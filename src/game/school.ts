// 학교(팀)와 선수: 학년, 신입생, 라인업, 매일 훈련, 컨디션, 경기 경험 성장
import { overall, composites } from './engine.ts';
import { generatePlayer } from './generate.ts';
import { randomName } from './names.ts';
import type { Rng } from './rng.ts';
import type {
  BasePlayer, BoxTeam, Career, Composites, Defense, Focus, GrowthEvent, InjuryEvent, IntensityKey,
  Player, ProgramKey, RatingKey, Team, TrainingChoice,
} from './types.ts';

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
  defense: { label: '수비', keys: ['diq', 'reb', 'str'] },
  physical: { label: '체력', keys: ['spd', 'jmp', 'end', 'str'] },
  tactics: { label: '전술 이해', keys: ['oiq', 'diq'] },
  rest: { label: '휴식', keys: [] },
  scout: { label: '상대 분석', keys: [] }, // 다음 공식전 상대를 분석해 그 경기에서만 보너스를 얻는다 (season.ts)
};

// 강도: 성장 배율, 컨디션 소모, 부상 확률
export const INTENSITY: Record<IntensityKey, { label: string; gain: number; cost: number; injury: number }> = {
  light: { label: '가볍게', gain: 0.6, cost: 3, injury: 0.0005 },
  normal: { label: '보통', gain: 1, cost: 6, injury: 0.002 },
  hard: { label: '강하게', gain: 1.4, cost: 10, injury: 0.006 },
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
  mid: '미들슛', tp: '3점슛', oiq: '공격 이해', diq: '수비 이해', drb: '드리블', pss: '패스', reb: '리바운드',
};

// ---------- 선수 생성 ----------

// 처음 팀을 만들 때 상급생의 지난 세월을 한꺼번에 반영한다 (게임 중에는 쓰지 않는다)
function ageOneYear(rng: Rng, p: Player) {
  const factor = 0.6 + (0.8 * p.potential) / 100;
  for (const k of ratingKeys(p)) {
    const gain = k === 'hgt' ? Math.max(0, rng.gauss(1.5, 1.5)) : clamp(rng.gauss(SCHOOL.growthPerYear * factor, 2.5), -2, 12);
    p.ratings[k] = Math.round(clamp(p.ratings[k] + gain, 5, 99));
  }
}

export function newPlayer(rng: Rng, state: Career, pos: number, prestige: number, year = 1): Player {
  const id = `p${state.nextId++}`;
  // 가끔 대형 신인이 들어온다
  const p: Player = {
    ...generatePlayer(rng, id, randomName(rng, state.nameStyle, id.slice(1)), pos, prestige - SCHOOL.freshmanGap + rng.gauss(0, 4)),
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
export function recruitClass(rng: Rng, state: Career, team: Team) {
  const recruits: Player[] = [];
  for (let i = 0; i < SCHOOL.classSize; i++) {
    const count = [1, 2, 3, 4, 5].map((pos) => team.players.filter((p) => p.pos === pos).length + rng.next() * 0.5);
    const pos = count.indexOf(Math.min(...count)) + 1;
    const p = newPlayer(rng, state, pos, team.prestige);
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
export function setLineup(team: Team) {
  const healthy = team.players.filter((p) => !p.injuredDays).sort((a, b) => overall(b) - overall(a));
  const injured = team.players.filter((p) => p.injuredDays);
  if (healthy.length < 5) { team.players = [...healthy, ...injured]; return; }
  // 다섯 자리 전체의 합이 가장 좋은 조합을 찾는다. 한 자리씩 차례로 뽑으면 센터가 가드 자리를 먼저 차지하는 일이 생긴다.
  // 자리마다 상위 후보 5명씩 따져 본다 (5명 미만이면 뛰어난 몇 명이 여러 자리의 후보를 독점해 조합이 안 나올 수 있다).
  const ovr = new Map(healthy.map((p) => [p, overall(p)]));
  const fit = (p: Player, pos: number) => ovr.get(p)! * (1 - 0.08 * Math.abs(p.pos - pos));
  const candidates = [1, 2, 3, 4, 5].map((pos) => [...healthy].sort((a, b) => fit(b, pos) - fit(a, pos)).slice(0, 5));
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
  if (!rng.chance(chance * (1.6 - p.condition / 100))) return;
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
    const effort = talent(p) * (0.5 + 0.5 * (p.condition / 100)) * I.gain * (camp ? GROWTH.campBonus : 1) * (0.7 + 0.6 * rng.next());
    for (const k of P.keys) gain(p, k, (GROWTH.sessionPoints / P.keys.length) * effort, report.growth);
    const own = p.focus ? PROGRAMS[p.focus] : undefined;
    if (own?.keys.length) {
      for (const k of own.keys) gain(p, k, (GROWTH.sessionPoints / own.keys.length) * effort * GROWTH.individualShare, report.growth);
    }
    p.condition = Math.max(0, p.condition - I.cost * (camp ? GROWTH.campCost : 1));
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
    const xp = GROWTH.matchPoints * share * level * talent(p);
    for (const k of ratingKeys(p)) if (k !== 'hgt') gain(p, k, xp * 0.4, report.growth);
    // 경기에서 실제로 한 플레이가 해당 능력치를 더 올린다
    gain(p, 'oiq', xp, report.growth);
    gain(p, 'diq', xp, report.growth);
    gain(p, 'tp', xp * Math.min(1, line.tpa / 5), report.growth);
    gain(p, 'mid', xp * Math.min(1, (line.fga - line.tpa) / 10), report.growth);
    gain(p, 'ins', xp * Math.min(1, (line.fga - line.tpa) / 10), report.growth);
    gain(p, 'reb', xp * Math.min(1, (line.orb + line.drb) / 8), report.growth);
    gain(p, 'pss', xp * Math.min(1, line.ast / 5), report.growth);
    p.condition = Math.max(0, p.condition - GROWTH.matchCost * share);
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
