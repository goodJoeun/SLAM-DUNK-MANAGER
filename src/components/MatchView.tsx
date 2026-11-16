import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { today } from '@/game/season';
import type { BoxTeam, PlayerRole, PlayerView, TeamView } from '@/game/types';
import type { ActiveMatch } from './useGame';
import { ALERTS, FEED_MODES, KEY_EVENT, SPEEDS, periodLabel } from './live';
import type { AlertKey, FeedMode, SpeedKey } from './live';
import FullCourt from './court/FullCourt';
import { tipOffScene } from './court/choreo';
import { CondBar, Crest, DEFENSE_ROLE, Icon, OFFENSE_ROLE, Panel, PosBadge, Seg, Select, TacticSelects, clubColor } from './ui';
import type { ViewProps } from './ui';

const SPEED_OPTIONS = Object.entries(SPEEDS).map(([k, v]) => [k, v.label] as [string, string]);
const NOTE_ICON = { info: 'bulb', warn: 'alert', bad: 'alert', good: 'ball' } as const;

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

function PlayerRow({ player: p, selected = false, onClick }: { player: PlayerView; selected?: boolean; onClick?: () => void }) {
  return (
    <div className={`bench-row ${selected ? 'sel' : ''} ${onClick && p.out ? 'off' : ''} ${onClick ? '' : 'static'}`} onClick={onClick}>
      <PosBadge pos={p.pos} />
      <span className="nm">{p.name} <span className="faint">{p.ovr}</span></span>
      <CondBar value={p.energy} />
      <span className="num">{p.pts}점</span>
      <span className={`num ${p.pf >= 4 ? 'bad' : 'faint'}`}>{p.pf}F</span>
    </div>
  );
}

function totals(t: BoxTeam) {
  const sum = (f: (p: BoxTeam['players'][number]) => number) => t.players.reduce((s, p) => s + f(p), 0);
  return {
    fgm: sum((p) => p.fgm), fga: sum((p) => p.fga), tpm: sum((p) => p.tpm), tpa: sum((p) => p.tpa),
    ftm: sum((p) => p.ftm), fta: sum((p) => p.fta), reb: sum((p) => p.orb + p.drb), ast: sum((p) => p.ast),
    stl: sum((p) => p.stl), blk: sum((p) => p.blk), tov: sum((p) => p.tov),
  };
}

function Compare({ box }: { box: BoxTeam[] }) {
  const [h, a] = box.map(totals);
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
function EndModal({ view, box, side, label, onFinish, onClose }: {
  view: { teams: TeamView[]; period: number };
  box: BoxTeam[];
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
        <ul className="lines">
          {box.map((t) => {
            const p = top(t);
            return (
              <li key={t.name}>
                <span className="muted">{t.name} 최다 득점</span>
                <span><b>{p.name}</b> {p.pts}점 · 리바 {p.orb + p.drb} · 어시 {p.ast}</span>
              </li>
            );
          })}
        </ul>
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

  // 마지막 공격권 연출까지 끝난 뒤에 종료 창을 띄운다
  const ended = live.finished && !m.pending;

  return (
    <div className="page" style={colors}>
      {ended && !m.endSeen && (
        <EndModal view={live} box={m.game.result().box} side={m.side} label={m.label} onFinish={() => act('finish')} onClose={() => act('dismissEnd')} />
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
            <button className="btn ghost" onClick={() => act('skip')}>끝까지 AI에게 맡기기</button>
            {!started && <button className="btn ghost" onClick={() => act('leaveMatch')} title="경기를 시작하기 전에는 홈으로 돌아가 준비를 마저 할 수 있습니다"><Icon name="back" />홈으로</button>}
          </>
        )}
      </div>

      {m.pause && !v.finished && (
        <div className="pause-banner">
          <Icon name="alert" />
          <div><b>경기를 멈췄습니다</b><span>{m.pause}</span></div>
          <span className="spacer" />
          <button className="btn primary" onClick={() => act('play')}>계속 진행</button>
        </div>
      )}

      <div className="match-main">
        <Panel title="코트" flush action={<span className="hint">{SPEEDS[prefs.speed].perSecond ? (SPEEDS[prefs.speed].keyOnly ? '주요 장면만 움직임으로 보여 줍니다' : '모든 공격권을 움직임으로 보여 줍니다') : '움직임 없이 빠르게 진행합니다'}</span>}>
          <FullCourt
            anim={m.anim}
            scene={m.scene ?? tipOffScene(live)}
            colors={courtColors}
            labels={labels}
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
              <PlayerRow key={p.id} player={p} selected={m.selected === p.id} onClick={v.finished ? undefined : () => act('pick', 'court', p.id)} />
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
                <PlayerRow key={p.id} player={p} onClick={() => act('pick', 'bench', p.id)} />
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
              <PlayerRow player={p} selected={m.selected === p.id} onClick={() => act('pick', 'court', p.id)} />
              <RoleRow role={t.roles?.[p.id]} onChange={(kind, value) => act('playerRole', p.id, kind, value)} />
            </div>
          ))}
          <div className="sub-hint">벤치</div>
          {mine.bench.map((p) => (
            <div key={p.id}>
              <PlayerRow player={p} onClick={() => act('pick', 'bench', p.id)} />
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
            <p className="hint">켜 둔 상황이 오면 경기를 멈추고 알려 드립니다. 교체를 AI 코치에게 맡긴 동안에는 파울·체력으로는 멈추지 않습니다.</p>
          </Panel>
          <Panel title={`${opp.name} 코트`} flush>
            {opp.court.map((p) => <PlayerRow key={p.id} player={p} />)}
          </Panel>
        </div>
      </div>
    </div>
  );
}
