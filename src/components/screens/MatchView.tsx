import { Fragment, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { denyOutlook, tacticLoad } from '@/game/match/engine';
import { today } from '@/game/career/season';
import type { BoxPlayer, BoxTeam, PlayerRole, PlayerView, RatingKey, Tactics, TeamView } from '@/game/types';
import type { ActiveMatch } from '@/state/useGame';
import { ALERTS, FEED_MODES, FRESH_ENERGY, KEY_EVENT, SPEEDS, TIRED_LEVELS, breakLabel, periodLabel, teamTotals } from '@/state/live';
import type { AlertKey, BreakInfo, FeedMode, SpeedKey } from '@/state/live';
import FullCourt from '@/components/court/FullCourt';
import ResultView from './ResultView';
import { FlowChart, Leaders, QuarterTable, TeamBoard } from './MatchBoards';
import { tipOffScene } from '@/components/court/choreo';
import Portrait, { licensedPortrait } from '@/components/shared/Portrait';
import {
  ATTR_GROUPS, Attr, CondBar, Crest, DEFENSE, DEFENSE_ROLE, DEFENSE_ROLE_INFO, FOCUS, Icon, OFFENSE_ROLE, OFFENSE_ROLE_INFO, PACE, POS_NAME, Panel, PosBadge, RATING_SHORT, Seg, Select,
  TacticSelects, matchColors,
} from '@/components/shared/ui';
import { TRAITS, traitOf } from '@/game/team/people';
import type { Player } from '@/game/types';
import type { ViewProps } from '@/components/shared/ui';

const SPEED_OPTIONS = Object.entries(SPEEDS).map(([k, v]) => [k, v.label] as [string, string]);
const TIRED_OPTIONS = TIRED_LEVELS.map((n) => [String(n), `${n} 아래`] as [string, string]);
const NOTE_ICON ={ info: 'bulb', warn: 'alert', bad: 'alert', good: 'ball' } as const;

function Side({ team: t, mine, away = false, prep = 0 }: { team: TeamView; mine: boolean; away?: boolean; prep?: number }) {
  return (
    <div className={`sb-team ${away ? 'away' : ''}`}>
      <Crest name={t.name} size={40} />
      <div className="who">
        <span className="nm">
          <span className="nm-t">{t.name}</span>{mine && <span className="pill club" style={{ marginLeft: 6 }}>우리 팀</span>}
          {prep > 0 && <span className="pill good" style={{ marginLeft: 6 }} title="경기 전 상대 분석으로 이 경기에서만 능력치가 오릅니다">준비 +{prep.toFixed(1)}</span>}
        </span>
        <span className="meta">
          팀 파울 {t.teamFouls} · 작전 타임 {t.timeoutsLeft}
          {t.run >= 4 && <> · <b className={mine ? 'good' : 'bad'}>연속 {t.run}점</b></>}
        </span>
      </div>
      <span className="sb-score">{t.score}</span>
    </div>
  );
}

// 교체 대상 줄. onClick이 없으면 상대 팀처럼 누를 수 없는 줄이 된다
// 선수 한 명의 개인 지시: 공격 역할 · 수비 지시
// 평소에는 내린 지시만 꼬리표로 보여 주고, 선수를 고르면(open) 버튼으로 펼친다
const OFFENSE_CHOICES: [string, string][] = [['', '기본'], ...OFFENSE_ROLE];
const DEFENSE_CHOICES: [string, string][] = [['', '기본'], ...DEFENSE_ROLE];
const roleName = (list: [string, string][], key?: string) => list.find(([k]) => k === key)?.[1];
// 고른 지시가 무엇을 하는지 바로 아래에 한 줄로 알려 준다
function RoleEdit({ role, onChange }: { role?: PlayerRole; onChange: (kind: 'offense' | 'defense', value: string) => void }) {
  return (
    <div className="role-edit">
      <div><span className="hint">공격 지시</span><Seg options={OFFENSE_CHOICES} titles={OFFENSE_ROLE_INFO} value={role?.offense ?? ''} onChange={(v) => onChange('offense', v)} /></div>
      <p className="role-info">{OFFENSE_ROLE_INFO[role?.offense ?? '']}</p>
      <div><span className="hint">수비 지시</span><Seg options={DEFENSE_CHOICES} titles={DEFENSE_ROLE_INFO} value={role?.defense ?? ''} onChange={(v) => onChange('defense', v)} /></div>
      <p className="role-info">{DEFENSE_ROLE_INFO[role?.defense ?? '']}</p>
    </div>
  );
}

// 선수에게 걸려 있는 지시를 이름 아래 꼬리표로: 에이스·개인 지시·집중 마크 담당
function tagsFor(p: PlayerView, t: Tactics, targetName?: string): string[] {
  const role = t.roles?.[p.id];
  return [
    t.keyPlayerId === p.id ? '에이스' : '',
    role?.offense ? `공격 · ${roleName(OFFENSE_ROLE, role.offense)}` : '',
    role?.defense ? `수비 · ${roleName(DEFENSE_ROLE, role.defense)}` : '',
    t.denyPlayerId && t.denyDefenderId === p.id ? `${targetName ?? '상대'} 집중 마크` : '',
  ].filter(Boolean);
}

// 선수의 가장 좋은 득점 수단 (상대 선수가 무엇으로 넣는지 한눈에 보려고)
const SCORING: [string, RatingKey[]][] = [['골밑', ['ins', 'dnk']], ['미들', ['mid']], ['3점', ['tp']]];
function bestScoring(p: Player) {
  return SCORING
    .map(([label, keys]) => ({ label, v: Math.round(Math.max(...keys.map((k) => p.ratings[k] ?? 0))) }))
    .reduce((a, b) => (b.v > a.v ? b : a));
}

// faces: 선수 id -> 이미지 주소. 이미지가 없는 선수는 회색 기본 그림이 나온다
// onClick: 줄을 누르면 (교체 등). onInfo: 줄 끝의 '정보' 버튼으로 능력치 창을 연다 (줄 누르기와 겹치지 않게 따로 둔다)
// tags: 줄 아래 꼬리표 (걸려 있는 지시). no: 코트 그림의 번호 (상대 선수는 코트에 번호만 보여서, 누가 몇 번인지 여기서 맞춰 본다)
function PlayerRow({ player: p, faces, selected = false, tags, no, onClick, onInfo }: {
  player: PlayerView; faces: Record<string, string>; selected?: boolean; tags?: string[]; no?: number; onClick?: () => void; onInfo?: (id: string) => void;
}) {
  return (
    <>
      <div className={`bench-row ${onInfo ? 'has-info' : ''} ${selected ? 'sel' : ''} ${onClick && p.out ? 'off' : ''} ${onClick ? '' : 'static'}`} onClick={onClick}>
        <PosBadge pos={p.pos} />
        <span className="nm name-cell">
          {no != null && <i className="slot-no" title={`코트 그림의 ${no}번`}>{no}</i>}
          <Portrait name={p.name} src={faces[p.id]} size={26} round />
          <span className="nm-text"><span className="nm-name">{p.name}</span> <span className="faint">{p.ovr}</span></span>
        </span>
        <CondBar value={p.energy} />
        <span className="num">{p.pts}점</span>
        <span className={`num ${p.pf >= 4 ? 'bad' : 'faint'}`}>{p.pf}F</span>
        {onInfo && <button className="btn ghost small info-btn" title={`${p.name} 능력치 보기`} onClick={(e) => { e.stopPropagation(); onInfo(p.id); }}>정보</button>}
      </div>
      {tags && tags.length > 0 && <div className="role-tags">{tags.map((tag) => <span key={tag} className="pill club">{tag}</span>)}</div>}
    </>
  );
}

// 상대 코트 위 다섯 명과, 각자를 우리 누가 막고 있는지. 여기서 바로 집중 마크를 걸고 푼다.
function Matchups({ mine, opp, faces, roster, onInfo, onDeny }: {
  mine: TeamView; opp: TeamView; faces: Record<string, string>; roster: Record<string, Player>;
  onInfo: (id: string) => void; onDeny?: (id: string) => void;
}) {
  const t = mine.tactics;
  // 엔진의 매치업(guardOf)과 같다: 같은 자리끼리 막고, 집중 마크 담당이 따로 있으면 대상과 자리를 맞바꾼다
  const targetSlot = t.denyPlayerId ? opp.court.findIndex((p) => p.id === t.denyPlayerId) : -1;
  const chosen = mine.court.findIndex((p) => p.id === t.denyDefenderId);
  const markerSlot = targetSlot < 0 ? -1 : chosen >= 0 ? chosen : targetSlot;
  const guardOf = (slot: number) => mine.court[targetSlot < 0 ? slot : slot === targetSlot ? markerSlot : slot === markerSlot ? targetSlot : slot];
  return (
    <>
      {opp.court.map((p, slot) => {
        const guard = guardOf(slot);
        const src = roster[p.id];
        const best = src ? bestScoring(src) : null;
        const denied = t.denyPlayerId === p.id;
        const edge = guard ? guard.ovr - p.ovr : 0;
        return (
          <Fragment key={p.id}>
            <PlayerRow faces={faces} player={p} no={slot + 1} onInfo={onInfo} />
            <div className="mu-line">
              {best && <span>주무기 <b>{best.label} {best.v}</b></span>}
              {guard && <span>수비 <b>{guard.name}</b> <span className={edge >= 5 ? 'good' : edge <= -5 ? 'bad' : 'faint'}>{edge > 0 ? `+${edge}` : edge}</span></span>}
              {onDeny && <button className={`btn small ${denied ? 'primary' : 'ghost'}`} aria-pressed={denied} onClick={() => onDeny(denied ? '' : p.id)}>{denied ? '집중 마크 중 · 풀기' : '집중 마크'}</button>}
            </div>
          </Fragment>
        );
      })}
    </>
  );
}

// 쿼터 사이 휴식 화면: 방금 끝난 쿼터의 기록과, 다음 쿼터 전에 살펴볼 것들
function BreakPanel({ info, mine, opp, side, tiredAt, onResume }: {
  info: BreakInfo;
  mine: TeamView;
  opp: TeamView;
  side: number;
  tiredAt: number;
  onResume: () => void;
}) {
  const me = info.quarter[side];
  const them = info.quarter[1 - side];
  const shots = (made: number, tried: number) => `${made}/${tried}${tried ? ` (${Math.round((100 * made) / tried)}%)` : ''}`;
  const rows: [string, string, string][] = [
    ['득점', `${me.pts}`, `${them.pts}`],
    ['야투', shots(me.fgm, me.fga), shots(them.fgm, them.fga)],
    ['3점슛', shots(me.tpm, me.tpa), shots(them.tpm, them.tpa)],
    ['리바운드', `${me.reb}`, `${them.reb}`],
    ['턴오버', `${me.tov}`, `${them.tov}`],
  ];
  const squad = [...mine.court, ...mine.bench].filter((p) => !p.out);
  const tired = mine.court.filter((p) => !p.out && p.energy < tiredAt + 10).sort((a, b) => a.energy - b.energy);
  const fouls = squad.filter((p) => p.pf >= 3).sort((a, b) => b.pf - a.pf);
  const rival = [...opp.court, ...opp.bench].reduce((a, b) => (b.pts > a.pts ? b : a));
  const diff = mine.score - opp.score;
  const next = info.period >= 4 ? `연장 ${info.period - 3}` : `${info.period + 1}쿼터`;
  return (
    <div className="break-panel">
      <div className="break-head">
        <div>
          <span className="eyebrow">{breakLabel(info.period)}</span>
          <h2>{mine.name} {mine.score} : {opp.score} {opp.name} <span className={diff > 0 ? 'good' : diff < 0 ? 'bad' : 'muted'}>{diff > 0 ? `${diff}점 앞섬` : diff < 0 ? `${-diff}점 뒤짐` : '동점'}</span></h2>
        </div>
        <button className="btn primary" onClick={onResume}><Icon name="next" />{next} 시작</button>
      </div>
      <div className="break-body">
        <table className="quarters">
          <thead><tr><th>{periodLabel(info.period)} 기록</th><th>{mine.name}</th><th>{opp.name}</th></tr></thead>
          <tbody>{rows.map(([label, a, b]) => <tr key={label}><td>{label}</td><td>{a}</td><td>{b}</td></tr>)}</tbody>
        </table>
        <ul className="lines">
          <li><span className="muted">지친 선수</span><span>{tired.length ? tired.map((p) => `${p.name} ${p.energy}`).join(', ') : '없음'}</span></li>
          <li><span className="muted">파울 3개 이상</span><span className={fouls.some((p) => p.pf >= 4) ? 'bad' : ''}>{fouls.length ? fouls.map((p) => `${p.name} ${p.pf}개`).join(', ') : '없음'}</span></li>
          <li><span className="muted">상대 최다 득점</span><span>{rival.pts ? `${rival.name} ${rival.pts}점` : '없음'}</span></li>
          <li><span className="muted">남은 작전 타임</span><span>{mine.timeoutsLeft}회</span></li>
        </ul>
      </div>
      <p className="hint">쉬는 시간입니다. 전술을 손보고, 코트 위 선수를 눌러 교체한 뒤 다음 쿼터를 시작하세요.</p>
    </div>
  );
}

function Compare({ box }: { box: BoxTeam[] }) {
  const [h, a] = box.map(teamTotals);
  const rows: [string, string, string, number, number][] = [
    ['야투', `${h.fgm}/${h.fga}`, `${a.fgm}/${a.fga}`, h.fga ? h.fgm / h.fga : 0, a.fga ? a.fgm / a.fga : 0],
    ['3점슛', `${h.tpm}/${h.tpa}`, `${a.tpm}/${a.tpa}`, h.tpa ? h.tpm / h.tpa : 0, a.tpa ? a.tpm / a.tpa : 0],
    ['자유투', `${h.ftm}/${h.fta}`, `${a.ftm}/${a.fta}`, h.ftm, a.ftm],
    ['리바운드', `${h.reb}`, `${a.reb}`, h.reb, a.reb],
    ['어시스트', `${h.ast}`, `${a.ast}`, h.ast, a.ast],
    ['스틸', `${h.stl}`, `${a.stl}`, h.stl, a.stl],
    ['블록', `${h.blk}`, `${a.blk}`, h.blk, a.blk],
    ['턴오버', `${h.tov}`, `${a.tov}`, h.tov, a.tov],
  ];
  return (
    <div className="compare">
      {rows.map(([label, hv, av, hn, an]) => {
        const share = hn + an ? (100 * hn) / (hn + an) : 50;
        return (
          <div key={label} className="cmp-row">
            <span className="lbl">{label}</span>
            <span>{hv}</span>
            <div className="cmp-bar"><i style={{ width: `${share}%` }} /><i style={{ width: `${100 - share}%` }} /></div>
            <span className="r">{av}</span>
          </div>
        );
      })}
    </div>
  );
}

const MADE = /성공|블록|스틸/;

type CenterTab = 'feed' | 'tactics' | 'alerts';
const CENTER_TABS: [CenterTab, string][] = [['feed', '중계'], ['tactics', '전술'], ['alerts', '자동 정지']];
type MatchTab = 'feed' | 'squad' | 'tactics' | 'opp' | 'stats';
const MATCH_TABS: [MatchTab, string][] = [['feed', '중계'], ['squad', '선수·교체'], ['tactics', '전술'], ['opp', '상대'], ['stats', '기록']];

// 경기 종료 창: 승패, 최종 점수, 양 팀 최다 득점자
// 경기 중 선수 능력치 창: 내 선수와 상대 선수 모두. 오늘 경기 기록도 함께 보여 준다
// stat: 오늘 경기 기록. onStep: 같은 팀의 앞뒤 선수로 넘긴다 (창을 닫았다 다시 열지 않고 명단을 훑어보게)
function PlayerCard({ player: p, live, stat, faces, team, mine, onStep, onClose }: {
  player: Player; live?: PlayerView; stat?: BoxPlayer; faces: Record<string, string>; team: string; mine: boolean; onStep: (dir: 1 | -1) => void; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onStep(-1);
      else if (e.key === 'ArrowRight') onStep(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onStep]);
  // 창이 화면보다 길 때(휴대폰): 열거나 선수를 넘길 때마다 맨 위(이름)부터 보여 준다
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => { card.current?.scrollTo(0, 0); }, [p.id]);
  const trait = TRAITS[traitOf(p)];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div ref={card} className="modal player-card" role="dialog" aria-modal="true" aria-labelledby="pc-title" onClick={(e) => e.stopPropagation()}>
        <div className="pc-head">
          <Portrait name={p.name} src={faces[p.id]} size={56} round />
          <div style={{ minWidth: 0, flex: 1 }}>
            <span className="eyebrow">{team}{mine ? '' : ' · 상대'}</span>
            <h2 id="pc-title">{p.name}</h2>
            <span className="muted">{POS_NAME[p.pos]} · {p.year}학년 · <span title={trait.info}>{trait.label}</span></span>
          </div>
          {live && <div className="pc-ovr"><small>종합</small><Attr v={live.ovr} big /></div>}
        </div>
        {live && (
          <div className="pc-live">
            <span>체력 <CondBar value={live.energy} /></span>
            <span><b>{live.pts}</b>점</span>
            <span className={live.pf >= 4 ? 'bad' : ''}><b>{live.pf}</b>파울</span>
            {live.out && <span className="pill bad">출전 불가</span>}
          </div>
        )}
        {stat && stat.sec > 0 && (
          <div className="pc-box">
            {([
              ['출전', `${Math.round(stat.sec / 60)}분`], ['야투', `${stat.fgm}/${stat.fga}`], ['3점', `${stat.tpm}/${stat.tpa}`], ['자유투', `${stat.ftm}/${stat.fta}`],
              ['리바', `${stat.orb + stat.drb}`], ['어시', `${stat.ast}`], ['스틸', `${stat.stl}`], ['블록', `${stat.blk}`], ['실책', `${stat.tov}`],
            ] as [string, string][]).map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}
          </div>
        )}
        <div className="attr-cols">
          {ATTR_GROUPS.map((g) => (
            <div key={g.title} className="attr-col">
              <h3>{g.title}</h3>
              {g.keys.map((k) => (
                <div key={k} className="attr-row"><span>{RATING_SHORT[k]}</span><Attr v={p.ratings[k]} /></div>
              ))}
            </div>
          ))}
        </div>
        <div className="row pc-foot">
          <button className="btn" onClick={() => onStep(-1)} title="같은 팀의 앞 선수 (←)"><Icon name="back" />이전</button>
          <button className="btn" onClick={() => onStep(1)} title="같은 팀의 다음 선수 (→)">다음<Icon name="next" /></button>
          <span className="spacer" />
          <button className="btn primary" onClick={onClose} autoFocus>닫기</button>
        </div>
      </div>
    </div>
  );
}

export default function MatchView({ S, act, match: m }: ViewProps & { match: ActiveMatch }) {
  // 점수판·기록은 연출 중인 공격권이 끝나기 전까지 이전 상태로 보여 준다. 선수 명단(교체)은 지금 상태.
  const live = m.game.view();
  const v = m.display?.view ?? live;
  const box = m.display?.box ?? m.game.result().box;
  const mine = live.teams[m.side];
  const opp = live.teams[1 - m.side];
  const labels = Object.fromEntries(live.teams.flatMap((team) => [...team.court, ...team.bench]).map((p) => [p.id, p.name]));
  // 선수 id -> 이미지 (올린 이미지가 우선, 없으면 연결된 원작 이미지)
  const faces: Record<string, string> = {};
  for (const team of live.teams) {
    for (const p of (team.id ? S.career.teams[team.id]?.players : undefined) ?? []) {
      const src = S.portraits[p.name] ?? licensedPortrait(p);
      if (src) faces[p.id] = src;
    }
  }
  const courtColors = matchColors([v.teams[0].name, v.teams[1].name], m.side);
  const clock = `${Math.floor(v.clock / 60)}:${String(v.clock % 60).padStart(2, '0')}`;
  const status = v.finished ? '경기 종료' : m.interlude ?? (m.playing ? periodLabel(v.period) : `${periodLabel(v.period)} · 일시정지`);
  const started = m.feed.length > 0 || m.possessions > 0;
  const everyone = Object.fromEntries([...mine.court, ...mine.bench].map((p) => [p.id, p.name]));
  const rivals = Object.fromEntries([...opp.court, ...opp.bench].map((p) => [p.id, `${p.name} (${p.pts}점)`]));
  const t = mine.tactics;
  // 집중 마크 담당 후보: 코트 위 선수를 먼저, 대상을 막을 때의 수비력과 함께 보여 준다
  const denyTarget = t.denyPlayerId ? S.career.teams[opp.id ?? '']?.players.find((p) => p.id === t.denyPlayerId) : undefined;
  const myRoster = S.career.teams[mine.id ?? '']?.players ?? [];
  const outlookOf = (p: PlayerView) => {
    const src = myRoster.find((x) => x.id === p.id);
    return src && denyTarget ? denyOutlook(src, denyTarget) : null;
  };
  // 추천 담당: 대상에게 마크 효과가 가장 큰 선수. 코트 위 선수를 먼저 보고, 벤치에 훨씬 나은 선수(10 이상)가 있을 때만 벤치 선수를 권한다
  const bestOf = (players: PlayerView[]) => players
    .map((p) => ({ p, power: Math.round((outlookOf(p)?.power ?? 0) * 100) }))
    .reduce<{ p: PlayerView; power: number } | null>((a, b) => (!a || b.power > a.power ? b : a), null);
  const bestCourt = denyTarget ? bestOf(mine.court.filter((p) => !p.out)) : null;
  const bestBench = denyTarget ? bestOf(mine.bench.filter((p) => !p.out)) : null;
  const benchPick = !!bestBench && bestBench.power >= (bestCourt?.power ?? 0) + 10;
  const recommend = benchPick ? bestBench : bestCourt;
  const SOLID_MARK = 80; // 이보다 낮으면 대상을 확실히 묶지 못해 효과가 작다 (scripts/balance/deny-check.ts, deny-matchups.ts)
  const markerLabel = (p: PlayerView, benched: boolean) => {
    const o = outlookOf(p);
    const miss = o ? [o.slower ? '느림' : '', o.smaller ? '작음' : '', o.weaker ? '힘 부족' : ''].filter(Boolean).join('·') : '';
    return `${recommend?.p.id === p.id ? '★ ' : ''}${p.name}${o ? ` · 마크 효과 ${Math.round(o.power * 100)}${miss ? ` (${miss})` : ''}` : ''}${benched ? ' [벤치]' : ''}`;
  };
  const markers = Object.fromEntries([
    ...mine.court.map((p) => [p.id, markerLabel(p, false)]),
    ...mine.bench.filter((p) => !p.out).map((p) => [p.id, markerLabel(p, true)]),
  ]);
  const prefs = S.prefs;
  const upcoming = today(S.career)?.prep;
  const prepBonus = upcoming && upcoming.daysUntil === 0 && (upcoming.opponentId === m.home || upcoming.opponentId === m.away) ? upcoming.bonus : 0;
  const feed = (prefs.feed === 'key' ? m.feed.filter((e) => KEY_EVENT.test(e.text)) : m.feed).slice(0, 150);
  const colors = { '--home': courtColors[0], '--away': courtColors[1] } as CSSProperties;

  // 코트 옆 패널: 중계(주요 장면·전체)와 코치 알림을 한 자리에서 바꿔 본다
  const [sideTab, setSideTab] = useState<'feed' | 'notes'>('feed');
  const sideTabs = { ...FEED_MODES, notes: m.notes.length ? `코치 알림 ${m.notes.length}` : '코치 알림' };
  const pickSideTab = (k: string) => {
    if (k === 'notes') { setSideTab('notes'); return; }
    setSideTab('feed');
    act('feedMode', k as FeedMode);
  };
  const outgoing = v.finished ? undefined : mine.court.find((p) => p.id === m.selected);
  const [confirmSkip, setConfirmSkip] = useState(false);
  // 능력치 창에 띄운 선수 (내 선수·상대 선수)
  const [infoId, setInfoId] = useState<string | null>(null);
  const info = (id: string) => setInfoId(id);
  const infoTeam = infoId ? live.teams.find((team) => [...team.court, ...team.bench].some((p) => p.id === infoId)) : undefined;
  const infoPlayer = infoTeam?.id ? S.career.teams[infoTeam.id]?.players.find((p) => p.id === infoId) : undefined;
  const infoLive = infoTeam ? [...infoTeam.court, ...infoTeam.bench].find((p) => p.id === infoId) : undefined;
  const infoStat = infoId ? m.game.result().box.flatMap((team) => team.players).find((p) => p.id === infoId) : undefined;
  const stepInfo = (dir: 1 | -1) => {
    if (!infoTeam) return;
    const ids = [...infoTeam.court, ...infoTeam.bench].map((p) => p.id);
    setInfoId(ids[(ids.indexOf(infoId!) + dir + ids.length) % ids.length]);
  };
  // 선수 id -> 원본 선수 (능력치). 양 팀 모두
  const roster: Record<string, Player> = {};
  for (const team of live.teams) for (const p of (team.id ? S.career.teams[team.id]?.players : undefined) ?? []) roster[p.id] = p;
  const denyName = t.denyPlayerId ? labels[t.denyPlayerId] : undefined;
  const tags = (p: PlayerView) => tagsFor(p, t, denyName);
  // 상대의 전술: 벤치에서 보이는 그대로 (공격 중심·수비 방식·템포)
  const ot = opp.tactics;
  const oppTactics = `${FOCUS[ot.focus ?? 'balanced']} 공격 · ${DEFENSE[ot.defense ?? 'man']} 수비 · ${(ot.pace ?? 0) > 0.25 ? '빠른' : (ot.pace ?? 0) < -0.25 ? '느린' : '보통'} 템포`;
  // 지금 우리 전술의 부담 (전술 화면과 같은 계산)
  const load = tacticLoad(t.defense, Math.round(t.pace ?? 0));
  const pctDelta = (x: number) => (Math.abs(x - 1) < 0.005 ? '' : `${x > 1 ? '+' : '−'}${Math.round(Math.abs(x - 1) * 100)}%`);
  const loadText = [
    pctDelta(load.drain) && `체력 소모 ${pctDelta(load.drain)}`,
    pctDelta(load.foul) && `파울 ${pctDelta(load.foul)}`,
    pctDelta(load.shootingFoul) && `슈팅 파울 ${pctDelta(load.shootingFoul)}`,
  ].filter(Boolean).join(' · ');
  const heavy = load.drain > 1.2;
  // 넓은 화면: 코트 아래 칸에 보여 줄 것
  const [centerTab, setCenterTab] = useState<CenterTab>('feed');
  const setDeny = (id: string) => act('matchTactic', 'denyPlayerId', id);
  // 휴대폰 화면: 코트 아래 내용을 탭으로 나눠 보고, 덜 쓰는 조작은 '더보기'에 접어 둔다
  const [tab, setTab] = useState<MatchTab>('feed');
  const [moreOpen, setMoreOpen] = useState(false);
  // 쿼터 사이 휴식 화면은 맨 위에 뜨므로, 아래쪽을 보고 있었다면 위로 올린다
  const onBreak = Boolean(m.pause && m.breakInfo);
  useEffect(() => {
    if (onBreak && window.matchMedia('(max-width: 860px)').matches) window.scrollTo({ top: 0 });
  }, [onBreak]);

  // 자동 정지 알림의 해결 버튼: 문제가 된 선수와, 대신 넣을 만한 벤치 선수(같은 포지션·체력·파울 여유 우선)
  // 지친 선수가 여럿이면 한 명씩 짝을 지어 한꺼번에 바꾼다. 체력이 덜 찬 벤치 선수(방금 뺀 선수)는 권하지 않는다.
  const fix = m.pause ? m.pauseFix : null;
  const subFix = fix?.kind === 'sub' ? fix : null;
  const outs = subFix ? mine.court.filter((p) => subFix.playerIds.includes(p.id)).sort((a, b) => a.energy - b.energy) : [];
  const usable = (p: PlayerView) => !p.out && p.pf < 4 && (subFix?.reason !== 'tired' || p.energy >= FRESH_ENERGY);
  const fit = (p: PlayerView, out: PlayerView) => p.ovr - 6 * Math.abs(p.pos - out.pos) + p.energy / 20;
  const pairs: [PlayerView, PlayerView][] = [];
  for (const out of outs) {
    const pool = mine.bench.filter((p) => usable(p) && !pairs.some(([, used]) => used.id === p.id));
    if (pool.length) pairs.push([out, pool.reduce((a, b) => (fit(b, out) > fit(a, out) ? b : a))]);
  }
  const unpaired = outs.filter((p) => !pairs.some(([out]) => out.id === p.id));
  const pickNext = outs.find((p) => p.id !== m.selected);
  const fixShown = outs.length > 0 || fix?.kind === 'timeout';

  // 마지막 공격권 연출까지 끝난 뒤에 종료 창을 띄운다
  const ended = live.finished && !m.pending;

  // 경기가 끝나면 지휘 화면 대신 결과 화면을 보여 준다
  if (ended) return <ResultView S={S} act={act} match={m} faces={faces} />;

  // 표에 쓰는 선수별 기록 (연출 중에는 그 공격권이 드러나기 전의 기록)
  const statOf = Object.fromEntries(box.flatMap((team) => team.players).map((p) => [p.id, p]));
  // 점수 흐름·쿼터별 점수에 쓰는 중계 기록: 연출 중인 공격권은 아직 드러내지 않는다
  const fullLog = m.game.result().log;
  const shownLog = m.pending ? fullLog.slice(0, Math.max(0, fullLog.length - m.pending.step.events.length)) : fullLog;
  const lead = v.teams[m.side].score - v.teams[1 - m.side].score;
  // 넓은 화면의 한 팀 칸: 위에 선수 기록 표, 아래에 우리 팀이면 점수 흐름과 팀 기록, 상대면 매치업과 부문별 1위
  const teamCol = (side: number) => {
    const team = live.teams[side];
    const isMine = side === m.side;
    return (
      <div className={`team-col ${isMine ? 'mine' : 'opp'}`}>
        <Panel
          title={team.name}
          flush
          className="d-only team-board"
          action={<span className="hint">{isMine ? '선수를 누르면 지시·교체' : '선수를 누르면 능력치'} · 팀 파울 {team.teamFouls}</span>}
        >
          <TeamBoard
            team={team}
            stats={statOf}
            selected={isMine ? m.selected : null}
            numbered={!isMine}
            denyId={isMine ? null : t.denyPlayerId}
            tagsOf={isMine ? tags : undefined}
            onCourt={isMine && !v.finished ? (id) => act('pick', 'court', id) : undefined}
            onBench={isMine && !v.finished ? (id) => (m.selected ? act('pick', 'bench', id) : info(id)) : undefined}
            onInfo={info}
          />
        </Panel>
        {isMine ? (
          <>
            {/* 고른 선수의 개인 지시와 교체: 넓은 화면에서는 이 칸 위에 겹쳐 뜨고, 휴대폰에서는 아래에서 올라온다 */}
            {outgoing && (
              <Panel
                title={`${outgoing.name} · 지시와 교체`}
                flush
                className="side-live sub-sheet"
                action={<div className="row"><button className="btn ghost small" onClick={() => info(outgoing.id)}>능력치</button><button className="btn ghost small" onClick={() => act('pick', 'court', outgoing.id)}>닫기</button></div>}
              >
                {/* 지시를 고를 때 참고할 능력치: 무엇을 잘하는 선수인지 */}
                {roster[outgoing.id] && (
                  <div className="sheet-attrs">
                    {(['ins', 'dnk', 'mid', 'tp', 'pss', 'mdf'] as RatingKey[]).map((k) => (
                      <span key={k}><small>{RATING_SHORT[k]}</small><Attr v={roster[outgoing.id].ratings[k] ?? roster[outgoing.id].ratings.diq} /></span>
                    ))}
                    <span><small>체력</small><b className={outgoing.energy < prefs.tiredAt ? 'bad' : ''}>{outgoing.energy}</b></span>
                    <span><small>파울</small><b className={outgoing.pf >= 4 ? 'bad' : ''}>{outgoing.pf}</b></span>
                  </div>
                )}
                <RoleEdit role={t.roles?.[outgoing.id]} onChange={(kind, value) => act('playerRole', outgoing.id, kind, value)} />
                <div className="sub-hint">대신 들어갈 선수 · 누르면 교체</div>
                {mine.bench.map((p) => (
                  <PlayerRow key={p.id} faces={faces} player={p} onClick={() => act('pick', 'bench', p.id)} onInfo={info} />
                ))}
              </Panel>
            )}
            <Panel title="점수 흐름" className="d-only" action={<span className={`hint ${lead > 0 ? 'good' : lead < 0 ? 'bad' : ''}`}>{lead > 0 ? `${lead}점 앞섬` : lead < 0 ? `${-lead}점 뒤짐` : '동점'} · 위쪽이 우리 우세</span>}>
              <FlowChart log={shownLog} side={m.side} colors={courtColors} />
            </Panel>
            <Panel title="쿼터별 점수 · 팀 기록" className="d-only" action={<span className="hint">{v.teams[0].name} · {v.teams[1].name}</span>}>
              <QuarterTable log={shownLog} teams={v.teams} period={v.period} />
              <Compare box={box} />
            </Panel>
          </>
        ) : (
          <>
            <Panel title="매치업 · 집중 마크" flush className="d-only" action={<span className="hint">동그라미 숫자는 코트의 번호</span>}>
              <div className="opp-brief">
                <b>{oppTactics}</b>
                <span className="muted">팀 파울 {opp.teamFouls} · 남은 작전 타임 {opp.timeoutsLeft} · 수비 옆 숫자는 종합 능력 차</span>
              </div>
              <Matchups mine={mine} opp={opp} faces={faces} roster={roster} onInfo={info} onDeny={v.finished ? undefined : setDeny} />
            </Panel>
            <Panel title="부문별 1위" className="d-only">
              <Leaders box={box} />
            </Panel>
          </>
        )}
      </div>
    );
  };


  return (
    <div className="page match" data-tab={tab} data-center={centerTab} style={colors}>
      {infoPlayer && infoTeam && (
        <PlayerCard player={infoPlayer} live={infoLive} stat={infoStat} faces={faces} team={infoTeam.name} mine={infoTeam === mine} onStep={stepInfo} onClose={() => setInfoId(null)} />
      )}
      <div className="scorebar">
        <Side team={v.teams[0]} mine={m.side === 0} prep={m.side === 0 ? prepBonus : 0} />
        <div className="sb-mid">
          <span className="q">{status}</span>
          <span className="clock">{clock}</span>
          <span className="faint" style={{ fontSize: 11.5 }}>{m.label}</span>
        </div>
        <Side team={v.teams[1]} mine={m.side === 1} away prep={m.side === 1 ? prepBonus : 0} />
      </div>

      <div className="match-dock">
      <div className={`controls-bar ${moreOpen ? 'open' : ''}`}>
        {v.finished ? (
          <button className="btn primary" onClick={() => act('finish')}>경기 종료 — 결과 반영</button>
        ) : (
          <>
            {m.playing
              ? <button className="btn primary play-btn" onClick={() => act('pause')}><span className="pause-ico" />일시정지</button>
              : <button className="btn primary play-btn" onClick={() => act('play')}><Icon name="next" />{started ? '계속 진행' : '경기 시작'}</button>}
            <Seg options={SPEED_OPTIONS} value={prefs.speed} onChange={(k) => act('speed', k as SpeedKey)} />
            <button className="btn" disabled={!mine.timeoutsLeft} onClick={() => act('timeout')}>작전 타임 ({mine.timeoutsLeft})</button>
            <button className="btn more-btn" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>{moreOpen ? '접기' : '더보기'}</button>
            <div className="ctl-more">
            <button className="btn" onClick={() => act('autosub')}>교체: {mine.auto ? 'AI 코치' : '직접'}</button>
            <span className="spacer" />
            {/* 진행 중에도 자리를 지켜 옆 버튼이 밀리지 않게 한다 */}
            <button className="btn ghost" disabled={m.playing || Boolean(m.pending)} onClick={() => act('step')} title="멈춘 상태에서 공격권 하나만 진행합니다">공격권 하나</button>
            {confirmSkip ? (
              <span className="skip-confirm">
                <span>남은 경기를 바로 끝낼까요? 되돌릴 수 없습니다.</span>
                <button className="btn primary" onClick={() => { setConfirmSkip(false); act('skip', 'game'); }}>끝까지 맡기기</button>
                <button className="btn ghost" onClick={() => setConfirmSkip(false)}>취소</button>
              </span>
            ) : (
              <>
                <button className="btn ghost" onClick={() => act('skip', 'period')} title="이번 쿼터가 끝날 때까지만 AI 코치에게 맡기고, 다음 쿼터부터 다시 직접 지휘합니다">이번 쿼터만 맡기기</button>
                <button className="btn ghost" onClick={() => setConfirmSkip(true)}>끝까지 AI에게 맡기기</button>
              </>
            )}
            {!started && <button className="btn ghost" onClick={() => act('leaveMatch')} title="경기를 시작하기 전에는 홈으로 돌아가 준비를 마저 할 수 있습니다"><Icon name="back" />홈으로</button>}
            </div>
          </>
        )}
      </div>

      {/* 쿼터 사이 휴식만으로 멈췄으면 아래 휴식 화면이 같은 내용을 보여 주므로 띠는 생략한다 */}
      {m.pause && !v.finished && !(m.breakInfo && !fixShown) && (
        <div className="pause-banner">
          <Icon name="alert" />
          <div>
            <b>경기를 멈췄습니다</b>
            <span>{m.pause}</span>
            {pairs.length > 1 && <span className="faint">추천 교체: {pairs.map(([out, sub]) => `${out.name} → ${sub.name}`).join(' · ')}</span>}
            {unpaired.length > 0 && (
              <span className="faint">
                {unpaired.map((p) => p.name).join(', ')}: 벤치에 {subFix?.reason === 'tired' ? `체력 ${FRESH_ENERGY} 이상인` : '파울 여유가 있는'} 교체 선수가 없습니다.
                {subFix?.reason === 'tired' && ' 작전 타임이나 느린 템포로 숨을 돌리게 할 수 있습니다.'}
              </span>
            )}
          </div>
          <span className="spacer" />
          {/* 멈춘 이유를 그 자리에서 해결하는 버튼 */}
          {pairs.length > 0 && (
            <button
              className="btn primary"
              onClick={() => act('swap', pairs.map(([out, sub]) => [out.id, sub.id] as [string, string]))}
              title={pairs.map(([out, sub]) => `${out.name} → ${sub.name} (종합 ${sub.ovr} · 체력 ${sub.energy} · 파울 ${sub.pf})`).join('\n')}
            >
              {pairs.length === 1 ? `${pairs[0][0].name} → ${pairs[0][1].name} 교체` : `${pairs.length}명 한꺼번에 교체`}
            </button>
          )}
          {pickNext && (
            <button className="btn" onClick={() => act('pick', 'court', pickNext.id)}>{outs.length > 1 ? `${pickNext.name} 교체 직접 고르기` : '교체 선수 직접 고르기'}</button>
          )}
          {m.pauseFix?.kind === 'timeout' && (
            <button className="btn primary" disabled={!mine.timeoutsLeft} onClick={() => act('timeout')}>작전 타임 ({mine.timeoutsLeft})</button>
          )}
          <button className={`btn pb-resume ${fixShown ? '' : 'primary'}`} onClick={() => act('play')}>계속 진행</button>
        </div>
      )}
      </div>

      {/* 쿼터 사이 휴식: 휴대폰에서는 여기(코트 위쪽)에 끼워 넣고, 넓은 화면에서는 코트 위에 겹쳐 띄운다 (아래 break-over) */}
      {onBreak && !v.finished && (
        <div className="break-flow">
          <BreakPanel info={m.breakInfo!} mine={mine} opp={opp} side={m.side} tiredAt={prefs.tiredAt} onResume={() => act('play')} />
        </div>
      )}

      {/* 넓은 화면: 코트를 가운데 두고 양옆에 두 팀의 현황을 둔다 (왼쪽 홈, 오른쪽 원정).
          휴대폰에서는 이 틀이 풀려, 코트 아래를 탭으로 나눠 보는 예전 구성 그대로다 (아래 m-only). */}
      <div className="match-main match-cols">
        {teamCol(0)}

        <div className="match-center">
          <Panel title="코트" flush className="court-panel" action={<span className="hint">{SPEEDS[prefs.speed].perSecond ? (SPEEDS[prefs.speed].keyOnly ? '주요 장면만 움직임으로 보여 줍니다' : '모든 공격권을 움직임으로 보여 줍니다') : '움직임 없이 빠르게 진행합니다'}</span>}>
            {/* 넓은 화면: 휴식 요약을 코트 위에 겹쳐서, 코트와 그 아래가 밀려 내려가지 않게 한다 */}
            {onBreak && !v.finished && (
              <div className="break-over">
                <BreakPanel info={m.breakInfo!} mine={mine} opp={opp} side={m.side} tiredAt={prefs.tiredAt} onResume={() => act('play')} />
              </div>
            )}
            <div className="court-stick">
              <FullCourt
                anim={m.anim}
                scene={m.scene ?? tipOffScene(live)}
                colors={courtColors}
                labels={labels}
                faces={faces}
                mySide={m.side}
                selected={m.selected}
                onPick={v.finished ? undefined : (id) => act('pick', 'court', id)}
                onInfo={info}
              />
              {/* 휴대폰: 코트 아래 내용을 고르는 탭 */}
              <div className="match-tabs" role="tablist">
                {MATCH_TABS.map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                    {label}{k === 'feed' && m.notes.length > 0 && <i className="badge">{m.notes.length}</i>}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          {/* 넓은 화면: 코트 아래 칸에 무엇을 둘지 (중계 · 전술 · 자동 정지) */}
          <div className="center-tabs d-only" role="tablist">
            {CENTER_TABS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={centerTab === k} className={centerTab === k ? 'on' : ''} onClick={() => setCenterTab(k)}>
                {label}
                {k === 'feed' && m.notes.length > 0 && <i className="badge">{m.notes.length}</i>}
                {k === 'tactics' && <small>{FOCUS[t.focus ?? 'balanced']} · {DEFENSE[t.defense ?? 'man']} · {PACE.find(([p]) => p === String(Math.round(t.pace ?? 0)))?.[1]}</small>}
              </button>
            ))}
          </div>

          <div className="match-side">
            <Panel
              title="중계"
              flush
              className="side-live mt mt-feed ct ct-feed"
              action={<Seg options={sideTabs} value={sideTab === 'notes' ? 'notes' : prefs.feed} onChange={pickSideTab} />}
            >
              {sideTab === 'notes' ? (
                m.notes.length ? (
                  <ul className="notes">
                    {m.notes.map((n) => (
                      <li key={n.id} className={`tone-${n.tone}`}>
                        <Icon name={NOTE_ICON[n.tone]} />
                        <span>{n.text}{n.paused && <span className="pill" style={{ marginLeft: 6 }}>자동 정지</span>}</span>
                        <span className="t">{n.period > 4 ? '연장' : `${n.period}Q`} {n.clock}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="empty">개입이 필요한 순간이 오면 코치가 알려 드립니다.</p>
              ) : (
                <div className="feed">
                  {feed.length > 0 && <div className="feed-head"><span>시간</span><span>점수는 {v.teams[0].name} - {v.teams[1].name} 순 · 색칠된 줄이 우리 팀</span></div>}
                  {feed.length
                    ? feed.map((e, i) => (
                      <div key={`${feed.length - i}-${e.clock}`} className={e.team === mine.name ? 'mine' : ''}>
                        <span className="t">{e.period > 4 ? '연장' : `${e.period}Q`} {e.clock}</span>
                        <span className="t">{e.score}</span>
                        <span className={MADE.test(e.text) ? 'made' : ''}>{e.text}</span>
                      </div>
                    ))
                    : <p className="empty">{started ? '아직 주요 장면이 없습니다.' : '경기 시작을 누르면 중계가 여기에 나옵니다.'}</p>}
                </div>
              )}
            </Panel>

            <div className="court-tactics mt mt-tactics ct ct-tactics">
              <div className="tac-main">
                <TacticSelects tactics={t} onChange={(key, value) => act('matchTactic', key, value)} />
                {/* 지금 전술이 체력과 파울에 주는 부담, 그리고 상대가 쓰는 전술 */}
                <p className="hint tac-load">
                  <span className={heavy ? 'bad' : ''}>{loadText ? `부담: ${loadText}` : '부담: 기본'}</span>
                  <span>상대: {oppTactics}</span>
                </p>
              </div>
              <div className="tac-picks">
                <label className="hint">에이스
                  <Select options={everyone} value={t.keyPlayerId} onChange={(value) => act('matchTactic', 'keyPlayerId', value)}><option value="">없음</option></Select>
                </label>
                <label className="hint">집중 마크
                  <Select options={rivals} value={t.denyPlayerId} onChange={(value) => act('matchTactic', 'denyPlayerId', value)}><option value="">없음</option></Select>
                </label>
                {/* 집중 마크를 고르기 전에도 자리를 잡아 둔다 (고를 때 줄이 늘어나지 않게) */}
                <label className="hint" title="마크 효과는 담당의 능력치를 대상의 능력치와 견줘 정합니다(수비 지능 대 공격 지능·주무기, 스피드, 키, 힘). 100이 대등한 수준이고, 확실히 앞서는 수비수가 아니면 큰 효과가 없습니다. 담당은 체력이 빨리 닳고 공격이 조금 무뎌집니다. 담당이 벤치에 있는 동안은 같은 자리 선수가 맡습니다.">마크 담당
                  <Select options={t.denyPlayerId ? markers : {}} value={t.denyPlayerId ? t.denyDefenderId : ''} disabled={!t.denyPlayerId} onChange={(value) => act('matchTactic', 'denyDefenderId', value)}><option value="">{t.denyPlayerId ? '같은 자리 선수' : '-'}</option></Select>
                </label>
              </div>
              {/* 담당 추천: 늘 한 줄을 차지한다 */}
              <div className="hint deny-pick">
                {denyTarget && recommend ? (
                  <>
                    <span className="dp-text">
                      {recommend.power >= SOLID_MARK
                        ? <>추천 담당: <b>{recommend.p.name}</b> (마크 효과 {recommend.power}){benchPick && ' · 벤치에 있어 교체로 넣어야 합니다'}</>
                        : <>{denyTarget.name}을(를) 확실히 막을 선수가 없습니다. 그나마 <b>{recommend.p.name}</b> (마크 효과 {recommend.power}) · 대상을 조금만 묶습니다</>}
                    </span>
                    {t.denyDefenderId !== recommend.p.id && (
                      <button className="btn ghost small" onClick={() => act('matchTactic', 'denyDefenderId', recommend.p.id)}>{recommend.p.name}에게 맡기기</button>
                    )}
                  </>
                ) : <span className="dp-text faint">집중 마크할 상대를 고르면, 맡기기 좋은 선수를 여기에 추천합니다.</span>}
              </div>
            </div>

            <Panel title="자동 정지" className="mt mt-tactics ct ct-alerts">
              <div className="toggles">
                {(Object.keys(ALERTS) as AlertKey[]).map((k) => (
                  <label key={k} className="toggle">
                    <input type="checkbox" checked={prefs.alerts[k]} onChange={() => act('toggleAlert', k)} />
                    {ALERTS[k]}
                  </label>
                ))}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <span className="hint">체력 저하 기준</span>
                <Seg options={TIRED_OPTIONS} value={String(prefs.tiredAt)} onChange={(k) => act('tiredAt', Number(k))} />
              </div>
              <p className="hint">켜 둔 상황이 오면 경기를 멈추고 알려 드립니다. 지친 선수가 여럿이면 한 번에 묶어 알립니다. 교체를 AI 코치에게 맡긴 동안에는 파울·체력으로는 멈추지 않습니다.</p>
            </Panel>
          </div>
        </div>

        {teamCol(1)}
      </div>

      {/* 휴대폰: 탭으로 골라 보는 선수 명단·기록·상대 */}
      <div className="match-grid m-only">
        <Panel title="벤치 · 개인 지시" flush className="mt mt-squad">
          <div className="sub-hint">
            {m.selected ? '뜬 창에서 지시를 내리거나, 대신 들어갈 벤치 선수를 누르세요. 다음 공격권부터 바로 적용됩니다.' : '코트 선수를 누르면 개인 지시와 교체 창이 뜹니다. 내린 지시는 이름 아래에 꼬리표로 남습니다.'}
          </div>
          {mine.court.map((p) => (
            <PlayerRow key={p.id} faces={faces} player={p} selected={m.selected === p.id} tags={tags(p)} onClick={() => act('pick', 'court', p.id)} onInfo={info} />
          ))}
          <div className="sub-hint">벤치</div>
          {mine.bench.map((p) => (
            <PlayerRow key={p.id} faces={faces} player={p} tags={tags(p)} onClick={() => act('pick', 'bench', p.id)} onInfo={info} />
          ))}
        </Panel>

        <div className="stack">
          <Panel title="경기 기록" className="mt mt-stats" action={<span className="hint">{v.teams[0].name} · {v.teams[1].name}</span>}>
            <Compare box={box} />
          </Panel>
          <Panel title={`${opp.name} 선수`} flush className="mt mt-opp" action={<span className="hint">정보를 누르면 능력치</span>}>
            <div className="opp-brief">
              <b>{oppTactics}</b>
              <span className="muted">팀 파울 {opp.teamFouls} · 남은 작전 타임 {opp.timeoutsLeft}</span>
            </div>
            <div className="sub-hint">코트 위 5명 · 동그라미 숫자는 코트의 번호 · 수비 옆 숫자는 종합 능력 차</div>
            <Matchups mine={mine} opp={opp} faces={faces} roster={roster} onInfo={info} onDeny={v.finished ? undefined : setDeny} />
            <div className="sub-hint">벤치</div>
            {opp.bench.map((p) => <PlayerRow key={p.id} faces={faces} player={p} onInfo={info} />)}
          </Panel>
        </div>
      </div>
    </div>
  );
}
