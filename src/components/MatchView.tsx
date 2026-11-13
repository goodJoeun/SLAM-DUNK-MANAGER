import type { PlayerView, TeamView } from '@/game/types';
import type { Act, ActiveMatch } from './useGame';
import { Bar, POS, Select, TacticControls, condClass } from './ui';

function Side({ team: t, isMine }: { team: TeamView; isMine: boolean }) {
  return (
    <div className={isMine ? 'mine' : ''}>
      <div className="team">{t.name}</div>
      <div className="score">{t.score}</div>
      <div className="muted">
        팀 파울 {t.teamFouls} · 타임 {t.timeoutsLeft}
        {t.run >= 4 && <> · <b className={isMine ? 'good' : 'bad'}>연속 {t.run}점</b></>}
      </div>
    </div>
  );
}

// onClick이 없으면 상대 팀 선수처럼 누를 수 없는 줄이 된다
function PlayerRow({ player: p, selected = false, onClick }: { player: PlayerView; selected?: boolean; onClick?: () => void }) {
  const clickable = Boolean(onClick);
  return (
    <div
      className={`player-row ${selected ? 'sel' : ''} ${clickable && p.out ? 'off' : ''}`}
      style={clickable ? undefined : { cursor: 'default' }}
      onClick={onClick}
    >
      <span className="muted">{POS[p.pos]}</span>
      <span>{p.name} <span className="muted">{p.ovr}</span></span>
      <Bar pct={p.energy} cls={condClass(p.energy)} />
      <span className="num">{p.pts}점</span>
      <span className={`num ${clickable && p.pf >= 4 ? 'bad' : 'muted'}`}>{p.pf}F</span>
    </div>
  );
}

export default function MatchView({ match: m, act }: { match: ActiveMatch; act: Act }) {
  const v = m.game.view();
  const mine = v.teams[m.side];
  const opp = v.teams[1 - m.side];
  const clock = `${Math.floor(v.clock / 60)}:${String(v.clock % 60).padStart(2, '0')}`;
  const everyone = Object.fromEntries([...mine.court, ...mine.bench].map((p) => [p.id, p.name]));
  const rivals = Object.fromEntries([...opp.court, ...opp.bench].map((p) => [p.id, `${p.name} (${p.pts}점)`]));
  const t = mine.tactics;
  const feed = m.feed.slice(0, 80);
  return (
    <main>
      <div className="card stack">
        <div className="row between">
          <h2>{m.label}</h2>
          <span className="pill accent">{v.finished ? '경기 종료' : v.period > 4 ? '연장' : `${v.period}쿼터`}</span>
        </div>
        <div className="scoreboard">
          <Side team={v.teams[0]} isMine={m.side === 0} />
          <div className="clock">{clock}</div>
          <Side team={v.teams[1]} isMine={m.side === 1} />
        </div>
        <div className="row">
          {v.finished ? (
            <button className="btn primary" onClick={() => act('finish')}>경기 종료 — 결과 반영</button>
          ) : (
            <>
              <button className="btn" disabled={Boolean(m.timer)} onClick={() => act('step')}>공격권 하나</button>
              <button className="btn primary" onClick={() => act('run')}>{m.timer ? '일시정지' : '쿼터 끝까지 진행'}</button>
              <button className="btn" disabled={!mine.timeoutsLeft} onClick={() => act('timeout')}>작전 타임 ({mine.timeoutsLeft})</button>
              <button className="btn" onClick={() => act('autosub')}>교체: {mine.auto ? 'AI 코치' : '직접'}</button>
              <button className="btn" onClick={() => act('skip')}>끝까지 AI에게 맡기기</button>
            </>
          )}
        </div>
      </div>
      <div className="grid2">
        <div className="stack">
          <div className="card">
            <h2>중계</h2>
            <div className="feed">
              {feed.length
                ? feed.map((e, i) => (
                  <div key={m.feed.length - i} className={e.team === mine.name ? 'mine' : ''}>
                    <span className="t">{e.period > 4 ? '연장' : `${e.period}Q`} {e.clock}</span><span className="t">{e.score}</span><span>{e.text}</span>
                  </div>
                ))
                : <p className="muted">경기를 진행하면 중계가 나옵니다.</p>}
            </div>
          </div>
          <div className="card stack">
            <h2>전술</h2>
            <TacticControls tactics={t} onChange={(key, value) => act('matchTactic', key, value)}>
              <label>에이스 지정
                <Select options={everyone} value={t.keyPlayerId} onChange={(value) => act('matchTactic', 'keyPlayerId', value)}><option value="">없음</option></Select>
              </label>
              <label>집중 마크
                <Select options={rivals} value={t.denyPlayerId} onChange={(value) => act('matchTactic', 'denyPlayerId', value)}><option value="">없음</option></Select>
              </label>
            </TacticControls>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h2>코트</h2>
            {mine.court.map((p) => <PlayerRow key={p.id} player={p} selected={m.selected === p.id} onClick={() => act('pick', 'court', p.id)} />)}
            <h2 style={{ marginTop: 12 }}>벤치</h2>
            {mine.bench.map((p) => <PlayerRow key={p.id} player={p} selected={m.selected === p.id} onClick={() => act('pick', 'bench', p.id)} />)}
            <p className="muted">코트의 선수를 고른 뒤 벤치 선수를 누르면 교체됩니다. 막대는 체력입니다.</p>
          </div>
          <div className="card">
            <h2>{opp.name} 코트</h2>
            {opp.court.map((p) => <PlayerRow key={p.id} player={p} />)}
          </div>
        </div>
      </div>
    </main>
  );
}
