import { standings } from '@/game/competition';
import type { Career, Match, Stage } from '@/game/types';
import { CalendarCard, MatchList, isUser, teamName } from './ui';
import type { ViewProps } from './ui';

const STAGE: Record<Stage, string> = { group: '현 예선 조별 리그', finalLeague: '현 예선 결승 리그', playoff: '현 예선 플레이오프', knockout: '현 예선 토너먼트', national: '전국 대회', done: '종료' };
const WIDE_GRID = { gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))' };

function StandingsTable({ career, title, ids, matches }: { career: Career; title: string; ids: string[]; matches: Match[] }) {
  return (
    <div>
      <h3>{title}</h3>
      <table>
        <thead><tr><th>학교</th><th>승</th><th>패</th><th>득실</th></tr></thead>
        <tbody>
          {standings(ids, matches).map((r, i) => (
            <tr key={r.id} className={isUser(career, r.id) ? 'me' : ''}>
              <td>{i + 1}. {teamName(career, r.id)}</td><td>{r.w}</td><td>{r.l}</td><td>{r.pf - r.pa > 0 ? '+' : ''}{r.pf - r.pa}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CompView({ S }: ViewProps) {
  const career = S.career;
  const c = career.comp;
  if (!c) {
    return (
      <main>
        <CalendarCard career={career} />
        <div className="card"><h2>대회</h2><p className="muted">아직 올해 대회가 시작되지 않았습니다. 봄 훈련이 끝나면 인터하이 현 예선이 열립니다.</p></div>
      </main>
    );
  }
  const mine = c.finish[career.userTeamId];
  const rounds = [...c.rounds].reverse();
  return (
    <main>
      <div className="card stack">
        <div className="row between"><h2>{c.name}</h2><span className="pill accent">{STAGE[c.stage]}</span></div>
        {mine && <div className="notice">우리 학교: {mine}</div>}
        {c.league && <StandingsTable career={career} title="결승 리그" ids={c.league.ids} matches={c.league.matches} />}
        {c.groups && (
          <div className="choices" style={WIDE_GRID}>
            {c.groups.map((g) => <StandingsTable key={g.name} career={career} title={g.name} ids={g.ids} matches={g.matches} />)}
          </div>
        )}
      </div>
      <div className="card stack">
        <h2>경기 결과</h2>
        {rounds.length
          ? rounds.map((r, i) => <div key={rounds.length - i}><h3>{r.name}</h3><MatchList career={career} matches={r.matches} /></div>)
          : <p className="muted">아직 치른 경기가 없습니다.</p>}
      </div>
    </main>
  );
}
