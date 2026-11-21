// 경기 화면에서 코트 양옆과 아래에 놓이는 현황 부품: 팀별 선수 기록 표, 점수 차 흐름, 쿼터별 점수, 부문별 1위.
import type { BoxPlayer, BoxTeam, LogEvent, PlayerView, TeamView } from '@/game/types';
import { POS, attrClass, condClass } from '@/components/shared/ui';

const TB_COLS: { label: string; title: string; cls?: string }[] = [
  { label: '분', title: '출전 시간(분)' },
  { label: '득점', title: '득점' },
  { label: '리바', title: '리바운드' },
  { label: '어시', title: '어시스트' },
  { label: '스', title: '스틸', cls: 'x-wide' },
  { label: '블', title: '블록', cls: 'x-wide' },
  { label: '실', title: '실책(턴오버)' },
  { label: '파', title: '파울 (5개면 퇴장)' },
  { label: '야투', title: '야투 성공/시도' },
  { label: '3점', title: '3점슛 성공/시도' },
];

// 한 팀의 지금 상황을 한눈에: 코트 위 다섯 명과 벤치의 체력·기록, 맨 아래 팀 합계.
//   onCourt/onBench  우리 팀이면 줄을 눌러 지시·교체 창을 열거나 교체한다. 없으면 onInfo(능력치 창)로 간다
//   tagsOf           선수에게 걸려 있는 지시 (이름 옆에 작은 표시로)
//   numbered         코트 그림의 번호를 이름 앞에 붙인다 (상대는 코트에 번호만 보이므로)
export function TeamBoard({ team, stats, selected, numbered = false, denyId, tagsOf, onCourt, onBench, onInfo }: {
  team: TeamView;
  stats: Record<string, BoxPlayer>;
  selected?: string | null;
  numbered?: boolean;
  denyId?: string | null;
  tagsOf?: (p: PlayerView) => string[];
  onCourt?: (id: string) => void;
  onBench?: (id: string) => void;
  onInfo: (id: string) => void;
}) {
  const row = (p: PlayerView, slot: number | null) => {
    const s = stats[p.id];
    const tags = tagsOf?.(p) ?? [];
    const press = slot != null ? onCourt ?? onInfo : onBench ?? onInfo;
    return (
      <tr key={p.id} className={`click ${selected === p.id ? 'sel' : ''} ${p.out ? 'off' : ''}`} onClick={() => press(p.id)}>
        <td className="n">
          {numbered && slot != null && <i className="slot-no" title={`코트 그림의 ${slot + 1}번`}>{slot + 1}</i>}
          <b>{p.name}</b>
          {tags.length > 0 && <i className="tb-tag" title={tags.join(' · ')}>{tags[0] === '에이스' ? '에이스' : '지시'}</i>}
          {denyId === p.id && <i className="tb-tag bad" title="집중 마크를 걸어 둔 선수">마크</i>}
        </td>
        <td className="faint">{POS[p.pos]}</td>
        <td><b className={`gv b ${attrClass(p.ovr)}`}>{p.ovr}</b></td>
        <td><b className={`en ${condClass(p.energy)}`}>{p.energy}</b></td>
        <td>{s ? Math.round(s.sec / 60) : 0}</td>
        <td><b>{s?.pts ?? 0}</b></td>
        <td>{s ? s.orb + s.drb : 0}</td>
        <td>{s?.ast ?? 0}</td>
        <td className="x-wide">{s?.stl ?? 0}</td>
        <td className="x-wide">{s?.blk ?? 0}</td>
        <td>{s?.tov ?? 0}</td>
        <td className={p.pf >= 4 ? 'bad' : ''}>{p.pf}</td>
        <td>{s ? `${s.fgm}-${s.fga}` : '0-0'}</td>
        <td>{s ? `${s.tpm}-${s.tpa}` : '0-0'}</td>
      </tr>
    );
  };
  const all = [...team.court, ...team.bench].map((p) => stats[p.id]).filter(Boolean);
  const sum = (f: (s: BoxPlayer) => number) => all.reduce((x, s) => x + f(s), 0);
  return (
    <table className="tb">
      <thead>
        <tr>
          <th className="n">코트 위</th><th title="포지션">P</th><th title="종합 능력치">종합</th><th title="체력 (낮을수록 지쳤다)">체력</th>
          {TB_COLS.map((c) => <th key={c.label} title={c.title} className={c.cls}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {team.court.map((p, i) => row(p, i))}
        <tr className="tb-sep"><td colSpan={14}>벤치</td></tr>
        {team.bench.map((p) => row(p, null))}
      </tbody>
      <tfoot>
        <tr>
          <td className="n">팀 합계</td><td /><td /><td />
          <td>{Math.round(sum((s) => s.sec) / 60)}</td>
          <td>{sum((s) => s.pts)}</td><td>{sum((s) => s.orb + s.drb)}</td><td>{sum((s) => s.ast)}</td>
          <td className="x-wide">{sum((s) => s.stl)}</td><td className="x-wide">{sum((s) => s.blk)}</td>
          <td>{sum((s) => s.tov)}</td><td>{sum((s) => s.pf)}</td>
          <td>{sum((s) => s.fgm)}-{sum((s) => s.fga)}</td><td>{sum((s) => s.tpm)}-{sum((s) => s.tpa)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

// 쿼터별 득점: 중계 기록에서 각 쿼터의 마지막 점수를 찾아 앞 쿼터와의 차이를 구한다 (홈, 원정 순)
export function quarterScores(log: LogEvent[], final: [number, number]) {
  const ends: [number, number][] = [];
  for (const e of log) {
    const [x, y] = e.score.split('-').map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) ends[e.period - 1] = [x, y];
  }
  if (ends.length) ends[ends.length - 1] = final;
  for (let i = 0; i < ends.length; i++) ends[i] ??= ends[i - 1] ?? [0, 0]; // 기록이 한 줄도 없는 쿼터는 앞 쿼터 점수 그대로
  return ends.map((q, i) => { const prev = ends[i - 1] ?? [0, 0]; return [q[0] - prev[0], q[1] - prev[1]]; });
}

export function QuarterTable({ log, teams, period }: { log: LogEvent[]; teams: TeamView[]; period: number }) {
  const quarters = quarterScores(log, [teams[0].score, teams[1].score]);
  const count = Math.max(4, quarters.length);
  return (
    <table className="qt">
      <thead><tr><th />{Array.from({ length: count }, (_, i) => <th key={i} className={i + 1 === period ? 'now' : ''}>{i < 4 ? `${i + 1}Q` : `연${i - 3}`}</th>)}<th>합계</th></tr></thead>
      <tbody>
        {teams.map((t, s) => (
          <tr key={t.name}>
            <td>{t.name}</td>
            {Array.from({ length: count }, (_, i) => <td key={i} className={i + 1 === period ? 'now' : ''}>{quarters[i] ? quarters[i][s] : '-'}</td>)}
            <td><b>{t.score}</b></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 점수 차 흐름: 가로는 경기 시간, 세로는 우리 팀 기준 점수 차. 위쪽이 우리가 앞선 구간이다.
export function FlowChart({ log, side, colors }: { log: LogEvent[]; side: number; colors: [string, string] }) {
  const points: [number, number][] = [[0, 0]];
  for (const e of log) {
    const [h, a] = e.score.split('-').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(a)) continue;
    const diff = side === 0 ? h - a : a - h;
    if (diff !== points[points.length - 1][1]) points.push([e.at, diff]);
  }
  const last = points[points.length - 1];
  const now = Math.max(last[0], log.length ? log[log.length - 1].at : 0);
  const total = Math.max(2400, Math.ceil(now / 300) * 300); // 정규 40분, 연장이면 5분씩 늘린다
  const peak = Math.max(10, ...points.map(([, d]) => Math.abs(d)));
  const W = 360, H = 150, L = 26, R = 8, T = 10, B = 20;
  const x = (t: number) => L + (t / total) * (W - L - R);
  const y = (d: number) => T + (1 - (d + peak) / (2 * peak)) * (H - T - B);
  let line = `M${x(0).toFixed(1)} ${y(0).toFixed(1)}`;
  for (const [t, d] of points.slice(1)) line += `H${x(t).toFixed(1)}V${y(d).toFixed(1)}`;
  line += `H${x(now).toFixed(1)}`;
  const area = `${line}V${y(0).toFixed(1)}H${x(0).toFixed(1)}Z`;
  const marks = Array.from({ length: Math.round(total / 600) + 1 }, (_, i) => i * 600).filter((t) => t > 0 && t < total);
  return (
    <svg className="flow" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`점수 차 흐름. 지금 ${last[1] >= 0 ? '+' : ''}${last[1]}점`}>
      <defs>
        <clipPath id="flow-up"><rect x="0" y="0" width={W} height={y(0)} /></clipPath>
        <clipPath id="flow-down"><rect x="0" y={y(0)} width={W} height={H} /></clipPath>
      </defs>
      {marks.map((t) => <line key={t} className="grid" x1={x(t)} y1={T} x2={x(t)} y2={H - B} />)}
      <path d={area} fill={colors[side]} opacity="0.45" clipPath="url(#flow-up)" />
      <path d={area} fill={colors[1 - side]} opacity="0.4" clipPath="url(#flow-down)" />
      <line className="zero" x1={L} y1={y(0)} x2={W - R} y2={y(0)} />
      <path className="line" d={line} />
      <circle className="pt" cx={x(now)} cy={y(last[1])} r="3" />
      <text className="lbl" x={L - 4} y={y(peak) + 4} textAnchor="end">+{peak}</text>
      <text className="lbl" x={L - 4} y={y(0) + 4} textAnchor="end">0</text>
      <text className="lbl" x={L - 4} y={y(-peak) + 4} textAnchor="end">−{peak}</text>
      {Array.from({ length: Math.round(total / 600) }, (_, i) => (
        <text key={i} className="lbl" x={x(i * 600 + 300)} y={H - 6} textAnchor="middle">{i < 4 ? `${i + 1}Q` : '연장'}</text>
      ))}
    </svg>
  );
}

// 부문별 1위: 두 팀에서 득점·리바운드·어시스트가 가장 많은 선수
export function Leaders({ box }: { box: BoxTeam[] }) {
  const cats: [string, (p: BoxPlayer) => number][] = [['득점', (p) => p.pts], ['리바운드', (p) => p.orb + p.drb], ['어시스트', (p) => p.ast]];
  const top = (t: BoxTeam, f: (p: BoxPlayer) => number) => t.players.reduce((a, b) => (f(b) > f(a) ? b : a));
  return (
    <ul className="lines leaders">
      {cats.map(([label, f]) => (
        <li key={label}>
          <span className="muted">{label}</span>
          <span>
            {box.map((t, i) => {
              const p = top(t, f);
              return <span key={t.name} className="ld">{i > 0 && <i className="faint"> · </i>}<small className="faint">{t.name}</small> <b>{p.name}</b> {f(p)}</span>;
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}
