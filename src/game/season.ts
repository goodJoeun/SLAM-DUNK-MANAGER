// 3년 캠페인: 하루 단위로 진행한다. 매일 훈련을 고르고, 경기 날에는 직접 지휘할 수 있다.
// 한 해에 전국 대회가 3번 있다: 인터하이(여름), 국민체육대회(가을), 윈터컵(겨울).
// 각 대회는 현 예선을 통과한 학교만 전국 대회에 나간다.
// state는 JSON으로 그대로 저장·불러오기 할 수 있는 순수 데이터다.
//
//   const state = createCareer({ seed: 1 });
//   while (!state.finished) {
//     const day = today(state);                        // 오늘이 훈련일인지, 경기일인지, 상대는 누구인지
//     if (day.userMatch) {
//       const match = prepareUserMatch(state);         // 직접 지휘할 경기 (match.game은 engine의 createGame)
//       ... match.game.step() / substitute / timeout / setTactics ...
//       playDay(state, { match });
//     } else {
//       playDay(state, { program: 'shooting', intensity: 'hard' });
//     }
//   }
//   인자를 생략하면 AI가 대신 결정한다: playDay(state)

import { makeRng } from './rng.ts';
import { createGame, overall, simulateGame } from './engine.ts';
import {
  createSchool, setLineup, recruitClass, pickTactics, teamOverall, newPlayer, SCHOOL, starRecruitChance, recruitLevel,
  trainTeam, applyMatch, overnight, aiTraining,
} from './school.ts';
import { bracketOrder, roundRobin, standings, roundName, BYE } from './competition.ts';
import { DATASETS, buildSchool } from './dataset.ts';
import { keyMoments, playerRating } from './review.ts';
import { moraleAfterMatch, moraleAfterTraining, moraleOvernight, rollEvent } from './people.ts';
import type { Rng } from './rng.ts';
import type { Game } from './engine.ts';
import type {
  BoxTeam, CalendarDay, Career, Competition, CompetitionKey, DatasetKey, DayReport, DayType, Format, Group,
  IntensityKey, Leader, LeaderKey, Match, NameStyle, Player, PrepInfo, DrawInfo, ProgramKey, Round, Team, Today, TrainingChoice, UserMatchInfo, Prospect, YearReview, YearSummary,
} from './types.ts';

// 직접 지휘하는 경기 (prepareUserMatch의 결과)
export interface UserMatch {
  game: Game;
  side: number; // 내 팀이 홈이면 0, 원정이면 1
  home: string;
  away: string;
  label: string;
}

// 하루의 결정. 생략한 항목은 AI가 대신 정한다.
export interface DayDecision {
  program?: ProgramKey;
  intensity?: IntensityKey;
  match?: Pick<UserMatch, 'game' | 'home' | 'away'> | null;
  events?: boolean; // false면 다음 날 사건을 만들지 않는다 (자동 진행 스크립트용)
}

interface CalendarBlock {
  phase: string;
  days: string;
  start?: CompetitionKey;
  camp?: boolean;
}

// 그날 하루 동안 공유하는 정보
interface DayContext {
  rng: Rng;
  pre: DayDecision['match'] | null; // 직접 지휘한 경기
  played: Set<string>;
  report: DayReport;
}

export const SEASON = {
  campaignYears: 3,
  prefecture: '가나가와현', // 내 학교가 속한 현
  otherPrefectures: [
    '아이치현', '오사카부', '아키타현', '후쿠오카현', '교토부', '도쿄도', '시즈오카현', '히로시마현', '홋카이도',
    '미야기현', '지바현', '사이타마현', '효고현', '나가노현', '니가타현', '구마모토현', '오키나와현', '이바라키현',
  ],
  regionSize: 16, // 현 예선 참가 학교
  groupSize: 4, // 조별 리그: 4팀씩 4개 조, 각 조 1위가 다음 단계로
  nationalSize: 16, // 전국 대회 본선 참가 학교. 원작 데이터의 인터하이는 대진표(Dataset.draw)대로 59개교가 나온다
  guestPrestige: 58, // 다른 현 대표의 평균 수준
  prestigeByTier: [-1, 0, 1, 2, 2, 3], // 대회 성적(tier)별 학교 수준 변화. 한 해 3개 대회의 평균을 쓴다
  prestigeRegression: 0.25,

  // 대회별 현 예선 방식과 전국 대회 진출 팀 수
  //   group      조별 리그 (3경기)
  //   finalLeague 조 1위 4팀의 풀리그 (3경기)
  //   playoff    조 1위 4팀의 토너먼트 (준결승·결승)
  //   knockout   16강 단판 토너먼트 (4라운드)
  competitions: {
    interhigh: { name: '인터하이', format: ['group', 'finalLeague'], qualifiers: 2 },
    kokutai: { name: '국민체육대회', format: ['knockout'], qualifiers: 1 },
    wintercup: { name: '윈터컵', format: ['group', 'playoff'], qualifiers: 1 },
  } as Record<CompetitionKey, { name: string; format: Format[]; qualifiers: number }>,

  // 한 해 일정. T 훈련일, P 연습 경기, M 공식전.
  // 공식전(M) 수는 대회 구조와 맞아야 한다: 조별 3, 결승 리그 3, 플레이오프 2, 16강 토너먼트 4, 전국 대회 4 (인터하이는 64강 대진이라 6).
  calendar: [
    { phase: '봄 훈련', days: 'TTTPTTTPTTTPTT' },
    { phase: '인터하이 현 예선', days: 'MTTMTTMTTMTTMTTM', start: 'interhigh' },
    { phase: '여름 합숙', days: 'TTTTTPTT', camp: true },
    { phase: '인터하이', days: 'MTMTMTMTMTM' },
    { phase: '가을 훈련', days: 'TTTPTT' },
    { phase: '국민체육대회 현 예선', days: 'MTMTMTM', start: 'kokutai' },
    { phase: '국민체육대회', days: 'MTMTMTM' },
    { phase: '겨울 훈련', days: 'TTTPTT' },
    { phase: '윈터컵 현 예선', days: 'MTTMTTMTMTM', start: 'wintercup' },
    { phase: '윈터컵', days: 'MTMTMTM' },
  ] as CalendarBlock[],
};

// 경기 전 준비: 다음 공식전이 window일 안으로 다가오면 훈련 대신 상대를 분석할 수 있다.
// 하루마다 그 상대와의 경기에서만 능력치(키 제외) +perDay, 최대 maxDays일까지 쌓인다. AI 학교는 준비하지 않는다.
// 분석하면 코치가 상대 보고서를 준다 (scouting.ts). 보고서는 정보일 뿐이고, 어떻게 싸울지는 감독이 정한다.
// perDay가 크면 '공식전 전에는 무조건 분석'이 정답이 된다. 3일을 다 써도 전술 선택과 비슷한 크기가 되게 둔다.
export const PREPARATION = { perDay: 0.8, maxDays: 3, window: 3 };

const DAY_TYPE: Record<string, DayType> = { T: 'training', P: 'practice', M: 'official' };
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const shuffle = <T>(rng: Rng, xs: T[]) => {
  for (let i = xs.length - 1; i > 0; i--) { const j = rng.int(0, i); [xs[i], xs[j]] = [xs[j], xs[i]]; }
  return xs;
};
// 저장 가능한 난수: 시드 + 사용 횟수로 매번 새 난수열을 만든다
const rngFor = (state: Career) => makeRng((state.seed + Math.imul(++state.counter, 2654435761)) >>> 0);

// dataset: 'original'이면 src/game/data/original.ts의 학교·선수로 시작한다. 생략하면 전부 무작위 생성.
// nameStyle: 'kr'(한국어판 이름) | 'jp'(원작 이름)
export function createCareer({ seed = 1, userTeamIndex = 0, dataset = null, nameStyle = null }: {
  seed?: number;
  userTeamIndex?: number;
  dataset?: DatasetKey | null;
  nameStyle?: NameStyle | null;
} = {}): Career {
  const data = (dataset ? DATASETS[dataset] : null) ?? null;
  const state: Career = {
    seed, counter: 0, nextId: 1, year: 1, finished: false,
    dataset: data ? dataset : null, nameStyle: data ? (nameStyle ?? 'kr') : nameStyle,
    prefecture: data?.prefecture ?? SEASON.prefecture,
    teams: {}, regionIds: [], guestIds: [], userTeamId: '', prep: {},
    results: [], // 지금까지 끝난 대회 기록
    comp: null, stats: {}, yearPoints: {}, calendar: [], dayIndex: 0, // startSeason이 채운다
  };
  const rng = rngFor(state);
  for (let i = 0; i < SEASON.regionSize; i++) {
    const team = data
      ? buildSchool(rng, state, data.schools[i])
      : createSchool(rng, state, `제${i + 1}고교`, Math.round(clamp(rng.gauss(50, 5), 35, 65)));
    state.teams[team.id] = team;
    state.regionIds.push(team.id);
  }
  state.userTeamId = state.regionIds[userTeamIndex];
  startSeason(state);
  return state;
}

// ---------- 시즌 목표 ----------
// 교장은 학교 수준 순위에 맞춰 올해 목표를 준다. 세 대회 중 한 번이라도 그 성적에 닿으면 달성이다.
// 연말에 달성 여부로 학교 수준(다음 신입생의 질)과 교장의 신임이 달라진다.
export const TIER_LABEL = ['조별 리그·초반 탈락', '조 2위 또는 8강', '현 예선 최종 단계', '전국 대회 진출', '전국 8강 이상', '전국 우승'];
export const GOAL_LABEL = ['', '현 예선에서 조 2위 이내 또는 8강', '현 예선 최종 단계(결승 리그·결승) 진출', '전국 대회 진출', '전국 8강 이상', '전국 우승'];
const GOAL_EFFECT: Record<number, { verdict: string; prestige: number; trust: number }> = {
  2: { verdict: '목표를 넘어섰습니다. 학교의 지원이 크게 늘어납니다.', prestige: 2, trust: 15 },
  1: { verdict: '목표를 이뤘습니다. 학교가 농구부를 믿고 지원합니다.', prestige: 1, trust: 8 },
  [-1]: { verdict: '목표에 조금 못 미쳤습니다. 학교의 기대가 식고 있습니다.', prestige: -1, trust: -10 },
  [-2]: { verdict: '목표에 크게 못 미쳤습니다. 농구부 지원이 줄어듭니다.', prestige: -2, trust: -20 },
};

// id를 주면 그 학교를 맡았을 때의 목표를 미리 알려 준다 (학교 선택 화면)
export function goalTierFor(state: Career, id: string = state.userTeamId) {
  const rank = [...state.regionIds].sort((a, b) => state.teams[b].prestige - state.teams[a].prestige).indexOf(id) + 1;
  if (rank === 1 && state.teams[id].prestige >= 64) return 4; // 현 내 최강의 명문은 전국에서의 성적을 요구받는다
  return rank <= 2 ? 3 : rank <= 5 ? 2 : 1;
}

// 올해 목표와 지금까지의 진행 (예전 저장에는 목표가 없으므로 그 자리에서 정한다)
export function seasonGoal(state: Career) {
  state.goal ??= { tier: goalTierFor(state) };
  const best = state.bestTier ?? null;
  return {
    tier: state.goal.tier, label: GOAL_LABEL[state.goal.tier],
    best, bestLabel: best == null ? null : state.bestFinish ?? TIER_LABEL[best], // 실제 결과를 그대로 보여 준다 (예전 저장에는 없다)
    achieved: best != null && best >= state.goal.tier,
    trust: state.trust ?? 50,
  };
}

function reviewYear(state: Career): YearReview {
  const goal = seasonGoal(state);
  const best = goal.best ?? 0;
  const diff = best - goal.tier;
  const grade = diff >= 1 ? 2 : diff === 0 ? 1 : diff === -1 ? -1 : -2;
  const effect = GOAL_EFFECT[grade];
  state.trust = clamp((state.trust ?? 50) + effect.trust, 0, 100);
  return { goal: goal.label, best: goal.bestLabel ?? TIER_LABEL[best], grade, verdict: effect.verdict, prestigeBonus: effect.prestige, trust: state.trust };
}

// ---------- 신입생 스카우트 ----------
// 해마다 중학 유망주 후보가 생기고, 감독은 그중 몇 명을 영입 목표로 정한다.
// 연말에 목표마다 영입을 시도한다. 학교 수준이 유망주의 눈높이(level)보다 높을수록, 교장의 신임이 클수록 잘 온다.
// 온 선수는 신입생 자리를 차지하고, 나머지 자리는 예전처럼 부족한 포지션 위주로 채운다.
export const RECRUITING = { prospects: 8, maxTargets: 2, base: 0.6, perLevel: 0.04, perTrust: 0.004 };
const PROSPECT_OFFSETS = [-6, -3, 0, 0, 3, 5, 8, 12]; // 우리 학교 수준 대비 유망주의 눈높이

function makeProspects(state: Career, rng: Rng): Prospect[] {
  const prestige = state.teams[state.userTeamId].prestige;
  const positions = shuffle(rng, [1, 2, 3, 4, 5, rng.int(1, 5), rng.int(1, 5), rng.int(1, 5)]);
  return shuffle(rng, [...PROSPECT_OFFSETS]).slice(0, RECRUITING.prospects).map((offset, i) => {
    const level = Math.min(80, prestige + offset);
    // 능력치는 우리 학교에 들어오는 보통 신입생의 수준을 기준으로, 눈높이만큼 오르내린다
    return { player: newPlayer(rng, state, positions[i % positions.length], recruitLevel(prestige) + offset), level };
  });
}

export function recruitChance(state: Career, prospect: Prospect) {
  const prestige = state.teams[state.userTeamId].prestige;
  return clamp(RECRUITING.base + RECRUITING.perLevel * (prestige - prospect.level) + RECRUITING.perTrust * ((state.trust ?? 50) - 50), 0.1, 0.95);
}

// 올해의 유망주 목록 (예전 저장에는 없으므로 그 자리에서 만든다)
export function prospectsOf(state: Career): Prospect[] {
  state.prospects ??= makeProspects(state, rngFor(state));
  return state.prospects;
}

// 영입 목표를 켜고 끈다. 목표 수가 찼으면 false
export function toggleRecruitTarget(state: Career, id: string) {
  const targets = state.recruitTargets ?? [];
  if (targets.includes(id)) { state.recruitTargets = targets.filter((x) => x !== id); return true; }
  if (targets.length >= RECRUITING.maxTargets || !prospectsOf(state).some((p) => p.player.id === id)) return false;
  state.recruitTargets = [...targets, id];
  return true;
}

function resolveRecruiting(state: Career, rng: Rng) {
  const joined: Player[] = [];
  const missed: Player[] = [];
  for (const id of state.recruitTargets ?? []) {
    const prospect = state.prospects?.find((p) => p.player.id === id);
    if (!prospect) continue;
    (rng.chance(recruitChance(state, prospect)) ? joined : missed).push(prospect.player);
  }
  return { joined, missed };
}

function startSeason(state: Career) {
  const rng = rngFor(state);
  state.goal = { tier: goalTierFor(state) };
  delete state.bestTier;
  delete state.bestFinish;
  state.prospects = makeProspects(state, rng);
  state.recruitTargets = [];
  for (const id of state.regionIds) {
    const team = state.teams[id];
    setLineup(team);
    if (id !== state.userTeamId) team.tactics = pickTactics(rng, team);
    // 부임 첫날의 내 팀: 공격 방향만 주전 구성에 맞추고, 수비와 템포는 무난한 기본값으로 둔다.
    // (프레스나 빠른 템포는 체력 소모가 커서, 모르고 물려받으면 이유도 모른 채 후반에 무너진다)
    else if (!team.tactics.focus) team.tactics = { focus: pickTactics(rng, team).focus, defense: 'man', pace: 0 };
  }
  state.comp = null; // 진행 중인 대회
  state.stats = {}; // 선수별 공식전 누적 기록 (한 해)
  state.yearPoints = {}; // 학교별 올해 대회 성적 점수

  const rivals = state.regionIds.filter((id) => id !== state.userTeamId);
  state.calendar = [];
  for (const block of SEASON.calendar) {
    [...block.days].forEach((ch, i) => {
      const day: CalendarDay = { phase: block.phase, type: DAY_TYPE[ch], camp: !!block.camp };
      if (i === 0 && block.start) day.start = block.start; // 이 날부터 새 대회의 현 예선이 시작된다
      if (day.type === 'practice') day.opponentId = rivals[rng.int(0, rivals.length - 1)];
      state.calendar.push(day);
    });
  }
  state.dayIndex = 0;
  announceDraw(state, rng);
}

// ---------- 대회 ----------

// 대진 발표: 대회 현 예선이 시작되기 DRAW_LEAD일 전에 조 추첨·대진을 미리 정해, 첫 경기 상대도 분석할 수 있게 한다.
// 앞선 대회가 아직 끝나지 않았으면(일정상 그럴 일은 없다) 시작하는 날에 정한다. 발표했으면 그 내용을 돌려준다.
export const DRAW_LEAD = 4;
function announceDraw(state: Career, rng: Rng): DrawInfo | null {
  for (let k = 0; k <= DRAW_LEAD; k++) {
    const key = state.calendar[state.dayIndex + k]?.start;
    if (!key) continue;
    const c = state.comp;
    if (c && c.key === key) return null; // 이미 발표했다
    if (c && c.stage !== 'done' && k > 0) return null;
    startCompetition(state, key, rng);
    const first = officialPairing(state);
    if (!first) return null;
    const me = state.userTeamId;
    const opponentId = first.home === me ? first.away : first.home;
    const group = state.comp!.groups?.find((g) => g.ids.includes(me));
    return {
      competition: state.comp!.name, daysUntil: k, label: first.label, opponentId, opponent: state.teams[opponentId].name,
      group: group ? { name: group.name, teams: group.ids.map((id) => state.teams[id].name) } : undefined,
    };
  }
  return null;
}

function startCompetition(state: Career, key: CompetitionKey, rng: Rng) {
  for (const id of state.guestIds) delete state.teams[id]; // 지난 대회의 타 현 대표는 정리한다
  state.guestIds = [];
  const C = SEASON.competitions[key];
  const c: Competition = {
    key, name: C.name, format: C.format, qualifiers: C.qualifiers,
    stage: C.format[0], formatIndex: 0,
    groups: null, groupPlayed: 0, league: null, bracket: [], runnerUp: null,
    rounds: [], // 치른 라운드 기록
    finish: {}, // 학교별 최종 성적 (표시용)
    tier: {}, // 0 초반 탈락, 1 조 2위·8강, 2 현 예선 최종 단계, 3 전국 진출, 4 전국 8강 이상, 5 전국 우승
    prefChampion: null, champion: null,
  };
  state.comp = c;
  state.prep = {}; // 새 대회: 지난 대회를 위해 한 분석은 버린다
  // 학교 수준(지난 성적 반영) 순으로 시드를 준다
  const seeded = [...state.regionIds].sort((a, b) => state.teams[b].prestige - state.teams[a].prestige);
  if (c.stage === 'knockout') {
    c.bracket = bracketOrder(SEASON.regionSize).map((s) => seeded[s - 1]);
  } else {
    // 조 추첨: 포트를 나눠 강호끼리 같은 조에 몰리지 않게 한다
    const groupCount = SEASON.regionSize / SEASON.groupSize;
    const groups: Group[] = Array.from({ length: groupCount }, (_, i) => ({ name: `${'ABCDEFGH'[i]}조`, ids: [], schedule: [], matches: [] }));
    for (let pot = 0; pot < SEASON.groupSize; pot++) {
      shuffle(rng, seeded.slice(pot * groupCount, (pot + 1) * groupCount)).forEach((id, g) => groups[g].ids.push(id));
    }
    for (const g of groups) g.schedule = roundRobin(g.ids);
    c.groups = groups;
  }
}

function recordStats(state: Career, box: BoxTeam[]) {
  for (const t of box) {
    for (const p of t.players) {
      if (!p.sec) continue;
      const s = (state.stats[p.id] ??= { id: p.id, name: p.name, teamId: t.id!, gp: 0, sec: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0 });
      s.gp++;
      s.reb += p.orb + p.drb;
      for (const k of ['sec', 'pts', 'ast', 'stl', 'blk', 'fgm', 'fga', 'tpm', 'tpa'] as const) s[k] += p[k];
    }
  }
}

// 우리 선수의 경기별 기록을 남긴다 (연습 경기 포함)
function logUserGame(state: Career, mine: BoxTeam, opp: BoxTeam, official: boolean) {
  const log = (state.gameLog ??= {});
  for (const p of mine.players) {
    if (!p.sec) continue;
    (log[p.id] ??= []).push({
      year: state.year, day: state.dayIndex + 1, opponent: opp.name, official, won: mine.score > opp.score, score: `${mine.score} - ${opp.score}`,
      sec: Math.round(p.sec), pts: p.pts, reb: p.orb + p.drb, ast: p.ast, stl: p.stl, blk: p.blk, fgm: p.fgm, fga: p.fga, tpm: p.tpm, tpa: p.tpa,
      rating: playerRating(p),
    });
  }
}

// 우리 선수의 종합 능력치가 바뀌었으면 그 시점을 남긴다. day = 그날 일과가 끝난 뒤 (0이면 시즌 시작 전)
function recordTrend(state: Career, day: number) {
  const trend = (state.trend ??= {});
  for (const p of state.teams[state.userTeamId].players) {
    const list = (trend[p.id] ??= []);
    const ovr = overall(p);
    if (list[list.length - 1]?.ovr !== ovr) list.push({ year: state.year, day, ovr });
  }
}

// 졸업한 선수의 기록은 지운다
function pruneHistory(state: Career) {
  const ids = new Set(state.teams[state.userTeamId].players.map((p) => p.id));
  for (const store of [state.gameLog, state.trend]) {
    if (!store) continue;
    for (const id of Object.keys(store)) if (!ids.has(id)) delete store[id];
  }
}

// 공식전에서 내 팀이 받는 준비 보너스 [홈, 원정]
function prepFor(state: Career, home: string, away: string, official: boolean): [number, number] {
  const me = state.userTeamId;
  if (!official || (home !== me && away !== me)) return [0, 0];
  const bonus = prepBonus(state, home === me ? away : home);
  return home === me ? [bonus, 0] : [0, bonus];
}

// 분석 일수 × 하루 보너스
function prepBonus(state: Career, opponentId: string) {
  return Math.min(PREPARATION.maxDays, state.prep?.[opponentId] ?? 0) * PREPARATION.perDay;
}

function playMatch(state: Career, ctx: DayContext, home: string, away: string, official: boolean): Match {
  const pre = ctx.pre && ctx.pre.home === home && ctx.pre.away === away ? ctx.pre.game : null;
  const prep = prepFor(state, home, away, official);
  const g = pre
    ? (pre.finished ? pre.result() : pre.playToEnd())
    : simulateGame(state.teams[home], state.teams[away], { seed: ctx.rng.int(0, 2 ** 31), prep });
  if (home === state.userTeamId || away === state.userTeamId) {
    // 준비는 그 경기로 끝난다. 그 상대를 위해 건 집중 마크도 푼다 (다른 학교 선수를 계속 마크하지 않게).
    const opp = home === state.userTeamId ? away : home;
    delete state.prep?.[opp];
    delete state.teams[state.userTeamId].tactics.denyPlayerId;
    delete state.teams[state.userTeamId].tactics.denyDefenderId;
  }
  if (official) recordStats(state, g.box);
  const match: Match = { home, away, homeScore: g.score.home, awayScore: g.score.away, winner: g.winner === 'home' ? home : away, overtime: g.periods > 4 };

  // 경기 경험·컨디션·부상 반영 (우리 현 학교만 추적한다)
  const strength = [teamOverall(state.teams[home]), teamOverall(state.teams[away])];
  [home, away].forEach((id, side) => {
    ctx.played.add(id);
    if (!state.regionIds.includes(id)) return;
    const result = applyMatch(ctx.rng, state.teams[id], g.box[side], strength[1 - side], official);
    if (id === state.userTeamId) {
      const minutes = Object.fromEntries(g.box[side].players.map((p) => [p.id, p.sec]));
      moraleAfterMatch(state.teams[id], minutes, match.winner === id, official, strength[1 - side] - strength[side]);
      ctx.report.userBox = g.box;
      if (g.log.length) ctx.report.moments = keyMoments(g.log, side);
      logUserGame(state, g.box[side], g.box[1 - side], official);
      ctx.report.growth.push(...result.growth);
      ctx.report.injuries.push(...result.injuries);
    }
  });
  return match;
}

const stageLabel = (c: Competition) => (c.stage === 'national' ? c.name : `${c.name} 현 예선`);

// 토너먼트 한 라운드. tierOf(남은 팀 수) = 그 라운드에서 진 팀의 성적 등급
function playKnockoutRound(state: Career, ctx: DayContext, tierOf: (size: number) => number): Round {
  const c = state.comp!;
  const size = c.bracket.length;
  const name = `${stageLabel(c)} ${roundName(size)}`;
  const matches: Match[] = [];
  const winners: string[] = [];
  for (let i = 0; i < size; i += 2) {
    const [a, b] = [c.bracket[i], c.bracket[i + 1]];
    if (a === BYE || b === BYE) { winners.push(a || b); continue; } // 부전승
    const match = playMatch(state, ctx, a, b, true);
    matches.push(match);
    winners.push(match.winner);
    const loser = match.winner === match.home ? match.away : match.home;
    c.finish[loser] = size === 2 ? `${stageLabel(c)} 준우승` : `${name} 탈락`;
    c.tier[loser] = tierOf(size);
    if (size === 2) c.runnerUp = loser;
  }
  c.bracket = winners;
  const round: Round = { stage: c.stage, name, matches };
  c.rounds.push(round);
  return round;
}

// 대회의 다음 라운드 하나를 치른다
function playRound(state: Career, ctx: DayContext): Round | null {
  const c = state.comp;
  if (!c || c.stage === 'done') return null;

  if (c.stage === 'group') {
    const n = c.groupPlayed;
    const name = `${c.name} 현 예선 조별 리그 ${n + 1}차전`;
    const groups = c.groups!; // 조별 리그 단계에서는 항상 조가 편성되어 있다
    const matches: Match[] = [];
    for (const g of groups) {
      for (const [x, y] of g.schedule[n]) {
        const match = playMatch(state, ctx, x, y, true);
        g.matches.push(match);
        matches.push(match);
      }
    }
    c.groupPlayed++;
    const round: Round = { stage: 'group', name, matches };
    c.rounds.push(round);
    const tables = groups.map((g) => ({ name: g.name, table: standings(g.ids, g.matches) }));
    if (c.groupPlayed === SEASON.groupSize - 1) {
      const winners: string[] = [];
      for (const { name: groupName, table } of tables) {
        winners.push(table[0].id);
        table.slice(1).forEach((row, i) => {
          c.finish[row.id] = `${c.name} 현 예선 ${groupName} ${i + 2}위`;
          c.tier[row.id] = i === 0 ? 1 : 0;
        });
      }
      c.stage = c.format[++c.formatIndex];
      if (c.stage === 'finalLeague') c.league = { ids: winners, schedule: roundRobin(winners), played: 0, matches: [] };
      else c.bracket = winners; // playoff
    }
    return { ...round, groups: tables };
  }

  if (c.stage === 'finalLeague') {
    const L = c.league!;
    const name = `${c.name} 현 예선 결승 리그 ${L.played + 1}차전`;
    const matches = L.schedule[L.played].map(([a, b]) => playMatch(state, ctx, a, b, true));
    L.matches.push(...matches);
    L.played++;
    const round: Round = { stage: 'finalLeague', name, matches };
    c.rounds.push(round);
    const table = standings(L.ids, L.matches);
    if (L.played === L.schedule.length) {
      table.forEach((row, i) => {
        c.finish[row.id] = i < c.qualifiers ? `${c.name} 진출` : `${c.name} 현 예선 결승 리그 ${i + 1}위`;
        c.tier[row.id] = 2;
      });
      c.prefChampion = table[0].id;
      setupNational(state, ctx.rng, table.slice(0, c.qualifiers).map((row) => row.id));
    }
    return { ...round, table };
  }

  if (c.stage === 'knockout' || c.stage === 'playoff') {
    const round = playKnockoutRound(state, ctx, (size) => (size >= 16 ? 0 : size === 8 ? 1 : 2));
    if (c.bracket.length === 1) {
      c.prefChampion = c.bracket[0];
      c.finish[c.prefChampion] = `${c.name} 진출`;
      c.tier[c.prefChampion] = 2;
      const reps = [c.prefChampion];
      if (c.qualifiers > 1) { reps.push(c.runnerUp!); c.finish[c.runnerUp!] = `${c.name} 진출`; }
      setupNational(state, ctx.rng, reps);
    }
    return round;
  }

  if (c.stage === 'national') {
    const round = playKnockoutRound(state, ctx, (size) => (size > 8 ? 3 : 4));
    if (c.bracket.length === 1) {
      c.champion = c.bracket[0];
      c.finish[c.champion] = `${c.name} 우승`;
      c.tier[c.champion] = 5;
      finishCompetition(state);
    }
    return round;
  }
  return null;
}

// 전국 대회: 우리 현 대표 + 다른 현 대표들.
//   원작 데이터의 인터하이  원작 대진표 그대로 59개교. 현 1위·2위가 해남·북산의 자리에 들어간다.
//   그 밖의 대회           16개교를 추첨한다. 같은 현의 두 팀은 결승에서만 만난다.
function setupNational(state: Career, rng: Rng, reps: string[]) {
  const c = state.comp!;
  const data = state.dataset ? DATASETS[state.dataset] : null;
  const named = data?.nationals ?? [];
  const addGuest = (team: Team) => {
    team.tactics = pickTactics(rng, team);
    state.teams[team.id] = team;
    state.guestIds.push(team.id);
    return team.id;
  };
  state.guestIds = [];
  c.stage = 'national';

  const draw = data?.draw;
  if (draw && c.key === 'interhigh' && reps.length === draw.home.length) {
    const slot: Record<number, string> = {};
    draw.home.forEach((no, i) => { slot[no] = reps[i]; });
    for (const spec of named) if (spec.draw) slot[spec.draw] = addGuest(buildSchool(rng, state, spec));
    c.bracket = [];
    for (let no = 1; no <= draw.size; no++) {
      c.bracket.push(slot[no]);
      if (draw.byes.includes(no)) c.bracket.push(BYE);
    }
    return;
  }

  // 데이터에 학교가 있으면 그중에서 뽑는다. 강호일수록 자주 나오지만 해마다 얼굴이 조금씩 바뀐다.
  const count = SEASON.nationalSize - reps.length;
  const invited = named.map((spec) => ({ spec, score: spec.prestige + rng.gauss(0, 4) })).sort((a, b) => b.score - a.score).slice(0, count);
  const prefectures = shuffle(rng, [...SEASON.otherPrefectures]);
  for (let i = 0; i < count; i++) {
    addGuest(invited[i]
      ? buildSchool(rng, state, invited[i].spec)
      : createSchool(rng, state, `${prefectures[i % prefectures.length]} 대표`, Math.round(clamp(rng.gauss(SEASON.guestPrestige, 5), 45, 75))));
  }
  const guests = shuffle(rng, [...state.guestIds]); // 대진 추첨
  const half = SEASON.nationalSize / 2;
  c.bracket = reps.length > 1
    ? [reps[0], ...guests.slice(0, half - 1), reps[1], ...guests.slice(half - 1)]
    : [reps[0], ...guests];
}

function finishCompetition(state: Career) {
  const c = state.comp!;
  c.stage = 'done';
  const tier = c.tier[state.userTeamId] ?? 0;
  if (state.bestTier == null || tier > state.bestTier) {
    state.bestTier = tier;
    state.bestFinish = c.finish[state.userTeamId];
  }
  for (const id of state.regionIds) {
    state.yearPoints[id] = (state.yearPoints[id] ?? 0) + SEASON.prestigeByTier[c.tier[id] ?? 0];
  }
  state.results.push({
    year: state.year, key: c.key, name: c.name,
    userFinish: c.finish[state.userTeamId],
    prefChampion: state.teams[c.prefChampion!].name,
    champion: state.teams[c.champion!].name,
  });
}

// 오늘 내 팀이 치를 경기. 없으면 null
function userPairing(state: Career): { home: string; away: string; official: boolean; label: string } | null {
  const day = state.calendar[state.dayIndex];
  const me = state.userTeamId;
  if (!day) return null;
  if (day.type === 'practice') return { home: me, away: day.opponentId!, official: false, label: '연습 경기' };
  if (day.type !== 'official') return null;
  return officialPairing(state);
}

// 대회 진행 상황으로 본 내 팀의 다음 공식전 대진 (대회 중이 아니거나 탈락했으면 null)
function officialPairing(state: Career): { home: string; away: string; official: boolean; label: string } | null {
  const me = state.userTeamId;
  const c = state.comp;
  if (!c) return null;
  if (c.stage === 'group') {
    const group = c.groups!.find((g) => g.ids.includes(me))!;
    const pair = group.schedule[c.groupPlayed].find((p) => p.includes(me))!;
    return { home: pair[0], away: pair[1], official: true, label: `${c.name} 현 예선 ${group.name} ${c.groupPlayed + 1}차전` };
  }
  if (c.stage === 'finalLeague') {
    const league = c.league!;
    const pair = league.schedule[league.played].find((p) => p.includes(me));
    return pair ? { home: pair[0], away: pair[1], official: true, label: `${c.name} 현 예선 결승 리그 ${league.played + 1}차전` } : null;
  }
  if (['knockout', 'playoff', 'national'].includes(c.stage)) {
    const i = c.bracket.indexOf(me);
    if (i < 0) return null;
    const j = i - (i % 2);
    if (c.bracket[j] === BYE || c.bracket[j + 1] === BYE) return null; // 부전승: 이번 라운드는 쉰다
    return { home: c.bracket[j], away: c.bracket[j + 1], official: true, label: `${stageLabel(c)} ${roundName(c.bracket.length)}` };
  }
  return null;
}

// 내 팀이 이번 라운드를 부전승으로 쉬는지
export function userHasBye(state: Career) {
  const c = state.comp;
  if (!c || c.stage !== 'national') return false;
  const i = c.bracket.indexOf(state.userTeamId);
  return i >= 0 && c.bracket[i ^ 1] === BYE;
}

// ---------- 하루 진행 ----------

// 내 팀이 실제로 뛰는(지금 알기로 뛸 수 있는) 남은 경기일의 달력 위치. 탈락한 대회의 남은 공식전 날은 건너뛴다.
export function userMatchDays(state: Career): number[] {
  const days: number[] = [];
  const bye = userHasBye(state);
  const alive = bye || officialPairing(state) !== null; // 지금 대회에서 아직 다음 경기가 있다
  let newCompetition = false; // 그 날까지 새 대회가 시작되면 다시 처음부터 뛴다
  let skip = bye ? 1 : 0; // 부전승이면 다음 공식전 날은 경기가 없다
  for (let i = state.dayIndex; i < state.calendar.length; i++) {
    const d = state.calendar[i];
    if (i > state.dayIndex && d.start) newCompetition = true;
    if (d.type === 'official' && !newCompetition && skip-- > 0) continue;
    if (d.type === 'practice' || (d.type === 'official' && (alive || newCompetition))) days.push(i);
  }
  return days;
}

// 지금 대회에서 상대가 이미 정해진 내 팀의 공식전: 달력 위치 → 상대 학교 id.
// 조별 리그와 결승 리그는 남은 경기의 상대를 모두 알고, 토너먼트는 다음 경기만 안다.
export function knownOpponents(state: Career): Record<number, string> {
  const out: Record<number, string> = {};
  const me = state.userTeamId;
  const c = state.comp;
  if (!c || c.stage === 'done') return out;
  const other = (pair?: string[]) => (pair ? (pair[0] === me ? pair[1] : pair[0]) : null);
  let rounds: (string | null)[] = [];
  if (c.stage === 'group') {
    const group = c.groups!.find((g) => g.ids.includes(me))!;
    rounds = group.schedule.slice(c.groupPlayed).map((r) => other(r.find((p) => p.includes(me))));
  } else if (c.stage === 'finalLeague') {
    rounds = c.league!.schedule.slice(c.league!.played).map((r) => other(r.find((p) => p.includes(me))));
  } else {
    const pairing = officialPairing(state);
    rounds = [pairing ? other([pairing.home, pairing.away]) : null];
  }
  // 대진이 미리 발표된 대회는 아직 시작 전이므로, 그 대회의 시작일 하나는 지나가도 된다
  let starts = c.rounds.length ? 0 : 1;
  for (let i = state.dayIndex; i < state.calendar.length && rounds.length; i++) {
    const d = state.calendar[i];
    if (i > state.dayIndex && d.start && starts-- <= 0) break;
    if (d.type !== 'official') continue;
    const id = rounds.shift();
    if (id) out[i] = id;
  }
  return out;
}

// 다음 경기일까지 남은 날 (0이면 오늘). 남은 경기가 없으면 null
function nextMatchIn(state: Career) {
  const next = userMatchDays(state)[0];
  return next == null ? null : next - state.dayIndex;
}

// 오늘의 일정
export function today(state: Career): Today | null {
  if (state.finished) return null;
  const day = state.calendar[state.dayIndex];
  const pairing = userPairing(state);
  let userMatch: UserMatchInfo | null = null;
  if (pairing) {
    const opponentId = pairing.home === state.userTeamId ? pairing.away : pairing.home;
    userMatch = {
      label: pairing.label, official: pairing.official, opponentId, opponent: state.teams[opponentId].name, opponentOverall: teamOverall(state.teams[opponentId]),
      opener: pairing.official && !state.comp?.rounds.length,
    };
  }
  return {
    year: state.year, day: state.dayIndex + 1, of: state.calendar.length,
    phase: day.phase, type: day.type, camp: day.camp, prep: upcomingOfficial(state),
    daysToNextMatch: nextMatchIn(state), // 0이면 오늘이 경기일. 남은 경기가 없으면 null
    // 공식전 날인데 내 팀 경기가 없으면(탈락) 훈련일이 된다
    userTrains: !pairing,
    userMatch,
  };
}

// 오늘 경기를 직접 지휘하기 위한 경기 객체를 만든다. 끝낸 뒤 playDay(state, { match })로 넘긴다.
export function prepareUserMatch(state: Career): UserMatch | null {
  const pairing = userPairing(state);
  if (!pairing) return null;
  const side = pairing.home === state.userTeamId ? 0 : 1;
  const game = createGame(state.teams[pairing.home], state.teams[pairing.away], {
    seed: rngFor(state).int(0, 2 ** 31), log: true, manual: side === 0 ? [true, false] : [false, true],
    prep: prepFor(state, pairing.home, pairing.away, pairing.official),
  });
  return { game, side, home: pairing.home, away: pairing.away, label: pairing.label };
}

// 하루를 진행한다.
//   decision.program / decision.intensity : 오늘의 팀 훈련 (school.ts의 PROGRAMS, INTENSITY)
//   decision.match                        : prepareUserMatch로 만들어 직접 지휘한 경기
// 다음 공식전과 준비 상황. 대진이 아직 정해지지 않았으면 null
export function upcomingOfficial(state: Career): PrepInfo | null {
  const next = state.calendar.findIndex((d, i) => i >= state.dayIndex && d.type === 'official');
  if (next < 0) return null;
  const pairing = officialPairing(state);
  if (!pairing) return null;
  const opponentId = pairing.home === state.userTeamId ? pairing.away : pairing.home;
  const days = Math.min(PREPARATION.maxDays, state.prep?.[opponentId] ?? 0);
  const daysUntil = next - state.dayIndex;
  return {
    opponentId, opponent: state.teams[opponentId].name, label: pairing.label, daysUntil, days,
    bonus: prepBonus(state, opponentId),
    canScout: daysUntil >= 1 && daysUntil <= PREPARATION.window && days < PREPARATION.maxDays,
    reachDays: Math.min(PREPARATION.maxDays, days + Math.min(daysUntil, PREPARATION.window)),
  };
}

export function playDay(state: Career, decision: DayDecision = {}): DayReport | null {
  if (state.finished) return null;
  const day = state.calendar[state.dayIndex];
  const upcoming = upcomingOfficial(state); // 오늘 상대 분석을 하면 이 상대에 대한 준비가 쌓인다
  const report: DayReport = {
    year: state.year, day: state.dayIndex + 1, of: state.calendar.length, phase: day.phase, type: day.type,
    round: null, practice: null, training: null, userBox: null, growth: [], injuries: [],
    competitionEnd: null, yearEnd: null, scout: null,
  };
  const ctx: DayContext = { rng: rngFor(state), pre: decision.match ?? null, played: new Set(), report };
  recordTrend(state, state.dayIndex); // 처음 보는 선수는 오늘 일과 전의 값이 기준점이 된다

  if (day.type === 'official') {
    const before = state.results.length;
    report.round = playRound(state, ctx);
    if (state.results.length > before) report.competitionEnd = state.results[state.results.length - 1];
  }
  if (day.type === 'practice') report.practice = playMatch(state, ctx, state.userTeamId, day.opponentId!, false);

  // 경기가 없는 팀은 훈련한다. AI는 경기 전날이면 컨디션을 조절한다.
  const tomorrow = state.calendar[state.dayIndex + 1];
  for (const id of state.regionIds) {
    if (ctx.played.has(id)) continue;
    const team = state.teams[id];
    const mine = id === state.userTeamId;
    const matchTomorrow = tomorrow?.type === 'official' || (mine && tomorrow?.type === 'practice');
    let choice: TrainingChoice = mine && decision.program
      ? { program: decision.program, intensity: decision.intensity ?? 'normal' }
      : aiTraining(ctx.rng, team, matchTomorrow);
    if (mine && state.forcedRest) choice = { program: 'rest', intensity: 'normal' }; // 사건의 결과로 오늘은 쉰다
    const result = trainTeam(ctx.rng, team, choice.program, choice.intensity, { camp: day.camp });
    if (mine) {
      moraleAfterTraining(team, choice.program, choice.intensity);
      if (choice.program === 'scout' && upcoming?.canScout) {
        const days = upcoming.days + 1;
        state.prep = { ...state.prep, [upcoming.opponentId]: days };
        report.scout = upcomingOfficial(state);
      }
      report.training = choice;
      report.growth.push(...result.growth);
      report.injuries.push(...result.injuries);
    }
  }

  for (const id of state.regionIds) {
    overnight(state.teams[id]);
    setLineup(state.teams[id]);
  }
  moraleOvernight(state.teams[state.userTeamId]);
  delete state.forcedRest;
  delete state.event; // 고르지 않고 넘어간 사건은 사라진다
  recordTrend(state, state.dayIndex + 1);
  state.dayIndex++;
  if (state.dayIndex >= state.calendar.length) report.yearEnd = endYear(state, ctx.rng);
  else { const draw = announceDraw(state, ctx.rng); if (draw) report.draw = draw; }
  // 새 날 아침: 경기가 없는 날이면 감독이 결정할 사건이 생길 수 있다
  if (!state.finished && decision.events !== false && !userPairing(state)) {
    const event = rollEvent(state, ctx.rng);
    if (event) state.event = event;
  }
  return report;
}

// 연도 전환: 성적에 따라 학교 수준이 변하고, 3학년 졸업 -> 진급 -> 신입생 입학. 3년차가 끝나면 캠페인 종료.
function endYear(state: Career, rng: Rng): YearSummary {
  const summary: YearSummary = {
    year: state.year, final: state.year >= SEASON.campaignYears,
    results: state.results.filter((r) => r.year === state.year),
    graduates: [], recruits: [],
  };
  const scouting = summary.final ? { joined: [], missed: [] } : resolveRecruiting(state, rng); // 평가로 신임이 바뀌기 전의 가능성으로 정한다
  summary.review = reviewYear(state); // 올해 목표를 이뤘는지
  if (summary.final) {
    state.finished = true;
    return summary;
  }

  const comps = Object.keys(SEASON.competitions).length;
  for (const id of state.regionIds) {
    const team = state.teams[id];
    // 성적이 좋으면 오르고, 해마다 평균(50)으로 조금씩 되돌아간다
    const mine = id === state.userTeamId;
    const before = team.prestige;
    const delta = (state.yearPoints[id] ?? 0) / comps + rng.gauss(0, 2) + (mine ? summary.review.prestigeBonus : 0);
    team.prestige = Math.round(clamp(team.prestige + delta + (50 - team.prestige) * SEASON.prestigeRegression, 30, 75));
    if (mine) summary.prestige = [before, team.prestige];

    const leaving = team.players.filter((p) => p.year >= 3);
    team.players = team.players.filter((p) => p.year < 3);
    for (const p of team.players) { p.year++; p.condition = 100; p.injuredDays = 0; }
    const joined = mine ? scouting.joined : [];
    team.players.push(...joined); // 영입에 성공한 유망주가 먼저 자리를 차지한다
    // 올해 성적이 좋았던 학교일수록 처음부터 능력치가 높은 신입생이 올 확률이 높다
    const starChance = starRecruitChance(state.yearPoints[id] ?? 0);
    const stars: string[] = [];
    const recruits = [...joined, ...recruitClass(rng, state, team, SCHOOL.classSize - joined.length, starChance, stars)];
    if (mine) {
      summary.graduates = leaving; summary.recruits = recruits; summary.scouted = joined.map((p) => p.id); summary.missed = scouting.missed;
      summary.stars = stars; summary.starChance = starChance;
      // 임기 마지막 해에 돌아볼 수 있게, 입학 때의 모습을 선수에게 적어 둔다
      for (const p of recruits) p.joined = { ovr: overall(p), scouted: joined.includes(p) || undefined, star: stars.includes(p.id) || undefined };
    }
  }
  for (const id of state.guestIds) delete state.teams[id];
  state.guestIds = [];
  pruneHistory(state);
  state.year++;
  startSeason(state);
  return summary;
}

// 선수 순위 (공식전 경기당 평균). key: 'pts' | 'reb' | 'ast' | 'stl' | 'blk'
export function leaders(state: Career, key: LeaderKey, n = 5, minGames = 2): Leader[] {
  return Object.values(state.stats)
    .filter((s) => s.gp >= minGames && state.regionIds.includes(s.teamId))
    .map((s) => ({ ...s, team: state.teams[s.teamId].name, avg: s[key] / s.gp }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, n);
}
