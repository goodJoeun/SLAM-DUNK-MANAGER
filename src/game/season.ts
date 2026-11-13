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
import { createGame, simulateGame } from './engine.ts';
import {
  createSchool, setLineup, recruitClass, pickTactics, teamOverall,
  trainTeam, applyMatch, overnight, aiTraining,
} from './school.ts';
import { bracketOrder, roundRobin, standings, roundName } from './competition.ts';
import { DATASETS, buildSchool } from './dataset.ts';
import type { Rng } from './rng.ts';
import type { Game } from './engine.ts';
import type {
  BoxTeam, CalendarDay, Career, Competition, CompetitionKey, DatasetKey, DayReport, DayType, Format, Group,
  IntensityKey, Leader, LeaderKey, Match, NameStyle, ProgramKey, Round, Today, TrainingChoice, UserMatchInfo, YearSummary,
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
  nationalSize: 16,
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
  // 공식전(M) 수는 대회 구조와 맞아야 한다: 조별 3, 결승 리그 3, 플레이오프 2, 16강 토너먼트 4, 전국 대회 4.
  calendar: [
    { phase: '봄 훈련', days: 'TTTPTTTPTTTPTT' },
    { phase: '인터하이 현 예선', days: 'MTTMTTMTTMTTMTTM', start: 'interhigh' },
    { phase: '여름 합숙', days: 'TTTTTPTT', camp: true },
    { phase: '인터하이', days: 'MTMTMTM' },
    { phase: '가을 훈련', days: 'TTTPTT' },
    { phase: '국민체육대회 현 예선', days: 'MTMTMTM', start: 'kokutai' },
    { phase: '국민체육대회', days: 'MTMTMTM' },
    { phase: '겨울 훈련', days: 'TTTPTT' },
    { phase: '윈터컵 현 예선', days: 'MTTMTTMTMTM', start: 'wintercup' },
    { phase: '윈터컵', days: 'MTMTMTM' },
  ] as CalendarBlock[],
};

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
    teams: {}, regionIds: [], guestIds: [], userTeamId: '',
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

function startSeason(state: Career) {
  const rng = rngFor(state);
  for (const id of state.regionIds) {
    const team = state.teams[id];
    setLineup(team);
    if (id !== state.userTeamId || !team.tactics.focus) team.tactics = pickTactics(rng, team);
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
  if (state.calendar[0].start) startCompetition(state, state.calendar[0].start, rng);
}

// ---------- 대회 ----------

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

function playMatch(state: Career, ctx: DayContext, home: string, away: string, official: boolean): Match {
  const pre = ctx.pre && ctx.pre.home === home && ctx.pre.away === away ? ctx.pre.game : null;
  const g = pre
    ? (pre.finished ? pre.result() : pre.playToEnd())
    : simulateGame(state.teams[home], state.teams[away], { seed: ctx.rng.int(0, 2 ** 31) });
  if (official) recordStats(state, g.box);
  const match: Match = { home, away, homeScore: g.score.home, awayScore: g.score.away, winner: g.winner === 'home' ? home : away, overtime: g.periods > 4 };

  // 경기 경험·컨디션·부상 반영 (우리 현 학교만 추적한다)
  const strength = [teamOverall(state.teams[home]), teamOverall(state.teams[away])];
  [home, away].forEach((id, side) => {
    ctx.played.add(id);
    if (!state.regionIds.includes(id)) return;
    const result = applyMatch(ctx.rng, state.teams[id], g.box[side], strength[1 - side], official);
    if (id === state.userTeamId) {
      ctx.report.userBox = g.box;
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
    const match = playMatch(state, ctx, c.bracket[i], c.bracket[i + 1], true);
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
    const round = playKnockoutRound(state, ctx, (size) => (size === SEASON.nationalSize ? 3 : 4));
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

// 전국 대회: 우리 현 대표 + 다른 현 대표들. 같은 현의 두 팀은 결승에서만 만난다.
function setupNational(state: Career, rng: Rng, reps: string[]) {
  const c = state.comp!;
  // 데이터에 이름난 강호가 있으면 먼저 넣고, 남는 자리는 그 밖의 현 대표로 채운다
  const named = (state.dataset ? DATASETS[state.dataset] : null)?.nationals ?? [];
  const taken = new Set(named.map((s) => s.prefecture));
  const prefectures = shuffle(rng, SEASON.otherPrefectures.filter((p) => !taken.has(p)));
  const guests: string[] = [];
  for (let i = 0; i < SEASON.nationalSize - reps.length; i++) {
    const team = named[i]
      ? buildSchool(rng, state, named[i])
      : createSchool(rng, state, `${prefectures[(i - named.length) % prefectures.length]} 대표`, Math.round(clamp(rng.gauss(SEASON.guestPrestige, 5), 45, 75)));
    team.tactics = pickTactics(rng, team);
    state.teams[team.id] = team;
    guests.push(team.id);
  }
  shuffle(rng, guests); // 대진 추첨
  state.guestIds = guests;
  const half = SEASON.nationalSize / 2;
  c.bracket = reps.length > 1
    ? [reps[0], ...guests.slice(0, half - 1), reps[1], ...guests.slice(half - 1)]
    : [reps[0], ...guests];
  c.stage = 'national';
}

function finishCompetition(state: Career) {
  const c = state.comp!;
  c.stage = 'done';
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
  const c = state.comp;
  if (!day) return null;
  if (day.type === 'practice') return { home: me, away: day.opponentId!, official: false, label: '연습 경기' };
  if (day.type !== 'official' || !c) return null;
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
    return { home: c.bracket[j], away: c.bracket[j + 1], official: true, label: `${stageLabel(c)} ${roundName(c.bracket.length)}` };
  }
  return null;
}

// ---------- 하루 진행 ----------

function nextMatchIn(state: Career) {
  const i = state.calendar.findIndex((d, idx) => idx >= state.dayIndex && d.type !== 'training');
  return i < 0 ? null : i - state.dayIndex;
}

// 오늘의 일정
export function today(state: Career): Today | null {
  if (state.finished) return null;
  const day = state.calendar[state.dayIndex];
  const pairing = userPairing(state);
  let userMatch: UserMatchInfo | null = null;
  if (pairing) {
    const opponentId = pairing.home === state.userTeamId ? pairing.away : pairing.home;
    userMatch = { label: pairing.label, official: pairing.official, opponentId, opponent: state.teams[opponentId].name, opponentOverall: teamOverall(state.teams[opponentId]) };
  }
  return {
    year: state.year, day: state.dayIndex + 1, of: state.calendar.length,
    phase: day.phase, type: day.type, camp: day.camp,
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
  });
  return { game, side, home: pairing.home, away: pairing.away, label: pairing.label };
}

// 하루를 진행한다.
//   decision.program / decision.intensity : 오늘의 팀 훈련 (school.ts의 PROGRAMS, INTENSITY)
//   decision.match                        : prepareUserMatch로 만들어 직접 지휘한 경기
export function playDay(state: Career, decision: DayDecision = {}): DayReport | null {
  if (state.finished) return null;
  const day = state.calendar[state.dayIndex];
  const report: DayReport = {
    year: state.year, day: state.dayIndex + 1, of: state.calendar.length, phase: day.phase, type: day.type,
    round: null, practice: null, training: null, userBox: null, growth: [], injuries: [],
    competitionEnd: null, yearEnd: null,
  };
  const ctx: DayContext = { rng: rngFor(state), pre: decision.match ?? null, played: new Set(), report };

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
    const choice: TrainingChoice = mine && decision.program
      ? { program: decision.program, intensity: decision.intensity ?? 'normal' }
      : aiTraining(ctx.rng, team, matchTomorrow);
    const result = trainTeam(ctx.rng, team, choice.program, choice.intensity, { camp: day.camp });
    if (mine) {
      report.training = choice;
      report.growth.push(...result.growth);
      report.injuries.push(...result.injuries);
    }
  }

  for (const id of state.regionIds) {
    overnight(state.teams[id]);
    setLineup(state.teams[id]);
  }
  state.dayIndex++;
  if (state.dayIndex >= state.calendar.length) report.yearEnd = endYear(state, ctx.rng);
  else if (state.calendar[state.dayIndex].start) startCompetition(state, state.calendar[state.dayIndex].start!, ctx.rng);
  return report;
}

// 연도 전환: 성적에 따라 학교 수준이 변하고, 3학년 졸업 -> 진급 -> 신입생 입학. 3년차가 끝나면 캠페인 종료.
function endYear(state: Career, rng: Rng): YearSummary {
  const summary: YearSummary = {
    year: state.year, final: state.year >= SEASON.campaignYears,
    results: state.results.filter((r) => r.year === state.year),
    graduates: [], recruits: [],
  };
  if (summary.final) {
    state.finished = true;
    return summary;
  }

  const comps = Object.keys(SEASON.competitions).length;
  for (const id of state.regionIds) {
    const team = state.teams[id];
    // 성적이 좋으면 오르고, 해마다 평균(50)으로 조금씩 되돌아간다
    const delta = (state.yearPoints[id] ?? 0) / comps + rng.gauss(0, 2);
    team.prestige = Math.round(clamp(team.prestige + delta + (50 - team.prestige) * SEASON.prestigeRegression, 30, 75));

    const leaving = team.players.filter((p) => p.year >= 3);
    team.players = team.players.filter((p) => p.year < 3);
    for (const p of team.players) { p.year++; p.condition = 100; p.injuredDays = 0; }
    const recruits = recruitClass(rng, state, team);
    if (id === state.userTeamId) { summary.graduates = leaving; summary.recruits = recruits; }
  }
  for (const id of state.guestIds) delete state.teams[id];
  state.guestIds = [];
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
