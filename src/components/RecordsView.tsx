import { leaders } from '@/game/season';
import type { Career, LeaderKey } from '@/game/types';
import { PageTitle, Panel, SchoolName, isUser, pct } from './ui';
import type { ViewProps } from './ui';
import type { Act } from './useGame';

const BOARDS: [LeaderKey, string][] = [['pts', '득점'], ['reb', '리바운드'], ['ast', '어시스트'], ['stl', '스틸'], ['blk', '블록']];

function Board({ career, title, statKey, act }: { career: Career; title: string; statKey: LeaderKey; act: Act }) {
  const rows = leaders(career, statKey);
  return (
    <Panel title={title} flush className="span-4">
      <div className="table-wrap"><table className="data">
        <tbody>
          {rows.length
            ? rows.map((s, i) => (
              // 우리 선수는 누르면 선수 상세로 간다
              <tr key={s.id} className={isUser(career, s.teamId) ? 'me click' : ''} onClick={isUser(career, s.teamId) ? () => act('player', s.id) : undefined}>
                <td className="l"><span className="faint num">{i + 1}</span> <b>{s.name}</b> <span className="muted"><SchoolName id={s.teamId} name={s.team} onPick={(id) => act('school', id)} /></span></td>
                <td><b>{s.avg.toFixed(1)}</b></td>
              </tr>
            ))
            : <tr><td className="l muted">기록 없음</td></tr>}
        </tbody>
      </table></div>
    </Panel>
  );
}

export default function RecordsView({ S, act }: ViewProps) {
  const c = S.career;
  const roster = new Set(c.teams[c.userTeamId].players.map((p) => p.id));
  const mine = Object.values(c.stats).filter((s) => s.teamId === c.userTeamId && s.gp > 0).sort((a, b) => b.pts / b.gp - a.pts / a.gp);
  return (
    <div className="page">
      <PageTitle title="기록" sub={`${c.year}년차 공식전 기준 · 순위는 2경기 이상 출전한 현 내 선수`} />
      <Panel title="우리 학교 선수 기록" flush action={mine.length > 0 && <span className="hint">선수를 누르면 상세</span>}>
        {mine.length ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th className="l">선수</th><th>경기</th><th>분</th><th>득점</th><th>리바</th><th>어시</th><th>스틸</th><th>블록</th><th>야투</th><th>3점</th></tr></thead>
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
      <div className="dash">
        {BOARDS.map(([key, title]) => <Board key={key} career={c} title={`${title} 순위`} statKey={key} act={act} />)}
      </div>
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
