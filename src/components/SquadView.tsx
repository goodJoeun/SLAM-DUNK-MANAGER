import { useState } from 'react';
import { PROGRAMS, teamOverall } from '@/game/school';
import { overall } from '@/game/engine';
import { RATING_KEYS } from '@/game/generate';
import type { Career, Player, RatingKey } from '@/game/types';
import type { Act } from './useGame';
import Portrait, { PortraitEditor, licensedPortrait } from './Portrait';
import {
  ATTR_GROUPS, Attr, CondBar, Crest, Icon, PageTitle, Panel, POS_NAME, PosBadge, RATING_SHORT, Seg, Select, Stars,
  abilityStars, pct, potentialStars, userTeam,
} from './ui';
import type { ViewProps } from './ui';

type SortKey = 'lineup' | 'pos' | 'name' | 'year' | 'ovr' | 'pot' | 'cond' | 'pts' | RatingKey;

const FOCUS_PROGRAMS = Object.fromEntries(Object.entries(PROGRAMS).filter(([k]) => k !== 'rest' && k !== 'scout').map(([k, v]) => [k, v.label]));
const VIEWS = { overview: '개요', attrs: '능력치' };

const seasonAvg = (c: Career, p: Player) => {
  const s = c.stats[p.id];
  return s?.gp ? s.pts / s.gp : null;
};

function sortValue(c: Career, p: Player, key: SortKey, index: number): number | string {
  switch (key) {
    case 'lineup': return -index;
    case 'pos': return -p.pos;
    case 'name': return p.name;
    case 'year': return p.year;
    case 'ovr': return overall(p);
    case 'pot': return p.potential;
    case 'cond': return p.condition;
    case 'pts': return seasonAvg(c, p) ?? -1;
    default: return p.ratings[key];
  }
}

function status(p: Player, index: number) {
  if (p.injuredDays) return <span className="pill bad">부상 {p.injuredDays}일</span>;
  if (index < 5) return <span className="pill club">주전</span>;
  return <span className="pill">벤치</span>;
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
          <Portrait name={p.name} team={team.name} src={portraits[p.name] ?? licensedPortrait(p)} size={112} />
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
        </div>
        <div className="ratings-sum">
          <div>종합<Attr v={ovr} big /></div>
          <div>현재 능력<Stars value={abilityStars(ovr)} /></div>
          <div>성장 잠재력<Stars value={potentialStars(p.potential)} /></div>
          <div>컨디션 {Math.round(p.condition)}<CondBar value={p.condition} /></div>
        </div>
      </div>

      <div className="split">
        <Panel title="능력치">
          <div className="attr-cols">
            {ATTR_GROUPS.map((g) => (
              <div key={g.title} className="attr-col">
                <h3>{g.title}</h3>
                {g.keys.map((k) => <div key={k} className="attr-row"><span>{RATING_SHORT[k]}</span><Attr v={p.ratings[k]} /></div>)}
              </div>
            ))}
          </div>
          <p className="hint">색이 푸를수록 뛰어납니다. 능력치는 훈련과 경기 경험으로 오르고, 높을수록 올리기 어렵습니다.</p>
        </Panel>
        <div className="stack">
          <Panel title="개인 훈련">
            <Select options={FOCUS_PROGRAMS} value={p.focus} onChange={(v) => act('playerFocus', p.id, v)}>
              <option value="">지정 안 함</option>
            </Select>
            <p className="hint">팀 훈련 때마다 이 메뉴의 능력치가 추가로 오릅니다.{p.focus ? ` 대상: ${PROGRAMS[p.focus].keys.map((k) => RATING_SHORT[k]).join(', ')}` : ''}</p>
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

export default function SquadView({ S, act }: ViewProps) {
  const [view, setView] = useState<'overview' | 'attrs'>('overview');
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
  const th = (key: SortKey, label: string, cls = '') => (
    <th key={key} className={`sortable ${sort === key ? 'sorted' : ''} ${cls}`} onClick={() => setSort(sort === key ? 'lineup' : key)}>{label}</th>
  );

  return (
    <div className="page">
      <PageTitle title="선수단" sub={`${team.players.length}명 · 팀 전력 ${teamOverall(team)} · 주전은 능력과 포지션에 따라 매일 자동으로 정해집니다`}>
        <Seg options={VIEWS} value={view} onChange={(v) => setView(v as 'overview' | 'attrs')} />
      </PageTitle>
      <Panel title={view === 'overview' ? '선수 목록' : '능력치 비교'} flush action={<span className="hint">머리글을 누르면 정렬 · 선수를 누르면 상세</span>}>
        <div className="table-wrap"><table className="data">
          <thead>
            <tr>
              {th('pos', '포지션', 'l')}
              {th('name', '이름', 'l')}
              {view === 'overview' ? (
                <>
                  {th('year', '학년')}
                  <th className="c">현재 능력</th>
                  {th('pot', '잠재력', 'c')}
                  {th('ovr', '종합')}
                  {th('cond', '컨디션')}
                  <th className="c">상태</th>
                  <th className="l">개인 훈련</th>
                  {th('pts', '경기당 득점')}
                </>
              ) : (
                <>
                  {th('ovr', '종합')}
                  {RATING_KEYS.map((k) => th(k, RATING_SHORT[k], 'c'))}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, i }) => {
              const ovr = overall(p);
              const avg = seasonAvg(c, p);
              return (
                <tr key={p.id} className={`click ${sort === 'lineup' && i === 5 ? 'sep' : ''} ${p.injuredDays ? 'dim' : ''}`} onClick={() => act('player', p.id)}>
                  <td className="l"><PosBadge pos={p.pos} /></td>
                  <td className="l name"><span className="name-cell"><Portrait name={p.name} team={team.name} src={S.portraits[p.name] ?? licensedPortrait(p)} size={26} round />{p.name}{p.fixed && <span className="faint">★</span>}</span></td>
                  {view === 'overview' ? (
                    <>
                      <td>{p.year}학년</td>
                      <td className="c"><Stars value={abilityStars(ovr)} /></td>
                      <td className="c"><Stars value={potentialStars(p.potential)} /></td>
                      <td><Attr v={ovr} /></td>
                      <td><span className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}><span className="num">{Math.round(p.condition)}</span><CondBar value={p.condition} /></span></td>
                      <td className="c">{status(p, i)}</td>
                      <td className="l">{p.focus ? PROGRAMS[p.focus].label : <span className="faint">-</span>}</td>
                      <td>{avg == null ? <span className="faint">-</span> : avg.toFixed(1)}</td>
                    </>
                  ) : (
                    <>
                      <td><Attr v={ovr} /></td>
                      {RATING_KEYS.map((k) => <td key={k} className="c"><Attr v={p.ratings[k]} /></td>)}
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </Panel>
      <p className="hint">★ 표시는 원작에 나오는 선수입니다. 현재 능력과 잠재력은 별 5개 만점으로 표시합니다.</p>
    </div>
  );
}
