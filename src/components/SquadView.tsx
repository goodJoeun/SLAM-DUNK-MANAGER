import { useState } from 'react';
import { PROGRAMS, SCHOOL, teamOverall } from '@/game/school';
import { RECRUITING, SEASON, prospectsOf, recruitChance } from '@/game/season';
import { overall } from '@/game/engine';
import { RATING_KEYS } from '@/game/generate';
import { TRAITS, moraleLabel, moraleOf, traitOf } from '@/game/people';
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
const VIEWS = { overview: '개요', attrs: '능력치', recruit: '신입생 스카우트' };
type View = keyof typeof VIEWS;

// 신입생 스카우트: 중학 유망주 가운데 영입 목표를 고른다. 결과는 학년이 바뀔 때 정해진다.
function RecruitPanel({ c, act }: { c: Career; act: Act }) {
  const team = userTeam(c);
  if (c.year >= SEASON.campaignYears) {
    return <Panel title="신입생 스카우트"><p className="muted">임기 마지막 해라 내년 신입생은 뽑지 않습니다.</p></Panel>;
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
            <th className="l">포지션</th><th className="l">이름</th><th className="c">잠재력</th><th>종합</th><th>영입 가능성</th><th className="c">영입 목표</th>
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
  const [view, setView] = useState<View>('overview');
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
      <PageTitle title="선수단" sub={`${team.players.length}명 · 팀 전력 ${teamOverall(team)} · 선발은 전술 화면에서 직접 정할 수 있습니다`}>
        <Seg options={VIEWS} value={view} onChange={(v) => setView(v as View)} />
      </PageTitle>
      {view === 'recruit' ? <RecruitPanel c={c} act={act} /> : <><Panel title={view === 'overview' ? '선수 목록' : '능력치 비교'} flush action={<span className="hint">머리글을 누르면 정렬 · 선수를 누르면 상세</span>}>
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
                  <th className="c">사기</th>
                  <th className="l">성격</th>
                  <th className="c">상태</th>
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
                      <td className="c"><span className={moraleOf(p) >= 68 ? 'good' : moraleOf(p) < 52 ? 'bad' : 'muted'}>{moraleLabel(moraleOf(p))}</span></td>
                      <td className="l" title={TRAITS[traitOf(p)].info}>{TRAITS[traitOf(p)].label}</td>
                      <td className="c">{status(p, i)}</td>
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
      <p className="hint">★ 표시는 원작에 나오는 선수입니다. 현재 능력과 잠재력은 별 5개 만점으로 표시합니다.</p></>}
    </div>
  );
}
