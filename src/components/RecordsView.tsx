import { leaders } from '@/game/season';
import type { Career, LeaderKey } from '@/game/types';
import { isUser } from './ui';
import type { ViewProps } from './ui';

function Board({ career, title, statKey }: { career: Career; title: string; statKey: LeaderKey }) {
  const rows = leaders(career, statKey);
  return (
    <div>
      <h3>{title}</h3>
      <ul className="list">
        {rows.length
          ? rows.map((s) => (
            <li key={s.id} className={isUser(career, s.teamId) ? 'me' : ''}>
              <span>{s.name} <span className="muted">{s.team}</span></span><span className="num">{s.avg.toFixed(1)}</span>
            </li>
          ))
          : <li className="muted">기록 없음</li>}
      </ul>
    </div>
  );
}

export default function RecordsView({ S }: ViewProps) {
  const c = S.career;
  return (
    <main>
      <div className="card">
        <h2>대회 기록</h2>
        {c.results.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>연도</th><th className="left">대회</th><th className="left">우리 학교</th><th className="left">현 예선 1위</th><th className="left">전국 우승</th></tr></thead>
            <tbody>
              {c.results.map((r, i) => (
                <tr key={i}><td>{r.year}년차</td><td className="left">{r.name}</td><td className="left">{r.userFinish}</td><td className="left">{r.prefChampion}</td><td className="left">{r.champion}</td></tr>
              ))}
            </tbody>
          </table></div>
        ) : <p className="muted">아직 끝난 대회가 없습니다.</p>}
      </div>
      <div className="card">
        <h2>{c.year}년차 현 내 선수 순위 (공식전 경기당)</h2>
        <div className="choices" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))' }}>
          <Board career={c} title="득점" statKey="pts" />
          <Board career={c} title="리바운드" statKey="reb" />
          <Board career={c} title="어시스트" statKey="ast" />
        </div>
      </div>
    </main>
  );
}
