// 직접 지휘하는 경기의 실시간 진행: 속도, 코트 연출, 중요한 순간의 자동 정지, 코치 알림.
// 엔진은 공격권 하나씩 진행할 뿐이고, 언제 멈추고 무엇을 보여 줄지는 여기서 정한다.
//
// 공격권 하나는 두 단계로 진행한다.
//   1) beginPossession: 엔진을 한 공격권 진행하고 코트 연출(타임라인)을 만든다. 화면 점수·중계는 아직 그대로 둔다.
//   2) reveal: 연출이 끝나면 점수·중계·알림을 드러낸다. 그래야 슛이 들어가기 전에 점수가 먼저 바뀌지 않는다.
import type { UserMatch } from '@/game/career/season';
import type { Scene } from '@/game/match/court';
import type { BoxTeam, GameView, LogEvent, PlayerView, StepResult } from '@/game/types';
import { choreograph, tipOffScene } from '@/components/court/choreo';
import type { EndKind } from '@/components/court/choreo';
import type { CourtAnimation } from '@/components/court/FullCourt';

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

export type AlertKey = 'period' | 'foul' | 'tired' | 'run' | 'clutch';
export const ALERTS: Record<AlertKey, string> = {
  period: '쿼터 종료·하프타임',
  foul: '우리 선수 파울 트러블',
  tired: '우리 선수 체력 저하',
  run: '상대 연속 8점',
  clutch: '4쿼터 막판 접전',
};

export type FeedMode = 'all' | 'key';
export const FEED_MODES: Record<FeedMode, string> = { key: '주요 장면', all: '전체' };
// 주요 장면: 득점·턴오버·블록·파울·교체·작전 타임 (빗나간 슛과 리바운드는 뺀다)
// 주요 장면: 교체는 양이 많아 전체 보기에만 나온다
// 감독이 바꾼 전술·개인 지시도 주요 장면에 남긴다 (언제 무엇을 바꿨는지 흐름과 견줘 볼 수 있게)
export const KEY_EVENT = /성공|턴오버|스틸|블록|파울|작전 타임|퇴장|전술 변경|개인 지시/;

// 체력 저하 알림 기준: 코트 위 선수의 체력이 이 아래로 떨어지면 알린다
export const TIRED_LEVELS = [30, 40, 50];
// 한 명이 기준에 닿으면 기준에 거의 다다른 선수(이만큼 위까지)도 함께 묶어, 곧바로 같은 이유로 또 멈추지 않게 한다
const TIRED_MARGIN = 8;
// 지친 선수 대신 들어갈 벤치 선수는 체력이 이만큼은 돼야 한다 (방금 뺀 선수를 도로 넣으라고 권하지 않는다)
export const FRESH_ENERGY = 70;

export interface MatchPrefs {
  speed: SpeedKey;
  alerts: Record<AlertKey, boolean>;
  tiredAt: number;
  feed: FeedMode;
}
export const DEFAULT_PREFS: MatchPrefs = {
  speed: 'normal',
  alerts: { period: true, foul: true, tired: true, run: true, clutch: true },
  tiredAt: 40,
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

// 자동 정지 알림에서 바로 할 수 있는 조치: 문제가 된 선수들 교체, 또는 작전 타임
export type PauseFix = { kind: 'sub'; reason: 'tired' | 'foul'; playerIds: string[] } | { kind: 'timeout' };

// 팀 기록 합계 (경기 기록 비교와 쿼터별 기록에 쓴다)
export function teamTotals(t: BoxTeam) {
  const sum = (f: (p: BoxTeam['players'][number]) => number) => t.players.reduce((s, p) => s + f(p), 0);
  return {
    pts: sum((p) => p.pts), fgm: sum((p) => p.fgm), fga: sum((p) => p.fga), tpm: sum((p) => p.tpm), tpa: sum((p) => p.tpa),
    ftm: sum((p) => p.ftm), fta: sum((p) => p.fta), reb: sum((p) => p.orb + p.drb), ast: sum((p) => p.ast),
    stl: sum((p) => p.stl), blk: sum((p) => p.blk), tov: sum((p) => p.tov),
  };
}
export type TeamTotals = ReturnType<typeof teamTotals>;

// 쿼터 사이 휴식: 방금 끝난 쿼터에 두 팀이 올린 기록 (홈, 원정 순)
export interface BreakInfo {
  period: number; // 방금 끝난 쿼터
  quarter: [TeamTotals, TeamTotals];
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
  pauseFix: PauseFix | null; // 멈춘 이유를 바로 해결할 방법 (알림 띠의 버튼)
  interlude: string | null; // 쿼터 사이 휴식 중이면 안내 문구
  breakInfo: BreakInfo | null; // 쿼터가 막 끝났으면 그 쿼터의 기록 (다음 공격권이 시작되면 지운다)
  periodMark: [TeamTotals, TeamTotals] | null; // 이번 쿼터가 시작될 때의 기록 합계
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
  counter: number; // 이 경기를 만들기 직전의 career.counter. 이어 할 때 같은 값에서 다시 만들어야 같은 경기가 된다
}

export const newMatch = (m: UserMatch, counter: number): ActiveMatch => ({
  ...m, feed: [], selected: null, timer: null, playing: false, pause: null, pauseFix: null, interlude: null, breakInfo: null, periodMark: null, notes: [], flags: {},
  scene: null, lastEnd: null, anim: null, pending: null, display: null, deferredLog: [], possessions: 0, logMark: 0, endSeen: false, counter,
});

export const FEED_LIMIT = 400;
const NOTE_LIMIT = 40;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export const periodLabel = (period: number) => (period > 4 ? `연장 ${period - 4}` : `${period}쿼터`);
// 쿼터가 끝났을 때의 이름: 2쿼터 뒤는 하프타임
export const breakLabel = (period: number) => (period === 2 ? '전반 종료 · 하프타임' : `${periodLabel(period)} 종료`);
const clockText = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export function addNote(m: ActiveMatch, view: GameView, tone: NoteTone, text: string, paused = false) {
  const id = (m.notes[0]?.id ?? 0) + 1;
  m.notes.unshift({ id, period: view.period, clock: clockText(view.clock), text, tone, paused });
  if (m.notes.length > NOTE_LIMIT) m.notes.length = NOTE_LIMIT;
}

// 감독이 바꾼 전술·개인 지시를 중계에 한 줄 남긴다. 연출 중이면 그 공격권 뒤에 붙인다.
// 같은 시각에 같은 항목(key)을 여러 번 바꾸면 한 줄로 합치고(처음 값 → 마지막 값), 도로 되돌렸으면 줄을 지운다.
const changeOrigin = new WeakMap<LogEvent, { key: string; from: string }>();
export function logChange(m: ActiveMatch, key: string, label: string, from: string, to: string) {
  const v = m.game.view();
  const stamp = clockText(v.clock);
  const list = m.pending ? m.deferredLog : m.feed;
  const i = list.findIndex((e) => e.period === v.period && e.clock === stamp && changeOrigin.get(e)?.key === key);
  const origin = i >= 0 ? changeOrigin.get(list[i])!.from : from;
  if (i >= 0) list.splice(i, 1);
  if (origin === to) return;
  const [h, a] = v.teams;
  const line: LogEvent = {
    period: v.period, clock: stamp, team: v.teams[m.side].name, side: m.side, at: m.game.result().log.at(-1)?.at ?? 0,
    score: `${h.score}-${a.score}`, text: `${label}: ${origin} → ${to}`,
  };
  changeOrigin.set(line, { key, from: origin });
  if (m.pending) m.deferredLog.push(line);
  else m.feed.unshift(line);
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
  m.breakInfo = null;
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

// 이 쿼터에서 파울이 몇 개면 파울 트러블로 보는가
export const foulTroubleAt = (period: number) => Math.min(4, period + 1);

// 한 공격권이 끝난 뒤 상황을 살펴 알림을 남긴다. 멈춰야 하면 그 이유를 돌려준다.
function review(m: ActiveMatch, prefs: MatchPrefs, after: GameView, events: LogEvent[]): string | null {
  const me = after.teams[m.side];
  const opp = after.teams[1 - m.side];
  const manual = !me.auto; // 교체를 AI 코치에게 맡겼으면 파울·체력으로는 멈추지 않는다
  let stop: string | null = null;
  const raise = (key: string, tone: NoteTone, text: string, pause: boolean, fix: PauseFix | null = null) => {
    if (m.flags[key]) return;
    m.flags[key] = true;
    addNote(m, after, tone, text, pause);
    if (pause && !stop) { stop = text; m.pauseFix = fix; }
  };

  // 파울 트러블: 1쿼터에 2개, 2쿼터에 3개, 후반에 4개 (AI 감독이 선수를 아끼는 기준과 같다). 파울이 더 쌓이면 다시 알린다
  const troubleAt = foulTroubleAt(after.period);
  for (const p of me.court) {
    if (p.pf >= troubleAt && !p.out) {
      const when = after.period > 4 ? '연장' : after.period <= 2 && p.pf < 4 ? (after.period === 1 ? '1쿼터에' : '전반에') : '';
      const text = p.pf >= 4
        ? `${p.name} 파울 트러블 — 파울 4개, 한 번 더 하면 퇴장입니다.`
        : `${p.name} 파울 트러블 — ${when} 벌써 파울 ${p.pf}개입니다. 잠시 쉬게 할지 정하세요.`;
      raise(`pf:${p.id}:${p.pf}`, 'warn', text, prefs.alerts.foul && manual, { kind: 'sub', reason: 'foul', playerIds: [p.id] });
    }
  }
  // 체력: 선수마다 따로 멈추지 않고, 지친 선수들을 한 번에 묶어 알린다
  const unflagged = (p: PlayerView) => !p.out && !m.flags[`tired:${p.id}`];
  if (me.court.some((p) => unflagged(p) && p.energy < prefs.tiredAt)) {
    const group = me.court.filter((p) => unflagged(p) && p.energy < prefs.tiredAt + TIRED_MARGIN).sort((a, b) => a.energy - b.energy);
    for (const p of group) m.flags[`tired:${p.id}`] = true;
    const text = group.length === 1
      ? `${group[0].name} 체력 ${group[0].energy} — 교체를 고려하세요.`
      : `지친 선수 ${group.length}명 (${group.map((p) => `${p.name} ${p.energy}`).join(', ')}) — 교체를 고려하세요.`;
    const pause = prefs.alerts.tired && manual;
    addNote(m, after, 'warn', text, pause);
    if (pause && !stop) { stop = text; m.pauseFix = { kind: 'sub', reason: 'tired', playerIds: group.map((p) => p.id) }; }
  }
  for (const p of [...me.court, ...me.bench]) if (p.energy >= 70) delete m.flags[`tired:${p.id}`]; // 회복하면 다시 알린다

  for (const e of events) {
    if (e.info?.kind === 'foulout') {
      const ours = e.team === me.name;
      raise(`out:${e.info.actor}`, ours ? 'bad' : 'good', ours ? `${e.text}. 벤치 선수가 대신 들어갑니다.` : `상대 ${e.text}.`, false);
    }
    if (e.info?.kind === 'timeout' && e.team === opp.name) addNote(m, after, 'info', `${opp.name} 작전 타임.`);
  }

  if (opp.run >= 8) raise('run', 'bad', `${opp.name} 연속 ${opp.run}점 — 작전 타임으로 흐름을 끊어 보세요.`, prefs.alerts.run, { kind: 'timeout' });
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
  let stop = watch ? review(m, prefs, after, step.events) : null;
  if (step.periodEnded) {
    // 방금 끝난 쿼터의 기록 = 지금 합계 - 쿼터 시작 때 합계
    const now = m.game.result().box.map(teamTotals) as [TeamTotals, TeamTotals];
    const diff = (a: TeamTotals, b: TeamTotals | undefined) =>
      Object.fromEntries(Object.entries(a).map(([k, x]) => [k, x - (b?.[k as keyof TeamTotals] ?? 0)])) as TeamTotals;
    if (!step.finished) m.breakInfo = { period: pending.period, quarter: [diff(now[0], m.periodMark?.[0]), diff(now[1], m.periodMark?.[1])] };
    m.periodMark = now;
    if (watch) {
      const [h, a] = after.teams;
      const text = `${step.finished ? '경기 종료' : breakLabel(pending.period)} · ${h.name} ${h.score} : ${a.score} ${a.name}`;
      // 쿼터 사이는 감독이 손을 쓸 시간이다: 켜 두었으면 멈춰서 전술과 교체를 고치게 한다
      const pause = !step.finished && prefs.alerts.period;
      addNote(m, after, 'info', text, pause);
      if (pause && !stop) { stop = `${text}. 전술과 교체를 손본 뒤 계속 진행하세요.`; m.pauseFix = null; }
    }
  }
  return { stop, periodEnded: step.periodEnded, finished: step.finished };
}

// 연출 없이 공격권 하나를 바로 진행한다
export function advanceMatch(m: ActiveMatch, prefs: MatchPrefs, watch = true) {
  const b = beginPossession(m, { ...prefs, speed: 'fastest' });
  if (!b) return { stop: null, periodEnded: false, finished: true };
  return reveal(m, prefs, b.pending, watch);
}
