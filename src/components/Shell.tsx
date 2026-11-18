// 화면 틀: 위쪽 학교 머리띠(날짜·다음 경기·계속 버튼)와 왼쪽 메뉴
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { today } from '@/game/season';
import { PROGRAMS, INTENSITY, teamOverall } from '@/game/school';
import type { Today } from '@/game/types';
import type { ScreenKey } from './useGame';
import { Attr, CondBar, Crest, Icon, clubVars, mean, userTeam } from './ui';
import type { IconName, ViewProps } from './ui';

const NAV: { key: ScreenKey; label: string; icon: IconName }[] = [
  { key: 'home', label: '홈', icon: 'home' },
  { key: 'inbox', label: '받은 소식', icon: 'inbox' },
  { key: 'squad', label: '선수단', icon: 'squad' },
  { key: 'tactics', label: '전술', icon: 'tactics' },
  { key: 'training', label: '훈련', icon: 'training' },
  { key: 'comp', label: '대회', icon: 'trophy' },
  { key: 'records', label: '기록', icon: 'chart' },
];

// 휴대폰 화면의 아래쪽 탭. 나머지 메뉴는 '더보기'에 넣는다
const TAB_KEYS: ScreenKey[] = ['home', 'inbox', 'squad', 'tactics', 'training'];
const TABS = NAV.filter((n) => TAB_KEYS.includes(n.key));
const MORE = NAV.filter((n) => !TAB_KEYS.includes(n.key));

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
  useEffect(() => {
    const header = headerRef.current;
    const app = appRef.current;
    if (!header || !app) return;
    const update = () => app.style.setProperty('--header-h', `${header.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  // 화면을 바꾸면 맨 위에서 시작한다 (이전 화면의 스크롤 위치가 남아 제목이 가려지지 않게)
  useEffect(() => { window.scrollTo(0, 0); }, [S.screen, S.playerId, S.schoolId, inMatchNow(S)]);

  // 스페이스: 평소에는 '계속', 경기 중에는 진행/일시정지. 입력 칸이나 버튼에 초점이 있으면 건드리지 않는다.
  const onSpace = useRef<() => void>(() => {});
  onSpace.current = () => {
    if (S.match) {
      if (!S.match.game.finished) act(S.match.playing ? 'pause' : 'play');
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

  const [more, setMore] = useState(false); // 휴대폰 화면의 '더보기' 메뉴
  const go = (key: ScreenKey) => { setMore(false); act('screen', key); };

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
  const restAdvice = !d || d.userMatch || decision || !training ? null
    : cond < REST_ADVICE.low ? `컨디션 ${cond} · 휴식 권장`
      : d.daysToNextMatch === 1 && cond < REST_ADVICE.beforeMatch ? `내일 경기 · 컨디션 ${cond} · 휴식 권장` : null;

  // 하루를 넘기는 버튼들. 넓은 화면에서는 머리띠에, 휴대폰에서는 아래쪽 고정 줄에 놓인다
  const actions = !inMatch && d && (
    <>
      {!d.userMatch && (
        <button className="btn ghost" onClick={() => act('auto')} title="AI 코치가 다음 경기일까지 훈련을 맡습니다">다음 경기까지</button>
      )}
      {restAdvice && (
        <button className="btn rest-today" onClick={() => act('restDay')} title="정해 둔 훈련 메뉴는 그대로 두고 오늘 하루만 쉽니다">오늘은 휴식</button>
      )}
      <button
        className={`btn continue ${decision || restAdvice ? 'alert' : ''}`}
        onClick={() => act('proceed')}
        title={decision ? '홈의 "오늘의 결정"을 먼저 골라야 하루가 넘어갑니다' : restAdvice ? '컨디션이 낮으면 훈련 효율이 떨어지고 다치기 쉬우며, 경기력도 떨어집니다. 훈련 화면에서 휴식을 고를 수 있습니다. (단축키: 스페이스)' : '단축키: 스페이스'}
      >
        <span className="c-main">{d.userMatch ? '경기 시작' : decision ? '결정 필요' : '계속'}<Icon name="next" /></span>
        <small>{d.userMatch ? d.userMatch.label : decision ? '오늘의 결정을 먼저 고르세요' : restAdvice ?? `훈련: ${plan}`}</small>
      </button>
    </>
  );
  const moreOn = !S.schoolId && MORE.some((n) => n.key === S.screen);

  return (
    <div ref={appRef} className={`app ${inMatch ? 'in-match' : ''}`} style={clubVars(team.name)}>
      <header ref={headerRef} className="app-header">
        <div className="club">
          <Crest name={team.name} size={34} />
          <div><b>{team.name}</b><span>{c.prefecture} · 학교 수준 {team.prestige}</span></div>
        </div>
        <div className="hdr-date">
          <b>{d ? `${d.year}년차 · ${d.day}일째` : '캠페인 종료'}</b>
          <span>{d ? d.phase : `${c.year}년차`}</span>
        </div>
        <div className="spacer" />
        {inMatch && <span className="pill live">경기 중</span>}
        {!inMatch && d && <NextChip d={d} />}
        <div className="hdr-act">{actions}</div>
      </header>

      {!inMatch && (
        <nav className="sidebar" aria-label="메뉴">
          {NAV.map((n) => (
            <button key={n.key} className={`nav-item ${S.screen === n.key && !S.schoolId ? 'on' : ''}`} onClick={() => act('screen', n.key)}>
              <Icon name={n.icon} />{n.label}
              {n.key === 'inbox' && unread > 0 && <span className="badge">{unread}</span>}
            </button>
          ))}
          <div className="side-foot">
            <div className="row"><span>팀 전력</span><Attr v={teamOverall(team)} /></div>
            <div className="row"><span>컨디션 {cond}</span><CondBar value={cond} /></div>
          </div>
          {/* 게임을 나가는 버튼이라 "계속" 옆이 아니라 메뉴 맨 끝에 둔다 */}
          <button className="nav-item nav-reset" title="지금 게임은 그대로 저장됩니다. 표지에서 다른 칸의 게임을 이어 하거나 새 게임을 시작할 수 있습니다." onClick={() => act('menu')}>표지로 나가기</button>
        </nav>
      )}

      {/* 휴대폰 화면: '계속' 버튼과 메뉴를 엄지가 닿는 화면 아래에 고정한다 */}
      {!inMatch && (
        <div className="dock">
          {more && (
            <div className="dock-more">
              {MORE.map((n) => (
                <button key={n.key} className={`nav-item ${S.screen === n.key && !S.schoolId ? 'on' : ''}`} onClick={() => go(n.key)}><Icon name={n.icon} />{n.label}</button>
              ))}
              <button className="nav-item" onClick={() => { setMore(false); act('menu'); }}><Icon name="back" />표지로 나가기 <span className="faint">· 게임은 저장됩니다</span></button>
            </div>
          )}
          {actions && <div className="dock-act">{actions}</div>}
          <nav className="tabbar" aria-label="아래쪽 메뉴">
            {TABS.map((n) => (
              <button key={n.key} className={S.screen === n.key && !S.schoolId && !more ? 'on' : ''} onClick={() => go(n.key)}>
                <Icon name={n.icon} /><span>{n.label}</span>
                {n.key === 'inbox' && unread > 0 && <i className="badge">{unread}</i>}
              </button>
            ))}
            <button className={more || moreOn ? 'on' : ''} aria-expanded={more} onClick={() => setMore(!more)}><Icon name="more" /><span>더보기</span></button>
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
            <button className="btn ghost small" onClick={() => act('screen', 'inbox')}>소식에서 자세히</button>
            <button className="btn ghost small" aria-label="닫기" onClick={() => act('dismissDayNote')}>닫기</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
