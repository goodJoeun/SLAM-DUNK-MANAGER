import { SEASON, today } from '@/game/season';
import { PROGRAMS, INTENSITY, teamOverall } from '@/game/school';
import type { Career, Team, Today } from '@/game/types';
import type { Act, PlayingState } from './useGame';
import { StandingsTable } from './CompView';
import {
  Attr, CalendarStrip, CondBar, Crest, FormPills, Icon, PageTitle, Panel, PosBadge, ResultList, clubColor, mean, teamName, userTeam,
} from './ui';
import type { ViewProps } from './ui';

const STAGE_SHORT: Record<string, string> = { group: '조별 리그', finalLeague: '결승 리그', playoff: '플레이오프', knockout: '토너먼트', national: '전국 대회', done: '종료' };

function nextFixture(c: Career) {
  for (let i = c.dayIndex; i < c.calendar.length; i++) {
    if (c.calendar[i].type !== 'training') return { inDays: i - c.dayIndex, day: c.calendar[i] };
  }
  return null;
}

function NextMatchPanel({ S, act, d, team }: { S: PlayingState; act: Act; d: Today; team: Team }) {
  const c = S.career;
  if (d.userMatch) {
    const m = d.userMatch;
    const mine = teamOverall(team);
    const share = (100 * mine) / (mine + m.opponentOverall);
    return (
      <Panel title={`오늘의 경기 · ${m.official ? '공식전' : '연습 경기'}`} className="span-8">
        <div className="versus">
          <div className="side"><Crest name={team.name} size={48} /><b>{team.name}</b><span className="muted">팀 전력 <Attr v={mine} /></span></div>
          <div className="vs">VS</div>
          <div className="side"><Crest name={m.opponent} size={48} /><b>{m.opponent}</b><span className="muted">팀 전력 <Attr v={m.opponentOverall} /></span></div>
        </div>
        <div className="strength" style={{ ['--club' as string]: clubColor(team.name) }}>
          <span>{mine}</span>
          <div className="bar"><i style={{ width: `${share}%` }} /><i style={{ width: `${100 - share}%` }} /></div>
          <span>{m.opponentOverall}</span>
        </div>
        <p className="muted" style={{ textAlign: 'center' }}>{m.label}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={() => act('command')}>벤치에서 직접 지휘</button>
          <button className="btn" onClick={() => act('simulate')}>결과만 보기</button>
        </div>
      </Panel>
    );
  }
  const next = nextFixture(c);
  const plan = S.program === 'rest' ? '휴식' : `${PROGRAMS[S.program].label} · ${INTENSITY[S.intensity].label}`;
  return (
    <Panel title="오늘" className="span-8">
      <div className="kv">
        <div><small>오늘의 훈련</small><b style={{ fontSize: 15 }}>{plan}</b></div>
        <div>
          <small>다음 경기</small>
          <b style={{ fontSize: 15 }}>
            {next ? (next.day.type === 'practice' ? `연습 경기 · ${teamName(c, next.day.opponentId ?? '')}` : `공식전 · ${next.day.phase}`) : '올해 남은 경기 없음'}
          </b>
          {next && <span className="muted">{next.inDays}일 후</span>}
        </div>
        {d.camp && <div><small>특별 일정</small><b style={{ fontSize: 15 }}>여름 합숙</b><span className="muted">성장 ×1.4</span></div>}
      </div>
      {d.type === 'official' && <p className="hint">오늘은 다른 학교들의 대회 경기가 열립니다. 우리 팀은 훈련합니다.</p>}
      <div className="row">
        <button className="btn" onClick={() => act('screen', 'training')}><Icon name="training" />훈련 설정</button>
        <button className="btn" onClick={() => act('screen', 'tactics')}><Icon name="tactics" />전술 확인</button>
      </div>
    </Panel>
  );
}

function CompetitionPanel({ c }: { c: Career }) {
  const comp = c.comp;
  if (!comp) {
    const i = c.calendar.findIndex((day, idx) => idx >= c.dayIndex && day.start);
    const start = i >= 0 ? c.calendar[i].start : undefined;
    return (
      <Panel title="대회" className="span-4">
        <p className="muted">진행 중인 대회가 없습니다.</p>
        {start && <p>다음 대회: <b>{SEASON.competitions[start].name}</b> 현 예선 · {i - c.dayIndex}일 후</p>}
      </Panel>
    );
  }
  const me = c.userTeamId;
  const group = comp.groups?.find((g) => g.ids.includes(me));
  const showGroup = comp.stage === 'group' && group;
  const showLeague = comp.stage === 'finalLeague' && comp.league;
  return (
    <Panel title={comp.name} className="span-4" action={<span className="pill club">{STAGE_SHORT[comp.stage]}</span>}>
      {comp.finish[me] && <div className="notice">우리 학교: {comp.finish[me]}</div>}
      {showGroup && <StandingsTable career={c} title={group.name} ids={group.ids} matches={group.matches} />}
      {showLeague && <StandingsTable career={c} title="결승 리그" ids={comp.league!.ids} matches={comp.league!.matches} />}
      {!showGroup && !showLeague && comp.bracket.length > 1 && (
        <p>남은 학교 <b>{comp.bracket.length}</b>곳 · {comp.bracket.includes(me) ? <span className="good">우리 학교 생존</span> : <span className="muted">우리 학교 탈락</span>}</p>
      )}
    </Panel>
  );
}

function EndView({ S, act }: ViewProps) {
  const c = S.career;
  const team = userTeam(c);
  const titles = c.results.filter((r) => r.userFinish.endsWith('우승')).length;
  return (
    <div className="page">
      <PageTitle title="3년의 기록" sub={`${team.name} · 캠페인 종료`}>
        <button className="btn primary" onClick={() => act('reset')}>새 게임 시작</button>
      </PageTitle>
      <div className="kv">
        <div><small>전국 우승</small><b>{titles}회</b></div>
        <div><small>전국 진출</small><b>{c.results.filter((r) => /진출|우승|강|준우승/.test(r.userFinish) && !r.userFinish.includes('현 예선')).length}회</b></div>
        <div><small>마지막 팀 전력</small><b><Attr v={teamOverall(team)} /></b></div>
        <div><small>학교 수준</small><b>{team.prestige}</b></div>
      </div>
      <Panel title="대회별 성적" flush>
        <div className="table-wrap"><table className="data">
          <thead><tr><th className="l">연도</th><th className="l">대회</th><th className="l">우리 학교</th><th className="l">전국 우승</th></tr></thead>
          <tbody>
            {c.results.map((r, i) => (
              <tr key={i} className={r.userFinish.endsWith('우승') ? 'me' : ''}>
                <td className="l">{r.year}년차</td><td className="l">{r.name}</td><td className="l">{r.userFinish}</td><td className="l">{r.champion}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Panel>
    </div>
  );
}

export default function HomeView({ S, act }: ViewProps) {
  const c = S.career;
  const d = today(c);
  if (!d) return <EndView S={S} act={act} />;
  const team = userTeam(c);
  const fit = team.players.filter((p) => !p.injuredDays);
  const cond = Math.round(mean(fit.map((p) => p.condition)));
  const injured = team.players.filter((p) => p.injuredDays);
  const tired = fit.filter((p) => p.condition < 60);
  const matches = S.inbox.filter((m) => m.kind === 'match');
  const upcoming = c.calendar.slice(c.dayIndex, c.dayIndex + 8).map((day, i) => ({ day, n: c.dayIndex + i + 1 }));

  return (
    <div className="page">
      <PageTitle title="홈" sub={`${d.year}년차 ${d.day}일째 · ${d.phase}`} />
      <div className="dash">
        <NextMatchPanel S={S} act={act} d={d} team={team} />

        <Panel title="팀 상태" className="span-4">
          <div className="kv">
            <div><small>팀 전력</small><b><Attr v={teamOverall(team)} /></b></div>
            <div><small>컨디션</small><b>{cond}</b><CondBar value={cond} wide /></div>
          </div>
          {injured.length > 0 && (
            <ul className="lines">
              {injured.map((p) => (
                <li key={p.id} className="click" onClick={() => act('player', p.id)}>
                  <span><PosBadge pos={p.pos} /> <b>{p.name}</b></span><span className="pill bad">부상 {p.injuredDays}일</span>
                </li>
              ))}
            </ul>
          )}
          {tired.length > 0 && <p className="hint">지친 선수 {tired.length}명: {tired.map((p) => p.name).join(', ')}</p>}
          {!injured.length && !tired.length && <p className="hint">부상자 없음 · 선수단 상태 양호</p>}
        </Panel>

        <Panel title="최근 경기" className="span-4" action={<FormPills results={matches.map((m) => Boolean(m.won))} />}>
          {matches.length ? (
            <ul className="lines">
              {matches.slice(0, 5).map((m) => (
                <li key={m.id} className="click" onClick={() => act('openMessage', m.id)}>
                  <span className="ellipsis"><b>{m.title.replace(/^(승리|패배) · /, '')}</b></span>
                  <span className={`pill ${m.won ? 'good' : 'bad'}`}>{m.won ? '승' : '패'}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">아직 치른 경기가 없습니다.</p>}
        </Panel>

        <CompetitionPanel c={c} />

        <Panel title="다가오는 일정" className="span-4">
          <ul className="lines">
            {upcoming.map(({ day, n }) => (
              <li key={n}>
                <span><b className="num">{n}일</b> <span className="muted">{day.phase}</span></span>
                {day.type === 'training'
                  ? <span className="pill">{day.camp ? '합숙 훈련' : '훈련'}</span>
                  : day.type === 'practice'
                    ? <span className="pill club">연습 · {teamName(c, day.opponentId ?? '')}</span>
                    : <span className="pill warn">공식전</span>}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="최근 소식"
          className="span-8"
          action={<button className="btn small ghost" onClick={() => act('screen', 'inbox')}>모두 보기</button>}
        >
          <ul className="lines">
            {S.inbox.slice(0, 6).map((m) => (
              <li key={m.id} className="click" onClick={() => act('openMessage', m.id)}>
                <span className="ellipsis">{m.unread && <span className="badge" style={{ marginRight: 6 }}>N</span>}<b>{m.title}</b> <span className="muted">· {m.from}</span></span>
                <span className="faint num">{m.year}년차 {m.day}일</span>
              </li>
            ))}
          </ul>
          {(() => {
            const last = S.inbox.find((m) => m.kind === 'round');
            return last?.round ? <><h3 className="hint">{last.round.name}</h3><ResultList lines={last.round.matches.filter((x) => x.mine).concat(last.round.matches.filter((x) => !x.mine)).slice(0, 4)} /></> : null;
          })()}
        </Panel>

        <Panel title={`${c.year}년차 일정`} className="span-4">
          <CalendarStrip career={c} />
        </Panel>
      </div>
    </div>
  );
}
