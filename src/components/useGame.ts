'use client';

// 화면 상태와 입력 처리. 게임 로직은 전부 src/game 에 있고, 여기서는 상태를 들고 입력을 전달하기만 한다.
// 엔진이 커리어 객체를 제자리에서 고치기 때문에, 상태는 하나의 변경 가능한 객체로 두고
// 입력을 처리할 때마다 다시 그리도록 알린다.
import { useEffect, useReducer, useState } from 'react';
import { createCareer, today, playDay, prepareUserMatch } from '@/game/season';
import type { DayDecision, UserMatch } from '@/game/season';
import type {
  Career, DayReport, Defense, Focus, GrowthEvent, IntensityKey, LogEvent, NameStyle, ProgramKey, Tactics,
} from '@/game/types';
import { buildMessages, teamNames, trainingDigest, welcomeMessage } from './inbox';
import type { Message, MessageDraft } from './inbox';

const SAVE_KEY = 'hoops-manager-save-v2';
const INBOX_KEY = 'hoops-manager-inbox-v1';
const PORTRAIT_KEY = 'hoops-manager-portraits-v1'; // 선수 이름 -> 사용자가 올린 이미지 (게임을 새로 시작해도 남는다)
const INBOX_LIMIT = 80;
const STEP_MS = 320; // 경기 자동 진행 속도

export type ScreenKey = 'home' | 'inbox' | 'squad' | 'tactics' | 'training' | 'comp' | 'records';

// 직접 지휘 중인 경기
export interface ActiveMatch extends UserMatch {
  feed: LogEvent[]; // 중계 (최신이 앞)
  selected: string | null; // 교체하려고 고른 코트 위 선수
  timer: ReturnType<typeof setInterval> | null; // 자동 진행 중이면 타이머
}

export interface GameState {
  career: Career | null;
  screen: ScreenKey;
  startSeed: number;
  nameStyle: NameStyle;
  program: ProgramKey;
  intensity: IntensityKey;
  inbox: Message[]; // 최신이 앞
  messageId: number | null;
  match: ActiveMatch | null;
  playerId: string | null;
  portraits: Record<string, string>;
}

// 게임을 시작한 뒤의 상태
export type PlayingState = GameState & { career: Career };

const randomSeed = () => Math.floor(Math.random() * 90000) + 1;

// 저장소는 막혀 있거나 비어 있을 수 있다. 그래도 게임은 계속된다.
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function removeKey(key: string) {
  try { localStorage.removeItem(key); } catch { /* 저장 실패는 무시한다 */ }
}

function save(S: GameState) {
  writeJson(SAVE_KEY, S.career);
  writeJson(INBOX_KEY, S.inbox);
}

const initialState = (): GameState => {
  const career = readJson<Career | null>(SAVE_KEY, null);
  return {
    career,
    screen: 'home',
    startSeed: randomSeed(),
    nameStyle: 'kr',
    program: 'shooting',
    intensity: 'normal',
    inbox: career ? readJson<Message[]>(INBOX_KEY, []) : [],
    messageId: null,
    match: null,
    playerId: null,
    portraits: readJson<Record<string, string>>(PORTRAIT_KEY, {}),
  };
};

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

// 새 메시지를 받은 소식 맨 위에 넣는다
function deliver(S: GameState, drafts: MessageDraft[]): Message[] {
  let id = S.inbox.reduce((max, m) => Math.max(max, m.id), 0);
  const fresh = drafts.map((d) => ({ ...d, id: ++id, unread: true }));
  S.inbox = [...[...fresh].reverse(), ...S.inbox].slice(0, INBOX_LIMIT);
  return fresh;
}

// 하루를 진행하고 그날의 소식을 받는다
function advance(S: GameState, decision: DayDecision = {}): Message[] {
  const career = careerOf(S);
  const names = teamNames(career);
  const report = playDay(career, decision);
  return report ? deliver(S, buildMessages(career, report, names)) : [];
}

// 경기 결과 메시지를 바로 연다
function openMatchReport(S: GameState, messages: Message[]) {
  const m = messages.find((x) => x.kind === 'match');
  if (!m) return;
  m.unread = false;
  S.messageId = m.id;
  S.screen = 'inbox';
}

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

function trainDay(S: GameState) {
  advance(S, { program: S.program, intensity: S.intensity });
  save(S);
}

function startCommand(S: GameState) {
  const match = prepareUserMatch(careerOf(S));
  if (match) S.match = { ...match, feed: [], selected: null, timer: null };
}

interface Ctx {
  S: GameState;
  rerender: () => void;
}

const actions = {
  namestyle({ S }: Ctx) { S.nameStyle = S.nameStyle === 'kr' ? 'jp' : 'kr'; },
  start({ S }: Ctx, index: number) {
    const career = createCareer({ seed: S.startSeed, userTeamIndex: index, dataset: 'original', nameStyle: S.nameStyle });
    Object.assign(S, { career, inbox: [], screen: 'home', messageId: null, playerId: null });
    deliver(S, [welcomeMessage(career)]);
    save(S);
  },
  reset({ S }: Ctx) {
    if (!window.confirm('지금 진행 중인 게임을 지우고 새로 시작할까요?')) return;
    stopMatchTimer(S);
    removeKey(SAVE_KEY);
    removeKey(INBOX_KEY);
    Object.assign(S, { career: null, match: null, inbox: [], messageId: null, playerId: null, screen: 'home', startSeed: randomSeed() });
  },
  screen({ S }: Ctx, key: ScreenKey) { S.screen = key; S.playerId = null; },
  openMessage({ S }: Ctx, id: number | null) {
    S.screen = 'inbox';
    S.messageId = id;
    const m = S.inbox.find((x) => x.id === id);
    if (m?.unread) { m.unread = false; save(S); }
  },
  setPortrait({ S }: Ctx, name: string, dataUrl: string) {
    const next = { ...S.portraits, [name]: dataUrl };
    if (!writeJson(PORTRAIT_KEY, next)) {
      window.alert('브라우저 저장 공간이 부족해 이미지를 저장하지 못했습니다. 다른 선수의 이미지를 지운 뒤 다시 시도해 주세요.');
      return;
    }
    S.portraits = next;
  },
  clearPortrait({ S }: Ctx, name: string) {
    const next = { ...S.portraits };
    delete next[name];
    S.portraits = next;
    writeJson(PORTRAIT_KEY, next);
  },
  readAll({ S }: Ctx) { for (const m of S.inbox) m.unread = false; save(S); },
  program({ S }: Ctx, key: ProgramKey) { S.program = key; },
  intensity({ S }: Ctx, key: IntensityKey) { S.intensity = key; },
  train({ S }: Ctx) { trainDay(S); },
  // 상단의 계속 버튼: 경기일이면 경기장으로, 아니면 정해 둔 훈련으로 하루를 보낸다
  proceed({ S }: Ctx) {
    const d = today(careerOf(S));
    if (!d) return;
    if (d.userMatch) startCommand(S);
    else trainDay(S);
  },
  auto({ S }: Ctx) {
    const career = careerOf(S);
    const growth: GrowthEvent[] = [];
    let last: DayReport | null = null;
    let days = 0;
    while (!career.finished && !today(career)?.userMatch) {
      const names = teamNames(career);
      const report = playDay(career);
      if (!report) break;
      days++;
      last = report;
      growth.push(...report.growth);
      deliver(S, buildMessages(career, report, names, { training: false }));
      if (report.yearEnd) break;
    }
    if (last) deliver(S, [trainingDigest(last, days, growth)]);
    save(S);
  },
  simulate({ S }: Ctx) { openMatchReport(S, advance(S)); save(S); },
  command({ S }: Ctx) { startCommand(S); },
  player({ S }: Ctx, id: string | null) { S.playerId = id || null; S.screen = 'squad'; },
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
    openMatchReport(S, advance(S, { match: m }));
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
