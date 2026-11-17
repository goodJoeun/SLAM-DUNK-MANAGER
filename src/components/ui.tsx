// 여러 화면이 함께 쓰는 작은 부품과 표기 규칙.
import type { CSSProperties, ReactNode } from 'react';
import { playerRating } from '@/game/review';
import type { BoxTeam, Career, Defense, Focus, GrowthEvent, Match, NameStyle, RatingKey, Tactics } from '@/game/types';
import type { MatchLine } from './inbox';
import type { Act, PlayingState } from './useGame';

// 게임을 시작한 뒤의 화면들이 받는 속성
export interface ViewProps {
  S: PlayingState;
  act: Act;
}

export const NAME_STYLE: Record<NameStyle, string> = { kr: '한국어판', jp: '원작' };
export const POS = ['', 'PG', 'SG', 'SF', 'PF', 'C'];
export const POS_NAME = ['', '포인트 가드', '슈팅 가드', '스몰 포워드', '파워 포워드', '센터'];
export const FOCUS: Record<Focus, string> = { balanced: '균형', inside: '골밑 중심', outside: '외곽 중심', spread: '5아웃' };
export const DEFENSE: Record<Defense, string> = { man: '맨투맨', zone: '존', press: '프레스', switch: '스위치', drop: '드롭' };
// 객체로 두면 "0", "1"이 "-1"보다 앞에 나열되므로 순서를 배열로 고정한다
export const PACE: [string, string][] = [['-1', '느리게'], ['0', '보통'], ['1', '빠르게']];

// 선수별 개인 지시
export const OFFENSE_ROLE: [string, string][] = [
  ['aggressive', '적극 공격'], ['conservative', '슛 자제'], ['three', '3점 위주'], ['drive', '돌파'], ['post', '포스트업'], ['pass', '패스 우선'],
];
export const DEFENSE_ROLE: [string, string][] = [['tight', '타이트 마크'], ['safe', '파울 조심']];

type Options = Record<string, string> | [string, string][];
const entries = (options: Options) => (Array.isArray(options) ? options : Object.entries(options));

export const RATING_SHORT: Record<RatingKey, string> = {
  hgt: '키', str: '힘', spd: '스피드', jmp: '점프', end: '지구력', ins: '골밑', dnk: '마무리', ft: '자유투',
  mid: '미들', tp: '3점', oiq: '공격IQ', diq: '수비IQ', drb: '드리블', pss: '패스', reb: '리바',
};
export const ATTR_GROUPS: { title: string; keys: RatingKey[] }[] = [
  { title: '공격', keys: ['ins', 'dnk', 'mid', 'tp', 'ft', 'drb', 'pss', 'oiq'] },
  { title: '수비', keys: ['diq', 'reb'] },
  { title: '신체', keys: ['hgt', 'str', 'spd', 'jmp', 'end'] },
];



export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
export const pct = (made: number, tried: number) => (tried ? `${Math.round((100 * made) / tried)}%` : '-');
export const condClass = (c: number) => (c < 50 ? 'low' : c < 75 ? 'mid' : 'green');

export const userTeam = (career: Career) => career.teams[career.userTeamId];
export const teamName = (career: Career, id: string) => career.teams[id]?.name ?? '?';
export const isUser = (career: Career, id: string | undefined) => id === career.userTeamId;

// ---------- 학교 색과 문장 ----------

// 학교 이름으로 고정된 색상을 정한다
export function clubHue(name: string) {
  let h = 7;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 360;
  return h;
}
export const clubColor = (name: string) => `hsl(${clubHue(name)} 62% 46%)`;
export const clubVars = (name: string) => ({ '--club': clubColor(name) }) as CSSProperties;

export function Crest({ name, size = 32 }: { name: string; size?: number }) {
  const hue = clubHue(name);
  return (
    <svg width={size} height={(size * 36) / 32} viewBox="0 0 32 36" aria-hidden="true" style={{ flex: 'none' }}>
      <path d="M16 1.5 30 6v12c0 8.6-6.2 13.7-14 16.5C8.2 31.7 2 26.6 2 18V6z" fill={`hsl(${hue} 62% 40%)`} stroke={`hsl(${hue} 70% 72%)`} strokeWidth="1.5" />
      <path d="M2.8 13h26.4" stroke={`hsl(${hue} 70% 72% / .45)`} strokeWidth="1" />
      <text x="16" y="25" textAnchor="middle" fontSize="12.5" fontWeight="800" fill="#fff">{name.slice(0, 1)}</text>
    </svg>
  );
}

// ---------- 아이콘 ----------

const ICONS = {
  home: ['M3 11 12 4l9 7', 'M5 9.5V20h5v-6h4v6h5V9.5'],
  inbox: ['M3 6h18v12H3z', 'm3 7 9 6 9-6'],
  squad: ['M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5', 'M16.5 11a2.5 2.5 0 1 0 0-5', 'M17 14.6c2.4.4 4 2.1 4 4.9'],
  tactics: ['M4 3h16v18H4z', 'M8 8l3 3m0-3-3 3', 'M15 16.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M9.5 15.5c1.8-3 3.6-4.5 5.5-4.5'],
  training: ['M6.5 7v10', 'M17.5 7v10', 'M3.5 9.5v5', 'M20.5 9.5v5', 'M6.5 12h11'],
  trophy: ['M8 4h8v5a4 4 0 0 1-8 0z', 'M8 6H5a3 3 0 0 0 3 4', 'M16 6h3a3 3 0 0 1-3 4', 'M12 13v4', 'M8 20h8', 'M10 17h4v3h-4z'],
  chart: ['M4 20V11', 'M10 20V5', 'M16 20v-7', 'M21 20H3'],
  ball: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M3 12h18', 'M12 3v18', 'M5.6 5.6c3 3 3 9.8 0 12.8', 'M18.4 5.6c-3 3-3 9.8 0 12.8'],
  cross: ['M12 5v14', 'M5 12h14'],
  alert: ['M12 4 2.5 20h19z', 'M12 10v4.5', 'M12 17.5h.01'],
  next: ['m9 6 6 6-6 6'],
  back: ['m15 6-6 6 6 6'],
  bulb: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z'],
} satisfies Record<string, string[]>;
export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

// ---------- 능력치 표기 ----------

export const attrClass = (v: number) => (v >= 85 ? 'a5' : v >= 70 ? 'a4' : v >= 55 ? 'a3' : v >= 40 ? 'a2' : 'a1');

export function Attr({ v, big = false }: { v: number; big?: boolean }) {
  return <span className={`attr ${attrClass(v)} ${big ? 'big' : ''}`}>{Math.round(v)}</span>;
}

// 현재 능력(종합)과 성장 잠재력을 반 개 단위 별 5개로
export const abilityStars = (ovr: number) => clamp(Math.round(((ovr - 25) / 12) * 2) / 2, 0.5, 5);
export const potentialStars = (potential: number) => clamp(Math.round((potential / 20) * 2) / 2, 0.5, 5);

export function Stars({ value }: { value: number }) {
  return <span className="stars" style={{ '--v': `${(value / 5) * 100}%` } as CSSProperties} title={`별 ${value}개`} />;
}

export function CondBar({ value, wide = false }: { value: number; wide?: boolean }) {
  return <span className={`cond ${wide ? 'wide' : ''}`}><i className={condClass(value)} style={{ width: `${clamp(value, 0, 100)}%` }} /></span>;
}

export function PosBadge({ pos }: { pos: number }) {
  return <span className={`pos p${pos}`} title={POS_NAME[pos]}>{POS[pos]}</span>;
}

// ---------- 틀 ----------

export function PageTitle({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-title">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Panel({ title, action, flush = false, className = '', children }: {
  title: string;
  action?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`panel ${flush ? 'flush' : ''} ${className}`}>
      <header className="panel-h"><h2>{title}</h2>{action}</header>
      <div className="panel-b">{children}</div>
    </section>
  );
}

// ---------- 입력 ----------

// { 값: 라벨 } 맵으로 만드는 선택 상자
export function Select({ options, value, onChange, style, children }: {
  options: Options;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} style={style}>
      {children}
      {entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

export function Seg({ options, value, onChange }: {
  options: Options;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div className="seg" role="group">
      {entries(options).map(([k, label]) => (
        <button key={k} className={String(value) === k ? 'on' : ''} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

// 경기 중 전술 변경용 선택 상자 세 개
export function TacticSelects({ tactics, onChange }: {
  tactics: Partial<Tactics>;
  onChange: (key: 'focus' | 'defense' | 'pace', value: string) => void;
}) {
  return (
    <div className="controls">
      <label className="hint">공격 중심<Select options={FOCUS} value={tactics.focus} onChange={(v) => onChange('focus', v)} /></label>
      <label className="hint">수비<Select options={DEFENSE} value={tactics.defense} onChange={(v) => onChange('defense', v)} /></label>
      <label className="hint">템포<Select options={PACE} value={Math.round(tactics.pace ?? 0)} onChange={(v) => onChange('pace', v)} /></label>
    </div>
  );
}

// ---------- 경기 결과 ----------

export const linesOf = (career: Career, matches: Match[]): MatchLine[] => matches.map((m) => ({
  home: teamName(career, m.home), away: teamName(career, m.away), homeScore: m.homeScore, awayScore: m.awayScore,
  overtime: m.overtime, mine: isUser(career, m.home) || isUser(career, m.away),
}));

export function ResultList({ lines }: { lines: MatchLine[] }) {
  return (
    <ul className="lines results">
      {lines.map((m, i) => {
        const homeWon = m.homeScore > m.awayScore;
        return (
          <li key={i} className={m.mine ? 'me' : ''}>
            <span className={homeWon ? 'win' : ''}>{m.home}</span>
            <span className="score">{m.homeScore} - {m.awayScore}{m.overtime ? ' (연)' : ''}</span>
            <span className={`r ${homeWon ? '' : 'win'}`}>{m.away}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function FormPills({ results, size = 5 }: { results: boolean[]; size?: number }) {
  const cells: (boolean | null)[] = [...results.slice(0, size)].reverse(); // 오래된 경기부터 왼쪽에
  while (cells.length < size) cells.unshift(null);
  return (
    <div className="form">
      {cells.map((won, i) => (won == null
        ? <i key={i} className="n">-</i>
        : <i key={i} className={won ? 'w' : 'l'}>{won ? '승' : '패'}</i>))}
    </div>
  );
}

// 선수 평점: 7.5 이상은 좋은 경기, 5.0 미만은 부진
export function Rating({ v }: { v: number }) {
  return <span className={`rating ${v >= 7.5 ? 'hi' : v < 5 ? 'lo' : ''}`}>{v.toFixed(1)}</span>;
}

export function BoxTable({ team }: { team: BoxTeam }) {
  const players = team.players.filter((p) => p.sec > 0).sort((a, b) => b.pts - a.pts);
  return (
    <div className="table-wrap"><table className="data">
      <thead><tr>
        <th className="l">선수</th><th title="득점·슛 효율·리바운드·어시스트·수비·실책을 합친 점수입니다. 6.0이 보통입니다.">평점</th><th>분</th><th>득점</th><th>야투</th><th>3점</th><th>자유투</th>
        <th>리바</th><th>어시</th><th>스틸</th><th>블록</th><th>턴오버</th><th>파울</th>
      </tr></thead>
      <tbody>
        {players.map((p) => (
          <tr key={p.id}>
            <td className="l name"><PosBadge pos={p.pos} /> {p.name}</td>
            <td><Rating v={playerRating(p)} /></td>
            <td>{Math.round(p.sec / 60)}</td><td><b>{p.pts}</b></td><td>{p.fgm}/{p.fga}</td><td>{p.tpm}/{p.tpa}</td><td>{p.ftm}/{p.fta}</td>
            <td>{p.orb + p.drb}</td><td>{p.ast}</td><td>{p.stl}</td><td>{p.blk}</td><td>{p.tov}</td><td className={p.pf >= 5 ? 'bad' : ''}>{p.pf}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

export function GrowthList({ growth }: { growth: GrowthEvent[] }) {
  if (!growth.length) return <p className="muted">눈에 띄게 오른 능력치가 없습니다.</p>;
  // 능력치는 한 번에 1씩 오르므로, 같은 항목의 가장 낮은 기록과 가장 높은 기록으로 상승폭을 구한다
  const by: Record<string, Record<string, { lo: number; to: number }>> = {};
  for (const g of growth) {
    const ups = (by[g.name] ??= {});
    const u = ups[g.label];
    ups[g.label] = u ? { lo: Math.min(u.lo, g.to), to: Math.max(u.to, g.to) } : { lo: g.to, to: g.to };
  }
  return (
    <ul className="lines">
      {Object.entries(by).map(([name, ups]) => (
        <li key={name}>
          <b>{name}</b>
          <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
            {Object.entries(ups).map(([label, u]) => <span key={label} className="pill good" title={`${u.lo - 1} → ${u.to}`}>{label} {u.to} <b>+{u.to - u.lo + 1}</b></span>)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CalendarStrip({ career }: { career: Career }) {
  return (
    <>
      <div className="calendar">
        {career.calendar.map((d, i) => (
          <i key={i} className={`${d.type} ${i < career.dayIndex ? 'past' : ''} ${i === career.dayIndex ? 'now' : ''}`} title={`${i + 1}일 · ${d.phase}`} />
        ))}
      </div>
      <div className="legend">
        <span><i />훈련</span>
        <span><i style={{ background: 'var(--info)' }} />연습 경기</span>
        <span><i style={{ background: 'var(--club)' }} />공식전</span>
      </div>
    </>
  );
}
