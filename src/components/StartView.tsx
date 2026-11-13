import { useMemo } from 'react';
import { createCareer } from '@/game/season';
import { teamOverall } from '@/game/school';
import { overall } from '@/game/engine';
import type { Act, GameState } from './useGame';
import { NAME_STYLE } from './ui';

export default function StartView({ S, act }: { S: GameState; act: Act }) {
  const { startSeed, nameStyle } = S;
  const p = useMemo(() => createCareer({ seed: startSeed, dataset: 'original', nameStyle }), [startSeed, nameStyle]);
  return (
    <div className="start">
      <h1>고교 농구 매니저</h1>
      <p className="muted">{p.prefecture}의 고교 농구부 감독이 되어 3년 동안 팀을 이끕니다. 매일 훈련을 정하고, 경기를 직접 지휘하고, 인터하이·국민체육대회·윈터컵 우승에 도전하세요.</p>
      <div className="card">
        <div className="row between">
          <h2>학교 선택</h2>
          <button className="btn small" onClick={() => act('namestyle')}>표기: {NAME_STYLE[nameStyle]} (바꾸기)</button>
        </div>
        <div className="table-wrap"><table>
          <thead><tr><th>학교</th><th>학교 수준</th><th>팀 전력</th><th className="left">주요 선수</th><th /></tr></thead>
          <tbody>
            {p.regionIds.map((id, i) => {
              const t = p.teams[id];
              const stars = t.players.filter((x) => x.fixed).sort((a, b) => overall(b) - overall(a)).slice(0, 3).map((x) => x.name).join(', ');
              return (
                <tr key={id}>
                  <td><b>{t.name}</b></td><td>{t.prestige}</td><td>{teamOverall(t)}</td>
                  <td className="left muted">{stars || '-'}</td>
                  <td><button className="btn small" onClick={() => act('start', i)}>이 학교로 시작</button></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        <p className="muted">학교 수준이 낮을수록 어렵습니다. 수준은 매년 성적에 따라 오르내리고, 신입생의 질을 좌우합니다.</p>
      </div>
    </div>
  );
}
