// 여러 화면이 함께 쓰는 작은 조각들.
import type { CSSProperties, ReactNode } from 'react';
import { PROGRAMS, INTENSITY } from '@/game/school';
import { overall } from '@/game/engine';
import type { BoxTeam, Career, Defense, Focus, GrowthEvent, Match, NameStyle, Tactics } from '@/game/types';
import type { Act, PlayingState, Report, TabKey } from './useGame';

// 게임을 시작한 뒤의 화면들이 받는 속성
export interface ViewProps {
  S: PlayingState;
  act: Act;
}

export const NAME_STYLE: Record<NameStyle, string> = { kr: '한국어판 이름', jp: '원작 이름' };
export const POS = ['', 'PG', 'SG', 'SF', 'PF', 'C'];
export const FOCUS: Record<Focus, string> = { balanced: '균형', inside: '골밑 중심', outside: '외곽 중심' };
export const DEFENSE: Record<Defense, string> = { man: '맨투맨', zone: '존', press: '프레스' };
export const PACE: Record<string, string> = { '-1': '느리게', 0: '보통', 1: '빠르게' };
export const TABS: Record<TabKey, string> = { today: '오늘', squad: '선수단', comp: '대회', records: '기록' };

export const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
export const condClass = (c: number) => (c < 50 ? 'low' : c < 75 ? 'mid' : 'green');
export const grade = (potential: number) => (potential >= 75 ? 'S' : potential >= 60 ? 'A' : potential >= 45 ? 'B' : potential >= 30 ? 'C' : 'D');

export const userTeam = (career: Career) => career.teams[career.userTeamId];
export const teamName = (career: Career, id: string) => career.teams[id]?.name ?? '?';
export const isUser = (career: Career, id: string | undefined) => id === career.userTeamId;

export function Bar({ pct, cls = '' }: { pct: number; cls?: string }) {
  return <div className={`bar ${cls}`}><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
}

// { 값: 라벨 } 맵으로 만드는 선택 상자
export function Select({ options, value, onChange, style, children }: {
  options: Record<string, string>;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} style={style}>
      {children}
      {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

export function TacticControls({ tactics, onChange, children }: {
  tactics: Partial<Tactics>;
  onChange: (key: 'focus' | 'defense' | 'pace', value: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="controls">
      <label>공격 중심<Select options={FOCUS} value={tactics.focus} onChange={(v) => onChange('focus', v)} /></label>
      <label>수비<Select options={DEFENSE} value={tactics.defense} onChange={(v) => onChange('defense', v)} /></label>
      <label>템포<Select options={PACE} value={Math.round(tactics.pace ?? 0)} onChange={(v) => onChange('pace', v)} /></label>
      {children}
    </div>
  );
}

export function CalendarCard({ career }: { career: Career }) {
  return (
    <div className="card">
      <h2>{career.year}년차 일정</h2>
      <div className="calendar">
        {career.calendar.map((d, i) => (
          <i key={i} className={`${d.type} ${i < career.dayIndex ? 'past' : ''} ${i === career.dayIndex ? 'now' : ''}`} title={`${i + 1}일 · ${d.phase}`} />
        ))}
      </div>
      <div className="legend">
        <span><i />훈련</span>
        <span><i style={{ background: 'var(--info)' }} />연습 경기</span>
        <span><i style={{ background: 'var(--accent)' }} />공식전</span>
      </div>
    </div>
  );
}

export function MatchList({ career, matches }: { career: Career; matches: Match[] }) {
  return (
    <ul className="list">
      {matches.map((m, i) => (
        <li key={i} className={isUser(career, m.home) || isUser(career, m.away) ? 'me' : ''}>
          <span>{teamName(career, m.home)} vs {teamName(career, m.away)}{m.overtime ? ' (연장)' : ''}</span>
          <span className="num">{m.homeScore} - {m.awayScore}</span>
        </li>
      ))}
    </ul>
  );
}

function BoxTable({ team }: { team: BoxTeam }) {
  const players = team.players.filter((p) => p.sec > 0).sort((a, b) => b.pts - a.pts);
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>선수</th><th>분</th><th>득점</th><th>야투</th><th>3점</th><th>리바</th><th>어시</th><th>스틸</th><th>블록</th><th>파울</th></tr></thead>
      <tbody>
        {players.map((p) => (
          <tr key={p.id}>
            <td>{p.name}</td><td>{Math.round(p.sec / 60)}</td><td>{p.pts}</td><td>{p.fgm}/{p.fga}</td><td>{p.tpm}/{p.tpa}</td>
            <td>{p.orb + p.drb}</td><td>{p.ast}</td><td>{p.stl}</td><td>{p.blk}</td><td>{p.pf}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

function GrowthList({ growth }: { growth: GrowthEvent[] }) {
  if (!growth.length) return null;
  const by: Record<string, Record<string, number>> = {};
  for (const g of growth) (by[g.name] ??= {})[g.label] = g.to;
  return (
    <>
      <h3>능력치 상승 {growth.length}건</h3>
      <ul className="list">
        {Object.entries(by).map(([name, ups]) => (
          <li key={name}><span>{name}</span><span className="good">{Object.entries(ups).map(([l, to]) => `${l} ${to}`).join(' · ')}</span></li>
        ))}
      </ul>
    </>
  );
}

// 하루(또는 자동 진행한 여러 날)의 결과
export function ReportCard({ career, report: r }: { career: Career; report: Report | null }) {
  if (!r) return <div className="card"><h2>진행 기록</h2><p className="muted">하루를 진행하면 훈련 성과와 경기 결과가 여기에 나옵니다.</p></div>;
  const box = r.userBox;
  const mine = box?.find((t) => isUser(career, t.id));
  const theirs = box?.find((t) => !isUser(career, t.id));
  const y = r.yearEnd && !r.yearEnd.final ? r.yearEnd : null;
  return (
    <div className="card stack">
      <h2>{r.year}년차 {r.day}일 결과</h2>
      {r.autoDays
        ? <p className="muted">AI 코치가 {r.autoDays}일 동안 훈련을 맡았습니다.</p>
        : r.training && <p>훈련: <b>{PROGRAMS[r.training.program].label}</b>{r.training.program === 'rest' ? '' : ` (${INTENSITY[r.training.intensity].label})`}</p>}
      {box && mine && theirs && (
        <>
          <div className="notice">{mine.score > theirs.score ? '승리' : '패배'} · {box[0].name} {box[0].score} - {box[1].score} {box[1].name}</div>
          <BoxTable team={mine} />
        </>
      )}
      {r.round && <><h3>{r.round.name}</h3><MatchList career={career} matches={r.round.matches} /></>}
      {r.competitionEnd && <div className="notice">{r.competitionEnd.name} 종료 · 우승 {r.competitionEnd.champion} · 우리 학교: {r.competitionEnd.userFinish}</div>}
      {r.injuries.map((inj, i) => <p key={i} className="bad">부상: {inj.name} ({inj.days}일 결장)</p>)}
      <GrowthList growth={r.growth} />
      {y && (
        <>
          <h3>{y.year}년차 종료 — 새 학년</h3>
          <p>졸업: {y.graduates.map((p) => `${p.name}(${overall(p)})`).join(', ')}</p>
          <p>신입생: {y.recruits.map((p) => `${p.name} ${POS[p.pos]}(${overall(p)}, 성장 ${grade(p.potential)})`).join(', ')}</p>
        </>
      )}
    </div>
  );
}
