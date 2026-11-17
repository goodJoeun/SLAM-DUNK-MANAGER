'use client';

import type { ComponentType } from 'react';
import { useGame } from './useGame';
import type { GameState, PlayingState, ScreenKey } from './useGame';
import type { ViewProps } from './ui';
import Shell from './Shell';
import StartView from './StartView';
import HomeView from './HomeView';
import InboxView from './InboxView';
import SquadView from './SquadView';
import TacticsView from './TacticsView';
import TrainingView from './TrainingView';
import CompView from './CompView';
import RecordsView from './RecordsView';
import MatchView from './MatchView';
import SchoolView from './SchoolView';

const SCREENS: Record<ScreenKey, ComponentType<ViewProps>> = {
  home: HomeView,
  inbox: InboxView,
  squad: SquadView,
  tactics: TacticsView,
  training: TrainingView,
  comp: CompView,
  records: RecordsView,
};

const isPlaying = (S: GameState): S is PlayingState => S.career !== null;

export default function Game() {
  const { S, act } = useGame();
  if (!isPlaying(S)) return <StartView S={S} act={act} />;
  const Screen = SCREENS[S.screen];
  const school = S.schoolId ? S.career.teams[S.schoolId] : undefined; // 다른 현 대표는 대회가 끝나면 정리되어 없을 수 있다
  return (
    <Shell S={S} act={act}>
      {S.match ? <MatchView S={S} act={act} match={S.match} /> : school ? <SchoolView S={S} act={act} team={school} /> : <Screen S={S} act={act} />}
    </Shell>
  );
}
