// 직접 지휘하는 경기의 실시간 진행: 속도, 중요한 순간의 자동 정지, 코치 알림.
// 엔진은 공격권 하나씩 진행할 뿐이고, 언제 멈추고 무엇을 알릴지는 여기서 정한다.
import type { UserMatch } from '@/game/season';
import type { GameView, LogEvent } from '@/game/types';

export type SpeedKey = 'slow' | 'normal' | 'fast' | 'fastest';
export const SPEEDS: Record<SpeedKey, { label: string; ms: number }> = {
  slow: { label: '느리게', ms: 900 },
  normal: { label: '보통', ms: 420 },
  fast: { label: '빠르게', ms: 160 },
  fastest: { label: '매우 빠르게', ms: 40 },
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
}

export const newMatch = (m: UserMatch): ActiveMatch => ({
  ...m, feed: [], selected: null, timer: null, playing: false, pause: null, interlude: null, notes: [], flags: {},
});

const FEED_LIMIT = 400;
const NOTE_LIMIT = 40;

export const periodLabel = (period: number) => (period > 4 ? `연장 ${period - 4}` : `${period}쿼터`);
const clockText = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export function addNote(m: ActiveMatch, view: GameView, tone: NoteTone, text: string, paused = false) {
  const id = (m.notes[0]?.id ?? 0) + 1;
  m.notes.unshift({ id, period: view.period, clock: clockText(view.clock), text, tone, paused });
  if (m.notes.length > NOTE_LIMIT) m.notes.length = NOTE_LIMIT;
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
    if (e.text.includes('5반칙 퇴장')) {
      const ours = e.team === me.name;
      raise(`out:${e.text}`, ours ? 'bad' : 'good', ours ? `${e.text}. 벤치 선수가 대신 들어갑니다.` : `상대 ${e.text}.`, false);
    }
    if (e.team === opp.name && e.text.startsWith('작전 타임')) addNote(m, after, 'info', `${opp.name} 작전 타임.`);
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

// 공격권 하나를 진행한다. watch가 false면 알림 없이 진행만 한다(끝까지 맡기기).
export function advanceMatch(m: ActiveMatch, prefs: MatchPrefs, watch = true) {
  const before = m.game.view();
  const s = m.game.step();
  if (!s) return { stop: null, periodEnded: false, finished: true };
  m.feed.unshift(...[...s.events].reverse());
  if (m.feed.length > FEED_LIMIT) m.feed.length = FEED_LIMIT;
  const after = m.game.view();
  const stop = watch ? review(m, prefs, after, s.events) : null;
  if (watch && s.periodEnded) {
    const [h, a] = after.teams;
    addNote(m, after, 'info', `${s.finished ? '경기 종료' : `${periodLabel(before.period)} 종료`} · ${h.name} ${h.score} : ${a.score} ${a.name}`);
  }
  return { stop, periodEnded: s.periodEnded, finished: s.finished };
}
