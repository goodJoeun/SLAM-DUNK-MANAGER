import { Fragment, useState } from 'react';
import type { CSSProperties } from 'react';
import { PROGRAMS, SCHOOL, teamOverall } from '@/game/team/school';
import { RECRUITING, SEASON, prospectsOf, recruitChance } from '@/game/career/season';
import { overall } from '@/game/match/engine';
import { TRAITS, moraleLabel, moraleOf, traitOf } from '@/game/team/people';
import type { Career, Player, RatingKey, TrendPoint } from '@/game/types';
import type { Act } from '@/state/useGame';
import Portrait, { PortraitEditor, licensedPortrait } from '@/components/shared/Portrait';
import {
  ATTR_GROUPS, Attr, CondBar, Crest, Icon, Panel, POS_NAME, PosBadge, RATING_SHORT, Rating, Seg, Select, Sheet, Stars,
  abilityStars, attrClass, pct, potentialStars, userTeam,
} from '@/components/shared/ui';
import type { ViewProps } from '@/components/shared/ui';

type SortKey = 'lineup' | 'pos' | 'name' | 'year' | 'ovr' | 'pot' | 'cond' | 'morale' | 'gp' | 'min' | 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'fg' | 'tp' | RatingKey | `g:${number}`;

const FOCUS_PROGRAMS = Object.fromEntries(Object.entries(PROGRAMS).filter(([k]) => k !== 'rest' && k !== 'scout').map(([k, v]) => [k, v.label]));
const VIEWS = { attrs: '능력치', status: '상태', stats: '기록', recruit: '스카우트' };
type View = keyof typeof VIEWS;

// 신입생 스카우트: 중학 유망주 가운데 영입 목표를 고른다. 결과는 학년이 바뀔 때 정해진다.
function RecruitPanel({ c, act }: { c: Career; act: Act }) {
  const team = userTeam(c);
  if (c.year >= SEASON.campaignYears) {
    // 마지막 해에는 뽑을 신입생이 없으므로, 임기 중에 들어온 선수들이 얼마나 컸는지 돌아본다
    const mine = team.players.filter((p) => p.joined).sort((a, b) => b.year - a.year || overall(b) - overall(a));
    return (
      <>
        <Panel title="내가 뽑은 선수들" flush={mine.length > 0} action={mine.length > 0 && <span className="hint">선수를 누르면 상세</span>}>
          {mine.length ? (
            <div className="table-wrap"><table className="data">
              <thead><tr>
                <th className="l">포지션</th><th className="l name">이름</th><th className="c">학년</th><th className="l">들어온 경위</th><th>입학 때</th><th>지금</th><th>성장</th>
              </tr></thead>
              <tbody>
                {mine.map((p) => {
                  const now = overall(p);
                  const diff = now - p.joined!.ovr;
                  return (
                    <tr key={p.id} className="click" onClick={() => act('player', p.id)}>
                      <td className="l"><PosBadge pos={p.pos} /></td>
                      <td className="l name">{p.name}</td>
                      <td className="c">{p.year}</td>
                      <td className="l">
                        {p.joined!.scouted ? <span className="pill good">영입 성공</span> : p.joined!.star ? <span className="pill warn">특급 신입생</span> : <span className="muted">일반 입학</span>}
                      </td>
                      <td><Attr v={p.joined!.ovr} /></td>
                      <td><Attr v={now} /></td>
                      <td><b className={diff > 0 ? 'good' : ''}>{diff > 0 ? `+${diff}` : diff}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          ) : <p className="muted">임기 중에 입학한 선수의 기록이 없습니다.</p>}
        </Panel>
        <p className="hint">임기 마지막 해라 내년 신입생은 뽑지 않습니다.</p>
      </>
    );
  }
  const targets = c.recruitTargets ?? [];
  const prospects = [...prospectsOf(c)].sort((a, b) => overall(b.player) - overall(a.player));
  const leaving = team.players.filter((p) => p.year >= 3);
  const staying = team.players.filter((p) => p.year < 3);
  return (
    <>
      <Panel title="신입생 스카우트" flush action={<span className="hint">영입 목표 {targets.length}/{RECRUITING.maxTargets}명</span>}>
        <div className="table-wrap"><table className="data">
          <thead><tr>
            <th className="l">포지션</th><th className="l name">이름</th><th className="c">잠재력</th><th>종합</th><th>영입 가능성</th><th className="c">영입 목표</th>
          </tr></thead>
          <tbody>
            {prospects.map((x) => {
              const p = x.player;
              const on = targets.includes(p.id);
              const chance = Math.round(recruitChance(c, x) * 100);
              return (
                <tr key={p.id}>
                  <td className="l"><PosBadge pos={p.pos} /></td>
                  <td className="l name">{p.name}</td>
                  <td className="c"><Stars value={potentialStars(p.potential)} /></td>
                  <td><Attr v={overall(p)} /></td>
                  <td><span className={`pill ${chance >= 65 ? 'good' : chance >= 40 ? '' : 'bad'}`}>{chance}%</span></td>
                  <td className="c">
                    <button className={`btn small ${on ? 'primary' : ''}`} disabled={!on && targets.length >= RECRUITING.maxTargets} onClick={() => act('recruitTarget', p.id)}>
                      {on ? '목표 해제' : '목표로 정하기'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </Panel>
      <Panel title="내년 선수단 전망">
        <p className="muted">3학년 {leaving.length}명이 졸업하고 신입생 {SCHOOL.classSize}명이 들어옵니다. 남는 선수의 포지션별 인원:</p>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5].map((pos) => <span key={pos} className="row" style={{ gap: 6 }}><PosBadge pos={pos} /><b>{staying.filter((p) => p.pos === pos).length}명</b></span>)}
        </div>
      </Panel>
      <p className="hint">
        영입 목표는 {RECRUITING.maxTargets}명까지 정할 수 있고, 학년이 바뀔 때 결과가 나옵니다. 학교 수준({team.prestige})이 높을수록, 교장의 신임({c.trust ?? 50})이 클수록 잘 옵니다.
        목표로 삼지 않은 자리와 영입에 실패한 자리는 코치가 부족한 포지션 위주로 채웁니다.
      </p>
    </>
  );
}

// 종합 능력치 변화를 계단 모양 선으로 그린다. 가로축은 기록을 시작한 뒤로 지난 날 수
function TrendChart({ points, yearLength, now }: { points: TrendPoint[]; yearLength: number; now: number }) {
  const at = (p: { year: number; day: number }) => (p.year - 1) * yearLength + p.day;
  const x0 = at(points[0]);
  const span = Math.max(1, now - x0);
  const values = points.map((p) => p.ovr);
  const lo = Math.min(...values) - 1;
  const hi = Math.max(...values) + 1;
  const W = 320, H = 96, L = 26, R = 30, T = 8, B = 18;
  const x = (d: number) => L + ((d - x0) / span) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let path = `M${x(x0).toFixed(1)} ${y(points[0].ovr).toFixed(1)}`;
  for (const p of points.slice(1)) path += `H${x(at(p)).toFixed(1)}V${y(p.ovr).toFixed(1)}`;
  path += `H${x(now).toFixed(1)}`;
  const first = points[0];
  const last = points[points.length - 1];
  // 해가 바뀐 지점에 세로 눈금을 둔다
  const yearMarks: number[] = [];
  for (let yr = first.year + 1; (yr - 1) * yearLength < now; yr++) yearMarks.push(yr);
  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`종합 능력치 ${first.ovr}에서 ${last.ovr}까지의 변화`}>
      <line className="axis" x1={L} y1={H - B} x2={W - R} y2={H - B} />
      {yearMarks.map((yr) => (
        <g key={yr}>
          <line className="mark" x1={x((yr - 1) * yearLength)} y1={T} x2={x((yr - 1) * yearLength)} y2={H - B} />
          <text className="lbl" x={x((yr - 1) * yearLength)} y={H - 5} textAnchor="middle">{yr}년차</text>
        </g>
      ))}
      <path className="line" d={path} />
      <circle className="pt" cx={x(now)} cy={y(last.ovr)} r="3" />
      <text className="val" x={L - 5} y={y(first.ovr) + 4} textAnchor="end">{first.ovr}</text>
      <text className="val now" x={x(now) + 6} y={y(last.ovr) + 4}>{last.ovr}</text>
    </svg>
  );
}

function PlayerProfile({ c, player: p, index, act, portraits }: {
  c: Career;
  player: Player;
  index: number;
  act: Act;
  portraits: Record<string, string>;
}) {
  const team = userTeam(c);
  const list = team.players;
  const prev = list[(index - 1 + list.length) % list.length];
  const next = list[(index + 1) % list.length];
  const s = c.stats[p.id];
  const ovr = overall(p);
  const [compareId, setCompareId] = useState('');
  const other = list.find((x) => x.id === compareId && x.id !== p.id);
  const trend = c.trend?.[p.id] ?? [];
  const games = [...(c.gameLog?.[p.id] ?? [])].reverse();
  const recent = games.slice(0, 8);
  const now = (c.year - 1) * c.calendar.length + c.dayIndex;
  return (
    <div className="page">
      <div className="row between">
        <button className="btn small ghost" onClick={() => act('player', null)}><Icon name="back" />선수단</button>
        <div className="row">
          <button className="btn small ghost" onClick={() => act('player', prev.id)}><Icon name="back" />{prev.name}</button>
          <button className="btn small ghost" onClick={() => act('player', next.id)}>{next.name}<Icon name="next" /></button>
        </div>
      </div>

      <div className="profile-head">
        <div className="profile-photo">
          <Portrait name={p.name} src={portraits[p.name] ?? licensedPortrait(p)} size={176} />
          <PortraitEditor
            hasCustom={Boolean(portraits[p.name])}
            onSet={(url) => act('setPortrait', p.name, url)}
            onClear={() => act('clearPortrait', p.name)}
          />
        </div>
        <div className="who">
          <span className="row"><Crest name={team.name} size={20} /><span className="muted">{team.name}</span></span>
          <h1>{p.name}</h1>
          <div className="row">
            <PosBadge pos={p.pos} /><span>{POS_NAME[p.pos]}</span><span className="muted">·</span><span>{p.year}학년</span>
            {status(p, index)}
            {p.fixed && <span className="pill">원작 선수</span>}
          </div>
          <div className="row" title={TRAITS[traitOf(p)].info}>
            <span className="pill club">{TRAITS[traitOf(p)].label}</span><span className="muted">{TRAITS[traitOf(p)].info}</span>
          </div>
        </div>
        <div className="ratings-sum">
          <div>종합<Attr v={ovr} big /></div>
          <div>현재 능력<Stars value={abilityStars(ovr)} /></div>
          <div>성장 잠재력<Stars value={potentialStars(p.potential)} /></div>
          <div>컨디션 {Math.round(p.condition)}<CondBar value={p.condition} /></div>
          <div title="60이 보통입니다. 사기가 높으면 경기력과 훈련 효율이 오릅니다.">사기 {Math.round(moraleOf(p))}<b className={moraleOf(p) >= 68 ? 'good' : moraleOf(p) < 52 ? 'bad' : ''}>{moraleLabel(moraleOf(p))}</b></div>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <Panel
            title="능력치"
            action={(
              <label className="compare-pick">비교
                <select value={other ? compareId : ''} onChange={(e) => setCompareId(e.target.value)}>
                  <option value="">선택 안 함</option>
                  {list.filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.name} ({POS_NAME[x.pos]})</option>)}
                </select>
              </label>
            )}
          >
            <div className="attr-cols">
              {ATTR_GROUPS.map((g) => (
                <div key={g.title} className="attr-col">
                  <h3>{g.title}</h3>
                  {g.keys.map((k) => {
                    const diff = other ? p.ratings[k] - other.ratings[k] : 0;
                    return (
                      <div key={k} className="attr-row">
                        <span>{RATING_SHORT[k]}</span>
                        <span className="attr-vs">
                          <Attr v={p.ratings[k]} />
                          {other && <small className={diff > 0 ? 'good' : diff < 0 ? 'bad' : 'faint'} title={`${other.name} ${other.ratings[k]}`}>{diff > 0 ? `+${diff}` : diff === 0 ? '=' : diff}</small>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="hint">
              {other
                ? `옆의 숫자는 ${other.name}(종합 ${overall(other)})보다 얼마나 높고 낮은지입니다.`
                : '색이 푸를수록 뛰어납니다. 능력치는 훈련과 경기 경험으로 오르고, 높을수록 올리기 어렵습니다.'}
            </p>
          </Panel>
          <Panel title="최근 경기" flush action={games.length > 0 && <span className="hint">{games.length}경기 중 최근 {recent.length}경기</span>}>
            {recent.length ? (
              <div className="table-wrap"><table className="data">
                <thead><tr>
                  <th className="l">날짜</th><th className="l">상대</th><th className="c">결과</th><th>평점</th><th>출전</th><th>득점</th><th>리바운드</th><th>어시스트</th><th>야투</th><th>3점</th>
                </tr></thead>
                <tbody>
                  {recent.map((g) => (
                    <tr key={`${g.year}-${g.day}`}>
                      <td className="l muted">{g.year}년차 {g.day}일</td>
                      <td className="l">{g.opponent}{!g.official && <span className="faint"> · 연습</span>}</td>
                      <td className="c"><span className={g.won ? 'good' : 'bad'}>{g.won ? '승' : '패'}</span> <span className="muted">{g.score}</span></td>
                      <td>{g.rating == null ? <span className="faint">-</span> : <Rating v={g.rating} />}</td>
                      <td>{Math.round(g.sec / 60)}분</td>
                      <td><b>{g.pts}</b></td>
                      <td>{g.reb}</td>
                      <td>{g.ast}</td>
                      <td>{g.fgm}/{g.fga}</td>
                      <td>{g.tpm}/{g.tpa}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            ) : <p className="muted pad">아직 출전한 경기가 없습니다. 경기를 치르면 여기에 경기별 기록이 쌓입니다.</p>}
          </Panel>
        </div>
        <div className="stack">
          <Panel title="개인 훈련">
            <Select options={FOCUS_PROGRAMS} value={p.focus} onChange={(v) => act('playerFocus', p.id, v)}>
              <option value="">지정 안 함</option>
            </Select>
            <p className="hint">팀 훈련 때마다 이 메뉴의 능력치가 추가로 오릅니다.{p.focus ? ` 대상: ${PROGRAMS[p.focus].keys.map((k) => RATING_SHORT[k]).join(', ')}` : ''}</p>
          </Panel>
          <Panel title="성장 추이" action={trend.length > 0 && <span className="hint">종합 {trend[0].ovr} → {ovr} ({ovr - trend[0].ovr >= 0 ? '+' : ''}{ovr - trend[0].ovr})</span>}>
            {trend.length > 1 ? (
              <TrendChart points={trend} yearLength={c.calendar.length} now={Math.max(now, 1)} />
            ) : <p className="muted">{trend.length ? `기록을 시작한 뒤로 종합 ${trend[0].ovr}에서 변화가 없습니다.` : '날이 지나면 종합 능력치의 변화가 여기에 그려집니다.'}</p>}
          </Panel>
          <Panel title={`${c.year}년차 공식전 기록`}>
            {s?.gp ? (
              <div className="kv">
                <div><small>경기</small><b>{s.gp}</b></div>
                <div><small>득점</small><b>{(s.pts / s.gp).toFixed(1)}</b></div>
                <div><small>리바운드</small><b>{(s.reb / s.gp).toFixed(1)}</b></div>
                <div><small>어시스트</small><b>{(s.ast / s.gp).toFixed(1)}</b></div>
                <div><small>야투</small><b>{pct(s.fgm, s.fga)}</b></div>
                <div><small>3점</small><b>{pct(s.tpm, s.tpa)}</b></div>
              </div>
            ) : <p className="muted">올해 공식전 출전 기록이 없습니다.</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// 능력치 표의 묶음: 묶음마다 평균을 먼저 보여 주고 세부 능력치를 잇는다
const GROUPS: { title: string; keys: RatingKey[] }[] = [
  { title: '골밑', keys: ['ins', 'dnk', 'reb'] },
  { title: '외곽', keys: ['mid', 'tp', 'ft'] },
  { title: '플레이메이킹', keys: ['drb', 'pss', 'oiq'] },
  { title: '수비', keys: ['mdf', 'tdf', 'diq'] },
  { title: '신체', keys: ['hgt', 'str', 'spd', 'jmp', 'end'] },
];
// 좁은 칸에 들어가는 짧은 머리글 (없으면 RATING_SHORT)
const COL_LABEL: Partial<Record<RatingKey, string>> = { oiq: 'IQ', diq: 'IQ', mdf: '대인', tdf: '팀' };
const rating = (p: Player, k: RatingKey) => p.ratings[k] ?? p.ratings.diq; // 대인·팀 수비가 없는 예전 데이터는 수비IQ로 읽는다
const groupAvg = (p: Player, g: number) => GROUPS[g].keys.reduce((s, k) => s + rating(p, k), 0) / GROUPS[g].keys.length;
const avgOf = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

// 색으로 수준을 보여 주는 숫자 칸 (종합처럼 상자를 두르지 않는다)
const Num = ({ v, bold = false }: { v: number; bold?: boolean }) => <span className={`gv ${attrClass(v)} ${bold ? 'b' : ''}`}>{Math.round(v)}</span>;

function sortValue(c: Career, p: Player, key: SortKey, index: number): number | string {
  if (key.startsWith('g:')) return groupAvg(p, Number(key.slice(2)));
  const s = c.stats[p.id];
  const per = (x: number | undefined) => (s?.gp ? (x ?? 0) / s.gp : -1);
  switch (key) {
    case 'lineup': return -index;
    case 'pos': return -p.pos;
    case 'name': return p.name;
    case 'year': return p.year;
    case 'ovr': return overall(p);
    case 'pot': return p.potential;
    case 'cond': return p.condition;
    case 'morale': return moraleOf(p);
    case 'gp': return s?.gp ?? -1;
    case 'min': return per(s?.sec);
    case 'pts': return per(s?.pts);
    case 'reb': return per(s?.reb);
    case 'ast': return per(s?.ast);
    case 'stl': return per(s?.stl);
    case 'blk': return per(s?.blk);
    case 'fg': return s?.fga ? s.fgm / s.fga : -1;
    case 'tp': return s?.tpa ? s.tpm / s.tpa : -1;
    default: return rating(p, key as RatingKey);
  }
}

function status(p: Player, index: number) {
  if (p.injuredDays) return <span className="pill bad">부상 {p.injuredDays}일</span>;
  if (index < 5) return <span className="pill club">주전</span>;
  return <span className="pill">벤치</span>;
}

export default function SquadView({ S, act }: ViewProps) {
  const [view, setView] = useState<View>(S.squadTab === 'recruit' ? 'recruit' : 'attrs');
  const [sort, setSort] = useState<SortKey>('lineup');
  const c = S.career;
  const team = userTeam(c);
  const selectedIndex = team.players.findIndex((x) => x.id === S.playerId);
  if (selectedIndex >= 0) return <PlayerProfile c={c} player={team.players[selectedIndex]} index={selectedIndex} act={act} portraits={S.portraits} />;

  const rows = team.players.map((p, i) => ({ p, i }));
  if (sort !== 'lineup') {
    rows.sort((a, b) => {
      const x = sortValue(c, a.p, sort, a.i);
      const y = sortValue(c, b.p, sort, b.i);
      return typeof x === 'string' ? x.localeCompare(String(y)) : (y as number) - x;
    });
  }
  const th = (key: SortKey, label: string, cls = '', title?: string) => (
    <th key={key} title={title} className={`sortable ${sort === key ? 'sorted' : ''} ${cls}`} onClick={() => setSort(sort === key ? 'lineup' : key)}>{label}</th>
  );
  const everyone = team.players;
  const fit = everyone.filter((p) => !p.injuredDays);
  // 올해 공식전 기록 (경기당)
  const stat = (p: Player) => c.stats[p.id];
  const per = (p: Player, f: (s: NonNullable<ReturnType<typeof stat>>) => number) => { const s = stat(p); return s?.gp ? (f(s) / s.gp).toFixed(1) : null; };
  const dash = <span className="faint">-</span>;
  const teamGames = Math.max(0, ...everyone.map((p) => stat(p)?.gp ?? 0));
  const teamPer = (f: (s: NonNullable<ReturnType<typeof stat>>) => number) => (teamGames ? (everyone.reduce((sum, p) => sum + (stat(p) ? f(stat(p)!) : 0), 0) / teamGames).toFixed(1) : '-');
  const teamPct = (m: 'fgm' | 'tpm', a: 'fga' | 'tpa') => pct(everyone.reduce((x, p) => x + (stat(p)?.[m] ?? 0), 0), everyone.reduce((x, p) => x + (stat(p)?.[a] ?? 0), 0));

  // 선수 이름 칸 (왼쪽에 붙어 있는 칸)
  const nameCell = (p: Player) => (
    <td className="stick">
      <span className="name-cell">
        <Portrait name={p.name} src={S.portraits[p.name] ?? licensedPortrait(p)} size={26} round />
        <span className="gt-name">
          <b>{p.name}{p.fixed && <i className="faint" title="원작에 나오는 선수"> ★</i>}</b>
          {p.injuredDays ? <small className="bad">부상 {p.injuredDays}일</small> : null}
        </span>
      </span>
    </td>
  );
  const basicHead = (
    <>
      {th('name', '선수', 'stick')}
      {th('pos', '포지션')}
      {th('year', '학년')}
      {th('ovr', '종합')}
    </>
  );
  const basicCells = (p: Player) => (
    <>
      {nameCell(p)}
      <td><PosBadge pos={p.pos} /></td>
      <td className="muted">{p.year}</td>
      <td><Attr v={overall(p)} /></td>
    </>
  );
  const rowClass = (p: Player, i: number) => `click ${sort === 'lineup' && i === 5 ? 'sep' : ''} ${p.injuredDays ? 'dim' : ''}`;
  const tableStyle = { '--rows': rows.length } as CSSProperties;

  return (
    <Sheet
      icon="squad"
      title="선수단"
      sub={`${everyone.length}명 · 팀 전력 ${teamOverall(team)} · 머리글을 누르면 정렬, 선수를 누르면 상세`}
      actions={<Seg options={VIEWS} value={view} onChange={(v) => setView(v as View)} />}
    >
      {view === 'recruit' ? <div className="sheet-pad"><RecruitPanel c={c} act={act} /></div> : view === 'attrs' ? (
        <table className="gt" style={tableStyle}>
          <thead>
            <tr className="ghead">
              <th className="stick" colSpan={1}>기본 정보</th><th colSpan={3} />
              {GROUPS.map((g) => <th key={g.title} className="gb" colSpan={g.keys.length + 1}>{g.title}</th>)}
            </tr>
            <tr className="gcols">
              {basicHead}
              {GROUPS.map((g, gi) => (
                <Fragment key={g.title}>
                  {th(`g:${gi}`, '평균', 'gb avg', `${g.title} 평균`)}
                  {g.keys.map((k) => th(k, COL_LABEL[k] ?? RATING_SHORT[k], '', RATING_SHORT[k]))}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, i }) => (
              <tr key={p.id} className={rowClass(p, i)} onClick={() => act('player', p.id)}>
                {basicCells(p)}
                {GROUPS.map((g, gi) => (
                  <Fragment key={g.title}>
                    <td className="gb avg"><Num v={groupAvg(p, gi)} bold /></td>
                    {g.keys.map((k) => <td key={k}><Num v={rating(p, k)} /></td>)}
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="stick">팀 평균</td><td /><td className="muted">{avgOf(everyone.map((p) => p.year)).toFixed(1)}</td><td><Attr v={avgOf(everyone.map((p) => overall(p)))} /></td>
              {GROUPS.map((g, gi) => (
                <Fragment key={g.title}>
                  <td className="gb avg"><Num v={avgOf(everyone.map((p) => groupAvg(p, gi)))} bold /></td>
                  {g.keys.map((k) => <td key={k}><Num v={avgOf(everyone.map((p) => rating(p, k)))} /></td>)}
                </Fragment>
              ))}
            </tr>
          </tfoot>
        </table>
      ) : view === 'status' ? (
        <table className="gt" style={tableStyle}>
          <thead>
            <tr className="gcols solo">
              {basicHead}
              <th className="gb">현재 능력</th>
              {th('pot', '잠재력')}
              {th('cond', '컨디션', 'gb')}
              {th('morale', '사기')}
              <th className="gb l">성격</th>
              <th>상태</th>
              <th className="gb l">개인 훈련</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, i }) => {
              const morale = moraleOf(p);
              return (
                <tr key={p.id} className={rowClass(p, i)} onClick={() => act('player', p.id)}>
                  {basicCells(p)}
                  <td className="gb"><Stars value={abilityStars(overall(p))} /></td>
                  <td><Stars value={potentialStars(p.potential)} /></td>
                  <td className="gb"><span className="gt-cond"><b>{Math.round(p.condition)}</b><CondBar value={p.condition} /></span></td>
                  <td><span className={morale >= 68 ? 'good' : morale < 52 ? 'bad' : 'muted'}>{moraleLabel(morale)}</span></td>
                  <td className="gb l" title={TRAITS[traitOf(p)].info}>{TRAITS[traitOf(p)].label}</td>
                  <td>{status(p, i)}</td>
                  <td className="gb l">{p.focus ? PROGRAMS[p.focus].label : <span className="faint">지정 안 함</span>}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="stick">팀 평균</td><td /><td className="muted">{avgOf(everyone.map((p) => p.year)).toFixed(1)}</td><td><Attr v={avgOf(everyone.map((p) => overall(p)))} /></td>
              <td className="gb" /><td />
              <td className="gb"><span className="gt-cond"><b>{Math.round(avgOf(fit.map((p) => p.condition)))}</b><CondBar value={avgOf(fit.map((p) => p.condition))} /></span></td>
              <td className="muted">{moraleLabel(avgOf(everyone.map((p) => moraleOf(p))))}</td>
              <td className="gb" /><td className="muted">부상 {everyone.length - fit.length}명</td><td className="gb" />
            </tr>
          </tfoot>
        </table>
      ) : (
        <table className="gt" style={tableStyle}>
          <thead>
            <tr className="gcols solo">
              {basicHead}
              {th('gp', '경기', 'gb')}
              {th('min', '분')}
              {th('pts', '득점', 'gb')}
              {th('reb', '리바운드')}
              {th('ast', '어시스트')}
              {th('stl', '스틸')}
              {th('blk', '블록')}
              {th('fg', '야투', 'gb')}
              {th('tp', '3점')}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, i }) => {
              const s = stat(p);
              return (
                <tr key={p.id} className={rowClass(p, i)} onClick={() => act('player', p.id)}>
                  {basicCells(p)}
                  <td className="gb">{s?.gp ?? dash}</td>
                  <td>{per(p, (x) => x.sec / 60) ?? dash}</td>
                  <td className="gb"><b>{per(p, (x) => x.pts) ?? dash}</b></td>
                  <td>{per(p, (x) => x.reb) ?? dash}</td>
                  <td>{per(p, (x) => x.ast) ?? dash}</td>
                  <td>{per(p, (x) => x.stl) ?? dash}</td>
                  <td>{per(p, (x) => x.blk) ?? dash}</td>
                  <td className="gb">{s?.gp ? pct(s.fgm, s.fga) : dash}</td>
                  <td>{s?.gp ? pct(s.tpm, s.tpa) : dash}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="stick">팀 합계 · 경기당</td><td /><td /><td />
              <td className="gb">{teamGames || '-'}</td><td />
              <td className="gb">{teamPer((x) => x.pts)}</td><td>{teamPer((x) => x.reb)}</td><td>{teamPer((x) => x.ast)}</td><td>{teamPer((x) => x.stl)}</td><td>{teamPer((x) => x.blk)}</td>
              <td className="gb">{teamPct('fgm', 'fga')}</td><td>{teamPct('tpm', 'tpa')}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </Sheet>
  );
}
