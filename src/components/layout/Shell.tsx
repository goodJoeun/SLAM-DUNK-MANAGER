// 화면 틀: 위쪽 학교 머리띠(날짜·다음 경기·계속 버튼)와 왼쪽 메뉴
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { today } from '@/game/career/season';
import { PROGRAMS, INTENSITY, teamOverall } from '@/game/team/school';
import type { Today } from '@/game/types';
import type { ScreenKey } from '@/state/useGame';
import { Attr, CondBar, Crest, Icon, clubVars, mean, usePhone, userTeam } from '@/components/shared/ui';
import EventModal, { eventKey, resultKey } from './EventModal';
import FarewellModal from './FarewellModal';
import type { IconName, ViewProps } from '@/components/shared/ui';

const NAV: { key: ScreenKey; label: string; icon: IconName }[] = [
  { key: 'home', label: '홈', icon: 'home' },
  { key: 'inbox', label: '받은 소식', icon: 'inbox' },
  { key: 'squad', label: '선수단', icon: 'squad' },
  { key: 'tactics', label: '전술', icon: 'tactics' },
  { key: 'training', label: '훈련', icon: 'training' },
  { key: 'schedule', label: '일정', icon: 'calendar' },
  { key: 'comp', label: '대회', icon: 'trophy' },
  { key: 'schools', label: '학교', icon: 'school' },
  { key: 'leaders', label: '리더보드', icon: 'chart' },
  { key: 'records', label: '기록', icon: 'records' },
];

// 휴대폰 화면의 아래쪽 탭: 시즌을 굴리는 데 꼭 필요한 다섯 곳만 둔다.
// 받은 소식은 머리띠의 아이콘으로 열고, 일정·학교·리더보드·기록은 넓은 화면에서만 메뉴에 나온다
const TAB_KEYS: ScreenKey[] = ['home', 'squad', 'tactics', 'training', 'comp'];
const TABS = NAV.filter((n) => TAB_KEYS.includes(n.key));

const REST_ADVICE = { low: 60, beforeMatch: 75 }; // 이 컨디션 아래에서 훈련을 이어 가려 하면 휴식을 권한다

function NextChip({ d }: { d: Today }) {
  const next = d.userMatch ? `오늘 · ${d.userMatch.opponent}` : d.daysToNextMatch == null ? '올해 남은 경기 없음' : `${d.daysToNextMatch}일 후`;
  return <div className="next-chip"><span>다음 경기</span><b>{next}</b></div>;
}

const inMatchNow = (S: ViewProps['S']) => Boolean(S.match);

export default function Shell({ S, act, children }: ViewProps & { children: ReactNode }) {
  // 머리띠 높이를 재어 두면, 그 아래에 붙는 요소(경기 점수판, 메뉴)가 머리띠가 두 줄로 늘어나도 겹치지 않는다
  const appRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  // 휴대폰 화면 아래에 고정된 줄(계속 버튼·메뉴)의 높이도 잰다. 화면을 가득 채우는 표가 그 위까지만 차지하게 한다
  const dockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    const app = appRef.current;
    if (!header || !app) return;
    const update = () => {
      app.style.setProperty('--header-h', `${header.offsetHeight}px`);
      app.style.setProperty('--dock-h', `${dockRef.current?.offsetHeight ?? 0}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    if (dockRef.current) ro.observe(dockRef.current);
    return () => ro.disconnect();
  }, [inMatchNow(S)]);

  // 화면을 바꾸면 맨 위에서 시작한다 (이전 화면의 스크롤 위치가 남아 제목이 가려지지 않게).
  // 화면 전환 효과가 새 화면을 찍기 전에 올려야 하므로 그리기 전에(layout effect) 한다
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [S.screen, S.playerId, S.schoolId, inMatchNow(S)]);

  // 오늘의 결정 팝업: 닫은 사건·결과의 이름을 기억해 둔다 (새 사건이 생기면 다시 뜬다)
  const [closed, setClosed] = useState<string | null>(null);
  const popupKey = eventKey(S) ?? resultKey(S);
  const popup = !inMatchNow(S) && popupKey != null && popupKey !== closed;
  const farewell = !inMatchNow(S) ? S.farewell : null; // 3학년의 마지막 경기 (경기 결과 화면을 떠난 뒤에 띄운다)

  // 스페이스: 평소에는 '계속', 경기 중에는 진행/일시정지. 입력 칸이나 버튼에 초점이 있으면 건드리지 않는다.
  const onSpace = useRef<() => void>(() => {});
  onSpace.current = () => {
    if (S.match) {
      if (!S.match.game.finished) act(S.match.playing ? 'pause' : 'play');
    } else if (S.farewell) {
      act('dismissFarewell');
    } else if (S.career.event && !today(S.career)?.userMatch) {
      setClosed(null); // 결정을 미뤄 둔 사건이 있으면 하루를 넘기는 대신 창을 다시 연다
    } else if (today(S.career)) act('proceed');
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest?.('input, select, textarea, button, a, [role="dialog"]')) return;
      e.preventDefault();
      onSpace.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const phone = usePhone();
  const c = S.career;
  const team = userTeam(c);
  const d = today(c); // 캠페인이 끝났으면 null
  const unread = S.inbox.filter((m) => m.unread).length;
  const inMatch = Boolean(S.match);
  const note = S.dayNote;
  const cond = Math.round(mean(team.players.filter((p) => !p.injuredDays).map((p) => p.condition)));
  const plan = S.program === 'rest' || S.program === 'scout' ? PROGRAMS[S.program].label : `${PROGRAMS[S.program].label} · ${INTENSITY[S.intensity].label}`;
  // 계속 버튼이 지금 무엇을 하는지, 누르기 전에 알아야 할 것을 버튼에 적는다
  const decision = Boolean(c.event) && !d?.userMatch; // 감독의 결정을 기다리는 사건: 고르기 전에는 하루가 넘어가지 않는다
  const training = S.program !== 'rest' && S.program !== 'scout';
  // 지친 채로 훈련을 이어 가려 할 때의 휴식 권고 (경기 전날은 기준을 높인다)
  const ceremony = d?.type === 'graduation'; // 졸업식 날: 훈련 없이 '계속'으로 졸업식을 치른다
  const restAdvice = !d || d.userMatch || decision || !training || ceremony ? null
    : cond < REST_ADVICE.low ? `컨디션 ${cond} · 휴식 권장`
      : d.daysToNextMatch === 1 && cond < REST_ADVICE.beforeMatch ? `내일 경기 · 컨디션 ${cond} · 휴식 권장` : null;

  // 하루를 넘기는 버튼들. 넓은 화면에서는 머리띠에, 휴대폰에서는 아래쪽 고정 줄에 놓인다
  const actions = !inMatch && d && (
    <>
      {!d.userMatch && !ceremony && (
        d.daysToNextMatch == null
          ? <button className="btn ghost" onClick={() => act('auto')} title="올해 경기는 모두 끝났습니다. AI 코치가 학년이 끝나는 날까지 훈련을 맡습니다">졸업식까지 진행</button>
          : <button className="btn ghost" onClick={() => act('auto')} title="AI 코치가 다음 경기일까지 훈련을 맡습니다">다음 경기까지</button>
      )}
      {restAdvice && (
        <button className="btn rest-today" onClick={() => act('restDay')} title="정해 둔 훈련 메뉴는 그대로 두고 오늘 하루만 쉽니다">오늘은 휴식</button>
      )}
      <button
        className={`btn continue ${decision || restAdvice ? 'alert' : ''}`}
        onClick={() => (decision ? setClosed(null) : act('proceed'))}
        title={decision ? '"오늘의 결정"을 먼저 골라야 하루가 넘어갑니다. 누르면 결정 창을 다시 엽니다' : restAdvice ? '컨디션이 낮으면 훈련 효율이 떨어지고 다치기 쉬우며, 경기력도 떨어집니다. 훈련 화면에서 휴식을 고를 수 있습니다. (단축키: 스페이스)' : '단축키: 스페이스'}
      >
        <span className="c-main">{d.userMatch ? '경기 시작' : decision ? '결정 필요' : ceremony ? '졸업식' : '계속'}<Icon name="next" /></span>
        <small>{d.userMatch ? d.userMatch.label : decision ? '오늘의 결정을 먼저 고르세요' : ceremony ? '3학년을 떠나보냅니다' : restAdvice ?? `훈련: ${plan}`}</small>
      </button>
    </>
  );

  return (
    <div ref={appRef} className={`app ${inMatch ? 'in-match' : ''}`} style={clubVars(team.name)}>
      <header ref={headerRef} className="app-header">
        <div className="club">
          <Crest name={team.name} size={34} />
          <div><b>{team.name}</b><span>{phone ? c.prefecture : `${c.prefecture} · 학교 수준 ${team.prestige}`}</span></div>
        </div>
        <div className="hdr-date">
          <b>{d ? `${d.year}년차 · ${d.day}일째` : '캠페인 종료'}</b>
          <span>{d ? d.phase : `${c.year}년차`}</span>
        </div>
        <div className="spacer" />
        {inMatch && <span className="pill live">{S.match?.game.finished ? '경기 종료' : '경기 중'}</span>}
        {!inMatch && d && <NextChip d={d} />}
        <div className="hdr-act">{actions}</div>
        {/* 휴대폰: 받은 소식은 탭 대신 머리띠의 아이콘으로 */}
        {!inMatch && (
          <button className={`hdr-inbox m-only ${S.screen === 'inbox' && !S.schoolId ? 'on' : ''}`} aria-label={unread ? `받은 소식, 읽지 않은 소식 ${unread}건` : '받은 소식'} onClick={() => act('screen', 'inbox')}>
            <Icon name="inbox" />
            {unread > 0 && <i className="badge">{unread > 9 ? '9+' : unread}</i>}
          </button>
        )}
      </header>

      {!inMatch && (
        <nav className="sidebar" aria-label="메뉴">
          {/* 넓은 화면: 메뉴 맨 위에 우리 학교 (머리띠의 학교 표시는 숨긴다) */}
          <div className="side-club">
            <Crest name={team.name} size={46} />
            <div><b>{team.name}</b><span>{c.prefecture} · <span className="nowrap">학교 수준 {team.prestige}</span></span></div>
          </div>
          {NAV.map((n) => (
            <button key={n.key} className={`nav-item ${n.key === 'leaders' ? 'sep' : ''} ${S.screen === n.key && !S.schoolId ? 'on' : ''}`} onClick={() => act('screen', n.key)}>
              <Icon name={n.icon} />{n.label}
              {n.key === 'inbox' && unread > 0 && <span className="badge">{unread}</span>}
            </button>
          ))}
          <div className="side-foot">
            <div className="row"><span>팀 전력</span><Attr v={teamOverall(team)} /></div>
            <div className="row"><span>컨디션 {cond}</span><CondBar value={cond} /></div>
          </div>
          {/* 게임을 나가는 버튼이라 "계속" 옆이 아니라 메뉴 맨 끝에 둔다 */}
          <button className="nav-item nav-reset" title="지금 게임은 그대로 저장됩니다. 표지에서 다른 칸의 게임을 이어 하거나 새 게임을 시작할 수 있습니다." onClick={() => act('menu')}><Icon name="back" />표지로 나가기</button>
        </nav>
      )}

      {/* 휴대폰 화면: '계속' 버튼과 메뉴를 엄지가 닿는 화면 아래에 고정한다 */}
      {!inMatch && (
        <div ref={dockRef} className="dock">
          {actions && <div className="dock-act">{actions}</div>}
          <nav className="tabbar" aria-label="아래쪽 메뉴">
            {TABS.map((n) => (
              <button key={n.key} className={S.screen === n.key && !S.schoolId ? 'on' : ''} onClick={() => act('screen', n.key)}>
                <Icon name={n.icon} /><span>{n.label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}

      <div className="content">
        {/* 방금 보낸 하루의 결과: 다음 날로 넘어가거나 닫기 전까지 어느 화면에서든 보인다 */}
        {!inMatch && note && note.year === c.year && note.dayIndex === c.dayIndex && (
          <div key={`${note.year}-${note.dayIndex}`} className="day-note" role="status">
            <Icon name="training" />
            <b>{note.title}</b>
            {note.items.map((item) => <span key={item.text} className={`pill ${item.tone ?? ''}`}>{item.text}</span>)}
            <span className="spacer" />
            <button className="btn ghost small d-only" onClick={() => act('screen', 'inbox')}>소식에서 자세히</button>
            <button className="btn ghost small" aria-label="닫기" onClick={() => act('dismissDayNote')}>닫기</button>
          </div>
        )}
        {children}
      </div>
      {/* 은퇴 창이 먼저다: 닫고 나면 그날 아침의 결정 창이 이어서 뜬다 */}
      {farewell
        ? <FarewellModal f={farewell} onClose={() => act('dismissFarewell')} />
        : popup && <EventModal S={S} act={act} onClose={() => setClosed(popupKey)} />}
    </div>
  );
}
