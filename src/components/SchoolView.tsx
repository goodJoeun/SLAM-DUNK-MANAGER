// 학교 정보: 다른 학교의 이름을 누르면 열린다.
// 누구나 알 수 있는 것(학교 수준, 전력, 명단, 올해 성적과 기록)만 보여 준다.
// 전술과 강·약점은 공식전 전 상대 분석으로만 알 수 있다 (scouting.ts).
import { overall } from '@/game/engine';
import { teamOverall } from '@/game/school';
import { today } from '@/game/season';
import { scoutReport } from '@/game/scouting';
import { standings } from '@/game/competition';
import type { Team } from '@/game/types';
import { Attr, Crest, Icon, Panel, PosBadge, ResultList, clubVars, linesOf, userTeam } from './ui';
import type { ViewProps } from './ui';

export default function SchoolView({ S, act, team }: ViewProps & { team: Team }) {
  const c = S.career;
  const mine = userTeam(c);
  const ovr = teamOverall(team);
  const gap = ovr - teamOverall(mine);
  const local = c.regionIds.includes(team.id);
  const prep = today(c)?.prep;
  const days = prep && prep.opponentId === team.id ? prep.days : 0;
  const report = scoutReport(team, days);
  const top = new Set(report.players.map((p) => p.name));
  const roster = [...team.players].sort((a, b) => a.pos - b.pos || b.year - a.year);

  // 진행 중인 대회에서의 위치와 치른 경기
  const comp = c.comp;
  const finish = comp?.finish[team.id];
  const group = comp?.groups?.find((g) => g.ids.includes(team.id));
  const table = group ? standings(group.ids, group.matches) : comp?.league?.ids.includes(team.id) ? standings(comp.league.ids, comp.league.matches) : null;
  const rank = table ? table.findIndex((r) => r.id === team.id) : -1;
  const row = rank >= 0 ? table![rank] : null;
  const played = (comp?.rounds ?? [])
    .flatMap((r) => r.matches.filter((m) => m.home === team.id || m.away === team.id).map((m) => ({ round: r.name, m })))
    .reverse();
  const wins = played.filter((x) => x.m.winner === team.id).length;

  // 올해 공식전 기록 (경기당 득점 순)
  const stats = Object.values(c.stats).filter((s) => s.teamId === team.id && s.gp > 0).sort((a, b) => b.pts / b.gp - a.pts / a.gp).slice(0, 6);
  // 지난 대회 성적: 현 예선 1위와 전국 우승만 기록에 남는다
  const titles = c.results.filter((r) => r.prefChampion === team.name || r.champion === team.name);

  return (
    <div className="page" style={clubVars(team.name)}>
      <div className="row between">
        <button className="btn small ghost" onClick={() => act('school', null)}><Icon name="back" />돌아가기</button>
      </div>

      <div className="profile-head">
        <Crest name={team.name} size={64} />
        <div className="who">
          <span className="muted">{local ? c.prefecture : '다른 현 대표'}</span>
          <h1>{team.name}</h1>
          <div className="row">
            {finish && <span className="pill club">{comp!.name} · {finish}</span>}
            {days > 0 && <span className="pill good">상대 분석 {days}일</span>}
          </div>
        </div>
        <div className="ratings-sum">
          <div>팀 전력<Attr v={ovr} big /></div>
          <div>우리와의 차이<b className={gap > 0 ? 'bad' : gap < 0 ? 'good' : ''} style={{ fontSize: 18 }}>{gap > 0 ? `+${gap}` : gap}</b></div>
          <div>학교 수준<b style={{ fontSize: 18, color: 'var(--text)' }}>{team.prestige}</b></div>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <Panel title="선수 명단" flush action={<span className="hint">능력치는 주요 선수 3명만 알려져 있습니다</span>}>
            <div className="table-wrap"><table className="data">
              <thead><tr><th className="l">포지션</th><th className="l name">이름</th><th>학년</th><th>종합</th></tr></thead>
              <tbody>
                {roster.map((p) => (
                  <tr key={p.id}>
                    <td className="l"><PosBadge pos={p.pos} /></td>
                    <td className="l name">{p.name}{top.has(p.name) && <span className="pill club" style={{ marginLeft: 6 }}>주요 선수</span>}</td>
                    <td>{p.year}학년</td>
                    <td>{top.has(p.name) ? <Attr v={overall(p)} /> : <span className="faint">?</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Panel>
          <Panel title="전술과 강·약점">
            {days > 0 ? (
              <ul className="lines">
                <li><span>즐겨 쓰는 전술</span><b>{report.tactics}</b></li>
                {report.sections.flatMap((sec) => sec.lines).map((l) => <li key={l}><span>{l}</span></li>)}
              </ul>
            ) : (
              <p className="muted">
                아직 분석하지 않은 학교입니다. 다음 공식전 상대로 정해지면, 경기 전 훈련일에 훈련 대신 상대 분석을 해서 전술과 강·약점을 알아낼 수 있습니다.
              </p>
            )}
          </Panel>
        </div>

        <div className="stack">
          <Panel title={comp ? `${comp.name} 성적` : '대회 성적'}>
            {comp && (row || played.length > 0) ? (
              <>
                <div className="kv">
                  {row && <div><small>{group ? group.name : '결승 리그'}</small><b>{rank + 1}위</b><span className="muted">{row.w}승 {row.l}패 · 득실 {row.pf - row.pa > 0 ? '+' : ''}{row.pf - row.pa}</span></div>}
                  <div><small>이번 대회</small><b>{wins}승 {played.length - wins}패</b></div>
                </div>
                {played.slice(0, 6).map(({ round, m }) => (
                  <div key={round} className="stack" style={{ gap: 6 }}>
                    <h3 className="hint">{round}</h3>
                    <ResultList lines={linesOf(c, [m])} onPick={(id) => act('school', id)} />
                  </div>
                ))}
              </>
            ) : <p className="muted">{comp ? '이번 대회에서 아직 치른 경기가 없습니다.' : '지금은 진행 중인 대회가 없습니다.'}</p>}
            {titles.length > 0 && (
              <ul className="lines">
                {titles.map((r) => <li key={`${r.year}-${r.key}`}><span className="muted">{r.year}년차 {r.name}</span><b>{r.champion === team.name ? '전국 우승' : '현 예선 1위'}</b></li>)}
              </ul>
            )}
          </Panel>
          <Panel title={`${c.year}년차 공식전 기록`} flush>
            {stats.length ? (
              <div className="table-wrap"><table className="data">
                <thead><tr><th className="l name">선수</th><th>경기</th><th>득점</th><th>리바</th><th>어시</th></tr></thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.id}>
                      <td className="l name">{s.name}</td><td>{s.gp}</td>
                      <td><b>{(s.pts / s.gp).toFixed(1)}</b></td><td>{(s.reb / s.gp).toFixed(1)}</td><td>{(s.ast / s.gp).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            ) : <p className="empty">올해 공식전 기록이 아직 없습니다.</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}
