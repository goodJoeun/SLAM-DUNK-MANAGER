// 풀코트 화면. 장면(Scene) 하나를 그리거나, 타임라인(Timeline)을 받아 키 사이를 부드럽게 이어 그린다.
// 장면을 누가 만들었는지(연출형이든 공간 시뮬레이션이든)는 상관하지 않는다.
import { memo, useEffect, useState } from 'react';
import { COURT } from '@/game/court';
import type { Scene, ScenePlayer, Timeline } from '@/game/court';

export interface CourtAnimation {
  timeline: Timeline;
  startAt: number; // performance.now() 기준
}

const ease = (f: number) => f * f * (3 - 2 * f);

// 타임라인의 t(ms) 시점 장면
export function sampleTimeline(tl: Timeline, t: number): Scene {
  const keys = tl.keys;
  if (t <= keys[0].t) return keys[0].scene;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.scene;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
  const e = ease(f);
  const from = new Map(a.scene.players.map((p) => [p.id, p]));
  const players: ScenePlayer[] = b.scene.players.map((p) => {
    const q = from.get(p.id) ?? p;
    return { ...p, x: q.x + (p.x - q.x) * e, y: q.y + (p.y - q.y) * e };
  });
  const ball = {
    x: a.scene.ball.x + (b.scene.ball.x - a.scene.ball.x) * f,
    y: a.scene.ball.y + (b.scene.ball.y - a.scene.ball.y) * f,
    z: b.arc ? 4 * f * (1 - f) : 0, // 슛은 포물선
    holder: f < 0.5 ? a.scene.ball.holder : b.scene.ball.holder,
  };
  return { players, ball, caption: b.caption ?? a.caption };
}

// 한쪽 끝의 코트 선 (왼쪽 기준, 오른쪽은 뒤집어 그린다)
function HalfLines() {
  const mid = COURT.width / 2;
  const cornerY = mid - COURT.threeCorner;
  const arcX = COURT.basketInset + Math.sqrt(COURT.three ** 2 - COURT.threeCorner ** 2);
  return (
    <>
      <rect className="paint" x="0" y={mid - COURT.keyWidth / 2} width={COURT.keyLength} height={COURT.keyWidth} />
      <circle className="ln" cx={COURT.keyLength} cy={mid} r={COURT.circle} />
      <path className="ln" d={`M0 ${cornerY}H${arcX}A${COURT.three} ${COURT.three} 0 0 1 ${arcX} ${COURT.width - cornerY}H0`} />
      <path className="ln" d={`M${COURT.basketInset} ${mid - COURT.restricted}A${COURT.restricted} ${COURT.restricted} 0 0 1 ${COURT.basketInset} ${mid + COURT.restricted}`} />
      <line className="board" x1="1.2" y1={mid - 0.9} x2="1.2" y2={mid + 0.9} />
      <circle className="rim" cx={COURT.basketInset} cy={mid} r="0.23" />
    </>
  );
}

const Lines = memo(function Lines() {
  const mid = COURT.width / 2;
  return (
    <g>
      <rect className="floor" x="0" y="0" width={COURT.length} height={COURT.width} />
      <HalfLines />
      <g transform={`translate(${COURT.length} 0) scale(-1 1)`}><HalfLines /></g>
      <line className="ln" x1={COURT.length / 2} y1="0" x2={COURT.length / 2} y2={COURT.width} />
      <circle className="ln" cx={COURT.length / 2} cy={mid} r={COURT.circle} />
      <rect className="ln" x="0" y="0" width={COURT.length} height={COURT.width} />
    </g>
  );
});

export default function FullCourt({ anim, scene, colors, labels, faces, mySide, selected, onPick }: {
  anim: CourtAnimation | null;
  scene: Scene;
  colors: [string, string];
  labels: Record<string, string>; // 선수 id -> 이름(성 포함)
  faces?: Record<string, string>; // 선수 id -> 이미지 주소. 있으면 등번호 대신 얼굴을 보여 준다
  mySide: number;
  selected?: string | null;
  onPick?: (id: string) => void; // 우리 팀 선수를 누르면 (교체 선택)
}) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!anim) return;
    let raf = 0;
    const end = anim.startAt + anim.timeline.duration;
    const loop = () => {
      const t = performance.now();
      setNow(t);
      if (t < end) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // 브라우저가 화면 갱신(requestAnimationFrame)을 멈춰 둔 경우에도 움직이도록 타이머로도 갱신한다
    const timer = setInterval(() => {
      const t = performance.now();
      setNow(t);
      if (t >= end) clearInterval(timer);
    }, 60);
    return () => { cancelAnimationFrame(raf); clearInterval(timer); };
  }, [anim]);

  const frame = anim ? sampleTimeline(anim.timeline, Math.max(0, now - anim.startAt)) : { ...scene, caption: undefined };
  const { ball } = frame;
  const z = ball.z ?? 0;

  return (
    <svg className="fullcourt" viewBox={`-1.2 -1.4 ${COURT.length + 2.4} ${COURT.width + 2.8}`} role="img" aria-label="풀코트 위 선수와 공의 위치">
      <defs><clipPath id="fc-face"><circle r="0.44" /></clipPath></defs>
      <Lines />
      {frame.caption && <text className="caption" x={COURT.length / 2} y="-0.42">{frame.caption}</text>}
      {frame.players.map((p) => {
        const mine = p.side === mySide;
        const hasBall = ball.holder === p.id;
        const face = faces?.[p.id];
        // 연결된 원작 이미지는 세로로 긴 상반신(4:5)이라 위쪽 얼굴 부분만, 올린 이미지는 정사각형 그대로 원 안에 넣는다
        const tall = face?.startsWith('/portraits/');
        return (
          <g
            key={p.id}
            transform={`translate(${p.x.toFixed(3)} ${p.y.toFixed(3)})`}
            className={`dot ${mine && onPick ? 'pick' : ''} ${selected === p.id ? 'sel' : ''}`}
            onClick={mine && onPick ? () => onPick(p.id) : undefined}
          >
            {hasBall && <circle className="holder" r="0.66" />}
            <circle className="body" r="0.44" fill={colors[p.side]} />
            {face ? (
              <g className="face">
                <image href={face} clipPath="url(#fc-face)" preserveAspectRatio="xMidYMin slice" {...(tall ? { x: -0.75, y: -0.44, width: 1.5, height: 1.875 } : { x: -0.44, y: -0.44, width: 0.88, height: 0.88 })} />
                <circle className="ring" r="0.44" stroke={colors[p.side]} />
                {/* 사진 오른쪽 아래에 팀 색 번호 배지 */}
                <circle className="badge" cx="0.36" cy="0.34" r="0.21" fill={colors[p.side]} />
                <text className="badge-no" x="0.36" y="0.45">{p.slot + 1}</text>
              </g>
            ) : <text className="no" y="0.15">{p.slot + 1}</text>}
            {/* 이름표가 겹치지 않게 상대는 공을 가진 선수만 이름을 보여 준다 (나머지는 마우스를 올리면 보인다) */}
            {(mine || hasBall) && <text className={`nm ${mine ? 'mine' : ''}`} y="1.0">{labels[p.id] ?? ''}</text>}
            <title>{labels[p.id] ?? ''}</title>
          </g>
        );
      })}
      <ellipse className="ball-shadow" cx={ball.x} cy={ball.y} rx={0.2 + z * 0.1} ry={0.1 + z * 0.05} opacity={0.5 - z * 0.3} />
      <circle className="ball" cx={ball.x} cy={ball.y - z * 1.6} r={0.21 * (1 + z * 0.6)} />
    </svg>
  );
}
