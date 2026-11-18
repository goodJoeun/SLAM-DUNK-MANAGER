// 학교(팀)와 선수: 학년, 신입생, 라인업, 매일 훈련, 컨디션, 경기 경험 성장
import { overall, composites } from '../match/engine.ts';
import { generatePlayer } from './generate.ts';
import { randomName } from './names.ts';
import { injuryRisk, matchLearning, staminaCost, trainingFactor } from './people.ts';
import type { Rng } from '../rng.ts';
import type {
  BasePlayer, BoxTeam, Career, Composites, Defense, Focus, GrowthEvent, InjuryEvent, IntensityKey,
  Player, ProgramKey, RatingKey, Ratings, Team, TrainingChoice,
} from '../types.ts';

export const SCHOOL = {
  classSize: 4, // 학년당 인원 (3개 학년 = 12명)
  freshmanGap: 13, // 신입생은 학교 수준보다 이만큼 낮게 들어온다
  growthPerYear: 8, // 처음 만들 때 상급생이 이미 성장해 있는 정도 (연간)
};

// 훈련 메뉴. keys = 오르는 능력치
export const PROGRAMS: Record<ProgramKey, { label: string; keys: RatingKey[] }> = {
  shooting: { label: '슈팅', keys: ['mid', 'tp', 'ft'] },
  inside: { label: '골밑', keys: ['ins', 'dnk', 'reb'] },
  ballwork: { label: '볼 핸들링·패스', keys: ['drb', 'pss'] },
  defense: { label: '수비', keys: ['mdf', 'tdf', 'reb', 'str'] },
  physical: { label: '체력', keys: ['spd', 'jmp', 'end', 'str'] },
  tactics: { label: '전술 이해', keys: ['oiq', 'diq', 'tdf'] },
  rest: { label: '휴식', keys: [] },
  scout: { label: '상대 분석', keys: [] }, // 다음 공식전 상대를 분석해 그 경기에서만 보너스를 얻는다 (season.ts)
};

// 강도: 성장 배율, 컨디션 소모, 부상 확률
export const INTENSITY: Record<IntensityKey, { label: string; gain: number; cost: number; injury: number }> = {
  light: { label: '가볍게', gain: 0.5, cost: 3, injury: 0.0005 },
  normal: { label: '보통', gain: 1, cost: 6, injury: 0.002 },
  hard: { label: '강하게', gain: 1.6, cost: 10, injury: 0.006 },
};

export const GROWTH = {
  sessionPoints: 1.05, // 훈련 한 번에 그 메뉴의 능력치들이 나눠 갖는 성장량 (잠재력 50, 보통 강도)
  individualShare: 0.35, // 개인 훈련 지정 시 추가로 받는 비율
  passivePerDay: 0.01, // 훈련과 무관한 자연 성장 (전 능력치)
  heightPerDay: 0.006, // 키는 자연 성장만
  campBonus: 1.4, // 합숙 중 성장 배율
  campCost: 1.2,
  yearFactor: { 1: 1.15, 2: 1.0, 3: 0.9 } as Record<number, number>, // 저학년일수록 빨리 큰다
  matchPoints: 0.5, // 풀타임 한 경기의 경험치 기준
  officialBonus: 1.3, // 공식전은 연습 경기보다 많이 배운다
  restRecovery: 18,
  overnightRecovery: 5,
  matchCost: 14, // 풀타임 출전 시 컨디션 소모
  matchInjury: 0.004,
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const SCOUT_COST = 2; // 상대 분석 하루의 컨디션 소모
const ratingKeys = (p: BasePlayer) => Object.keys(p.ratings) as RatingKey[];
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
export const RATING_LABEL: Record<RatingKey, string> = {
  hgt: '키', str: '힘', spd: '스피드', jmp: '점프', end: '지구력', ins: '골밑 기술', dnk: '마무리', ft: '자유투',
  mid: '미들슛', tp: '3점슛', oiq: '공격 이해', diq: '수비IQ', mdf: '대인 수비', tdf: '팀 수비', drb: '드리블', pss: '패스', reb: '리바운드',
};

// 예전 세이브 올리기: 수비 능력치가 하나(diq)뿐이던 때의 선수에게 대인 수비·팀 수비를 같은 값으로 채운다.
// 세이브 안의 모든 선수(팀, 졸업생, 신입생, 유망주 명단)를 찾아 고친다.
export function upgradeCareer<T>(career: T): T {
  const walk = (x: unknown) => {
    if (!x || typeof x !== 'object') return;
    const r = (x as { ratings?: Partial<Ratings> }).ratings;
    if (r && typeof r === 'object' && typeof r.diq === 'number') {
      r.mdf ??= r.diq;
      r.tdf ??= r.diq;
    }
    for (const v of Object.values(x)) walk(v);
  };
  walk(career);
  return career;
}

// ---------- 선수 생성 ----------

// 처음 팀을 만들 때 상급생의 지난 세월을 한꺼번에 반영한다 (게임 중에는 쓰지 않는다)
function ageOneYear(rng: Rng, p: Player) {
  const factor = 0.6 + (0.8 * p.potential) / 100;
  for (const k of ratingKeys(p)) {
    const gain = k === 'hgt' ? Math.max(0, rng.gauss(1.5, 1.5)) : clamp(rng.gauss(SCHOOL.growthPerYear * factor, 2.5), -2, 12);
    p.ratings[k] = Math.round(clamp(p.ratings[k] + gain, 5, 99));
  }
}

// spread: 같은 수준 안에서 선수마다 흩어지는 폭
export function newPlayer(rng: Rng, state: Career, pos: number, prestige: number, year = 1, spread = 4): Player {
  const id = `p${state.nextId++}`;
  // 가끔 대형 신인이 들어온다
  const p: Player = {
    ...generatePlayer(rng, id, randomName(rng, state.nameStyle, id.slice(1)), pos, prestige - SCHOOL.freshmanGap + rng.gauss(0, spread)),
    year: 1,
    potential: Math.round(clamp(rng.gauss(50, 15), 10, 95)),
    hidden: { consistency: Math.round(clamp(rng.gauss(50, 15), 10, 95)) },
    condition: 100, // 0~100. 훈련·경기로 떨어지고 휴식으로 회복
    injuredDays: 0,
    progress: {}, // 능력치별 소수점 성장 누적
    focus: null, // 개인 훈련 메뉴 (PROGRAMS의 키)
  };
  for (; p.year < year; p.year++) ageOneYear(rng, p);
  return p;
}

// 인원이 부족한 포지션부터 신입생을 뽑는다
// 특급 신입생: 지난해 대회 성적이 좋았던 학교에는 처음부터 능력치가 높은 신입생이 올 수 있다.
//   points = 그해 세 대회 성적 점수의 합 (SEASON.prestigeByTier 기준, -3 ~ 9). 성적이 좋을수록 확률이 높다.
export const STAR_RECRUIT = { base: 0.04, perPoint: 0.035, min: 0.02, max: 0.35, bonus: 10, bonusSd: 2 };
export const starRecruitChance = (points: number) => clamp(STAR_RECRUIT.base + STAR_RECRUIT.perPoint * points, STAR_RECRUIT.min, STAR_RECRUIT.max);

// 신입생 능력치 규칙 (모두 종합 능력치 기준의 평균값이고, 실제 값은 그 주변으로 흩어진다).
//   'tiered'  : 강팀은 신입생 전원이 strong 안팎으로 고르게 높다. 약팀은 weakRest 안팎이고, 해마다 aceChance의 확률로
//               그중 한 명이 weakAce 안팎의 에이스다. 그 사이 학교는 두 규칙을 학교 수준에 따라 이어 붙인다.
//               여기에 전년도 성적에 따른 특급 확률(STAR_RECRUIT)이 에이스가 아닌 신입생에게 따로 붙는다.
//   'prestige': 예전 규칙. 학교 수준에 비례하고 성적에 따른 특급 확률만 있다.
// 수치는 scripts/balance/recruits.ts의 여러 해 시뮬레이션으로 맞췄다 (약팀 에이스가 해마다 오면 몇 년 안에 전력이 평준화된다).
export const RECRUIT_MODEL = {
  mode: 'tiered' as 'prestige' | 'tiered',
  strongAt: 62, weakAt: 48, // 이 학교 수준 이상이면 강팀, 이하면 약팀
  strong: 62.5, weakAce: 72, weakRest: 47,
  aceChance: 0.3, // 그해 신입생 중 한 명이 에이스일 확률
  ovrOffset: 4.6, // generatePlayer의 quality와 종합 능력치의 차이 (스크립트로 잰 값)
  spread: 4, // 같은 기준 안에서 선수마다 흩어지는 폭
  starScale: 1, // 성적에 따른 특급 확률을 얼마나 반영할지 (0이면 끔)
};

const recruitStrength = (prestige: number) => clamp((prestige - RECRUIT_MODEL.weakAt) / (RECRUIT_MODEL.strongAt - RECRUIT_MODEL.weakAt), 0, 1);
// 종합 능력치 목표를 newPlayer에 넘길 수준 값으로 바꾼다
const levelFor = (ovr: number) => ovr - RECRUIT_MODEL.ovrOffset + SCHOOL.freshmanGap;
// 이 학교에 들어오는 보통 신입생의 수준 (newPlayer에 넘기는 값). 유망주 명단도 이 값을 기준으로 만든다.
export function recruitLevel(prestige: number) {
  const M = RECRUIT_MODEL;
  return M.mode === 'tiered' ? levelFor(M.weakRest + (M.strong - M.weakRest) * recruitStrength(prestige)) : prestige;
}

// starChance: 신입생 한 명이 특급일 확률. stars에 특급 신입생의 id를 담아 준다.
export function recruitClass(rng: Rng, state: Career, team: Team, size = SCHOOL.classSize, starChance = 0, stars?: string[]) {
  const recruits: Player[] = [];
  for (let i = 0; i < size; i++) {
    const count = [1, 2, 3, 4, 5].map((pos) => team.players.filter((p) => p.pos === pos).length + rng.next() * 0.5);
    const pos = count.indexOf(Math.min(...count)) + 1;
    const M = RECRUIT_MODEL;
    let p: Player;
    let star = false;
    if (M.mode === 'tiered') {
      // 강팀(s=1)은 모두 고르게 높고, 약팀(s=0)은 에이스 한 명만 높다. 그 사이는 이어 붙인다.
      const s = recruitStrength(team.prestige);
      const ace = i === 0 && rng.chance(M.aceChance); // 에이스는 해마다 오지 않는다
      // 전년도 성적이 좋았으면 에이스가 아닌 신입생도 특급일 수 있다
      const bonus = !ace && starChance > 0 && rng.chance(starChance * M.starScale) ? clamp(rng.gauss(STAR_RECRUIT.bonus, STAR_RECRUIT.bonusSd), 6, 14) : 0;
      const level = ace ? levelFor(M.weakAce + (M.strong - M.weakAce) * s) : recruitLevel(team.prestige) + bonus;
      p = newPlayer(rng, state, pos, level, 1, M.spread);
      star = bonus > 0 || (ace && s < 0.8); // 강팀의 첫 신입생은 남들과 같으므로 특급으로 표시하지 않는다
    } else {
      star = starChance > 0 && rng.chance(starChance);
      p = newPlayer(rng, state, pos, team.prestige + (star ? clamp(rng.gauss(STAR_RECRUIT.bonus, STAR_RECRUIT.bonusSd), 6, 14) : 0));
    }
    if (star) stars?.push(p.id);
    team.players.push(p);
    recruits.push(p);
  }
  return recruits;
}

export function createSchool(rng: Rng, state: Career, name: string, prestige: number) {
  const team: Team = { id: `t${state.nextId++}`, name, prestige, players: [], tactics: {} };
  const positions = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, rng.int(1, 5), rng.int(1, 5)];
  positions.forEach((pos, i) => team.players.push(newPlayer(rng, state, pos, prestige, 3 - (i % 3))));
  setLineup(team);
  return team;
}

// ---------- 라인업·전술 ----------

// 앞의 5명 = 포지션 1~5 주전, 나머지는 능력 순 벤치 (엔진이 이 순서를 그대로 쓴다). 부상자는 맨 뒤.
// team.lineup이 있으면 그 자리는 감독이 정한 선수를 쓴다. 그 선수가 다쳤거나 팀을 떠났으면 그 자리만 자동으로 채운다
// (다친 선수의 지정은 남겨 두어, 나으면 다시 선발로 돌아온다).
export function setLineup(team: Team) {
  if (team.lineup) {
    const onRoster = new Set(team.players.map((p) => p.id));
    team.lineup = team.lineup.map((id) => (id && onRoster.has(id) ? id : null));
    if (team.lineup.every((id) => !id)) delete team.lineup;
  }
  const healthy = team.players.filter((p) => !p.injuredDays).sort((a, b) => overall(b) - overall(a));
  const injured = team.players.filter((p) => p.injuredDays);
  if (healthy.length < 5) { team.players = [...healthy, ...injured]; return; }
  // 다섯 자리 전체의 합이 가장 좋은 조합을 찾는다. 한 자리씩 차례로 뽑으면 센터가 가드 자리를 먼저 차지하는 일이 생긴다.
  // 자리마다 상위 후보 5명씩 따져 본다 (5명 미만이면 뛰어난 몇 명이 여러 자리의 후보를 독점해 조합이 안 나올 수 있다).
  const ovr = new Map(healthy.map((p) => [p, overall(p)]));
  const fit = (p: Player, pos: number) => ovr.get(p)! * (1 - 0.08 * Math.abs(p.pos - pos));
  const fixed = [0, 1, 2, 3, 4].map((slot) => healthy.find((p) => p.id === team.lineup?.[slot]) ?? null);
  const free = healthy.filter((p) => !fixed.includes(p));
  const candidates = [1, 2, 3, 4, 5].map((pos) => (fixed[pos - 1] ? [fixed[pos - 1]!] : [...free].sort((a, b) => fit(b, pos) - fit(a, pos)).slice(0, 5)));
  let best: Player[] | null = null;
  let bestScore = -1;
  const search = (slot: number, chosen: Player[], score: number): void => {
    if (slot === 5) { if (score > bestScore) { bestScore = score; best = [...chosen]; } return; }
    for (const p of candidates[slot]) {
      if (chosen.includes(p)) continue;
      chosen.push(p);
      search(slot + 1, chosen, score + fit(p, slot + 1));
      chosen.pop();
    }
  };
  search(0, [], 0);
  const starters = best ?? healthy.slice(0, 5);
  team.players = [...starters, ...healthy.filter((p) => !starters.includes(p)), ...injured];
}

export const teamOverall = (team: Team) => Math.round(mean(team.players.slice(0, 5).map(overall)) * 0.75 + mean(team.players.slice(5, 9).map(overall)) * 0.25);

// AI 감독: 주전 구성에 맞는 전술을 고른다
export function pickTactics(rng: Rng, team: Team) {
  const cs = team.players.slice(0, 5).map(composites);
  const avg = (f: (c: Composites) => number) => mean(cs.map(f));
  const lean = avg((c) => Math.max(c.rim, c.post)) - avg((c) => Math.max(c.mid, c.three));
  let focus: Focus = 'balanced';
  if (lean > 0.03) focus = 'inside';
  if (lean < -0.03) focus = 'outside';
  let defense: Defense = 'man';
  if (avg((c) => c.defInterior) - avg((c) => c.defPerimeter) > 0.02 && rng.chance(0.5)) defense = 'zone';
  else if (avg((c) => c.stealing) + avg((c) => c.endurance) > 1.1 && rng.chance(0.5)) defense = 'press';
  return { focus, defense, pace: rng.int(-1, 1) * 0.5 };
}

// ---------- 성장 ----------

// 성장량을 쌓다가 1을 넘으면 능력치가 오른다. 오른 내역은 events에 남긴다.
function gain(p: Player, key: RatingKey, amount: number, events?: GrowthEvent[]) {
  const r = p.ratings[key];
  const slowdown = 1 - Math.max(0, r - 60) / 45; // 높은 능력치일수록 올리기 어렵다
  p.progress[key] = (p.progress[key] ?? 0) + amount * Math.max(0.1, slowdown);
  while (p.progress[key]! >= 1 && p.ratings[key] < 99) {
    p.progress[key]! -= 1;
    p.ratings[key]++;
    events?.push({ id: p.id, name: p.name, key, label: RATING_LABEL[key], to: p.ratings[key] });
  }
}

const talent = (p: Player) => (0.6 + (0.8 * p.potential) / 100) * (GROWTH.yearFactor[p.year] ?? 1);

function maybeInjure(rng: Rng, p: Player, chance: number, report: { injuries: InjuryEvent[] }) {
  if (!rng.chance(chance * (1.6 - p.condition / 100) * injuryRisk(p))) return;
  p.injuredDays = rng.int(3, 12);
  report.injuries.push({ id: p.id, name: p.name, days: p.injuredDays });
}

// 하루 훈련. program: PROGRAMS의 키, intensity: INTENSITY의 키
export function trainTeam(rng: Rng, team: Team, program: ProgramKey, intensity: IntensityKey = 'normal', { camp = false }: { camp?: boolean } = {}) {
  const report = { program, intensity, growth: [] as GrowthEvent[], injuries: [] as InjuryEvent[] };
  const P = PROGRAMS[program];
  const I = INTENSITY[intensity];
  for (const p of team.players) {
    if (p.injuredDays) continue;
    for (const k of ratingKeys(p)) gain(p, k, k === 'hgt' ? GROWTH.heightPerDay * (p.year === 1 ? 1.5 : 1) : GROWTH.passivePerDay, report.growth);
    if (program === 'scout') {
      p.condition = Math.max(0, p.condition - SCOUT_COST); // 영상 분석과 맞춤 연습: 성장은 없고 조금만 지친다
      continue;
    }
    if (program === 'rest') {
      p.condition = Math.min(100, p.condition + GROWTH.restRecovery);
      continue;
    }
    // 지쳐 있으면 같은 훈련을 해도 덜 는다
    const effort = talent(p) * trainingFactor(p) * (0.5 + 0.5 * (p.condition / 100)) * I.gain * (camp ? GROWTH.campBonus : 1) * (0.7 + 0.6 * rng.next());
    for (const k of P.keys) gain(p, k, (GROWTH.sessionPoints / P.keys.length) * effort, report.growth);
    const own = p.focus ? PROGRAMS[p.focus] : undefined;
    if (own?.keys.length) {
      for (const k of own.keys) gain(p, k, (GROWTH.sessionPoints / own.keys.length) * effort * GROWTH.individualShare, report.growth);
    }
    p.condition = Math.max(0, p.condition - I.cost * (camp ? GROWTH.campCost : 1) * staminaCost(p));
    maybeInjure(rng, p, I.injury, report);
  }
  return report;
}

// 경기 후: 뛴 만큼 배운다. 강한 상대일수록, 공식전일수록 많이 배운다.
export function applyMatch(rng: Rng, team: Team, boxTeam: BoxTeam, opponentOverall: number, official: boolean) {
  const report = { growth: [] as GrowthEvent[], injuries: [] as InjuryEvent[] };
  const level = clamp(1 + (opponentOverall - teamOverall(team)) / 40, 0.7, 1.5) * (official ? GROWTH.officialBonus : 1);
  for (const line of boxTeam.players) {
    const p = team.players.find((x) => x.id === line.id);
    if (!p || !line.sec) continue;
    const share = line.sec / 2400;
    const xp = GROWTH.matchPoints * share * level * talent(p) * matchLearning(p);
    for (const k of ratingKeys(p)) if (k !== 'hgt') gain(p, k, xp * 0.4, report.growth);
    // 경기에서 실제로 한 플레이가 해당 능력치를 더 올린다
    gain(p, 'oiq', xp, report.growth);
    gain(p, 'diq', xp, report.growth);
    gain(p, 'mdf', xp * 0.5, report.growth);
    gain(p, 'tdf', xp * 0.5, report.growth);
    gain(p, 'tp', xp * Math.min(1, line.tpa / 5), report.growth);
    gain(p, 'mid', xp * Math.min(1, (line.fga - line.tpa) / 10), report.growth);
    gain(p, 'ins', xp * Math.min(1, (line.fga - line.tpa) / 10), report.growth);
    gain(p, 'reb', xp * Math.min(1, (line.orb + line.drb) / 8), report.growth);
    gain(p, 'pss', xp * Math.min(1, line.ast / 5), report.growth);
    p.condition = Math.max(0, p.condition - GROWTH.matchCost * share * staminaCost(p));
    maybeInjure(rng, p, GROWTH.matchInjury * share, report);
  }
  return report;
}

// 하루가 끝날 때: 자고 나면 조금 회복하고, 부상은 하루씩 낫는다
export function overnight(team: Team) {
  for (const p of team.players) {
    p.condition = Math.min(100, p.condition + GROWTH.overnightRecovery + (p.injuredDays ? 5 : 0));
    if (p.injuredDays) p.injuredDays--;
  }
}

// AI 감독의 훈련 선택: 지쳤으면 쉬고, 아니면 메뉴를 고루 돌린다
export function aiTraining(rng: Rng, team: Team, matchTomorrow = false): TrainingChoice {
  const fit = team.players.filter((p) => !p.injuredDays);
  const condition = mean(fit.map((p) => p.condition));
  if (condition < 55 || (matchTomorrow && condition < 85)) return { program: 'rest', intensity: 'normal' };
  const menu = (Object.keys(PROGRAMS) as ProgramKey[]).filter((k) => k !== 'rest' && k !== 'scout');
  const intensity = matchTomorrow ? 'light' : rng.chance(0.2) ? 'hard' : 'normal'; // 경기 전날은 가볍게
  return { program: menu[rng.int(0, menu.length - 1)], intensity };
}
