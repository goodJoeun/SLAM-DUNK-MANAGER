'use client';

import type { ComponentType } from 'react';
import { today } from '@/game/season';
import { useGame } from './useGame';
import type { GameState, PlayingState, TabKey } from './useGame';
import { TABS, userTeam } from './ui';
import type { ViewProps } from './ui';
import StartView from './StartView';
import TodayView from './TodayView';
import SquadView from './SquadView';
import CompView from './CompView';
import RecordsView from './RecordsView';
import MatchView from './MatchView';

const VIEWS: Record<TabKey, ComponentType<ViewProps>> = { today: TodayView, squad: SquadView, comp: CompView, records: RecordsView };

const isPlaying = (S: GameState): S is PlayingState => S.career !== null;

function TopBar({ S, act }: ViewProps) {
  const c = S.career;
  const d = today(c); // 캠페인이 끝났으면 null
  return (
    <div className="topbar">
      <span className="school">{userTeam(c).name}</span>
      <span className="date">{d ? `${d.year}년차 · ${d.day}/${d.of}일 · ${d.phase}` : '캠페인 종료'}</span>
      <span className="spacer" />
      <nav className="tabs">
        {!S.match && (Object.entries(TABS) as [TabKey, string][]).map(([k, v]) => (
          <button key={k} className={`tab ${S.tab === k ? 'on' : ''}`} onClick={() => act('tab', k)}>{v}</button>
        ))}
      </nav>
      <button className="btn small" onClick={() => act('reset')}>새 게임</button>
    </div>
  );
}

export default function Game() {
  const { S, act } = useGame();
  if (!isPlaying(S)) return <StartView S={S} act={act} />;
  const View = VIEWS[S.tab];
  return (
    <>
      <TopBar S={S} act={act} />
      {S.match ? <MatchView match={S.match} act={act} /> : <View S={S} act={act} />}
    </>
  );
}
