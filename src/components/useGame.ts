'use client';

// 화면 상태와 입력 처리. 게임 로직은 전부 src/game 에 있고, 여기서는 상태를 들고 입력을 전달하기만 한다.
// 엔진이 커리어 객체를 제자리에서 고치기 때문에, 상태는 하나의 변경 가능한 객체로 두고
// 입력을 처리할 때마다 다시 그리도록 알린다.
import { useEffect, useReducer, useState } from 'react';
import { createCareer, today, playDay, prepareUserMatch } from '@/game/season';
import type { UserMatch } from '@/game/season';
import type {
  Career, DayReport, Defense, Focus, GrowthEvent, InjuryEvent, IntensityKey, LogEvent, NameStyle, ProgramKey, Tactics,
} from '@/game/types';

const SAVE_KEY = 'hoops-manager-save-v2';
const STEP_MS = 320; // 경기 자동 진행 속도

export type TabKey = 'today' | 'squad' | 'comp' | 'records';

// 하루의 결과. 여러 날을 자동 진행했으면 autoDays에 일수가 들어간다.
export type Report = DayReport & { autoDays?: number };

// 직접 지휘 중인 경기
export interface ActiveMatch extends UserMatch {
  feed: LogEvent[]; // 중계 (최신이 앞)
  selected: string | null; // 교체하려고 고른 코트 위 선수
  timer: ReturnType<typeof setInterval> | null; // 자동 진행 중이면 타이머
}

export interface GameState {
  career: Career | null;
  tab: TabKey;
  startSeed: number;
  nameStyle: NameStyle;
  program: ProgramKey;
  intensity: IntensityKey;
  report: Report | null;
  match: ActiveMatch | null;
  playerId: string | null;
}

// 게임을 시작한 뒤의 상태
export type PlayingState = GameState & { career: Career };

const randomSeed = () => Math.floor(Math.random() * 90000) + 1;

function load(): Career | null {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'); } catch { return null; }
}

function save(S: GameState) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S.career)); } catch { /* 저장 공간이 없어도 게임은 계속된다 */ }
}

const initialState = (): GameState => ({
  career: load(),
  tab: 'today',
  startSeed: randomSeed(),
  nameStyle: 'kr',
  program: 'shooting',
  intensity: 'normal',
  report: null,
  match: null,
  playerId: null,
});

function careerOf(S: GameState): Career {
  if (!S.career) throw new Error('진행 중인 게임이 없습니다.');
  return S.career;
}

function matchOf(S: GameState): ActiveMatch {
  if (!S.match) throw new Error('진행 중인 경기가 없습니다.');
  return S.match;
}

const userTeam = (S: GameState) => {
  const career = careerOf(S);
  return career.teams[career.userTeamId];
};

function stopMatchTimer(S: GameState) {
  if (S.match?.timer) { clearInterval(S.match.timer); S.match.timer = null; }
}

function stepMatch(S: GameState) {
  const m = matchOf(S);
  const s = m.game.step();
  if (!s) { stopMatchTimer(S); return; }
  m.feed.unshift(...[...s.events].reverse());
  if (s.periodEnded || s.finished) stopMatchTimer(S);
}

// 방금 엔진이 남긴 중계 한 줄(교체·작전 타임)을 화면 중계에 옮긴다
function pushLastLog(m: ActiveMatch) {
  const last = m.game.result().log.at(-1);
  if (last) m.feed.unshift({ ...last });
}

interface Ctx {
  S: GameState;
  rerender: () => void;
}

const actions = {
  namestyle({ S }: Ctx) { S.nameStyle = S.nameStyle === 'kr' ? 'jp' : 'kr'; },
  start({ S }: Ctx, index: number) {
    S.career = createCareer({ seed: S.startSeed, userTeamIndex: index, dataset: 'original', nameStyle: S.nameStyle });
    S.tab = 'today';
    S.report = null;
    save(S);
  },
  reset({ S }: Ctx) {
    if (!window.confirm('지금 진행 중인 게임을 지우고 새로 시작할까요?')) return;
    stopMatchTimer(S);
    localStorage.removeItem(SAVE_KEY);
    Object.assign(S, { career: null, match: null, report: null, playerId: null, startSeed: randomSeed() });
  },
  tab({ S }: Ctx, tab: TabKey) { S.tab = tab; },
  program({ S }: Ctx, key: ProgramKey) { S.program = key; },
  intensity({ S }: Ctx, key: IntensityKey) { S.intensity = key; },
  train({ S }: Ctx) { S.report = playDay(careerOf(S), { program: S.program, intensity: S.intensity }); save(S); },
  auto({ S }: Ctx) {
    const career = careerOf(S);
    const growth: GrowthEvent[] = [];
    const injuries: InjuryEvent[] = [];
    let last: DayReport | null = null;
    let days = 0;
    while (!career.finished && !today(career)?.userMatch) {
      last = playDay(career);
      if (!last) break;
      days++;
      growth.push(...last.growth);
      injuries.push(...last.injuries);
      if (last.yearEnd) break;
    }
    if (last) S.report = { ...last, growth, injuries, autoDays: days, training: null };
    save(S);
  },
  simulate({ S }: Ctx) { S.report = playDay(careerOf(S)); save(S); },
  command({ S }: Ctx) {
    const match = prepareUserMatch(careerOf(S));
    if (match) S.match = { ...match, feed: [], selected: null, timer: null };
  },
  player({ S }: Ctx, id: string | null) { S.playerId = id || null; },
  tactic({ S }: Ctx, key: 'focus' | 'defense' | 'pace', value: string) {
    const tactics = userTeam(S).tactics;
    if (key === 'pace') tactics.pace = Number(value);
    else if (key === 'focus') tactics.focus = value as Focus;
    else tactics.defense = value as Defense;
    save(S);
  },
  playerFocus({ S }: Ctx, id: string, value: string) {
    const player = userTeam(S).players.find((p) => p.id === id);
    if (player) player.focus = (value || null) as ProgramKey | null;
    save(S);
  },

  // 경기 중
  step({ S }: Ctx) { stepMatch(S); },
  run({ S, rerender }: Ctx) {
    const m = matchOf(S);
    if (m.timer) { stopMatchTimer(S); return; }
    m.timer = setInterval(() => { stepMatch(S); rerender(); }, STEP_MS);
  },
  timeout({ S }: Ctx) {
    const m = matchOf(S);
    if (m.game.timeout(m.side)) pushLastLog(m);
  },
  autosub({ S }: Ctx) { const m = matchOf(S); m.game.setAuto(m.side, !m.game.view().teams[m.side].auto); },
  skip({ S }: Ctx) { const m = matchOf(S); stopMatchTimer(S); m.game.setAuto(m.side, true); while (!m.game.finished) stepMatch(S); },
  pick({ S }: Ctx, where: 'court' | 'bench', id: string) {
    const m = matchOf(S);
    if (m.game.finished) return;
    if (where === 'court') { m.selected = m.selected === id ? null : id; return; }
    if (!m.selected) return;
    if (m.game.substitute(m.side, m.selected, id)) pushLastLog(m);
    m.selected = null;
  },
  matchTactic({ S }: Ctx, key: keyof Tactics, value: string) {
    const m = matchOf(S);
    m.game.setTactics(m.side, { [key]: key === 'pace' ? Number(value) : value || null } as Partial<Tactics>);
  },
  finish({ S }: Ctx) {
    const m = matchOf(S);
    stopMatchTimer(S);
    S.match = null;
    S.report = playDay(careerOf(S), { match: m });
    S.tab = 'today';
    save(S);
  },
};

type Actions = typeof actions;
type ActionArgs<K extends keyof Actions> = Actions[K] extends (ctx: Ctx, ...args: infer A) => void ? A : never;

// act('이름', ...인자): 입력을 처리하고 다시 그린다.
export type Act = <K extends keyof Actions>(name: K, ...args: ActionArgs<K>) => void;

// S: 현재 상태(화면에서는 읽기 전용으로 쓸 것)
export function useGame(): { S: GameState; act: Act } {
  const [S] = useState(initialState);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => () => stopMatchTimer(S), [S]);

  const act: Act = (name, ...args) => {
    (actions[name] as (ctx: Ctx, ...rest: unknown[]) => void)({ S, rerender }, ...args);
    rerender();
  };

  return { S, act };
}
