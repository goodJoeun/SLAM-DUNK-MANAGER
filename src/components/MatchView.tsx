import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { today } from '@/game/season';
import { keyMoments, playerRating } from '@/game/review';
import type { BoxTeam, LogEvent, PlayerRole, PlayerView, TeamView } from '@/game/types';
import type { ActiveMatch } from './useGame';
import { ALERTS, FEED_MODES, FRESH_ENERGY, KEY_EVENT, SPEEDS, TIRED_LEVELS, breakLabel, periodLabel, teamTotals } from './live';
import type { AlertKey, BreakInfo, FeedMode, SpeedKey } from './live';
import FullCourt from './court/FullCourt';
import { tipOffScene } from './court/choreo';
import Portrait, { licensedPortrait } from './Portrait';
import { CondBar, Crest, DEFENSE_ROLE, Icon, OFFENSE_ROLE, Panel, PosBadge, Rating, Seg, Select, TacticSelects, clubColor } from './ui';
import type { ViewProps } from './ui';

const SPEED_OPTIONS = Object.entries(SPEEDS).map(([k, v]) => [k, v.label] as [string, string]);
const TIRED_OPTIONS = TIRED_LEVELS.map((n) => [String(n), `${n} 아래`] as [string, string]);
const NOTE_ICON ={ info: 'bulb', warn: 'alert', bad: 'alert', good: 'ball' } as const;

function Side({ team: t, mine, away = false, prep = 0 }: { team: TeamView; mine: boolean; away?: boolean; prep?: number }) {
  return (
    <div className={`sb-team ${away ? 'away' : ''}`}>
      <Crest name={t.name} size={40} />
      <div className="who">
        <span className="nm">
          {t.name}{mine && <span className="pill club" style={{ marginLeft: 6 }}>우리 팀</span>}
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
function RoleRow({ role, onChange }: { role?: PlayerRole; onChange: (kind: 'offense' | 'defense', value: string) => void }) {
  return (
    <div className={`role-row ${role ? 'set' : ''}`}>
      <Select options={OFFENSE_ROLE} value={role?.offense} onChange={(v) => onChange('offense', v)}><option value="">공격: 기본</option></Select>
      <Select options={DEFENSE_ROLE} value={role?.defense} onChange={(v) => onChange('defense', v)}><option value="">수비: 기본</option></Select>
    </div>
  );
}

// faces: 선수 id -> 이미지 주소. 이미지가 없는 선수는 회색 기본 그림이 나온다
function PlayerRow({ player: p, faces, selected = false, onClick }: { player: PlayerView; faces: Record<string, string>; selected?: boolean; onClick?: () => void }) {
  return (
    <div className={`bench-row ${selected ? 'sel' : ''} ${onClick && p.out ? 'off' : ''} ${onClick ? '' : 'static'}`} onClick={onClick}>
      <PosBadge pos={p.pos} />
      <span className="nm name-cell"><Portrait name={p.name} src={faces[p.id]} size={26} round /><span>{p.name} <span className="faint">{p.ovr}</span></span></span>
      <CondBar value={p.energy} />
      <span className="num">{p.pts}점</span>
      <span className={`num ${p.pf >= 4 ? 'bad' : 'faint'}`}>{p.pf}F</span>
    </div>
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
      <p className="hint">쉬는 시간입니다. 코트 아래에서 전술을, 오른쪽 명단에서 교체를 손본 뒤 다음 쿼터를 시작하세요.</p>
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

// 경기 종료 창: 승패, 최종 점수, 양 팀 최다 득점자
function EndModal({ faces, view, box, log, side, label, onFinish, onClose }: {
  faces: Record<string, string>;
  view: { teams: TeamView[]; period: number };
  box: BoxTeam[];
  log: LogEvent[];
  side: number;
  label: string;
  onFinish: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const [h, a] = view.teams;
  const won = view.teams[side].score > view.teams[1 - side].score;
  const top = (t: BoxTeam) => t.players.reduce((x, y) => (y.pts > x.pts ? y : x));
  // 쿼터별 득점: 중계 기록에서 각 쿼터의 마지막 점수를 찾아 앞 쿼터와의 차이를 구한다
  const ends: [number, number][] = [];
  for (const e of log) {
    const [x, y] = e.score.split('-').map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) ends[e.period - 1] = [x, y];
  }
  if (ends.length) ends[ends.length - 1] = [h.score, a.score];
  const moments = keyMoments(log, side);
  const best = box[side].players.filter((p) => p.sec > 0).reduce((x, y) => (playerRating(y) > playerRating(x) ? y : x));
  const quarters = ends.map((q, i) => { const prev = ends[i - 1] ?? [0, 0]; return [q[0] - prev[0], q[1] - prev[1]]; });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="end-title" onClick={(e) => e.stopPropagation()}>
        <span className="eyebrow">{label}{view.period > 4 ? ' · 연장' : ''}</span>
        <h2 id="end-title" className={won ? 'good' : 'bad'}>{won ? '승리!' : '패배'}</h2>
        <div className="end-score">
          <div><Crest name={h.name} size={40} /><b>{h.name}</b></div>
          <span className="num">{h.score} : {a.score}</span>
          <div><Crest name={a.name} size={40} /><b>{a.name}</b></div>
        </div>
        {quarters.length > 1 && (
          <table className="quarters">
            <thead><tr><th />{quarters.map((_, i) => <th key={i}>{i < 4 ? `${i + 1}Q` : `연장${i - 3}`}</th>)}<th>합계</th></tr></thead>
            <tbody>
              {[h, a].map((t, s) => (
                <tr key={t.name}><td>{t.name}</td>{quarters.map((q, i) => <td key={i}>{q[s]}</td>)}<td>{t.score}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <ul className="lines">
          {box.map((t) => {
            const p = top(t);
            return (
              <li key={t.name}>
                <span className="muted">{t.name} 최다 득점</span>
                <span className="name-cell"><Portrait name={p.name} src={faces[p.id]} size={26} round /><span><b>{p.name}</b> {p.pts}점 · 리바 {p.orb + p.drb} · 어시 {p.ast}</span></span>
              </li>
            );
          })}
          <li>
            <span className="muted">우리 팀 최고 평점</span>
            <span className="name-cell"><Portrait name={best.name} src={faces[best.id]} size={26} round /><span><b>{best.name}</b> <Rating v={playerRating(best)} /></span></span>
          </li>
        </ul>
        {moments.length > 0 && (
          <div className="moments">
            <h3>승부처</h3>
            <ul>{moments.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>기록 더 보기</button>
          <button className="btn primary" autoFocus onClick={onFinish}>결과 반영</button>
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
  const courtColors: [string, string] = [clubColor(v.teams[0].name), clubColor(v.teams[1].name)];
  const clock = `${Math.floor(v.clock / 60)}:${String(v.clock % 60).padStart(2, '0')}`;
  const status = v.finished ? '경기 종료' : m.interlude ?? (m.playing ? periodLabel(v.period) : `${periodLabel(v.period)} · 일시정지`);
  const started = m.feed.length > 0 || m.possessions > 0;
  const everyone = Object.fromEntries([...mine.court, ...mine.bench].map((p) => [p.id, p.name]));
  const rivals = Object.fromEntries([...opp.court, ...opp.bench].map((p) => [p.id, `${p.name} (${p.pts}점)`]));
  const t = mine.tactics;
  const prefs = S.prefs;
  const upcoming = today(S.career)?.prep;
  const prepBonus = upcoming && upcoming.daysUntil === 0 && (upcoming.opponentId === m.home || upcoming.opponentId === m.away) ? upcoming.bonus : 0;
  const feed = (prefs.feed === 'key' ? m.feed.filter((e) => KEY_EVENT.test(e.text)) : m.feed).slice(0, 150);
  const colors = { '--home': clubColor(v.teams[0].name), '--away': clubColor(v.teams[1].name) } as CSSProperties;

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

  return (
    <div className="page" style={colors}>
      {ended && !m.endSeen && (
        <EndModal faces={faces} view={live} box={m.game.result().box} log={m.game.result().log} side={m.side} label={m.label} onFinish={() => act('finish')} onClose={() => act('dismissEnd')} />
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

      <div className="controls-bar">
        {v.finished ? (
          <button className="btn primary" onClick={() => act('finish')}>경기 종료 — 결과 반영</button>
        ) : (
          <>
            {m.playing
              ? <button className="btn primary play-btn" onClick={() => act('pause')}><span className="pause-ico" />일시정지</button>
              : <button className="btn primary play-btn" onClick={() => act('play')}><Icon name="next" />{started ? '계속 진행' : '경기 시작'}</button>}
            <Seg options={SPEED_OPTIONS} value={prefs.speed} onChange={(k) => act('speed', k as SpeedKey)} />
            <button className="btn" disabled={!mine.timeoutsLeft} onClick={() => act('timeout')}>작전 타임 ({mine.timeoutsLeft})</button>
            <button className="btn" onClick={() => act('autosub')}>교체: {mine.auto ? 'AI 코치' : '직접'}</button>
            <span className="spacer" />
            {!m.playing && <button className="btn ghost" disabled={Boolean(m.pending)} onClick={() => act('step')} title="멈춘 상태에서 공격권 하나만 진행합니다">공격권 하나</button>}
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
          <button className={`btn ${fixShown ? '' : 'primary'}`} onClick={() => act('play')}>계속 진행</button>
        </div>
      )}

      {m.pause && m.breakInfo && !v.finished && (
        <BreakPanel info={m.breakInfo} mine={mine} opp={opp} side={m.side} tiredAt={prefs.tiredAt} onResume={() => act('play')} />
      )}

      <div className="match-main">
        <Panel title="코트" flush action={<span className="hint">{SPEEDS[prefs.speed].perSecond ? (SPEEDS[prefs.speed].keyOnly ? '주요 장면만 움직임으로 보여 줍니다' : '모든 공격권을 움직임으로 보여 줍니다') : '움직임 없이 빠르게 진행합니다'}</span>}>
          <FullCourt
            anim={m.anim}
            scene={m.scene ?? tipOffScene(live)}
            colors={courtColors}
            labels={labels}
            faces={faces}
            mySide={m.side}
            selected={m.selected}
            onPick={v.finished ? undefined : (id) => act('pick', 'court', id)}
          />
          {/* 코트를 보면서 바로 지시할 수 있게 전술을 코트 바로 아래에 한 줄로 둔다 */}
          <div className="court-tactics" title="경기 중에도 바로 적용됩니다">
            <TacticSelects tactics={t} onChange={(key, value) => act('matchTactic', key, value)} />
            <div className="controls">
              <label className="hint">에이스 지정
                <Select options={everyone} value={t.keyPlayerId} onChange={(value) => act('matchTactic', 'keyPlayerId', value)}><option value="">없음</option></Select>
              </label>
              <label className="hint">집중 마크
                <Select options={rivals} value={t.denyPlayerId} onChange={(value) => act('matchTactic', 'denyPlayerId', value)}><option value="">없음</option></Select>
              </label>
            </div>
          </div>
        </Panel>

        {/* 코트 옆: 코트 위 다섯 명(체력·득점·파울)과 중계. 교체할 선수를 고르면 중계 자리에 벤치가 뜬다 */}
        <div className="match-side">
          <Panel title="코트 위 5명" flush action={<span className="hint">누르면 교체 · 막대는 체력</span>}>
            {mine.court.map((p) => (
              <PlayerRow key={p.id} faces={faces} player={p} selected={m.selected === p.id} onClick={v.finished ? undefined : () => act('pick', 'court', p.id)} />
            ))}
          </Panel>

          {outgoing ? (
            <Panel
              title={`${outgoing.name} 대신 들어갈 선수`}
              flush
              className="side-live"
              action={<button className="btn ghost small" onClick={() => act('pick', 'court', outgoing.id)}>취소</button>}
            >
              {mine.bench.map((p) => (
                <PlayerRow key={p.id} faces={faces} player={p} onClick={() => act('pick', 'bench', p.id)} />
              ))}
            </Panel>
          ) : (
            <Panel
              title="중계"
              flush
              className="side-live"
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
          )}
        </div>
      </div>

      <div className="match-grid">
        <Panel title="벤치 · 개인 지시" flush>
          <div className="sub-hint">
            {m.selected ? '들어갈 벤치 선수를 누르세요. 경기가 흐르는 중에도 다음 공격권부터 바로 바뀝니다.' : '코트 선수를 고른 뒤 벤치 선수를 누르면 교체됩니다. 코트 위 선수에게는 공격·수비 지시를 줄 수 있습니다.'}
          </div>
          {mine.court.map((p) => (
            <div key={p.id}>
              <PlayerRow faces={faces} player={p} selected={m.selected === p.id} onClick={() => act('pick', 'court', p.id)} />
              <RoleRow role={t.roles?.[p.id]} onChange={(kind, value) => act('playerRole', p.id, kind, value)} />
            </div>
          ))}
          <div className="sub-hint">벤치</div>
          {mine.bench.map((p) => (
            <div key={p.id}>
              <PlayerRow faces={faces} player={p} onClick={() => act('pick', 'bench', p.id)} />
              {/* 벤치 선수의 지시는 미리 정해 둔 것만 보여 줘 목록을 짧게 유지한다 */}
              {t.roles?.[p.id] && <RoleRow role={t.roles[p.id]} onChange={(kind, value) => act('playerRole', p.id, kind, value)} />}
            </div>
          ))}
        </Panel>

        <div className="stack">
          <Panel title="경기 기록" action={<span className="hint">{v.teams[0].name} · {v.teams[1].name}</span>}>
            <Compare box={box} />
          </Panel>
          <Panel title="자동 정지">
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
          <Panel title={`${opp.name} 코트`} flush>
            {opp.court.map((p) => <PlayerRow key={p.id} faces={faces} player={p} />)}
          </Panel>
        </div>
      </div>
    </div>
  );
}
