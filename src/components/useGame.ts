'use client';

// 화면 상태와 입력 처리. 게임 로직은 전부 src/game 에 있고, 여기서는 상태를 들고 입력을 전달하기만 한다.
// 엔진이 커리어 객체를 제자리에서 고치기 때문에, 상태는 하나의 변경 가능한 객체로 두고
// 입력을 처리할 때마다 다시 그리도록 알린다.
import { useEffect, useReducer, useState } from 'react';
import { createCareer, today, playDay, prepareUserMatch } from '@/game/season';
import type { DayDecision } from '@/game/season';
import type {
  Career, DayReport, Defense, Focus, GrowthEvent, IntensityKey, NameStyle, ProgramKey, Tactics,
} from '@/game/types';
import { BREAK_MS, DEFAULT_PREFS, SPEEDS, addNote, advanceMatch, beginPossession, newMatch, periodLabel, reveal } from './live';
import type { ActiveMatch, AlertKey, FeedMode, MatchPrefs, SpeedKey } from './live';
import { buildMessages, teamNames, trainingDigest, welcomeMessage } from './inbox';
import type { Message, MessageDraft } from './inbox';

const SAVE_KEY = 'hoops-manager-save-v2';
const INBOX_KEY = 'hoops-manager-inbox-v1';
const PORTRAIT_KEY = 'hoops-manager-portraits-v1'; // 선수 이름 -> 사용자가 올린 이미지 (게임을 새로 시작해도 남는다)
const PREFS_KEY = 'hoops-manager-match-prefs-v1'; // 경기 속도·자동 정지·중계 보기 설정
const INBOX_LIMIT = 80;

export type ScreenKey = 'home' | 'inbox' | 'squad' | 'tactics' | 'training' | 'comp' | 'records';

export type { ActiveMatch } from './live';

export interface GameState {
  career: Career | null;
  screen: ScreenKey;
  startSeed: number;
  nameStyle: NameStyle;
  program: ProgramKey;
  intensity: IntensityKey;
  resumeProgram: ProgramKey; // 상대 분석이 끝나면 돌아갈 훈련 메뉴
  inbox: Message[]; // 최신이 앞
  messageId: number | null;
  match: ActiveMatch | null;
  playerId: string | null;
  portraits: Record<string, string>;
  prefs: MatchPrefs;
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

function loadPrefs(): MatchPrefs {
  const saved = readJson<Partial<MatchPrefs>>(PREFS_KEY, {});
  return { ...DEFAULT_PREFS, ...saved, alerts: { ...DEFAULT_PREFS.alerts, ...saved.alerts } };
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
    resumeProgram: 'shooting',
    inbox: career ? readJson<Message[]>(INBOX_KEY, []) : [],
    messageId: null,
    match: null,
    playerId: null,
    portraits: readJson<Record<string, string>>(PORTRAIT_KEY, {}),
    prefs: loadPrefs(),
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

// 경기를 바로 멈춘다. 연출 중인 공격권이 있으면 결과를 곧바로 드러낸다(경기 종료·끝까지 맡기기·화면을 떠날 때).
function stopMatchTimer(S: GameState) {
  const m = S.match;
  if (!m) return;
  if (m.timer) clearTimeout(m.timer);
  m.timer = null;
  m.playing = false;
  m.interlude = null;
  if (m.pending) reveal(m, S.prefs, m.pending);
}

// 경기를 한 공격권씩 흘려보낸다. 공격권마다 코트 연출을 보여 준 뒤 결과를 드러내고,
// 중요한 순간이면 멈추고, 쿼터 사이에는 잠깐 쉬었다가 이어 간다.
// keepGoing이 false면 공격권 하나만 보여 주고 멈춘다(일시정지 중 공격권 하나 진행).
function tick(S: GameState, rerender: () => void, keepGoing = true) {
  const m = S.match;
  if (!m || (keepGoing && !m.playing)) return;
  m.timer = null;
  m.interlude = null;
  const b = beginPossession(m, S.prefs);
  if (!b) { stopMatchTimer(S); rerender(); return; }

  const finishUp = () => {
    if (S.match !== m) return; // 그사이 경기를 떠났다
    m.timer = null;
    const r = reveal(m, S.prefs, b.pending);
    if (r.finished) {
      stopMatchTimer(S);
    } else if (r.stop) {
      m.pause = r.stop;
      stopMatchTimer(S);
    } else if (!keepGoing || !m.playing) {
      // 공격권 하나만 보여 주거나, 연출 중에 일시정지를 눌렀다
    } else if (r.periodEnded) {
      m.interlude = `${periodLabel(m.game.view().period)} 시작 전 휴식`;
      m.timer = setTimeout(() => tick(S, rerender), BREAK_MS);
    } else {
      m.timer = setTimeout(() => tick(S, rerender), SPEEDS[S.prefs.speed].gap);
    }
    rerender();
  };

  if (b.ms > 0) {
    m.timer = setTimeout(finishUp, b.ms);
    rerender();
  } else {
    finishUp();
  }
}

// 방금 엔진이 남긴 중계 한 줄(교체·작전 타임)을 화면 중계에 옮긴다. 연출 중이면 그 공격권 뒤에 붙인다.
function pushLastLog(m: ActiveMatch) {
  const last = m.game.result().log.at(-1);
  if (!last) return;
  if (m.pending) m.deferredLog.push({ ...last });
  else m.feed.unshift({ ...last });
}

function trainDay(S: GameState) {
  advance(S, { program: S.program, intensity: S.intensity });
  resumeAfterScouting(S);
  save(S);
}

// 상대 분석은 다음 공식전 직전에만 할 수 있다. 더 할 수 없게 되면 원래 훈련 메뉴로 돌아간다.
function resumeAfterScouting(S: GameState) {
  if (S.program === 'scout' && !today(careerOf(S))?.prep?.canScout) S.program = S.resumeProgram;
}

function startCommand(S: GameState) {
  const match = prepareUserMatch(careerOf(S));
  if (match) S.match = newMatch(match);
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
  program({ S }: Ctx, key: ProgramKey) {
    if (key === 'scout' && S.program !== 'scout') S.resumeProgram = S.program;
    S.program = key;
  },
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
  simulate({ S }: Ctx) { openMatchReport(S, advance(S)); resumeAfterScouting(S); save(S); },
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
  play({ S, rerender }: Ctx) {
    const m = matchOf(S);
    if (m.playing || m.game.finished) return;
    m.pause = null;
    m.playing = true;
    if (m.pending) return; // 연출 중인 공격권이 끝나면 이어서 진행한다
    m.timer = setTimeout(() => tick(S, rerender), 0);
  },
  // 일시정지: 연출 중인 공격권은 끝까지 보여 준 뒤 멈춘다
  // 코치의 대응 계획대로 팀 전술을 바꾼다 (공격 중심·수비·집중 마크)
  applyPlan({ S }: Ctx) {
    const plan = today(careerOf(S))?.prep?.plan;
    if (!plan) return;
    const tactics = userTeam(S).tactics;
    tactics.focus = plan.focus;
    tactics.defense = plan.defense;
    if (plan.denyId) tactics.denyPlayerId = plan.denyId;
    else delete tactics.denyPlayerId;
    save(S);
  },
  dismissEnd({ S }: Ctx) { matchOf(S).endSeen = true; },
  pause({ S }: Ctx) {
    const m = matchOf(S);
    m.playing = false;
    m.interlude = null;
    if (!m.pending && m.timer) { clearTimeout(m.timer); m.timer = null; }
  },
  // 멈춘 상태에서 공격권 하나만 진행 (자세히 보고 싶을 때)
  step({ S, rerender }: Ctx) {
    const m = matchOf(S);
    if (m.playing || m.pending || m.game.finished) return;
    m.pause = null;
    tick(S, rerender, false);
  },
  speed({ S }: Ctx, key: SpeedKey) { S.prefs.speed = key; writeJson(PREFS_KEY, S.prefs); },
  toggleAlert({ S }: Ctx, key: AlertKey) { S.prefs.alerts[key] = !S.prefs.alerts[key]; writeJson(PREFS_KEY, S.prefs); },
  feedMode({ S }: Ctx, mode: FeedMode) { S.prefs.feed = mode; writeJson(PREFS_KEY, S.prefs); },
  timeout({ S }: Ctx) {
    const m = matchOf(S);
    if (m.game.timeout(m.side)) pushLastLog(m);
  },
  autosub({ S }: Ctx) { const m = matchOf(S); m.game.setAuto(m.side, !m.game.view().teams[m.side].auto); },
  skip({ S }: Ctx) {
    const m = matchOf(S);
    stopMatchTimer(S);
    m.pause = null;
    m.game.setAuto(m.side, true);
    addNote(m, m.game.view(), 'info', 'AI 코치가 남은 경기를 맡았습니다.');
    while (!m.game.finished) advanceMatch(m, S.prefs, false);
    const [h, a] = m.game.view().teams;
    addNote(m, m.game.view(), 'info', `경기 종료 · ${h.name} ${h.score} : ${a.score} ${a.name}`);
  },
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
    resumeAfterScouting(S);
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
