// 연출형 코트: 엔진이 낸 한 공격권의 기록(누가 어디서 슛, 패스, 리바운드, 스틸 ...)에 맞춰 선수 움직임을 짠다.
// 위치는 결과에 영향을 주지 않는다. 결과는 엔진이 이미 정했고, 여기서는 그 결과를 그럴듯하게 보여 줄 뿐이다.
// 여기서 쓰는 난수는 연출 전용이라 엔진 난수와 무관하다(경기 결과가 바뀌지 않는다).
import { COURT, attacksRight, fromCourt, toCourt } from '@/game/court';
import type { AttackPoint, Scene, ScenePlayer, Timeline } from '@/game/court';
import type { Defense, Focus, GameView, ShotType, StepResult } from '@/game/types';

// 공격권이 어떻게 끝났는지 (다음 공격권의 시작 모양을 정한다)
export type EndKind = 'made' | 'defReb' | 'steal' | 'turnover' | 'ft' | 'other';

type Spot = [number, number];
const BASKET: AttackPoint = { u: COURT.basketInset, v: 0 };

// 세트 오펜스 대형 (자리 0~4 = PG, SG, SF, PF, C)
const FORMATION: Record<Focus, Spot[]> = {
  balanced: [[8.2, 0], [6.0, 5.3], [6.0, -5.3], [4.6, 2.6], [1.9, -1.8]], // 4아웃 1인
  inside: [[8.0, 0.6], [6.4, 5.6], [5.8, -5.6], [2.0, 2.0], [1.8, -1.9]], // 빅맨 둘이 골밑
  outside: [[8.6, 0], [6.6, 5.2], [6.6, -5.2], [1.0, 6.5], [7.6, -3.4]], // 5아웃
};
const TRANSITION: Spot[] = [[15.0, 0.5], [12.5, 5.5], [13.0, -5.5], [14.5, 2.5], [15.5, -2.2]]; // 공을 몰고 넘어올 때
const FAST_BREAK: Spot[] = [[7.0, 0.5], [5.0, 4.5], [5.2, -4.5], [11.0, 2.0], [12.5, -1.5]]; // 스틸 뒤 속공
const ZONE: Spot[] = [[6.2, 2.4], [6.2, -2.4], [2.8, 4.3], [2.8, -4.3], [1.7, 0]]; // 2-3 존

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
const lerp = (a: AttackPoint, b: AttackPoint, f: number) => ({ u: a.u + (b.u - a.u) * f, v: a.v + (b.v - a.v) * f });
// a에서 b 쪽으로 dist만큼 (b를 넘지 않게)
function toward(a: AttackPoint, b: AttackPoint, dist: number) {
  const d = sub(b, a);
  const l = len(d);
  if (l < 1e-6) return { ...a };
  const k = Math.min(dist, l) / l;
  return { u: a.u + d.u * k, v: a.v + d.v * k };
}
const clampToCourt = (p: AttackPoint) => ({
  u: Math.max(0.4, Math.min(COURT.length - 0.4, p.u)),
  v: Math.max(-COURT.width / 2 + 0.4, Math.min(COURT.width / 2 - 0.4, p.v)),
});

export interface ChoreoInput {
  period: number; // 이 공격권이 진행된 쿼터
  after: GameView; // 공격권을 마친 뒤의 상황 (이번 공격권에 뛴 다섯 명이 코트에 있다)
  step: StepResult;
  prev: Scene | null; // 지난 공격권이 끝난 장면
  prevEnd: EndKind | null;
  seed: number;
  msPerSecond: number; // 경기 시간 1초를 몇 ms로 보여 줄지
  targetSeconds: number; // 이 공격권에 흐른 경기 시간 (연출을 대략 이 길이에 맞춘다)
}

const RUN_SPEED = 5.5; // 키 하나 동안 선수가 움직이는 평균 속도의 한도 (m/s)
const PASS_SPEED = 13; // 공이 날아가는 속도 (m/s)
const MAX_STRETCH = 1.6; // 경기 시간에 맞추려고 움직임을 늘리는 한도

interface RawKey {
  w: number;
  arc: boolean;
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

  // 시작 위치: 지난 장면에서 이어 간다. 새로 들어온 선수는 벤치(기록석 앞)에서 들어온다.
  const bench = fromCourt({ x: COURT.length / 2, y: -0.8 }, right);
  const pos: Record<string, AttackPoint> = {};
  for (const id of [...offIds, ...defIds]) {
    const p = prev?.players.find((x) => x.id === id);
    pos[id] = p ? fromCourt(p, right) : { ...bench };
  }
  let holder: string | null = prev?.ball.holder && offIds.includes(prev.ball.holder) ? prev.ball.holder : null;
  let ball: AttackPoint = prev ? fromCourt(prev.ball, right) : fromCourt({ x: COURT.length / 2, y: COURT.width / 2 }, right);
  const fixed = new Set<string>(); // 이번 키에서 따로 자리를 정한 선수 (수비 배치가 덮어쓰지 않는다)
  let phase: 'transition' | 'set' = 'transition';
  const keys: RawKey[] = [];

  const ballSpot = () => (holder ? pos[holder] : ball);

  function placeDefense() {
    const b = ballSpot();
    defIds.forEach((id, i) => {
      if (fixed.has(id)) return;
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
        pos[id] = { u: u + (b.u > 6.5 ? 0.6 : 0), v: v + b.v * 0.3 }; // 공 쪽으로 쏠린다
        return;
      }
      const onBall = offIds[i] === holder;
      const guard = toward(man, BASKET, onBall ? 1.0 : 1.9);
      pos[id] = onBall ? guard : lerp(guard, b, 0.15); // 공 없는 쪽 수비는 도움 수비를 위해 공 쪽으로 처진다
    });
  }

  // 공격수들이 자기 자리 주변에서 조금씩 움직인다
  function drift(spots: Spot[], amount: number) {
    offIds.forEach((id, i) => {
      if (fixed.has(id) || id === holder) return;
      const s = spot(spots[i]);
      pos[id] = clampToCourt({ u: s.u + (rnd() - 0.5) * amount, v: s.v + (rnd() - 0.5) * amount });
    });
  }

  function snapshot(w: number, arc = false) {
    placeDefense();
    keys.push({ w, arc, holder, ball: { ...ballSpot() }, pos: Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, clampToCourt(v)])) });
    fixed.clear();
  }

  function shotSpot(type: ShotType | undefined, cur: AttackPoint): AttackPoint {
    const side = cur.v >= 0 ? 1 : -1;
    const pick = (options: Spot[]) => { const [u, v] = options[Math.floor(rnd() * options.length)]; return { u, v: v * side }; };
    switch (type) {
      case 'rim': return { u: 1.2, v: 0.7 * side };
      case 'post': return { u: 2.5, v: 1.8 * side };
      case 'mid': return pick([[5.4, 0], [4.6, 3.4], [3.2, 4.6]]);
      case 'three': return pick([[8.5, 0], [6.4, 5.0], [1.0, 6.8]]);
      default: return cur;
    }
  }

  // 슈터를 맡은 수비수가 달려 나와 막는다
  function closeOut(shooter: string) {
    const i = offIds.indexOf(shooter);
    const guard = defIds[i];
    if (!guard) return;
    pos[guard] = toward(pos[shooter], BASKET, 0.8);
    fixed.add(guard);
  }

  function passTo(receiver: string, w = 1.1) {
    if (holder === receiver) return;
    holder = receiver;
    drift(FORMATION[focus], 1.0);
    snapshot(w);
  }

  // 슛 전에 공을 돌린다. 어시스트가 있으면 마지막 패스는 그 선수가 한다.
  function passChain(shooter: string, assist: string | undefined, passes: number) {
    let cur = holder ?? offIds[0];
    for (let i = 0; i < passes; i++) {
      const options = offIds.filter((id) => id !== cur && id !== shooter && id !== assist);
      if (!options.length) break;
      cur = options[Math.floor(rnd() * options.length)];
      passTo(cur);
    }
    if (assist && pos[assist]) passTo(assist);
    passTo(shooter, 0.9);
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

  // ---- 1) 넘어오기 ----
  keys.push({ w: 0, arc: false, holder, ball: { ...ballSpot() }, pos: { ...pos } });
  const fast = prevEnd === 'steal';
  if (!holder) holder = offIds[0]; // 득점 뒤 인바운드, 또는 바닥의 공
  offIds.forEach((id, i) => { if (id !== holder || !fast) pos[id] = spot(fast ? FAST_BREAK[i] : TRANSITION[i], 1.4); });
  snapshot(fast ? 1.4 : 3);

  // ---- 2) 세트 대형 ----
  if (!fast) {
    phase = 'set';
    if (holder !== offIds[0]) holder = offIds[0]; // 포인트 가드에게 공을 맡긴다
    offIds.forEach((id, i) => { pos[id] = spot(FORMATION[focus][i], 0.8); });
    snapshot(2);
  }
  phase = 'set';

  // ---- 3) 기록대로 진행 ----
  let fresh = true; // 새로 공격을 시작하는 중이면 패스를 돌린다
  let endKind: EndKind = 'other';
  for (const e of step.events) {
    const info = e.info;
    if (!info) continue;
    switch (info.kind) {
      case 'shot':
      case 'block': {
        const shooter = info.kind === 'shot' ? info.actor : info.other;
        if (!shooter || !pos[shooter]) break;
        if (fresh) passChain(shooter, info.assist, fast ? 0 : 1 + Math.floor(rnd() * 2));
        else passTo(shooter, 0.6);
        pos[shooter] = shotSpot(info.shot, pos[shooter]);
        fixed.add(shooter);
        closeOut(shooter);
        snapshot(1.3);
        if (info.kind === 'block') {
          const at = lerp(pos[shooter], BASKET, 0.25);
          if (info.actor && pos[info.actor]) { pos[info.actor] = toward(at, BASKET, 0.4); fixed.add(info.actor); }
          holder = null;
          ball = at;
          snapshot(0.45, true);
          ball = { u: at.u + 1.6, v: at.v + (rnd() - 0.5) * 4 };
          snapshot(0.5);
        } else {
          holder = null;
          ball = { ...BASKET };
          snapshot(0.9, true);
          if (info.made) { ball = { u: 0.9, v: 0 }; snapshot(0.35); endKind = 'made'; }
        }
        fresh = false;
        break;
      }
      case 'rebound': {
        const r = info.actor;
        if (!r || !pos[r]) break;
        pos[r] = { u: 1.6 + rnd() * 1.6, v: (rnd() - 0.5) * 4 };
        fixed.add(r);
        holder = r;
        snapshot(0.9);
        endKind = info.offensive ? 'other' : 'defReb';
        break;
      }
      case 'ft': {
        const s = info.actor;
        if (!s || !pos[s]) break;
        freeThrowLineup(s);
        holder = s;
        snapshot(1.3);
        const n = info.attempts ?? 1;
        for (let i = 0; i < n; i++) {
          freeThrowLineup(s);
          holder = null;
          ball = { ...BASKET };
          snapshot(0.7, true);
          if (i < n - 1) { freeThrowLineup(s); holder = s; snapshot(0.35); }
        }
        freeThrowLineup(s);
        ball = { u: 0.9, v: 0 };
        snapshot(0.3);
        endKind = 'ft';
        break;
      }
      case 'foul':
        snapshot(0.5); // 휘슬, 잠깐 멈춘다
        fresh = true;
        break;
      case 'steal': {
        const thief = info.actor;
        const at = info.other && pos[info.other] ? pos[info.other] : ballSpot();
        if (thief && pos[thief]) {
          pos[thief] = toward(at, BASKET, 0.3);
          fixed.add(thief);
          holder = thief;
          snapshot(0.6);
          pos[thief] = clampToCourt({ u: pos[thief].u + 4, v: pos[thief].v * 0.7 }); // 반대편으로 치고 나간다
          fixed.add(thief);
          snapshot(0.9);
        }
        endKind = 'steal';
        break;
      }
      case 'turnover': {
        const at = ballSpot();
        holder = null;
        ball = { u: at.u, v: at.v >= 0 ? 7.9 : -7.9 }; // 공이 줄 밖으로
        snapshot(0.7);
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
    for (const id of Object.keys(b.pos)) if (a.pos[id]) run = Math.max(run, len(sub(b.pos[id], a.pos[id])));
    const pass = len(sub(b.ball, a.ball));
    b.w = Math.max(b.w, run / RUN_SPEED, b.arc ? 0 : pass / PASS_SPEED);
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
    return { t: (acc / total) * duration, scene: toScene(k), arc: k.arc };
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
