// 일정: 올해 달력 전체를 시기별로 보여 준다. 지난 경기는 결과를, 남은 연습 경기는 상대를 함께 적는다.
import { today, userMatchDays } from '@/game/career/season';
import { teamOverall } from '@/game/team/school';
import type { CalendarDay } from '@/game/types';
import { Attr, CalendarStrip, PageTitle, Panel, SchoolName } from '@/components/shared/ui';
import type { ViewProps } from '@/components/shared/ui';

export default function ScheduleView({ S, act }: ViewProps) {
  const c = S.career;
  const d = today(c);
  const ours = new Set(userMatchDays(c)); // 우리 팀이 뛰는 날 (달력 순번)
  // 올해 치른 우리 경기의 결과 소식 (날짜 -> 소식)
  const results = new Map(S.inbox.filter((m) => m.kind === 'match' && m.year === c.year).map((m) => [m.day, m]));
  const pick = (id: string) => act('school', id);

  // 이어지는 같은 시기끼리 묶는다
  const groups: { phase: string; days: { i: number; day: CalendarDay }[] }[] = [];
  c.calendar.forEach((day, i) => {
    const last = groups[groups.length - 1];
    if (last && last.phase === day.phase) last.days.push({ i, day });
    else groups.push({ phase: day.phase, days: [{ i, day }] });
  });

  const left = c.calendar.slice(c.dayIndex);
  const practiceLeft = left.filter((x) => x.type === 'practice').length;
  const officialLeft = [...ours].filter((i) => c.calendar[i].type === 'official').length;
  const next = d?.userMatch ? `오늘 · ${d.userMatch.opponent}` : d?.daysToNextMatch == null ? '올해 남은 경기 없음' : `${d.daysToNextMatch}일 후`;

  const row = ({ i, day }: { i: number; day: CalendarDay }) => {
    const past = i < c.dayIndex;
    const now = i === c.dayIndex && !c.finished;
    const result = results.get(i + 1);
    const opp = day.opponentId ? c.teams[day.opponentId] : undefined;
    let what;
    if (result) {
      // 소식 제목: "승리 · 우리 76 : 70 상대"
      what = (
        <button className="name-link sched-result" title="경기 소식 보기" onClick={() => act('openMessage', result.id)}>
          <span className={`pill ${result.won ? 'good' : 'bad'}`}>{result.won ? '승' : '패'}</span>
          {result.title.replace(/^(승리|패배) · /, '')}
        </button>
      );
    } else if (day.type === 'practice') {
      what = <>연습 경기{opp && <> · <SchoolName id={opp.id} name={opp.name} onPick={pick} /> <Attr v={teamOverall(opp)} /></>}</>;
    } else if (day.type === 'official') {
      what = past || !ours.has(i) ? <span className="faint">공식전 · 우리 경기 없음</span> : <b>공식전{day.start ? ' · 대회 첫날' : ''}</b>;
    } else {
      what = <span className="faint">{day.camp ? '합숙 훈련' : '훈련'}</span>;
    }
    return (
      <li key={i} className={`sched-day ${day.type} ${past ? 'past' : ''} ${now ? 'now' : ''}`}>
        <span className="num">{i + 1}일</span>
        <span className="what">{what}</span>
        {now && <span className="pill club">오늘</span>}
      </li>
    );
  };

  return (
    <div className="page">
      <PageTitle title="일정" sub={`${c.year}년차 · 전체 ${c.calendar.length}일 · 학교 이름을 누르면 학교 정보, 지난 경기를 누르면 경기 소식`} />
      <Panel title={`${c.year}년차 달력`}>
        <div className="kv">
          <div><small>오늘</small><b>{c.finished ? '종료' : `${c.dayIndex + 1}일째`}</b><span className="muted">{d?.phase ?? '캠페인 종료'}</span></div>
          <div><small>다음 경기</small><b>{next}</b></div>
          <div><small>남은 연습 경기</small><b>{practiceLeft}경기</b></div>
          <div><small>남은 공식전</small><b>{officialLeft}일</b><span className="muted">대회에서 살아남는 동안</span></div>
        </div>
        <CalendarStrip career={c} />
      </Panel>
      <div className="sched">
        {groups.map((g) => {
          const from = g.days[0].i;
          const to = g.days[g.days.length - 1].i;
          const state = to < c.dayIndex ? '지남' : from > c.dayIndex ? `${from - c.dayIndex}일 후 시작` : '진행 중';
          return (
            <Panel key={from} title={g.phase} flush action={<span className="hint">{from + 1}~{to + 1}일 · {state}</span>} className={to < c.dayIndex ? 'sched-past' : ''}>
              <ul className="sched-list">{g.days.map(row)}</ul>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
