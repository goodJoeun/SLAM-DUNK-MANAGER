import { today } from '@/game/season';
import { PROGRAMS, INTENSITY, RATING_LABEL, teamOverall } from '@/game/school';
import type { IntensityKey, ProgramKey, Team, Today, UserMatchInfo } from '@/game/types';
import type { Act } from './useGame';
import { Bar, CalendarCard, ReportCard, condClass, mean, userTeam } from './ui';
import type { ViewProps } from './ui';

const PROGRAM_KEYS = Object.keys(PROGRAMS) as ProgramKey[];
const INTENSITY_KEYS = Object.keys(INTENSITY) as IntensityKey[];

function MatchDayCard({ team, cond, match: m, act }: { team: Team; cond: number; match: UserMatchInfo; act: Act }) {
  return (
    <div className="card stack">
      <div className="row between">
        <h2>경기일 — {m.label}</h2>
        <span className={`pill ${m.official ? 'accent' : ''}`}>{m.official ? '공식전' : '연습 경기'}</span>
      </div>
      <div className="scoreboard">
        <div><div className="team">{team.name}</div><div className="muted">팀 전력 {teamOverall(team)} · 컨디션 {cond}</div></div>
        <div className="muted">vs</div>
        <div><div className="team">{m.opponent}</div><div className="muted">팀 전력 {m.opponentOverall}</div></div>
      </div>
      <div className="row">
        <button className="btn primary" onClick={() => act('command')}>직접 지휘하기</button>
        <button className="btn" onClick={() => act('simulate')}>결과만 보기</button>
      </div>
      <p className="muted">직접 지휘하면 교체·작전 타임·전술 변경을 경기 중에 할 수 있습니다.</p>
    </div>
  );
}

function TrainingCard({ S, act, team, cond, day: d }: ViewProps & { team: Team; cond: number; day: Today }) {
  const injured = team.players.filter((p) => p.injuredDays).length;
  return (
    <div className="card stack">
      <div className="row between">
        <h2>훈련일</h2>
        <span className="row">
          {d.camp && <span className="pill accent">합숙 · 성장 ×1.4</span>}
          <span className="pill">{d.daysToNextMatch == null ? '올해 남은 경기 없음' : `다음 경기까지 ${d.daysToNextMatch}일`}</span>
        </span>
      </div>
      {d.type === 'official' && <p className="muted">오늘은 다른 학교들의 대회 경기가 열립니다. 우리 팀은 훈련합니다.</p>}
      <div className="row">
        <span>팀 컨디션 <b>{cond}</b></span>
        <div style={{ flex: 1 }}><Bar pct={cond} cls={condClass(cond)} /></div>
        {injured > 0 && <span className="pill bad">부상 {injured}명</span>}
      </div>
      <h3>훈련 메뉴</h3>
      <div className="choices">
        {PROGRAM_KEYS.map((k) => {
          const p = PROGRAMS[k];
          return (
            <button key={k} className={`choice ${S.program === k ? 'on' : ''}`} onClick={() => act('program', k)}>
              <b>{p.label}</b><span>{p.keys.length ? p.keys.map((x) => RATING_LABEL[x]).join(' · ') : '컨디션 회복'}</span>
            </button>
          );
        })}
      </div>
      {S.program !== 'rest' && (
        <>
          <h3>강도</h3>
          <div className="choices">
            {INTENSITY_KEYS.map((k) => {
              const i = INTENSITY[k];
              return (
                <button key={k} className={`choice ${S.intensity === k ? 'on' : ''}`} onClick={() => act('intensity', k)}>
                  <b>{i.label}</b><span>성장 ×{i.gain} · 컨디션 -{i.cost}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="row">
        <button className="btn primary" onClick={() => act('train')}>하루 진행</button>
        <button className="btn" onClick={() => act('auto')}>다음 경기일까지 AI 코치에게 맡기기</button>
      </div>
    </div>
  );
}

function EndView({ S, act }: ViewProps) {
  const c = S.career;
  return (
    <main>
      <div className="card stack">
        <h2>3년의 기록 — {userTeam(c).name}</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>연도</th><th className="left">대회</th><th className="left">우리 학교</th><th className="left">전국 우승</th></tr></thead>
          <tbody>
            {c.results.map((r, i) => (
              <tr key={i}><td>{r.year}년차</td><td className="left">{r.name}</td><td className="left">{r.userFinish}</td><td className="left">{r.champion}</td></tr>
            ))}
          </tbody>
        </table></div>
        <div className="row"><button className="btn primary" onClick={() => act('reset')}>새 게임 시작</button></div>
      </div>
      <ReportCard career={c} report={S.report} />
    </main>
  );
}

export default function TodayView({ S, act }: ViewProps) {
  const c = S.career;
  const d = today(c);
  if (!d) return <EndView S={S} act={act} />; // 캠페인 종료
  const team = userTeam(c);
  const cond = Math.round(mean(team.players.filter((p) => !p.injuredDays).map((p) => p.condition)));
  return (
    <main>
      <div className="grid2">
        <div className="stack">
          {d.userMatch
            ? <MatchDayCard team={team} cond={cond} match={d.userMatch} act={act} />
            : <TrainingCard S={S} act={act} team={team} cond={cond} day={d} />}
          <CalendarCard career={c} />
        </div>
        <ReportCard career={c} report={S.report} />
      </div>
    </main>
  );
}
