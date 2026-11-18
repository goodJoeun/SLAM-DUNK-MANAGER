// 연출형 코트: 엔진이 낸 한 공격권의 기록(누가 어디서 슛, 패스, 리바운드, 스틸 ...)에 맞춰 선수 움직임을 짠다.
// 위치는 결과에 영향을 주지 않는다. 결과는 엔진이 이미 정했고, 여기서는 그 결과를 그럴듯하게 보여 줄 뿐이다.
// 여기서 쓰는 난수는 연출 전용이라 엔진 난수와 무관하다(경기 결과가 바뀌지 않는다).
//
// 공격 패턴은 기록에 맞는 것을 고른다. 예를 들어 빅맨의 골밑 득점에 가드의 어시스트가 붙어 있으면 픽앤롤,
// 포스트업 득점이면 포스트업, 윙의 3점이면 스크린을 받고 나오거나 돌파 후 빼 주는 패스로 보여 준다.
import { COURT, attacksRight, fromCourt, toCourt } from '@/game/match/court';
import type { AttackPoint, Point, Scene, ScenePlayer, Timeline } from '@/game/match/court';
import type { Defense, Focus, GameView, LogEvent, ShotType, StepResult } from '@/game/types';

// 공격권이 어떻게 끝났는지 (다음 공격권의 시작 모양을 정한다)
export type EndKind = 'made' | 'defReb' | 'steal' | 'turnover' | 'ft' | 'other';

type Spot = [number, number];
const BASKET: AttackPoint = { u: COURT.basketInset, v: 0 };

// 세트 오펜스 대형 (자리 0~4 = PG, SG, SF, PF, C)
const FORMATION: Record<Focus, Spot[]> = {
  balanced: [[8.2, 0], [6.0, 5.3], [6.0, -5.3], [4.6, 2.6], [1.9, -1.8]], // 4아웃 1인
  inside: [[8.0, 0.6], [6.4, 5.6], [5.8, -5.6], [2.0, 2.0], [1.8, -1.9]], // 빅맨 둘이 골밑
  outside: [[8.6, 0], [6.6, 5.2], [6.6, -5.2], [1.0, 6.5], [7.6, -3.4]], // 외곽 중심
  spread: [[8.6, 0], [6.6, 5.4], [6.6, -5.4], [1.0, 6.6], [1.0, -6.6]], // 5아웃: 다섯 명 모두 3점 라인 밖, 코너까지
};
const TRANSITION: Spot[] = [[15.0, 0.5], [12.5, 5.5], [13.0, -5.5], [14.5, 2.5], [15.5, -2.2]]; // 공을 몰고 넘어올 때
const FAST_BREAK: Spot[] = [[7.0, 0.5], [5.0, 4.5], [5.2, -4.5], [11.0, 2.0], [12.5, -1.5]]; // 스틸 뒤 속공
const ZONE: Spot[] = [[6.2, 2.4], [6.2, -2.4], [2.8, 4.3], [2.8, -4.3], [1.7, 0]]; // 2-3 존
const HUDDLE: Spot[] = [[-1.0, -0.4], [-0.5, -1.0], [0.3, -1.1], [0.9, -0.5], [0, -0.2]]; // 작전 타임 때 벤치 앞 (코트 좌표 오프셋)

const RUN_SPEED = 5.5; // 키 하나 동안 선수가 움직이는 평균 속도의 한도 (m/s)
const PASS_SPEED = 13; // 공이 날아가는 속도 (m/s)
const MAX_STRETCH = 1.6; // 경기 시간에 맞추려고 움직임을 늘리는 한도

// 연출용 난수 (xorshift)
function visualRng(seed: number) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a ^= a << 13; a >>>= 0;
    a ^= a >>> 17;
    a ^= a << 5; a >>>= 0;
    return a / 4294967296;
  };
}

const sub = (a: AttackPoint, b: AttackPoint) => ({ u: a.u - b.u, v: a.v - b.v });
const len = (a: AttackPoint) => Math.hypot(a.u, a.v);
const dist = (a: AttackPoint, b: AttackPoint) => len(sub(a, b));
const lerp = (a: AttackPoint, b: AttackPoint, f: number) => ({ u: a.u + (b.u - a.u) * f, v: a.v + (b.v - a.v) * f });
// a에서 b 쪽으로 d만큼 (b를 넘지 않게)
function toward(a: AttackPoint, b: AttackPoint, d: number) {
  const v = sub(b, a);
  const l = len(v);
  if (l < 1e-6) return { ...a };
  const k = Math.min(d, l) / l;
  return { u: a.u + v.u * k, v: a.v + v.v * k };
}
const clampToCourt = (p: AttackPoint) => ({
  u: Math.max(0.4, Math.min(COURT.length - 0.4, p.u)),
  v: Math.max(-COURT.width / 2 + 0.4, Math.min(COURT.width / 2 - 0.4, p.v)),
});
// 벤치(기록석 양옆) 위치. 홈은 왼쪽, 원정은 오른쪽 (코트 좌표)
const benchPoint = (side: number): Point => ({ x: COURT.length / 2 + (side === 0 ? -3.5 : 3.5), y: -0.9 });

export interface ChoreoInput {
  period: number; // 이 공격권이 진행된 쿼터
  after: GameView; // 공격권을 마친 뒤의 상황 (이번 공격권에 뛴 다섯 명이 코트에 있다)
  step: StepResult;
  pre?: LogEvent[]; // 지난 공격권 뒤에 감독이 직접 한 교체·작전 타임
  prev: Scene | null; // 지난 공격권이 끝난 장면
  prevEnd: EndKind | null;
  seed: number;
  msPerSecond: number; // 경기 시간 1초를 몇 ms로 보여 줄지
  targetSeconds: number; // 이 공격권에 흐른 경기 시간 (연출을 대략 이 길이에 맞춘다)
}

interface RawKey {
  w: number;
  arc: boolean;
  caption?: string;
  pos: Record<string, AttackPoint>;
  holder: string | null;
  ball: AttackPoint;
}

export function choreograph(input: ChoreoInput): { timeline: Timeline; end: Scene; endKind: EndKind } {
  const { period, after, step, prev, prevEnd, seed, msPerSecond, targetSeconds } = input;
  const o = step.offense;
  const d = 1 - o;
  const right = attacksRight(o, period);
  const offIds = after.teams[o].court.map((p) => p.id);
  const defIds = after.teams[d].court.map((p) => p.id);
  const focus: Focus = after.teams[o].tactics.focus ?? 'balanced';
  const defense: Defense = after.teams[d].tactics.defense ?? 'man';
  const rnd = visualRng(seed);
  const flip = rnd() < 0.5 ? 1 : -1; // 대형을 좌우로 뒤집어 매번 같은 모양이 되지 않게
  const spot = ([u, v]: Spot, jitter = 0): AttackPoint => ({ u: u + (rnd() - 0.5) * jitter, v: v * flip + (rnd() - 0.5) * jitter });
  const pickOne = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];

  // 시작 위치: 지난 장면에서 이어 간다. 새로 들어온 선수는 자기 벤치에서 들어온다.
  const pos: Record<string, AttackPoint> = {};
  for (const [ids, side] of [[offIds, o], [defIds, d]] as const) {
    for (const id of ids) {
      const p = prev?.players.find((x) => x.id === id);
      pos[id] = fromCourt(p ?? benchPoint(side), right);
    }
  }
  let holder: string | null = prev?.ball.holder && offIds.includes(prev.ball.holder) ? prev.ball.holder : null;
  let ball: AttackPoint = prev ? fromCourt(prev.ball, right) : fromCourt({ x: COURT.length / 2, y: COURT.width / 2 }, right);
  const fixed = new Set<string>(); // 이번 키에서만 따로 자리를 정한 선수 (수비 배치가 덮어쓰지 않는다)
  const hold = new Set<string>(); // 패턴이 끝날 때까지 자리를 지키는 공격수 (흩어지지 않는다)
  const offCourt = new Set<string>(); // 코트 밖(벤치 앞)에 있는 선수
  let phase: 'transition' | 'set' = 'transition';
  const keys: RawKey[] = [];

  const ballSpot = () => (holder ? pos[holder] : ball);
  const slotOf = (id: string) => offIds.indexOf(id);
  const isBig = (id: string) => slotOf(id) >= 3;
  const guardOf = (id: string) => defIds[slotOf(id)];
  const sideOf = (p: AttackPoint) => (Math.abs(p.v) < 0.6 ? (rnd() < 0.5 ? 1 : -1) : p.v > 0 ? 1 : -1);

  function placeDefense() {
    const b = ballSpot();
    const ballInPaint = holder !== null && dist(b, BASKET) < 4.6;
    let helper: string | null = null;
    if (phase === 'set' && defense !== 'zone' && ballInPaint) {
      // 돌파가 골밑까지 오면 가장 가까운 수비가 도우러 들어온다
      let best = Infinity;
      defIds.forEach((id, i) => {
        if (offIds[i] === holder || fixed.has(id)) return;
        const dd = dist(pos[id], b);
        if (dd < best) { best = dd; helper = id; }
      });
    }
    defIds.forEach((id, i) => {
      if (fixed.has(id) || offCourt.has(id)) return;
      const man = pos[offIds[i]] ?? BASKET;
      if (phase === 'transition') {
        // 프레스는 넘어오는 공격수에게 바로 붙고, 나머지는 자기 골대 앞으로 돌아간다
        if (defense === 'press') pos[id] = toward(man, BASKET, 0.9);
        else if (defense === 'zone') pos[id] = spot(ZONE[i], 0.4);
        else pos[id] = toward(spot(FORMATION[focus][i]), BASKET, 2.2);
        return;
      }
      if (defense === 'zone') {
        const [u, v] = ZONE[i];
        const sink = ballInPaint ? -0.8 : b.u > 6.5 ? 0.6 : 0; // 공이 골밑에 들어오면 다 같이 좁힌다
        pos[id] = { u: u + sink, v: v * (ballInPaint ? 0.7 : 1) + b.v * 0.3 }; // 공 쪽으로 쏠린다
        return;
      }
      const onBall = offIds[i] === holder;
      const sag = onBall ? (defense === 'drop' && i >= 3 ? 2.6 : 1.0) : 1.9; // 드롭: 빅맨은 골밑 쪽으로 물러난다
      const guard = toward(man, BASKET, sag);
      if (id === helper) pos[id] = lerp(guard, b, 0.6);
      else pos[id] = onBall ? guard : lerp(guard, b, 0.15); // 공 없는 쪽 수비는 도움 수비를 위해 공 쪽으로 처진다
    });
  }

  // 공격수들이 자기 자리 주변에서 조금씩 움직인다 (패턴에 참여 중인 선수는 제외)
  function drift(amount: number) {
    offIds.forEach((id, i) => {
      if (fixed.has(id) || hold.has(id) || offCourt.has(id) || id === holder) return;
      const s = spot(FORMATION[focus][i]);
      pos[id] = clampToCourt({ u: s.u + (rnd() - 0.5) * amount, v: s.v + (rnd() - 0.5) * amount });
    });
  }

  function snapshot(w: number, opts: { arc?: boolean; caption?: string } = {}) {
    placeDefense();
    const copy = Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, offCourt.has(k) ? { ...v } : clampToCourt(v)]));
    keys.push({ w, arc: Boolean(opts.arc), caption: opts.caption, holder, ball: { ...ballSpot() }, pos: copy });
    fixed.clear();
  }

  function put(id: string, p: AttackPoint, keep = true) {
    pos[id] = p;
    fixed.add(id);
    if (keep && offIds.includes(id)) hold.add(id);
  }

  function passTo(receiver: string, w = 1.1, caption?: string) {
    if (holder === receiver || !pos[receiver]) return;
    holder = receiver;
    drift(1.0);
    snapshot(w, { caption });
  }

  // 마지막 패스는 어시스트한 선수가 하도록 공을 건넨다
  function deliver(shooter: string, assist: string | undefined, caption?: string) {
    if (assist && assist !== shooter && pos[assist] && holder !== assist) passTo(assist, 0.9);
    passTo(shooter, 0.9, caption);
  }

  // 공을 한두 번 돌린다 (특별한 패턴이 없을 때)
  function swing(shooter: string, assist: string | undefined, passes: number) {
    let cur = holder ?? offIds[0];
    for (let i = 0; i < passes; i++) {
      const options = offIds.filter((id) => id !== cur && id !== shooter && id !== assist);
      if (!options.length) break;
      cur = pickOne(options);
      passTo(cur);
    }
    deliver(shooter, assist);
  }

  // ---------- 공격 패턴 ----------

  function pickAndRoll(handler: string, screener: string, finisher: 'handler' | 'screener', shot: ShotType | undefined) {
    const start = pos[handler];
    const s = sideOf(start);
    const screenAt = { u: start.u - 1.1, v: start.v + s * 0.9 };
    put(screener, screenAt);
    put(handler, start);
    snapshot(1.1, { caption: '픽앤롤' });
    // 스크린을 타고 드리블. 막던 수비는 스크린에 걸린다
    const pullUpThree = finisher === 'handler' && shot === 'three';
    const drive = pullUpThree ? { u: 8.0, v: s * 2.6 } : { u: start.u - 2.8, v: start.v + s * 2.6 };
    put(handler, drive);
    const hg = guardOf(handler);
    if (hg) { pos[hg] = lerp(screenAt, start, 0.6); fixed.add(hg); }
    const sg = guardOf(screener);
    if (sg) { pos[sg] = toward(drive, BASKET, 0.9); fixed.add(sg); } // 스크리너 수비가 돌파를 막으러 나온다
    snapshot(1.1);
    if (finisher === 'screener') {
      const roll = shot === 'rim' || shot === 'post' ? { u: 2.2, v: s * 0.6 } : shot === 'three' ? { u: 7.6, v: s * 3.4 } : { u: 5.2, v: s * 1.4 };
      put(screener, roll);
      if (shot === 'rim' || shot === 'post') put(handler, toward(drive, BASKET, 1.4));
      snapshot(1.0, { caption: shot === 'rim' || shot === 'post' ? '스크린 뒤 골밑으로' : '스크린 뒤 바깥으로' });
      passTo(screener, 0.7);
    } else if (shot === 'rim') {
      put(handler, { u: 2.0, v: s * 1.0 });
      put(screener, { u: 2.6, v: -s * 1.2 });
      snapshot(1.0, { caption: '돌파' });
    } else if (shot === 'mid') {
      put(handler, { u: 4.8, v: s * 2.6 });
      snapshot(0.8);
    }
  }

  function postUp(post: string, assist: string | undefined) {
    const s = sideOf(pos[post]);
    put(post, { u: 2.4, v: s * 1.9 });
    const pg = guardOf(post);
    if (pg) { pos[pg] = { u: 1.9, v: s * 1.6 }; fixed.add(pg); } // 뒤에 붙어 버틴다
    // 같은 쪽 윙으로 공을 옮긴 뒤 포스트로 넣는다
    const wing = assist && assist !== post ? assist : offIds.filter((id) => id !== post && slotOf(id) <= 2).sort((a, b) => dist(pos[a], { u: 5.6, v: s * 5 }) - dist(pos[b], { u: 5.6, v: s * 5 }))[0];
    if (wing) put(wing, { u: 5.8, v: s * 5.0 });
    snapshot(1.2, { caption: '포스트업' });
    if (wing && holder !== wing) passTo(wing, 0.9);
    passTo(post, 0.8);
    put(post, { u: 1.9, v: s * 1.3 }); // 등지고 밀고 들어간다
    if (pg) { pos[pg] = { u: 1.6, v: s * 0.9 }; fixed.add(pg); }
    snapshot(0.9);
  }

  function offScreen(shooter: string, assist: string | undefined, shot: ShotType | undefined) {
    const s = sideOf(pos[shooter]);
    const screener = offIds.filter((id) => id !== shooter && isBig(id))[0] ?? offIds.find((id) => id !== shooter && id !== holder);
    const low = { u: 1.4, v: s * 4.4 };
    put(shooter, low);
    if (screener) put(screener, { u: 3.0, v: s * 3.4 });
    snapshot(1.2, { caption: '스크린을 받고 슛' });
    const out = shot === 'three' ? pickOne([{ u: 6.3, v: s * 5.0 }, { u: 7.9, v: s * 3.0 }]) : { u: 4.5, v: s * 3.6 };
    put(shooter, out);
    const g = guardOf(shooter);
    if (g && screener) { pos[g] = lerp(pos[screener], low, 0.4); fixed.add(g); } // 스크린에 걸려 늦는다
    snapshot(1.1);
    deliver(shooter, assist);
  }

  function cut(shooter: string, assist: string | undefined) {
    const s = sideOf(pos[shooter]);
    put(shooter, { u: 6.9, v: s * 5.6 });
    snapshot(0.8, { caption: '백도어 컷' }); // 바깥으로 빠지는 척하다가
    const from = pos[shooter];
    put(shooter, { u: 1.7, v: s * 0.9 });
    const g = guardOf(shooter);
    if (g) { pos[g] = toward(from, pos[shooter], 1.8); fixed.add(g); }
    snapshot(1.0);
    deliver(shooter, assist);
  }

  function driveKick(shooter: string, assist: string | undefined, shot: ShotType | undefined) {
    let driver = assist && assist !== shooter ? assist : holder ?? offIds[0];
    if (driver === shooter) driver = offIds.find((id) => id !== shooter) ?? driver;
    if (holder !== driver) passTo(driver, 0.9);
    const s = sideOf(pos[driver]);
    put(driver, { u: 3.4, v: s * 1.0 });
    const open = shot === 'three' ? pickOne([{ u: 1.0, v: -s * 6.7 }, { u: 6.4, v: -s * 5.0 }]) : { u: 4.6, v: -s * 3.6 };
    put(shooter, open);
    snapshot(1.2, { caption: '돌파 후 패스' });
    passTo(shooter, 0.8);
  }

  function iso(handler: string, shot: ShotType | undefined) {
    const s = sideOf(pos[handler]);
    put(handler, shot === 'rim' ? { u: 1.8, v: s * 0.9 } : shot === 'mid' ? { u: 4.6, v: s * 2.2 } : { u: 8.0, v: s * 1.5 });
    snapshot(1.3, { caption: '1대1' });
  }

  function catchAndDrive(shooter: string, assist: string | undefined) {
    deliver(shooter, assist);
    const s = sideOf(pos[shooter]);
    put(shooter, { u: 1.8, v: s * 1.0 });
    snapshot(1.0, { caption: '돌파' });
  }

  // 기록(누가, 무슨 슛, 누구의 어시스트)에 맞는 패턴을 고른다
  function runPlay(shooter: string, assist: string | undefined, shot: ShotType | undefined) {
    const handler = holder ?? offIds[0];
    const r = rnd();
    if (shot === 'post') return postUp(shooter, assist);
    if (shooter === handler) {
      if (assist) return driveKick(shooter, assist, shot); // 공을 빼 줬다가 다시 받아 쏜다
      const screener = offIds.filter((id) => id !== handler && isBig(id))[0];
      return r < 0.65 && screener ? pickAndRoll(handler, screener, 'handler', shot) : iso(handler, shot);
    }
    if (isBig(shooter) && (!assist || assist === handler) && shot !== 'three' && r < 0.75) {
      return pickAndRoll(handler, shooter, 'screener', shot);
    }
    if (shot === 'rim') return r < 0.5 ? cut(shooter, assist) : catchAndDrive(shooter, assist);
    if (shot === 'three' || shot === 'mid') return r < 0.5 ? offScreen(shooter, assist, shot) : driveKick(shooter, assist, shot);
    return swing(shooter, assist, 1 + Math.floor(rnd() * 2));
  }

  // 슛 자리: 이미 알맞은 자리에 있으면 그대로, 아니면 가장 가까운 자리로
  function shotSpot(type: ShotType | undefined, cur: AttackPoint): AttackPoint {
    const r = dist(cur, BASKET);
    const s = cur.v >= 0 ? 1 : -1;
    const nearest = (options: Spot[]) => options.map(([u, v]) => ({ u, v: v * s })).sort((a, b) => dist(a, cur) - dist(b, cur))[0];
    switch (type) {
      case 'rim': return r < 2.2 ? cur : { u: 1.3, v: 0.8 * s };
      case 'post': return r < 3.2 ? cur : { u: 2.4, v: 1.8 * s };
      case 'mid': return r > 3.2 && r < 6.4 ? cur : nearest([[5.6, 0], [4.6, 3.4], [3.2, 4.6]]);
      case 'three': return r > 6.8 ? cur : nearest([[8.6, 0], [6.4, 5.1], [1.0, 6.8]]);
      default: return cur;
    }
  }

  // 슈터를 맡은 수비수가 달려 나와 막는다
  function closeOut(shooter: string, late = false) {
    const g = guardOf(shooter);
    if (!g) return;
    pos[g] = toward(pos[shooter], BASKET, late ? 1.8 : 0.8);
    fixed.add(g);
  }

  // 빗나간 슛: 수비는 자기 선수와 림 사이로 들어가 막고(박스아웃), 공격 빅맨은 림으로 달려든다
  function boxOut(shooter: string) {
    defIds.forEach((id, i) => { pos[id] = toward(pos[offIds[i]], BASKET, 0.7); fixed.add(id); });
    offIds.forEach((id, i) => {
      if (i >= 3 || id === shooter) pos[id] = toward(pos[id], BASKET, 1.6);
      else if (i === 0) pos[id] = { u: 9.0, v: 0 }; // 포인트 가드는 수비로 돌아갈 준비
      fixed.add(id);
    });
  }

  function freeThrowLineup(shooter: string) {
    pos[shooter] = { u: COURT.keyLength, v: 0 };
    fixed.add(shooter);
    const lane: Spot[] = [[2.3, 2.75], [2.3, -2.75], [3.4, 2.75], [3.4, -2.75], [4.4, 2.75]];
    const others = [...defIds.slice(0, 3), ...offIds.filter((id) => id !== shooter).slice(0, 2)];
    others.forEach((id, i) => { pos[id] = { u: lane[i][0], v: lane[i][1] }; fixed.add(id); });
    const rest = [...defIds.slice(3), ...offIds.filter((id) => id !== shooter).slice(2)];
    rest.forEach((id, i) => { pos[id] = { u: 8.6, v: (i % 2 ? -1 : 1) * (2.5 + i) }; fixed.add(id); });
  }

  // 작전 타임: 양 팀이 자기 벤치 앞으로 모인다
  function huddle(caption: string) {
    ball = { ...ballSpot() }; // 공은 그 자리에 두고 모인다
    holder = null;
    for (const [ids, side] of [[offIds, o], [defIds, d]] as const) {
      const bench = benchPoint(side);
      ids.forEach((id, i) => {
        const [dx, dy] = HUDDLE[i];
        pos[id] = fromCourt({ x: bench.x + dx, y: -0.3 + dy }, right);
        offCourt.add(id);
        fixed.add(id);
      });
    }
    snapshot(1.6, { caption });
    for (const id of [...offIds, ...defIds]) fixed.add(id);
    snapshot(1.4, { caption });
    offCourt.clear();
  }

  // ---- 0) 공격권 사이의 작전 타임 ----
  keys.push({ w: 0, arc: false, holder, ball: { ...ballSpot() }, pos: { ...pos } });
  const lead: LogEvent[] = [...(input.pre ?? [])];
  for (const e of step.events) {
    if (e.info?.kind === 'timeout' || e.info?.kind === 'sub') lead.push(e);
    else break;
  }
  const timeoutBy = lead.find((e) => e.info?.kind === 'timeout');
  if (timeoutBy) huddle(`${timeoutBy.team} 작전 타임`);

  // ---- 1) 넘어오기 ----
  const fast = prevEnd === 'steal';
  if (!holder) holder = offIds[0]; // 득점 뒤 인바운드, 또는 바닥의 공
  offIds.forEach((id, i) => { if (id !== holder || !fast) pos[id] = spot(fast ? FAST_BREAK[i] : TRANSITION[i], 1.4); });
  snapshot(fast ? 1.4 : 3, { caption: fast ? '속공' : undefined });

  // ---- 2) 세트 대형 ----
  if (!fast) {
    phase = 'set';
    if (holder !== offIds[0]) holder = offIds[0]; // 포인트 가드에게 공을 맡긴다
    offIds.forEach((id, i) => { pos[id] = spot(FORMATION[focus][i], 0.8); });
    snapshot(2);
  }
  phase = 'set';

  // ---- 3) 기록대로 진행 ----
  let fresh = true; // 새로 공격을 시작하는 중이면 패턴을 쓴다
  let endKind: EndKind = 'other';
  for (const e of step.events) {
    const info = e.info;
    if (!info) continue;
    switch (info.kind) {
      case 'shot':
      case 'block': {
        const shooter = info.kind === 'shot' ? info.actor : info.other;
        if (!shooter || !pos[shooter]) break;
        if (fresh && !fast) runPlay(shooter, info.assist, info.shot);
        else if (fresh) deliver(shooter, info.assist); // 속공은 바로 연결
        else passTo(shooter, 0.6); // 공격 리바운드 뒤 곧바로
        put(shooter, shotSpot(info.shot, pos[shooter]));
        closeOut(shooter, info.kind === 'shot' && info.made && rnd() < 0.5);
        snapshot(0.9);
        hold.clear();
        if (info.kind === 'block') {
          const at = lerp(pos[shooter], BASKET, 0.25);
          if (info.actor && pos[info.actor]) { pos[info.actor] = toward(at, BASKET, 0.4); fixed.add(info.actor); }
          holder = null;
          ball = at;
          snapshot(0.45, { arc: true, caption: '블록!' });
          ball = { u: at.u + 1.6, v: at.v + (rnd() - 0.5) * 4 };
          boxOut(shooter);
          snapshot(0.5, { caption: '블록!' });
        } else {
          holder = null;
          ball = { ...BASKET };
          snapshot(0.9, { arc: true });
          if (info.made) {
            ball = { u: 0.9, v: 0 };
            snapshot(0.35, { caption: info.shot === 'three' ? '3점슛!' : '득점' });
            endKind = 'made';
          } else {
            ball = { u: 2.0 + rnd() * 1.2, v: (rnd() - 0.5) * 3 };
            boxOut(shooter);
            snapshot(0.45, { caption: '리바운드 다툼' });
          }
        }
        fresh = false;
        break;
      }
      case 'rebound': {
        const r = info.actor;
        if (!r || !pos[r]) break;
        put(r, { u: 1.6 + rnd() * 1.6, v: (rnd() - 0.5) * 4 }, false);
        holder = r;
        snapshot(0.7, { caption: info.offensive ? '공격 리바운드' : undefined });
        endKind = info.offensive ? 'other' : 'defReb';
        break;
      }
      case 'ft': {
        const s = info.actor;
        if (!s || !pos[s]) break;
        freeThrowLineup(s);
        holder = s;
        snapshot(1.3, { caption: '자유투' });
        const n = info.attempts ?? 1;
        for (let i = 0; i < n; i++) {
          freeThrowLineup(s);
          holder = null;
          ball = { ...BASKET };
          snapshot(0.7, { arc: true, caption: '자유투' });
          if (i < n - 1) { freeThrowLineup(s); holder = s; snapshot(0.35); }
        }
        freeThrowLineup(s);
        ball = { u: 0.9, v: 0 };
        snapshot(0.3);
        endKind = 'ft';
        break;
      }
      case 'foul':
        snapshot(0.5, { caption: '파울' }); // 휘슬, 잠깐 멈춘다
        hold.clear();
        fresh = true;
        break;
      case 'steal': {
        const thief = info.actor;
        const at = info.other && pos[info.other] ? pos[info.other] : ballSpot();
        if (thief && pos[thief]) {
          put(thief, toward(at, BASKET, 0.3), false);
          holder = thief;
          snapshot(0.6, { caption: '스틸!' });
          put(thief, clampToCourt({ u: pos[thief].u + 4, v: pos[thief].v * 0.7 }), false); // 반대편으로 치고 나간다
          snapshot(0.9);
        }
        endKind = 'steal';
        break;
      }
      case 'turnover': {
        const at = ballSpot();
        holder = null;
        ball = { u: at.u, v: at.v >= 0 ? 7.9 : -7.9 }; // 공이 줄 밖으로
        snapshot(0.7, { caption: '턴오버' });
        endKind = 'turnover';
        break;
      }
      default:
        break; // 교체·작전 타임·퇴장은 공격권 사이에 일어난다
    }
  }

  // ---- 키를 시간으로 바꾼다 ----
  // 키마다 기본 길이(초)를 두되, 멀리 움직이는 키는 사람이 뛸 수 있는 속도가 되도록 늘린다
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    let run = 0;
    for (const id of Object.keys(b.pos)) if (a.pos[id]) run = Math.max(run, dist(b.pos[id], a.pos[id]));
    b.w = Math.max(b.w, run / RUN_SPEED, b.arc ? 0 : dist(b.ball, a.ball) / PASS_SPEED);
  }
  let seconds = keys.reduce((s, k) => s + k.w, 0) || 1;
  // 실제로 흐른 경기 시간보다 짧으면 조금 늘려서 경기 시계와 비슷하게 맞춘다
  const stretch = Math.min(MAX_STRETCH, Math.max(1, targetSeconds / seconds));
  seconds *= stretch;
  const duration = Math.max(1, seconds * msPerSecond);
  const total = keys.reduce((s, k) => s + k.w, 0) || 1;
  let acc = 0;
  const toScene = (k: RawKey): Scene => {
    const players: ScenePlayer[] = [
      ...offIds.map((id, slot) => ({ id, side: o, slot, ...toCourt(k.pos[id], right) })),
      ...defIds.map((id, slot) => ({ id, side: d, slot, ...toCourt(k.pos[id], right) })),
    ];
    const at = toCourt(k.ball, right);
    // 공을 가진 선수의 손 위치
    const ballAt = k.holder ? { x: at.x + 0.32, y: at.y - 0.28 } : at;
    return { players, ball: { ...ballAt, holder: k.holder } };
  };
  const timelineKeys = keys.map((k) => {
    acc += k.w;
    return { t: (acc / total) * duration, scene: toScene(k), arc: k.arc, caption: k.caption };
  });
  return { timeline: { duration, keys: timelineKeys }, end: timelineKeys[timelineKeys.length - 1].scene, endKind };
}

// 경기 시작 전: 센터 서클 주변에 선다
export function tipOffScene(view: GameView): Scene {
  const players: ScenePlayer[] = [];
  const around: Spot[] = [[-2.4, 0], [-3.5, 3.5], [-3.5, -3.5], [-1.6, 2.4], [-0.6, 0]];
  view.teams.forEach((t, side) => {
    const dir = attacksRight(side, 1) ? -1 : 1; // 자기 진영 쪽
    t.court.forEach((p, slot) => {
      const [du, dv] = around[slot];
      players.push({ id: p.id, side, slot, x: COURT.length / 2 - dir * du, y: COURT.width / 2 + dv });
    });
  });
  return { players, ball: { x: COURT.length / 2, y: COURT.width / 2, holder: null } };
}
