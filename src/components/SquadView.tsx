import { PROGRAMS, RATING_LABEL, teamOverall } from '@/game/school';
import { overall } from '@/game/engine';
import type { Player, RatingKey } from '@/game/types';
import type { Act } from './useGame';
import { Bar, POS, Select, TacticControls, condClass, grade, userTeam } from './ui';
import type { ViewProps } from './ui';

const FOCUS_PROGRAMS = Object.fromEntries(Object.entries(PROGRAMS).filter(([k]) => k !== 'rest').map(([k, v]) => [k, v.label]));

function PlayerDetail({ player: p, act }: { player: Player; act: Act }) {
  return (
    <div className="card stack">
      <div className="row between">
        <h2>{p.name} · {p.year}학년 {POS[p.pos]} · 종합 {overall(p)}</h2>
        <button className="btn small" onClick={() => act('player', null)}>닫기</button>
      </div>
      <div className="ratings">
        {(Object.keys(p.ratings) as RatingKey[]).map((k) => (
          <div key={k} className="rating"><span>{RATING_LABEL[k]}</span><b className="num">{p.ratings[k]}</b><Bar pct={p.ratings[k]} /></div>
        ))}
      </div>
      <label className="row">개인 훈련{' '}
        <Select options={FOCUS_PROGRAMS} value={p.focus} onChange={(v) => act('playerFocus', p.id, v)} style={{ width: 'auto' }}>
          <option value="">없음</option>
        </Select>
        <span className="muted">팀 훈련 때마다 이 메뉴의 능력치가 추가로 오릅니다.</span>
      </label>
    </div>
  );
}

export default function SquadView({ S, act }: ViewProps) {
  const team = userTeam(S.career);
  const selected = team.players.find((x) => x.id === S.playerId);
  return (
    <main>
      <div className="card stack">
        <h2>기본 전술</h2>
        <TacticControls tactics={team.tactics} onChange={(key, v) => act('tactic', key, v)} />
        <p className="muted">경기 시작 때 적용되고, 직접 지휘하는 경기에서는 도중에 바꿀 수 있습니다. 주전은 능력과 포지션에 따라 매일 자동으로 정해집니다.</p>
      </div>
      {selected && <PlayerDetail player={selected} act={act} />}
      <div className="card">
        <h2>선수단 · 팀 전력 {teamOverall(team)}</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>선수</th><th>학년</th><th>포지션</th><th>종합</th><th>성장</th><th>컨디션</th><th>상태</th><th className="left">개인 훈련</th></tr></thead>
          <tbody>
            {team.players.map((p, i) => (
              <tr key={p.id} className={`clickable ${i === 5 ? 'sep' : ''}`} onClick={() => act('player', p.id)}>
                <td>{p.name}</td><td>{p.year}학년</td><td>{POS[p.pos]}</td><td><b>{overall(p)}</b></td><td>{grade(p.potential)}</td>
                <td><div className="row" style={{ justifyContent: 'flex-end' }}><span>{Math.round(p.condition)}</span><Bar pct={p.condition} cls={condClass(p.condition)} /></div></td>
                <td>
                  {p.injuredDays
                    ? <span className="pill bad">부상 {p.injuredDays}일</span>
                    : i < 5 ? <span className="pill accent">주전</span> : <span className="pill">벤치</span>}
                </td>
                <td className="left">{p.focus ? PROGRAMS[p.focus].label : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="muted">선수를 누르면 세부 능력치를 보고 개인 훈련을 정할 수 있습니다. 성장 등급(S~D)이 높을수록 빨리 큽니다.</p>
      </div>
    </main>
  );
}
