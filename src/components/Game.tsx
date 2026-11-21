'use client';

import type { ComponentType } from 'react';
import { useGame } from '@/state/useGame';
import type { GameState, PlayingState, ScreenKey } from '@/state/useGame';
import type { ViewProps } from './shared/ui';
import Shell from './layout/Shell';
import StartView from './screens/StartView';
import TitleView from './screens/TitleView';
import HomeView from './screens/HomeView';
import InboxView from './screens/InboxView';
import SquadView from './screens/SquadView';
import TacticsView from './screens/TacticsView';
import TrainingView from './screens/TrainingView';
import CompView from './screens/CompView';
import RecordsView from './screens/RecordsView';
import LeadersView from './screens/LeadersView';
import ScheduleView from './screens/ScheduleView';
import SchoolsView from './screens/SchoolsView';
import MatchView from './screens/MatchView';
import SchoolView from './screens/SchoolView';
import TouchTips from './layout/TouchTips';

const SCREENS: Record<ScreenKey, ComponentType<ViewProps>> = {
  home: HomeView,
  inbox: InboxView,
  squad: SquadView,
  tactics: TacticsView,
  training: TrainingView,
  schedule: ScheduleView,
  comp: CompView,
  schools: SchoolsView,
  leaders: LeadersView,
  records: RecordsView,
};

const isPlaying = (S: GameState): S is PlayingState => S.career !== null;

export default function Game() {
  const { S, act } = useGame();
  if (!isPlaying(S)) return <>{S.stage === 'title' ? <TitleView S={S} act={act} /> : <StartView S={S} act={act} />}<TouchTips /></>;
  const Screen = SCREENS[S.screen];
  const school = S.schoolId ? S.career.teams[S.schoolId] : undefined; // 다른 현 대표는 대회가 끝나면 정리되어 없을 수 있다
  return (
    <>
    <Shell S={S} act={act}>
      {S.match ? <MatchView S={S} act={act} match={S.match} /> : school ? <SchoolView S={S} act={act} team={school} /> : <Screen S={S} act={act} />}
    </Shell>
    <TouchTips />
    </>
  );
}
