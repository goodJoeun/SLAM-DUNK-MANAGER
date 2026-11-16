'use client';

// 화면 상태와 입력 처리. 게임 로직은 전부 src/game 에 있고, 여기서는 상태를 들고 입력을 전달하기만 한다.
// 엔진이 커리어 객체를 제자리에서 고치기 때문에, 상태는 하나의 변경 가능한 객체로 두고
// 입력을 처리할 때마다 다시 그리도록 알린다.
import { useEffect, useReducer, useState } from 'react';
import { createCareer, today, playDay, prepareUserMatch, toggleRecruitTarget } from '@/game/season';
import { setLineup } from '@/game/school';
import { resolveEvent } from '@/game/people';
import type { DayDecision } from '@/game/season';
import { INTENSITY, PROGRAMS } from '@/game/school';
import type {
  Career, DayReport, Defense, Focus, GrowthEvent, InjuryEvent, IntensityKey, NameStyle, PlayerRole, PrepInfo, ProgramKey, Tactics,
} from '@/game/types';
import { BREAK_MS, DEFAULT_PREFS, SPEEDS, TIRED_LEVELS, addNote, advanceMatch, beginPossession, newMatch, periodLabel, reveal } from './live';
import type { ActiveMatch, AlertKey, FeedMode, MatchPrefs, SpeedKey } from './live';
import { buildMessages, mergeTraining, quiet, supersedes, teamNames, trainingDigest, welcomeMessage } from './inbox';
import type { Message, MessageDraft } from './inbox';

const SAVE_KEY = 'hoops-manager-save-v2';
const INBOX_KEY = 'hoops-manager-inbox-v1';
const PORTRAIT_KEY = 'hoops-manager-portraits-v1'; // 선수 이름 -> 사용자가 올린 이미지 (게임을 새로 시작해도 남는다)
const PREFS_KEY = 'hoops-manager-match-prefs-v1'; // 경기 속도·자동 정지·중계 보기 설정
const INBOX_LIMIT = 80;

export type ScreenKey = 'home' | 'inbox' | 'squad' | 'tactics' | 'training' | 'comp' | 'records';

export type { ActiveMatch } from './live';

// 방금 보낸 하루(또는 AI 코치에게 맡긴 며칠)의 결과 한 줄. 다음 날로 넘어가기 전까지 화면 위쪽에 보여 준다.
export interface DayNote {
  year: number;
  dayIndex: number; // 이 날짜에 머무는 동안만 보여 준다
  title: string;
  items: { text: string; tone?: 'good' | 'bad' }[];
}

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
  dayNote?: DayNote | null;
  lastEvent?: { title: string; chosen: string; result: string[]; day: number }; // 방금 결정한 사건의 결과 (그날 홈 화면에 보여 준다)
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
  const prefs = { ...DEFAULT_PREFS, ...saved, alerts: { ...DEFAULT_PREFS.alerts, ...saved.alerts } };
  if (!TIRED_LEVELS.includes(prefs.tiredAt)) prefs.tiredAt = DEFAULT_PREFS.tiredAt;
  return prefs;
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
  const fresh: Message[] = [];
  for (const draft of drafts) {
    // 주간 훈련 보고·상대 분석 보고서는 이전 것을 대신한다 (inbox.ts의 supersedes)
    const old = supersedes(S.inbox, draft);
    if (old) {
      S.inbox = S.inbox.filter((m) => m !== old);
      if (S.messageId === old.id) S.messageId = null;
    }
    const d = old && draft.kind === 'training' ? mergeTraining(old, draft) : draft;
    const m: Message = { ...d, id: ++id, unread: !quiet(d) };
    fresh.push(m);
    S.inbox = [m, ...S.inbox];
  }
  S.inbox = S.inbox.slice(0, INBOX_LIMIT);
  return fresh;
}

// 하루를 진행하고 그날의 소식을 받는다
function advance(S: GameState, decision: DayDecision = {}): { fresh: Message[]; report: DayReport | null } {
  const career = careerOf(S);
  const names = teamNames(career);
  const report = playDay(career, decision);
  const fresh = report ? deliver(S, buildMessages(career, report, names)) : [];
  S.dayNote = null;
  openYearEnd(S, fresh);
  return { fresh, report };
}

// 뛸 수 있는 선수들의 평균 컨디션
function teamCondition(S: GameState) {
  const fit = userTeam(S).players.filter((p) => !p.injuredDays);
  return fit.length ? Math.round(fit.reduce((sum, p) => sum + p.condition, 0) / fit.length) : 0;
}

// 훈련으로 보낸 날의 결과를 한 줄로 간추린다: 무엇을 했고, 누가 컸고, 컨디션이 어떻게 변했고, 누가 다쳤는지
function noteDay(S: GameState, o: {
  title: string; condBefore: number; growth: GrowthEvent[]; injuries: InjuryEvent[]; scout?: PrepInfo | null;
}) {
  const career = careerOf(S);
  const items: DayNote['items'] = [];
  if (o.scout) items.push({ text: `${o.scout.opponent} 분석 ${o.scout.days}일째 · 그 경기 능력치 +${o.scout.bonus.toFixed(1)}`, tone: 'good' });
  const perPlayer = new Map<string, number>();
  for (const g of o.growth) perPlayer.set(g.name, (perPlayer.get(g.name) ?? 0) + 1);
  if (perPlayer.size) {
    const ranked = [...perPlayer].sort((a, b) => b[1] - a[1]);
    const shown = ranked.slice(0, 3).map(([name, n]) => `${name} +${n}`).join(', ');
    items.push({ text: `능력치 상승 ${o.growth.length}건 · ${shown}${ranked.length > 3 ? ` 외 ${ranked.length - 3}명` : ''}`, tone: 'good' });
  } else if (!o.scout) {
    items.push({ text: '오른 능력치 없음' });
  }
  const condAfter = teamCondition(S);
  items.push({ text: `팀 컨디션 ${o.condBefore} → ${condAfter}`, tone: condAfter < 60 ? 'bad' : undefined });
  for (const inj of o.injuries) items.push({ text: `${inj.name} 부상 (${inj.days}일)`, tone: 'bad' });
  S.dayNote = { year: career.year, dayIndex: career.dayIndex, title: o.title, items };
}

// 한 해가 끝나면 연말 평가(졸업·신입생 포함)를 바로 띄운다
function openYearEnd(S: GameState, messages: Message[]) {
  const m = messages.find((x) => x.kind === 'season' && (x.yearReview || x.final));
  if (!m) return;
  m.unread = false;
  S.messageId = m.id;
  S.screen = 'inbox';
}

// 경기 결과 메시지를 바로 연다
function openMatchReport(S: GameState, messages: Message[]) {
  const m = messages.find((x) => x.kind === 'match');
  if (!m || messages.some((x) => x.kind === 'season')) return; // 연말 평가가 떴으면 그대로 둔다
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

// 감독의 결정을 기다리는 사건이 있으면 하루를 넘기지 않고 홈 화면에서 고르게 한다
function blockedByEvent(S: GameState) {
  if (!careerOf(S).event) return false;
  S.screen = 'home';
  S.playerId = null;
  return true;
}

function trainDay(S: GameState) {
  if (blockedByEvent(S)) return;
  const condBefore = teamCondition(S);
  const { report } = advance(S, { program: S.program, intensity: S.intensity });
  // 한 해가 끝난 날은 연말 평가가 뜨므로 따로 알리지 않는다
  if (report && !report.yearEnd) {
    const done = report.training;
    const plan = !done ? '훈련'
      : done.program === 'rest' || done.program === 'scout' ? PROGRAMS[done.program].label
        : `${PROGRAMS[done.program].label} 훈련 · ${INTENSITY[done.intensity].label}`;
    noteDay(S, { title: `${report.day}일째 · ${plan}`, condBefore, growth: report.growth, injuries: report.injuries, scout: report.scout });
  }
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
    Object.assign(S, { career, inbox: [], screen: 'home', messageId: null, playerId: null, dayNote: null });
    deliver(S, [welcomeMessage(career)]);
    save(S);
  },
  reset({ S }: Ctx) {
    if (!window.confirm('지금 진행 중인 게임을 지우고 새로 시작할까요?')) return;
    stopMatchTimer(S);
    removeKey(SAVE_KEY);
    removeKey(INBOX_KEY);
    Object.assign(S, { career: null, match: null, inbox: [], messageId: null, playerId: null, dayNote: null, screen: 'home', startSeed: randomSeed() });
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
  dismissDayNote({ S }: Ctx) { S.dayNote = null; },
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
    if (blockedByEvent(S)) return;
    const growth: GrowthEvent[] = [];
    const injuries: InjuryEvent[] = [];
    const condBefore = teamCondition(S);
    S.dayNote = null;
    let ended = false; // 한 해가 끝났다
    let last: DayReport | null = null;
    let days = 0;
    while (!career.finished && !today(career)?.userMatch) {
      const names = teamNames(career);
      // 상대 분석을 하기로 해 뒀으면 분석할 수 있는 날은 AI 코치도 그 계획을 따른다
      const scout = S.program === 'scout' && today(career)?.prep?.canScout;
      const report = playDay(career, scout ? { program: 'scout' } : {});
      if (!report) break;
      days++;
      last = report;
      growth.push(...report.growth);
      injuries.push(...report.injuries);
      openYearEnd(S, deliver(S, buildMessages(career, report, names, { training: false })));
      if (report.yearEnd) { ended = true; break; }
      if (career.event) { S.screen = 'home'; break; } // 감독이 결정할 일이 생기면 거기서 멈춘다
    }
    if (last) deliver(S, [trainingDigest(last, days, growth)]);
    if (last && !ended) noteDay(S, { title: `${days}일 진행 · AI 코치가 훈련을 맡았습니다`, condBefore, growth, injuries, scout: last.scout });
    resumeAfterScouting(S);
    save(S);
  },
  simulate({ S }: Ctx) { openMatchReport(S, advance(S).fresh); resumeAfterScouting(S); save(S); },
  command({ S }: Ctx) { startCommand(S); },
  player({ S }: Ctx, id: string | null) { S.playerId = id || null; S.screen = 'squad'; },
  tactic({ S }: Ctx, key: 'focus' | 'defense' | 'pace', value: string) {
    const tactics = userTeam(S).tactics;
    if (key === 'pace') tactics.pace = Number(value);
    else if (key === 'focus') tactics.focus = value as Focus;
    else tactics.defense = value as Defense;
    save(S);
  },
  // 선발 자리(slot 0~4)에 선수를 세운다. 이미 다른 자리의 선발이면 두 선수가 자리를 바꾼다.
  starter({ S }: Ctx, slot: number, id: string) {
    const team = userTeam(S);
    const player = team.players.find((p) => p.id === id);
    if (!player || player.injuredDays || slot < 0 || slot > 4) return;
    const current = team.players.slice(0, 5).map((p) => p.id);
    const lineup = current.map((cur, i) => team.lineup?.[i] ?? cur); // 다친 선수의 지정은 그대로 둔다
    const from = current.indexOf(id);
    if (from >= 0) lineup[from] = current[slot];
    lineup[slot] = id;
    team.lineup = lineup.map((x, i) => (i !== slot && x === id ? current[slot] : x));
    setLineup(team);
    save(S);
  },
  autoLineup({ S }: Ctx) {
    const team = userTeam(S);
    delete team.lineup;
    setLineup(team);
    save(S);
  },
  // 신입생 스카우트: 영입 목표를 켜고 끈다
  recruitTarget({ S }: Ctx, id: string) {
    if (S.career && toggleRecruitTarget(S.career, id)) save(S);
  },
  // 오늘의 사건에서 선택지를 고른다. 결과는 받은 소식에 남는다.
  eventChoice({ S }: Ctx, choice: number) {
    const career = careerOf(S);
    const d = today(career);
    const r = resolveEvent(career, choice);
    if (r && d) {
      deliver(S, [{
        year: d.year, day: d.day, phase: d.phase, kind: 'event', from: r.from, title: r.title, summary: r.result[0] ?? r.chosen,
        body: [...r.body, `감독의 결정: ${r.chosen}`, ...r.result],
      }]).forEach((m) => { m.unread = false; });
      S.lastEvent = { title: r.title, chosen: r.chosen, result: r.result, day: career.dayIndex };
    }
    setLineup(userTeam(S)); // 사건으로 빠지게 된 선수가 있으면 선발을 다시 짠다
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
  dismissEnd({ S }: Ctx) { matchOf(S).endSeen = true; },
  // 경기 시작 전에는 경기 화면을 나갈 수 있다 (경기일은 그대로라 다시 들어오면 된다)
  leaveMatch({ S }: Ctx) {
    const m = matchOf(S);
    if (m.possessions > 0 || m.feed.length) return;
    stopMatchTimer(S);
    S.match = null;
    S.screen = 'home';
  },
  // 선수별 개인 지시 (경기 중 바로 적용)
  playerRole({ S }: Ctx, id: string, kind: 'offense' | 'defense', value: string) {
    const m = matchOf(S);
    const roles = { ...(m.game.view().teams[m.side].tactics.roles ?? {}) };
    const role = { ...roles[id], [kind]: value || undefined };
    if (!role.offense && !role.defense) delete roles[id];
    else roles[id] = role as PlayerRole;
    m.game.setTactics(m.side, { roles });
  },
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
  tiredAt({ S }: Ctx, level: number) {
    if (!TIRED_LEVELS.includes(level)) return;
    S.prefs.tiredAt = level;
    writeJson(PREFS_KEY, S.prefs);
  },
  feedMode({ S }: Ctx, mode: FeedMode) { S.prefs.feed = mode; writeJson(PREFS_KEY, S.prefs); },
  timeout({ S }: Ctx) {
    const m = matchOf(S);
    if (!m.game.timeout(m.side)) return;
    pushLastLog(m);
    // 작전 타임 동안 경기를 멈춰 전술과 교체를 손볼 시간을 준다
    const text = '작전 타임: 상대의 기세를 끊고 코트 위 선수들이 숨을 돌렸습니다. 전술과 교체를 손본 뒤 계속 진행하세요.';
    addNote(m, m.game.view(), 'info', text, true);
    m.pause = text;
    m.pauseFix = null;
    m.playing = false;
    m.interlude = null;
    if (!m.pending && m.timer) { clearTimeout(m.timer); m.timer = null; }
  },
  autosub({ S }: Ctx) { const m = matchOf(S); m.game.setAuto(m.side, !m.game.view().teams[m.side].auto); },
  // AI 코치에게 맡기고 건너뛴다. scope가 'period'면 이번 쿼터 끝까지만, 'game'이면 경기 끝까지.
  skip({ S }: Ctx, scope: 'period' | 'game' = 'game') {
    const m = matchOf(S);
    if (m.game.finished) return;
    stopMatchTimer(S);
    m.pause = null;
    m.selected = null;
    const wasAuto = m.game.view().teams[m.side].auto;
    const period = m.game.view().period;
    m.game.setAuto(m.side, true);
    addNote(m, m.game.view(), 'info', scope === 'game' ? 'AI 코치가 남은 경기를 맡았습니다.' : `AI 코치가 ${periodLabel(period)} 남은 시간을 맡았습니다.`);
    while (!m.game.finished) {
      const r = advanceMatch(m, S.prefs, false);
      if (scope === 'period' && r.periodEnded) break;
    }
    const [h, a] = m.game.view().teams;
    if (m.game.finished) {
      addNote(m, m.game.view(), 'info', `경기 종료 · ${h.name} ${h.score} : ${a.score} ${a.name}`);
    } else {
      m.game.setAuto(m.side, wasAuto); // 쿼터만 맡겼으면 교체 방식은 원래대로
      const text = `${periodLabel(period)} 종료 · ${h.name} ${h.score} : ${a.score} ${a.name}. 다시 직접 지휘합니다.`;
      addNote(m, m.game.view(), 'info', text, true);
      m.pause = text;
      m.pauseFix = null;
    }
  },
  pick({ S }: Ctx, where: 'court' | 'bench', id: string) {
    const m = matchOf(S);
    if (m.game.finished) return;
    if (where === 'court') { m.selected = m.selected === id ? null : id; return; }
    if (!m.selected) return;
    const outId = m.selected;
    if (m.game.substitute(m.side, outId, id)) pushLastLog(m);
    // 알림에 걸린 선수를 직접 바꿨으면 그 선수는 해결된 것으로 본다
    if (m.pauseFix?.kind === 'sub' && m.pauseFix.playerIds.includes(outId)) {
      const left = m.pauseFix.playerIds.filter((x) => x !== outId);
      if (left.length) m.pauseFix = { ...m.pauseFix, playerIds: left };
      else {
        m.pauseFix = null;
        if (m.pause) m.pause = '교체를 마쳤습니다. 계속 진행하세요.';
      }
    }
    m.selected = null;
  },
  // 알림 띠의 추천 교체: 고르는 단계 없이 바로 바꾼다
  // 지친 선수가 여럿이면 [나갈 선수, 들어갈 선수] 짝을 한꺼번에 받는다
  swap({ S }: Ctx, pairs: [string, string][]) {
    const m = matchOf(S);
    if (m.game.finished) return;
    const me = m.game.view().teams[m.side];
    const nameOf = Object.fromEntries([...me.court, ...me.bench].map((p) => [p.id, p.name]));
    const done: string[] = [];
    for (const [outId, inId] of pairs) {
      if (!m.game.substitute(m.side, outId, inId)) continue;
      pushLastLog(m);
      done.push(`${nameOf[outId]} → ${nameOf[inId]}`);
    }
    m.pauseFix = null;
    m.selected = null;
    if (m.pause && done.length) m.pause = `교체 완료: ${done.join(', ')}. 계속 진행하세요.`;
  },
  matchTactic({ S }: Ctx, key: keyof Tactics, value: string) {
    const m = matchOf(S);
    m.game.setTactics(m.side, { [key]: key === 'pace' ? Number(value) : value || null } as Partial<Tactics>);
  },
  finish({ S }: Ctx) {
    const m = matchOf(S);
    stopMatchTimer(S);
    S.match = null;
    openMatchReport(S, advance(S, { match: m }).fresh);
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
