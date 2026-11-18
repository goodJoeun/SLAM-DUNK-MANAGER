import { standings } from '@/game/career/competition';
import { SEASON, qualifiersFor } from '@/game/career/season';
import type { Career, Competition, CompetitionKey, Match, Stage } from '@/game/types';
import { CalendarStrip, PageTitle, Panel, ResultList, SchoolName, isUser, linesOf, teamName } from '@/components/shared/ui';
import type { ViewProps } from '@/components/shared/ui';

const STAGE: Record<Stage, string> = {
  group: '조별 리그', finalLeague: '결승 리그', playoff: '플레이오프', knockout: '토너먼트', national: '전국 대회', done: '종료',
};

export function StandingsTable({ career, title, ids, matches, onPick }: { career: Career; title: string; ids: string[]; matches: Match[]; onPick?: (id: string) => void }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr><th className="l">{title}</th><th>승</th><th>패</th><th>득점</th><th>실점</th><th>득실</th></tr></thead>
        <tbody>
          {standings(ids, matches).map((r, i) => (
            <tr key={r.id} className={isUser(career, r.id) ? 'me' : ''}>
              <td className="l"><span className="faint num">{i + 1}</span> <SchoolName id={r.id} name={teamName(career, r.id)} onPick={onPick} /></td>
              <td>{r.w}</td><td>{r.l}</td><td>{r.pf}</td><td>{r.pa}</td>
              <td className={r.pf - r.pa > 0 ? 'good' : r.pf - r.pa < 0 ? 'bad' : ''}>{r.pf - r.pa > 0 ? '+' : ''}{r.pf - r.pa}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stepper({ career, c }: { career: Career; c: Competition }) {
  const steps: Stage[] = [...c.format, 'national'];
  const now = c.stage === 'done' ? steps.length : steps.indexOf(c.stage);
  return (
    <div className="stepper">
      {steps.map((s, i) => <span key={s} className={i < now ? 'done' : i === now ? 'now' : ''}>{i + 1}. {STAGE[s]}</span>)}
      <span className={c.stage === 'done' ? 'now' : ''}>{c.champion ? `우승 · ${teamName(career, c.champion)}` : '우승'}</span>
    </div>
  );
}

export default function CompView({ S, act }: ViewProps) {
  const pick = (id: string) => act('school', id);
  const career = S.career;
  const c = career.comp;
  if (!c) {
    const i = career.calendar.findIndex((day, idx) => idx >= career.dayIndex && day.start);
    const start = i >= 0 ? career.calendar[i].start : undefined;
    return (
      <div className="page">
        <PageTitle title="대회" sub={start ? `다음 대회: ${SEASON.competitions[start].name} 현 예선 · ${i - career.dayIndex}일 후` : '올해 남은 대회가 없습니다'} />
        <Panel title={`${career.year}년차 일정`}><CalendarStrip career={career} /></Panel>
        <Panel title="대회 방식">
          <ul className="lines">
            {(Object.keys(SEASON.competitions) as CompetitionKey[]).map((key) => ({ key, ...SEASON.competitions[key] })).map((x) => (
              <li key={x.name}><b>{x.name}</b><span className="muted">{x.format.map((f) => STAGE[f]).join(' → ')} → 전국 대회 · 현 대표 {qualifiersFor(career, x.key)}곳</span></li>
            ))}
          </ul>
        </Panel>
      </div>
    );
  }
  const me = career.userTeamId;
  const mine = c.finish[me];
  const rounds = [...c.rounds].reverse();
  return (
    <div className="page">
      <PageTitle title={c.name} sub={`${career.year}년차 · 현 대표 ${c.qualifiers}곳이 전국 대회에 나갑니다 · 학교 이름을 누르면 학교 정보`} />
      <Panel title="진행 단계"><Stepper career={career} c={c} />{mine && <div className="notice">우리 학교: {mine}</div>}</Panel>
      <div className="split">
        <div className="stack">
          {c.league && (
            <Panel title="결승 리그" flush><StandingsTable career={career} title="학교" ids={c.league.ids} matches={c.league.matches} onPick={pick} /></Panel>
          )}
          {c.groups && (
            <Panel title="조별 리그" flush>
              <div className="groups">
                {c.groups.map((g) => (
                  <div key={g.name}><StandingsTable career={career} title={g.name} ids={g.ids} matches={g.matches} onPick={pick} /></div>
                ))}
              </div>
            </Panel>
          )}
          {(c.stage === 'knockout' || c.stage === 'playoff' || c.stage === 'national') && c.bracket.length > 1 && (
            <Panel title={`남은 학교 ${c.bracket.filter(Boolean).length}곳`}>
              <div className="row">
                {c.bracket.filter(Boolean).map((id) => <span key={id} className={`pill ${id === me ? 'club' : ''}`}><SchoolName id={id} name={teamName(career, id)} onPick={pick} /></span>)}
              </div>
            </Panel>
          )}
        </div>
        <Panel title="경기 결과">
          {rounds.length
            ? rounds.map((r, i) => <div key={rounds.length - i} className="stack" style={{ gap: 6 }}><h3 className="hint">{r.name}</h3><ResultList lines={linesOf(career, r.matches)} onPick={pick} /></div>)
            : <p className="muted">아직 치른 경기가 없습니다.</p>}
        </Panel>
      </div>
    </div>
  );
}
