import { PREPARATION, SEASON, seasonGoal, today, upcomingOfficial, userHasBye } from '@/game/season';
import { PROGRAMS, INTENSITY, teamOverall } from '@/game/school';
import type { Career, Team, Today } from '@/game/types';
import type { Act, PlayingState } from './useGame';
import { StandingsTable } from './CompView';
import {
  Attr, CalendarStrip, CondBar, Crest, DEFENSE, FOCUS, FormPills, Icon, PageTitle, Panel, PosBadge, ResultList, SchoolName, clubColor, mean, teamName, userTeam,
} from './ui';
import { scoutReport } from '@/game/scouting';
import { describeEvent, moraleLabel, teamMorale } from '@/game/people';
import type { ViewProps } from './ui';

const STAGE_SHORT: Record<string, string> = { group: '조별 리그', finalLeague: '결승 리그', playoff: '플레이오프', knockout: '토너먼트', national: '전국 대회', done: '종료' };

function nextFixture(c: Career) {
  for (let i = c.dayIndex; i < c.calendar.length; i++) {
    if (c.calendar[i].type !== 'training') return { inDays: i - c.dayIndex, day: c.calendar[i] };
  }
  return null;
}

// 경기 당일의 상대 정보. 주요 선수는 누구나 아는 정보이고, 전술과 강·약점은 상대 분석을 한 만큼만 보인다.
function OpponentBrief({ S, d }: { S: PlayingState; d: Today }) {
  const m = d.userMatch;
  const opp = m && S.career.teams[m.opponentId];
  if (!m || !opp) return null;
  const days = m.official && d.prep?.daysUntil === 0 && d.prep.opponentId === m.opponentId ? d.prep.days : 0;
  const report = scoutReport(opp, days);
  const mine = userTeam(S.career).tactics;
  return (
    <div className="brief">
      <div>
        <h3 className="hint">{m.opponent} 주요 선수</h3>
        <ul className="lines">
          {report.players.map((p) => <li key={p.name}><span><PosBadge pos={p.pos} /> <b>{p.name}</b></span><Attr v={p.ovr} /></li>)}
        </ul>
      </div>
      <div>
        <h3 className="hint">상대 분석 {days ? `${days}일` : '없음'}</h3>
        {days ? (
          <ul className="lines">
            <li><span>즐겨 쓰는 전술</span><b>{report.tactics}</b></li>
            {report.sections.flatMap((sec) => sec.lines).map((l) => <li key={l}><span>{l}</span></li>)}
          </ul>
        ) : (
          <p className="muted">
            {!m.official ? '연습 경기는 상대 분석 없이 치릅니다.'
              : m.opener ? '대회 첫 경기는 대진이 경기 당일에 정해져 미리 분석할 수 없습니다. 다음 경기부터는 경기 전 훈련일에 상대 분석을 할 수 있습니다.'
                : '이 경기는 상대 분석 없이 치릅니다. 공식전 전 훈련일에 훈련 대신 상대 분석을 하면 상대의 전술과 강·약점을 미리 알 수 있습니다.'}
          </p>
        )}
        <p className="hint">우리 전술: {FOCUS[mine.focus ?? 'balanced']} 공격 · {DEFENSE[mine.defense ?? 'man']} 수비</p>
      </div>
    </div>
  );
}

// 오늘의 결정: 감독이 선택지를 골라야 하루를 진행할 수 있는 사건. 고른 뒤에는 그날 동안 결과를 보여 준다.
function EventPanel({ S, act }: { S: PlayingState; act: Act }) {
  const c = S.career;
  const view = c.event ? describeEvent(c, c.event) : null;
  if (view) {
    return (
      <Panel title={`오늘의 결정 · ${view.from}`} className="span-12 event">
        <h3 style={{ margin: '0 0 6px' }}>{view.title}</h3>
        {view.body.map((line) => <p key={line} style={{ margin: '0 0 10px' }}>{line}</p>)}
        <div className="opts event-opts">
          {view.options.map((o, i) => (
            <button key={o.label} className="opt" onClick={() => act('eventChoice', i)}>
              <b>{o.label}</b><span>{o.hint}</span>
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>결정을 내려야 오늘 하루를 진행할 수 있습니다.</p>
      </Panel>
    );
  }
  const last = S.lastEvent;
  if (!last || last.day !== c.dayIndex) return null;
  return (
    <Panel title="오늘의 결정 · 결과" className="span-12">
      <p style={{ margin: '0 0 6px' }}><b>{last.title}</b> <span className="muted">— {last.chosen}</span></p>
      <ul className="lines">{last.result.map((line) => <li key={line}><span>{line}</span></li>)}</ul>
    </Panel>
  );
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
          <div className="side"><Crest name={m.opponent} size={48} /><b><SchoolName id={m.opponentId} name={m.opponent} onPick={(id) => act('school', id)} /></b><span className="muted">팀 전력 <Attr v={m.opponentOverall} /></span></div>
        </div>
        <div className="strength" style={{ ['--club' as string]: clubColor(team.name) }}>
          <span>{mine}</span>
          <div className="bar"><i style={{ width: `${share}%` }} /><i style={{ width: `${100 - share}%` }} /></div>
          <span>{m.opponentOverall}</span>
        </div>
        <p className="muted" style={{ textAlign: 'center' }}>{m.label}</p>
        {m.official && d.prep && d.prep.daysUntil === 0 && (
          <p style={{ textAlign: 'center' }}>{d.prep.days
            ? <span className="pill good">상대 분석 {d.prep.days}일 · 능력치 +{d.prep.bonus.toFixed(1)}</span>
            : null}</p>
        )}
        <OpponentBrief S={S} d={d} />
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => act('screen', 'tactics')}><Icon name="tactics" />전술·선발 확인</button>
          <button className="btn primary" onClick={() => act('command')}>벤치에서 직접 지휘</button>
          <button className="btn" onClick={() => act('simulate')}>결과만 보기</button>
        </div>
      </Panel>
    );
  }
  const next = nextFixture(c);
  const plan = S.program === 'rest' || S.program === 'scout' ? PROGRAMS[S.program].label : `${PROGRAMS[S.program].label} · ${INTENSITY[S.intensity].label}`;
  const prep = d.prep;
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
      {prep && (
        <div className="notice" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200 }}>
            다음 공식전 <b><SchoolName id={prep.opponentId} name={prep.opponent} onPick={(id) => act('school', id)} /></b> ({prep.daysUntil}일 후) · 상대 분석 {prep.days}/{PREPARATION.maxDays}일
            {prep.days > 0 && <> · 그 경기 능력치 +{prep.bonus.toFixed(1)}</>}
          </span>
          {prep.canScout && S.program !== 'scout' && <button className="btn small primary" onClick={() => act('program', 'scout')} title="오늘의 훈련 메뉴를 상대 분석으로 바꿉니다. 날짜는 '계속'을 눌러야 넘어갑니다.">오늘 훈련을 상대 분석으로</button>}
          {S.program === 'scout' && <span className="pill club">오늘 분석 예정</span>}
        </div>
      )}
      <div className="row">
        <button className="btn" onClick={() => act('screen', 'training')}><Icon name="training" />훈련 설정</button>
        <button className="btn" onClick={() => act('screen', 'tactics')}><Icon name="tactics" />전술 확인</button>
      </div>
    </Panel>
  );
}

function CompetitionPanel({ c, act }: { c: Career; act: Act }) {
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
      {showGroup && <StandingsTable career={c} title={group.name} ids={group.ids} matches={group.matches} onPick={(id) => act('school', id)} />}
      {showLeague && <StandingsTable career={c} title="결승 리그" ids={comp.league!.ids} matches={comp.league!.matches} onPick={(id) => act('school', id)} />}
      {!showGroup && !showLeague && comp.bracket.length > 1 && (
        <p>남은 학교 <b>{comp.bracket.filter(Boolean).length}</b>곳 · {comp.bracket.includes(me) ? <span className="good">{userHasBye(c) ? '우리 학교 부전승 (이번 라운드는 쉽니다)' : '우리 학교 생존'}</span> : <span className="muted">우리 학교 탈락</span>}</p>
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
  const goal = seasonGoal(S.career);
  const morale = teamMorale(team);
  const injured = team.players.filter((p) => p.injuredDays);
  const tired = fit.filter((p) => p.condition < 60);
  const matches = S.inbox.filter((m) => m.kind === 'match');
  const upcoming = c.calendar.slice(c.dayIndex, c.dayIndex + 8).map((day, i) => ({ day, n: c.dayIndex + i + 1 }));
  // 공식전은 대진이 정해진 바로 다음 경기만 상대를 안다
  const official = upcomingOfficial(c);
  const officialDay = official ? c.dayIndex + official.daysUntil + 1 : null;

  return (
    <div className="page">
      <PageTitle title="홈" sub={`${d.year}년차 ${d.day}일째 · ${d.phase}`} />
      <div className="dash">
        <EventPanel S={S} act={act} />
        <NextMatchPanel S={S} act={act} d={d} team={team} />

        <Panel title="팀 상태" className="span-4">
          <div className="kv">
            <div><small>팀 전력</small><b><Attr v={teamOverall(team)} /></b></div>
            <div title="컨디션이 낮으면 경기 내내 능력이 떨어지고(60이면 약 5%) 더 빨리 지칩니다. 훈련 효율과 부상 위험에도 영향을 줍니다."><small>컨디션</small><b>{cond}</b><CondBar value={cond} wide /></div>
            <div title="60이 보통입니다. 승패·출전 시간·훈련 강도·감독의 결정에 따라 오르내리고, 경기력과 훈련 효율에 영향을 줍니다."><small>팀 사기</small><b>{moraleLabel(morale)}</b><span className="muted">{Math.round(morale)} / 100</span></div>
          </div>
          <div className="notice" style={{ marginTop: 8 }}>
            <b>올해 목표</b> · {goal.label}<br />
            <span className="muted">
              {goal.achieved ? <span className="good">달성 ({goal.bestLabel})</span> : goal.bestLabel ? `아직 미달 · 올해 최고 성적: ${goal.bestLabel}` : '아직 끝난 대회가 없습니다'}
              {' · '}교장의 신임 {goal.trust}
            </span>
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

        <CompetitionPanel c={c} act={act} />

        <Panel title="다가오는 일정" className="span-4">
          <ul className="lines">
            {upcoming.map(({ day, n }) => (
              <li key={n}>
                <span><b className="num">{n}일</b> <span className="muted">{day.phase}</span></span>
                {day.type === 'training'
                  ? <span className="pill">{day.camp ? '합숙 훈련' : '훈련'}</span>
                  : day.type === 'practice'
                    ? <span className="pill club">연습 · {teamName(c, day.opponentId ?? '')}</span>
                    : <span className="pill warn">{n === officialDay && official ? `공식전 · ${official.opponent}` : '공식전'}</span>}
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
