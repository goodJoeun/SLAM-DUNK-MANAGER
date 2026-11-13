import type { CSSProperties } from 'react';
import type { BoxTeam, PlayerView, TeamView } from '@/game/types';
import type { ActiveMatch } from './useGame';
import Court from './Court';
import { CondBar, Crest, Panel, PosBadge, Select, TacticSelects, clubColor } from './ui';
import type { ViewProps } from './ui';

function Side({ team: t, mine, away = false }: { team: TeamView; mine: boolean; away?: boolean }) {
  return (
    <div className={`sb-team ${away ? 'away' : ''}`}>
      <Crest name={t.name} size={40} />
      <div className="who">
        <span className="nm">{t.name}{mine && <span className="pill club" style={{ marginLeft: 6 }}>우리 팀</span>}</span>
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

export default function MatchView({ act, match: m }: ViewProps & { match: ActiveMatch }) {
  const v = m.game.view();
  const box = m.game.result().box;
  const mine = v.teams[m.side];
  const opp = v.teams[1 - m.side];
  const clock = `${Math.floor(v.clock / 60)}:${String(v.clock % 60).padStart(2, '0')}`;
  const period = v.finished ? '경기 종료' : v.period > 4 ? `연장 ${v.period - 4}` : `${v.period}쿼터`;
  const everyone = Object.fromEntries([...mine.court, ...mine.bench].map((p) => [p.id, p.name]));
  const rivals = Object.fromEntries([...opp.court, ...opp.bench].map((p) => [p.id, `${p.name} (${p.pts}점)`]));
  const t = mine.tactics;
  const feed = m.feed.slice(0, 120);
  const colors = { '--home': clubColor(v.teams[0].name), '--away': clubColor(v.teams[1].name) } as CSSProperties;

  return (
    <div className="page" style={colors}>
      <div className="scorebar">
        <Side team={v.teams[0]} mine={m.side === 0} />
        <div className="sb-mid">
          <span className="q">{period}</span>
          <span className="clock">{clock}</span>
          <span className="faint" style={{ fontSize: 11.5 }}>{m.label}</span>
        </div>
        <Side team={v.teams[1]} mine={m.side === 1} away />
      </div>

      <div className="controls-bar">
        {v.finished ? (
          <button className="btn primary" onClick={() => act('finish')}>경기 종료 — 결과 반영</button>
        ) : (
          <>
            <button className="btn primary" onClick={() => act('run')}>{m.timer ? '일시정지' : '쿼터 끝까지 진행'}</button>
            <button className="btn" disabled={Boolean(m.timer)} onClick={() => act('step')}>공격권 하나</button>
            <button className="btn" disabled={!mine.timeoutsLeft} onClick={() => act('timeout')}>작전 타임 ({mine.timeoutsLeft})</button>
            <button className="btn" onClick={() => act('autosub')}>교체: {mine.auto ? 'AI 코치' : '직접'}</button>
            <span className="spacer" />
            <button className="btn ghost" onClick={() => act('skip')}>끝까지 AI에게 맡기기</button>
          </>
        )}
      </div>

      <div className="match-grid">
        <Panel title={`${mine.name} 코트`} flush>
          <div style={{ padding: 12 }}>
            <Court
              players={mine.court.map((p) => ({ id: p.id, name: p.name, note: `${p.pts}점 · ${p.pf}F`, energy: p.energy, selected: m.selected === p.id, out: p.out }))}
              onPick={(id) => act('pick', 'court', id)}
            />
          </div>
          <div className="sub-hint">{m.selected ? '들어갈 벤치 선수를 누르세요.' : '코트의 선수를 누른 뒤 벤치 선수를 누르면 교체됩니다. 고리는 체력입니다.'}</div>
          {mine.bench.map((p) => <PlayerRow key={p.id} player={p} selected={m.selected === p.id} onClick={() => act('pick', 'bench', p.id)} />)}
        </Panel>

        <Panel title="중계" flush>
          <div className="feed">
            {feed.length
              ? feed.map((e, i) => (
                <div key={m.feed.length - i} className={e.team === mine.name ? 'mine' : ''}>
                  <span className="t">{e.period > 4 ? '연장' : `${e.period}Q`} {e.clock}</span>
                  <span className="t">{e.score}</span>
                  <span className={MADE.test(e.text) ? 'made' : ''}>{e.text}</span>
                </div>
              ))
              : <p className="empty">경기를 진행하면 중계가 여기에 나옵니다.</p>}
          </div>
        </Panel>

        <div className="stack">
          <Panel title="경기 기록" action={<span className="hint">{v.teams[0].name} · {v.teams[1].name}</span>}>
            <Compare box={box} />
          </Panel>
          <Panel title="전술">
            <TacticSelects tactics={t} onChange={(key, value) => act('matchTactic', key, value)} />
            <div className="controls">
              <label className="hint">에이스 지정
                <Select options={everyone} value={t.keyPlayerId} onChange={(value) => act('matchTactic', 'keyPlayerId', value)}><option value="">없음</option></Select>
              </label>
              <label className="hint">집중 마크
                <Select options={rivals} value={t.denyPlayerId} onChange={(value) => act('matchTactic', 'denyPlayerId', value)}><option value="">없음</option></Select>
              </label>
            </div>
          </Panel>
          <Panel title={`${opp.name} 코트`} flush>
            {opp.court.map((p) => <PlayerRow key={p.id} player={p} />)}
          </Panel>
        </div>
      </div>
    </div>
  );
}
