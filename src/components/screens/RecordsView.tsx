import { PageTitle, Panel, pct } from '@/components/shared/ui';
import type { ViewProps } from '@/components/shared/ui';

export default function RecordsView({ S, act }: ViewProps) {
  const c = S.career;
  const roster = new Set(c.teams[c.userTeamId].players.map((p) => p.id));
  const mine = Object.values(c.stats).filter((s) => s.teamId === c.userTeamId && s.gp > 0).sort((a, b) => b.pts / b.gp - a.pts / a.gp);
  return (
    <div className="page">
      <PageTitle title="기록" sub={`${c.year}년차 공식전 기준 · 우리 학교 선수 기록과 역대 대회 성적`}>
        <button className="btn small" onClick={() => act('screen', 'leaders')}>현·대회 선수 순위는 리더보드에서</button>
      </PageTitle>
      <Panel title="우리 학교 선수 기록" flush action={mine.length > 0 && <span className="hint">선수를 누르면 상세</span>}>
        {mine.length ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th className="l name">선수</th><th>경기</th><th>분</th><th>득점</th><th>리바</th><th>어시</th><th>스틸</th><th>블록</th><th>야투</th><th>3점</th></tr></thead>
            <tbody>
              {mine.map((s) => (
                <tr key={s.id} className={roster.has(s.id) ? 'click' : ''} onClick={roster.has(s.id) ? () => act('player', s.id) : undefined}>
                  <td className="l name">{s.name}</td><td>{s.gp}</td><td>{(s.sec / 60 / s.gp).toFixed(1)}</td>
                  <td><b>{(s.pts / s.gp).toFixed(1)}</b></td><td>{(s.reb / s.gp).toFixed(1)}</td><td>{(s.ast / s.gp).toFixed(1)}</td>
                  <td>{(s.stl / s.gp).toFixed(1)}</td><td>{(s.blk / s.gp).toFixed(1)}</td><td>{pct(s.fgm, s.fga)}</td><td>{pct(s.tpm, s.tpa)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <p className="empty">올해 공식전 기록이 아직 없습니다.</p>}
      </Panel>
      <Panel title="역대 대회 성적" flush>
        {c.results.length ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th className="l">연도</th><th className="l">대회</th><th className="l">우리 학교</th><th className="l">현 예선 1위</th><th className="l">전국 우승</th></tr></thead>
            <tbody>
              {c.results.map((r, i) => (
                <tr key={i}><td className="l">{r.year}년차</td><td className="l">{r.name}</td><td className="l"><b>{r.userFinish}</b></td><td className="l">{r.prefChampion}</td><td className="l">{r.champion}</td></tr>
              ))}
            </tbody>
          </table></div>
        ) : <p className="empty">아직 끝난 대회가 없습니다.</p>}
      </Panel>
    </div>
  );
}
