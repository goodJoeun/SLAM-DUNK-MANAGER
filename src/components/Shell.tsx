// 화면 틀: 위쪽 학교 머리띠(날짜·다음 경기·계속 버튼)와 왼쪽 메뉴
import { useEffect, useRef } from 'react';
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
  useEffect(() => { window.scrollTo(0, 0); }, [S.screen, S.playerId, inMatchNow(S)]);

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

  const c = S.career;
  const team = userTeam(c);
  const d = today(c); // 캠페인이 끝났으면 null
  const unread = S.inbox.filter((m) => m.unread).length;
  const inMatch = Boolean(S.match);
  const note = S.dayNote;
  const cond = Math.round(mean(team.players.filter((p) => !p.injuredDays).map((p) => p.condition)));
  const plan = S.program === 'rest' || S.program === 'scout' ? PROGRAMS[S.program].label : `${PROGRAMS[S.program].label} · ${INTENSITY[S.intensity].label}`;

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
        {!inMatch && d && !d.userMatch && (
          <button className="btn ghost" onClick={() => act('auto')} title="AI 코치가 다음 경기일까지 훈련을 맡습니다">다음 경기까지</button>
        )}
        {!inMatch && d && (
          <button className="btn continue" onClick={() => act('proceed')} title="단축키: 스페이스">
            <span className="c-main">{d.userMatch ? '경기 시작' : '계속'}<Icon name="next" /></span>
            <small>{d.userMatch ? d.userMatch.label : `훈련: ${plan}`}</small>
          </button>
        )}
        {/* 경기 중에는 실수로 누르지 않게 숨긴다 */}
        {!inMatch && <button className="btn ghost small" onClick={() => act('reset')}>새 게임</button>}
      </header>

      {!inMatch && (
        <nav className="sidebar" aria-label="메뉴">
          {NAV.map((n) => (
            <button key={n.key} className={`nav-item ${S.screen === n.key ? 'on' : ''}`} onClick={() => act('screen', n.key)}>
              <Icon name={n.icon} />{n.label}
              {n.key === 'inbox' && unread > 0 && <span className="badge">{unread}</span>}
            </button>
          ))}
          <div className="side-foot">
            <div className="row"><span>팀 전력</span><Attr v={teamOverall(team)} /></div>
            <div className="row"><span>컨디션 {cond}</span><CondBar value={cond} /></div>
          </div>
        </nav>
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
