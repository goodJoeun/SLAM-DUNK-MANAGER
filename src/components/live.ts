// 직접 지휘하는 경기의 실시간 진행: 속도, 코트 연출, 중요한 순간의 자동 정지, 코치 알림.
// 엔진은 공격권 하나씩 진행할 뿐이고, 언제 멈추고 무엇을 보여 줄지는 여기서 정한다.
//
// 공격권 하나는 두 단계로 진행한다.
//   1) beginPossession: 엔진을 한 공격권 진행하고 코트 연출(타임라인)을 만든다. 화면 점수·중계는 아직 그대로 둔다.
//   2) reveal: 연출이 끝나면 점수·중계·알림을 드러낸다. 그래야 슛이 들어가기 전에 점수가 먼저 바뀌지 않는다.
import type { UserMatch } from '@/game/season';
import type { Scene } from '@/game/court';
import type { BoxTeam, GameView, LogEvent, StepResult } from '@/game/types';
import { choreograph, tipOffScene } from './court/choreo';
import type { EndKind } from './court/choreo';
import type { CourtAnimation } from './court/FullCourt';

export type SpeedKey = 'slow' | 'normal' | 'fast' | 'fastest';
// perSecond: 경기 시간 1초를 몇 ms로 보여 줄지 (0이면 연출 없이 바로 진행)
// gap: 공격권 사이 쉬는 시간, keyOnly: 득점·블록·스틸이 있는 공격권만 연출한다
export const SPEEDS: Record<SpeedKey, { label: string; perSecond: number; gap: number; keyOnly?: boolean }> = {
  slow: { label: '느리게', perSecond: 260, gap: 350 },
  normal: { label: '보통', perSecond: 120, gap: 150 },
  fast: { label: '빠르게', perSecond: 70, gap: 90, keyOnly: true },
  fastest: { label: '매우 빠르게', perSecond: 0, gap: 40 },
};
export const BREAK_MS = 1500; // 쿼터 사이 휴식

export type AlertKey = 'foul' | 'tired' | 'run' | 'clutch';
export const ALERTS: Record<AlertKey, string> = {
  foul: '우리 선수 파울 4개',
  tired: '우리 선수 체력 저하',
  run: '상대 연속 8점',
  clutch: '4쿼터 막판 접전',
};

export type FeedMode = 'all' | 'key';
export const FEED_MODES: Record<FeedMode, string> = { key: '주요 장면', all: '전체' };
// 주요 장면: 득점·턴오버·블록·파울·교체·작전 타임 (빗나간 슛과 리바운드는 뺀다)
export const KEY_EVENT = /성공|턴오버|스틸|블록|파울|교체|작전 타임|퇴장/;

export interface MatchPrefs {
  speed: SpeedKey;
  alerts: Record<AlertKey, boolean>;
  feed: FeedMode;
}
export const DEFAULT_PREFS: MatchPrefs = {
  speed: 'normal',
  alerts: { foul: true, tired: true, run: true, clutch: true },
  feed: 'key',
};

export type NoteTone = 'info' | 'warn' | 'bad' | 'good';
export interface CoachNote {
  id: number;
  period: number;
  clock: string;
  text: string;
  tone: NoteTone;
  paused: boolean; // 이 알림 때문에 경기가 멈췄는지
}

// 엔진은 진행했지만 아직 화면에 드러내지 않은 공격권
export interface Pending {
  step: StepResult;
  period: number; // 이 공격권이 진행된 쿼터
}

// 직접 지휘 중인 경기
export interface ActiveMatch extends UserMatch {
  feed: LogEvent[]; // 중계 (최신이 앞)
  selected: string | null; // 교체하려고 고른 코트 위 선수
  timer: ReturnType<typeof setTimeout> | null;
  playing: boolean;
  pause: string | null; // 자동으로 멈춘 이유
  interlude: string | null; // 쿼터 사이 휴식 중이면 안내 문구
  notes: CoachNote[]; // 코치 알림 (최신이 앞)
  flags: Record<string, boolean>; // 같은 알림을 되풀이하지 않기 위한 표시
  // 코트 연출
  scene: Scene | null; // 마지막 공격권이 끝난 장면
  lastEnd: EndKind | null;
  anim: CourtAnimation | null; // 지금 재생 중인 움직임
  pending: Pending | null;
  display: { view: GameView; box: BoxTeam[] } | null; // 연출 중에 보여 줄 (이전) 점수판과 기록
  deferredLog: LogEvent[]; // 연출 중에 일어난 교체·작전 타임 (공격권을 드러낸 뒤에 중계에 붙인다)
  possessions: number;
  logMark: number; // 엔진 중계 기록에서 화면이 이미 연출에 반영한 위치
  endSeen: boolean; // 경기 종료 창을 닫았는지
}

export const newMatch = (m: UserMatch): ActiveMatch => ({
  ...m, feed: [], selected: null, timer: null, playing: false, pause: null, interlude: null, notes: [], flags: {},
  scene: null, lastEnd: null, anim: null, pending: null, display: null, deferredLog: [], possessions: 0, logMark: 0, endSeen: false,
});

const FEED_LIMIT = 400;
const NOTE_LIMIT = 40;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export const periodLabel = (period: number) => (period > 4 ? `연장 ${period - 4}` : `${period}쿼터`);
const clockText = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export function addNote(m: ActiveMatch, view: GameView, tone: NoteTone, text: string, paused = false) {
  const id = (m.notes[0]?.id ?? 0) + 1;
  m.notes.unshift({ id, period: view.period, clock: clockText(view.clock), text, tone, paused });
  if (m.notes.length > NOTE_LIMIT) m.notes.length = NOTE_LIMIT;
}

// 이 공격권을 움직임으로 보여 줄지 (빠르게는 득점·블록·스틸이 있는 공격권만)
function animates(prefs: MatchPrefs, step: StepResult) {
  const s = SPEEDS[prefs.speed];
  if (!s.perSecond) return false;
  if (!s.keyOnly) return true;
  return step.events.some((e) => e.info && ((e.info.kind === 'shot' && e.info.made) || e.info.kind === 'block' || e.info.kind === 'steal'));
}

// 1) 엔진을 한 공격권 진행하고 코트 연출을 만든다. 끝났으면 null.
export function beginPossession(m: ActiveMatch, prefs: MatchPrefs): { pending: Pending; ms: number } | null {
  const before = m.game.view();
  const result = m.game.result();
  const box = result.box;
  const pre = result.log.slice(m.logMark); // 지난 공격권 뒤에 감독이 직접 한 교체·작전 타임
  const step = m.game.step();
  if (!step) return null;
  m.logMark = result.log.length; // result().log는 엔진의 기록 배열 그 자체라 step 뒤의 길이를 담는다
  const after = m.game.view();
  const c = choreograph({
    period: before.period, after, step, pre, prev: m.scene ?? tipOffScene(before), prevEnd: m.lastEnd, seed: ++m.possessions,
    msPerSecond: SPEEDS[prefs.speed].perSecond, targetSeconds: clamp(step.elapsed, 4, 18),
  });
  const ms = animates(prefs, step) ? Math.round(c.timeline.duration) : 0;
  m.scene = c.end;
  m.lastEnd = c.endKind;
  const pending = { step, period: before.period };
  if (ms > 0) {
    m.anim = { timeline: c.timeline, startAt: performance.now() };
    m.display = { view: before, box };
    m.pending = pending;
  } else {
    m.anim = null;
  }
  return { pending, ms };
}

// 한 공격권이 끝난 뒤 상황을 살펴 알림을 남긴다. 멈춰야 하면 그 이유를 돌려준다.
function review(m: ActiveMatch, prefs: MatchPrefs, after: GameView, events: LogEvent[]): string | null {
  const me = after.teams[m.side];
  const opp = after.teams[1 - m.side];
  const manual = !me.auto; // 교체를 AI 코치에게 맡겼으면 파울·체력으로는 멈추지 않는다
  let stop: string | null = null;
  const raise = (key: string, tone: NoteTone, text: string, pause: boolean) => {
    if (m.flags[key]) return;
    m.flags[key] = true;
    addNote(m, after, tone, text, pause);
    if (pause && !stop) stop = text;
  };

  for (const p of me.court) {
    if (p.pf >= 4 && !p.out) raise(`pf4:${p.id}`, 'warn', `${p.name} 파울 4개 — 한 번 더 하면 퇴장입니다.`, prefs.alerts.foul && manual);
    if (p.energy < 40) raise(`tired:${p.id}`, 'warn', `${p.name} 체력 ${p.energy} — 교체를 고려하세요.`, prefs.alerts.tired && manual);
  }
  for (const p of [...me.court, ...me.bench]) if (p.energy >= 70) delete m.flags[`tired:${p.id}`]; // 회복하면 다시 알린다

  for (const e of events) {
    if (e.info?.kind === 'foulout') {
      const ours = e.team === me.name;
      raise(`out:${e.info.actor}`, ours ? 'bad' : 'good', ours ? `${e.text}. 벤치 선수가 대신 들어갑니다.` : `상대 ${e.text}.`, false);
    }
    if (e.info?.kind === 'timeout' && e.team === opp.name) addNote(m, after, 'info', `${opp.name} 작전 타임.`);
  }

  if (opp.run >= 8) raise('run', 'bad', `${opp.name} 연속 ${opp.run}점 — 작전 타임으로 흐름을 끊어 보세요.`, prefs.alerts.run);
  else if (opp.run < 4) delete m.flags.run;
  if (me.run >= 8) raise('myrun', 'good', `우리 팀 연속 ${me.run}점 — 흐름을 탔습니다.`, false);
  else if (me.run < 4) delete m.flags.myrun;

  const diff = me.score - opp.score;
  if (!after.finished && after.period >= 4 && after.clock <= 120 && Math.abs(diff) <= 5) {
    raise(`clutch:${after.period}`, 'warn', `막판 접전 (${diff > 0 ? '+' : ''}${diff}) — 마지막 2분입니다.`, prefs.alerts.clutch);
  }
  for (const p of opp.court) {
    for (const n of [15, 25]) if (p.pts >= n) raise(`hot:${p.id}:${n}`, 'info', `상대 ${p.name}, 벌써 ${p.pts}점 — 집중 마크를 고려하세요.`, false);
  }
  return stop;
}

// 2) 공격권 결과를 화면에 드러낸다. watch가 false면 알림 없이 진행만 한다(끝까지 맡기기).
export function reveal(m: ActiveMatch, prefs: MatchPrefs, pending: Pending, watch = true) {
  const { step } = pending;
  m.pending = null;
  m.display = null;
  m.anim = null;
  m.feed.unshift(...[...step.events].reverse());
  if (m.deferredLog.length) { m.feed.unshift(...[...m.deferredLog].reverse()); m.deferredLog = []; }
  if (m.feed.length > FEED_LIMIT) m.feed.length = FEED_LIMIT;
  const after = m.game.view();
  const stop = watch ? review(m, prefs, after, step.events) : null;
  if (watch && step.periodEnded) {
    const [h, a] = after.teams;
    addNote(m, after, 'info', `${step.finished ? '경기 종료' : `${periodLabel(pending.period)} 종료`} · ${h.name} ${h.score} : ${a.score} ${a.name}`);
  }
  return { stop, periodEnded: step.periodEnded, finished: step.finished };
}

// 연출 없이 공격권 하나를 바로 진행한다
export function advanceMatch(m: ActiveMatch, prefs: MatchPrefs, watch = true) {
  const b = beginPossession(m, { ...prefs, speed: 'fastest' });
  if (!b) return { stop: null, periodEnded: false, finished: true };
  return reveal(m, prefs, b.pending, watch);
}
