// 엔진·시즌·화면이 함께 쓰는 데이터 모양.
// 커리어(Career)는 JSON으로 그대로 저장되므로, 여기 타입을 바꾸면 기존 세이브와의 호환도 함께 따져야 한다.

// ---------- 선수·팀 ----------

export type RatingKey =
  | 'hgt' | 'str' | 'spd' | 'jmp' | 'end' | 'ins' | 'dnk' | 'ft'
  | 'mid' | 'tp' | 'oiq' | 'diq' | 'mdf' | 'tdf' | 'drb' | 'pss' | 'reb';
// 수비 능력치는 셋으로 나뉜다. mdf 대인 수비: 맡은 상대를 1대1로 막는 힘 / tdf 팀 수비: 도움 수비·로테이션 /
// diq 수비IQ: 읽고 예측하는 힘 (스틸·블록 타이밍, 도움 수비 판단). 예전 세이브에는 diq만 있어 불러올 때 채운다 (school.ts upgradeCareer)
export type Ratings = Record<RatingKey, number>;

export type ProgramKey = 'shooting' | 'inside' | 'ballwork' | 'defense' | 'physical' | 'tactics' | 'rest' | 'scout';
export type IntensityKey = 'light' | 'normal' | 'hard';
export type NameStyle = 'kr' | 'jp';

// spread: 5아웃 스페이싱 (골밑·3점 위주) / switch: 스크린마다 수비를 바꿔 맡음 / drop: 빅맨이 골밑까지 물러나 림을 지킴
export type Focus = 'balanced' | 'inside' | 'outside' | 'spread';
export type Defense = 'man' | 'zone' | 'press' | 'switch' | 'drop';

// 선수별 개인 지시
export type OffenseRole = 'aggressive' | 'conservative' | 'three' | 'drive' | 'post' | 'pass';
export type DefenseRole = 'tight' | 'safe';
export interface PlayerRole {
  offense?: OffenseRole;
  defense?: DefenseRole;
}

export interface Tactics {
  pace: number;
  focus: Focus;
  defense: Defense;
  keyPlayerId: string | null; // 에이스 지정
  denyPlayerId: string | null; // 집중 마크
  denyDefenderId?: string | null; // 집중 마크를 맡길 우리 선수. 없거나 코트에 없으면 대상과 같은 자리의 선수가 맡는다
  roles?: Record<string, PlayerRole>; // 선수 id -> 개인 지시
}

// 경기 엔진이 요구하는 최소한의 선수 정보
export interface BasePlayer {
  id: string;
  name: string;
  pos: number; // 1 PG ~ 5 C
  ratings: Ratings;
}

// 학교에 소속된 선수
export interface Player extends BasePlayer {
  year: number;
  potential: number;
  hidden: { consistency: number };
  condition: number; // 0~100. 훈련·경기로 떨어지고 휴식으로 회복
  injuredDays: number;
  progress: Partial<Ratings>; // 능력치별 소수점 성장 누적
  focus: ProgramKey | null; // 개인 훈련 메뉴
  fixed?: boolean; // 데이터 파일에 명시된 선수
  trait?: TraitKey; // 성격 (people.ts). 없으면 처음 읽을 때 정한다
  morale?: number; // 사기 0~100, 60이 보통. 내 학교 선수만 변한다
  joined?: { ovr: number; scouted?: boolean; star?: boolean }; // 내 임기 중에 입학한 선수: 입학 때의 종합 능력치와 들어온 경위
}

export type TraitKey = 'steady' | 'worker' | 'genius' | 'clutch' | 'moody' | 'leader' | 'lazy' | 'ironman';
export type EventKey = 'benchTalk' | 'nightPractice' | 'quarrel' | 'exam' | 'alumni' | 'slump' | 'rookie' | 'friendly' | 'ache' | 'late';
// 감독의 결정을 기다리는 사건. a·b = 주인공 선수 id
export interface CareerEvent { key: EventKey; a: string; b?: string }

export interface Team {
  id: string;
  name: string;
  prestige: number;
  players: Player[];
  tactics: Partial<Tactics>;
  lineup?: (string | null)[]; // 감독이 직접 정한 선발: 포지션 1~5 자리의 선수 id. 없으면 매일 자동으로 정한다
}

// 경기 엔진의 입력. Team은 그대로 넣을 수 있고, 임시 생성 팀(generateTeam)은 id 없이도 된다.
export interface EnginePlayer extends BasePlayer {
  hidden?: { consistency: number };
  condition?: number;
  injuredDays?: number;
  morale?: number;
  trait?: TraitKey;
}
export interface EngineTeam {
  id?: string;
  name: string;
  players: EnginePlayer[];
  tactics?: Partial<Tactics>;
}

// 합성 능력치 (0~1)
export interface Composites {
  ballHandling: number;
  passing: number;
  rim: number;
  post: number;
  mid: number;
  three: number;
  ft: number;
  rebounding: number;
  defInterior: number;
  defPerimeter: number;
  helpInterior: number; // 팀 수비: 동료가 뚫렸을 때 골밑을 메우는 힘
  helpPerimeter: number; // 팀 수비: 외곽 로테이션
  stealing: number;
  blocking: number;
  endurance: number;
  usage: number;
}

// ---------- 경기 ----------

export type ShotType = 'rim' | 'post' | 'mid' | 'three';

export interface StatLine {
  sec: number; pts: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  orb: number; drb: number; ast: number; stl: number; blk: number; tov: number; pf: number;
}

// 중계 한 줄에 붙는 구조화된 정보. 코트 연출처럼 문장을 해석하지 않고 쓰기 위한 것이다.
export type EventKind = 'shot' | 'block' | 'rebound' | 'ft' | 'foul' | 'steal' | 'turnover' | 'sub' | 'timeout' | 'foulout';
export interface EventInfo {
  kind: EventKind;
  actor?: string; // 주인공 선수 id (슛한 선수, 리바운드한 선수, 스틸한 선수, 들어온 선수 ...)
  other?: string; // 상대역 (블록당한 슈터, 공을 뺏긴 선수, 나간 선수)
  assist?: string;
  shot?: ShotType; // 슛·블록, 또는 슛하다 얻은 자유투의 슛 종류
  made?: boolean;
  offensive?: boolean; // 공격 리바운드
  attempts?: number; // 자유투 시도
  makes?: number; // 자유투 성공
}

export interface LogEvent {
  period: number;
  clock: string;
  team: string;
  text: string;
  score: string;
  side: number; // 이 줄의 주인공 팀 (0 홈, 1 원정)
  at: number; // 경기 시작부터 흐른 시간(초)
  info?: EventInfo;
}

export interface StepResult {
  events: LogEvent[];
  periodEnded: boolean;
  finished: boolean;
  offense: number; // 이번 공격권의 공격 팀 (0 홈, 1 원정)
  elapsed: number; // 이번 공격권에 흐른 경기 시간(초)
}

export interface GameOptions {
  seed?: number;
  log?: boolean;
  manual?: [boolean, boolean]; // 직접 지휘하는 쪽 [홈, 원정]
  prep?: [number, number]; // 경기 전 상대 분석으로 얻은 보너스 [홈, 원정]. 이 경기에서만 능력치(키 제외)에 더한다
}

export interface PlayerView {
  id: string;
  name: string;
  pos: number;
  ovr: number;
  energy: number; // 0~100
  pf: number;
  pts: number;
  out: boolean; // 퇴장·부상으로 더는 뛸 수 없음
}

export interface TeamView {
  id: string | undefined;
  name: string;
  score: number;
  tactics: Tactics;
  auto: boolean;
  teamFouls: number;
  timeoutsLeft: number;
  run: number;
  court: PlayerView[];
  bench: PlayerView[];
}

export interface GameView {
  period: number;
  clock: number;
  finished: boolean;
  teams: TeamView[];
}

export interface BoxPlayer extends StatLine {
  id: string;
  name: string;
  pos: number;
  ovr: number;
  starter: boolean;
}

export interface BoxTeam {
  id: string | undefined;
  name: string;
  score: number;
  possessions: number;
  subs: number;
  players: BoxPlayer[];
}

export interface GameResult {
  finished: boolean;
  periods: number;
  score: { home: number; away: number };
  winner: 'home' | 'away';
  box: BoxTeam[];
  log: LogEvent[];
}

// ---------- 훈련·성장 ----------

export interface GrowthEvent {
  id: string;
  name: string;
  key: RatingKey;
  label: string;
  to: number;
}

export interface InjuryEvent {
  id: string;
  name: string;
  days: number;
}

export interface TrainingChoice {
  program: ProgramKey;
  intensity: IntensityKey;
}

// ---------- 대회·시즌 ----------

export type DayType = 'training' | 'practice' | 'official' | 'graduation'; // graduation: 졸업식 (한 해의 마지막 날. 훈련도 경기도 없다)
export type CompetitionKey = 'interhigh' | 'kokutai' | 'wintercup';
export type Format = 'group' | 'finalLeague' | 'playoff' | 'knockout';
export type Stage = Format | 'national' | 'done';
export type DatasetKey = 'original';

export interface Match {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  winner: string;
  overtime: boolean;
}

export type Pairing = [string, string];

export interface StandingRow {
  id: string;
  w: number;
  l: number;
  pf: number;
  pa: number;
}

export interface Group {
  name: string;
  ids: string[];
  schedule: Pairing[][];
  matches: Match[];
}

export interface League {
  ids: string[];
  schedule: Pairing[][];
  played: number;
  matches: Match[];
}

export interface Round {
  stage: Stage;
  name: string;
  matches: Match[];
  groups?: { name: string; table: StandingRow[] }[]; // 조별 리그 라운드
  table?: StandingRow[]; // 결승 리그 라운드
}

export interface Competition {
  key: CompetitionKey;
  name: string;
  format: Format[];
  qualifiers: number;
  stage: Stage;
  formatIndex: number;
  groups: Group[] | null;
  groupPlayed: number;
  league: League | null;
  bracket: string[]; // 대진 순서대로 둘씩 맞붙는다. BYE('')와 짝이 된 학교는 그 라운드를 쉰다
  runnerUp: string | null;
  rounds: Round[]; // 치른 라운드 기록
  finish: Record<string, string>; // 학교별 최종 성적 (표시용)
  tier: Record<string, number>; // 0 초반 탈락, 1 조 2위·8강, 2 현 예선 최종 단계, 3 전국 진출, 4 전국 8강 이상, 5 전국 우승
  prefChampion: string | null;
  champion: string | null;
}

export interface CompetitionResult {
  year: number;
  key: CompetitionKey;
  name: string;
  userFinish: string;
  prefChampion: string;
  champion: string;
}

export interface CalendarDay {
  phase: string;
  type: DayType;
  camp: boolean;
  start?: CompetitionKey; // 이 날부터 새 대회의 현 예선이 시작된다
  opponentId?: string; // 연습 경기 상대
}

// 선수별 공식전 누적 기록 (한 해)
export interface SeasonStat {
  id: string;
  name: string;
  teamId: string;
  gp: number; sec: number; pts: number; reb: number; ast: number; stl: number; blk: number;
  fgm: number; fga: number; tpm: number; tpa: number;
  team?: string; // 기록할 때의 학교 이름 (다른 현 대표는 대회가 끝나면 정리되므로 이름을 함께 남긴다)
  pos?: number;
}

// 리더보드 한 줄: 경기당 평균과 성공률
export type BoardKey = 'gp' | 'min' | 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'fg' | 'tp';
export interface BoardRow {
  id: string;
  name: string;
  teamId: string;
  team: string;
  pos: number;
  mine: boolean;
  local: boolean; // 우리 현의 학교 (눌러서 학교 정보를 볼 수 있다)
  gp: number; min: number; pts: number; reb: number; ast: number; stl: number; blk: number;
  fg: number | null; tp: number | null; // 성공률(%). 던진 슛이 없으면 null
  fgm: number; fga: number; tpm: number; tpa: number; // 경기당
}
// 우리 선수의 한 경기 기록 (연습 경기 포함). 선수 상세의 최근 경기 표에 쓴다
export interface GameLine {
  year: number; day: number;
  opponent: string;
  official: boolean;
  won: boolean;
  score: string; // "우리 - 상대"
  sec: number; pts: number; reb: number; ast: number; stl: number; blk: number;
  fgm: number; fga: number; tpm: number; tpa: number;
  rating?: number; // 평점 (review.ts의 playerRating)
}
// 종합 능력치가 바뀐 시점 (성장 추이)
export interface TrendPoint { year: number; day: number; ovr: number }

export type LeaderKey = 'pts' | 'reb' | 'ast' | 'stl' | 'blk';
export interface Leader extends SeasonStat {
  team: string;
  avg: number;
}

// 캠페인 전체 상태. JSON으로 그대로 저장·불러오기 한다.
export interface Career {
  seed: number;
  counter: number;
  nextId: number;
  year: number;
  finished: boolean;
  dataset: DatasetKey | null;
  nameStyle: NameStyle | null;
  prefecture: string;
  teams: Record<string, Team>;
  regionIds: string[];
  guestIds: string[];
  userTeamId: string;
  results: CompetitionResult[]; // 지금까지 끝난 대회 기록
  comp: Competition | null; // 진행 중인 대회
  stats: Record<string, SeasonStat>;
  // 지금(또는 가장 최근) 대회의 선수 기록. 다른 현 대표의 전국 대회 기록도 들어 있다. 다음 대회가 시작되면 새로 쌓는다
  compStats?: { key: CompetitionKey; name: string; stats: Record<string, SeasonStat> };
  yearPoints: Record<string, number>; // 학교별 올해 대회 성적 점수
  calendar: CalendarDay[];
  dayIndex: number;
  prep?: Record<string, number>; // 다음 공식전 상대별 분석 일수 (대회가 바뀌면 비운다)
  goal?: { tier: number; times?: number }; // 교장이 정한 올해 목표: 세 대회 중 times번(없으면 1) 이상 tier 등급의 성적
  yearTiers?: number[]; // 올해 끝난 대회들에서 우리 학교의 성적 등급 (끝난 순서)
  bestTier?: number; // 올해 끝난 대회 중 우리 학교의 가장 좋은 성적 등급
  bestFinish?: string; // 그 성적을 낸 대회의 실제 결과 (예: "인터하이 현 예선 C조 2위")
  trust?: number; // 교장의 신임 0~100 (목표 달성 여부에 따라 해마다 변한다)
  prospects?: Prospect[]; // 올해 눈여겨볼 중학 유망주 (우리 학교가 영입을 시도할 수 있는 후보)
  recruitTargets?: string[]; // 영입 목표로 정한 유망주의 선수 id
  staff?: Coach[]; // 우리 학교 코치진 (coach/staff.ts)
  coachPool?: Coach[]; // 올해 영입할 수 있는 코치 후보
  event?: CareerEvent; // 오늘 감독이 결정해야 하는 사건 (고르기 전에는 하루를 진행할 수 없다)
  lastEventDay?: number;
  lastEventKey?: EventKey;
  gameLog?: Record<string, GameLine[]>; // 우리 선수별 경기 기록 (재학 중인 선수만 남긴다)
  trend?: Record<string, TrendPoint[]>; // 우리 선수별 종합 능력치 변화
  forcedRest?: boolean; // 사건의 결과로 오늘 훈련이 휴식으로 바뀐다
  retired?: boolean; // 올해 내 팀의 경기가 모두 끝나 3학년이 은퇴했다 (졸업 때까지 팀 훈련에서 빠진다)
}

// 3학년의 마지막 경기: 올해 내 팀의 마지막 경기가 끝난 날, 은퇴하는 3학년을 돌아본다
export interface FarewellLine {
  id: string; name: string; pos: number; ovr: number;
  from?: { ovr: number; joined: boolean }; // 처음 봤을 때의 종합 능력치. joined: 내 임기 중에 입학했다 (아니면 부임 때의 값)
  games: number; pts: number; reb: number; ast: number; // 내 임기 중 공식전 출전 수와 경기당 평균
  best?: { pts: number; opponent: string; year: number }; // 가장 많이 득점한 공식전
}
export interface Farewell {
  year: number;
  final: boolean; // 임기 마지막 해
  finish: string | null; // 마지막 대회의 성적
  daysLeft: number; // 졸업식까지 남은 날
  players: FarewellLine[];
}

// 중학 유망주. level = 이 선수가 보통 진학할 학교의 수준 (우리 학교 수준이 이보다 낮을수록 데려오기 어렵다)
// 코치: 한 분야를 맡는다. 훈련 메뉴 여섯 가지와 트레이너·분석 코치
export type CoachRole = ProgramKeyTraining | 'trainer' | 'analyst';
type ProgramKeyTraining = 'shooting' | 'inside' | 'ballwork' | 'defense' | 'physical' | 'tactics';
export interface Coach { id: string; name: string; role: CoachRole; stars: number } // stars 1~5

export interface Prospect {
  player: Player;
  level: number;
}

// 연말 평가: 올해 목표를 이뤘는지와 그 결과
export interface YearReview {
  goal: string;
  best: string; // 올해 가장 좋았던 성적
  grade: number; // 2 초과 달성, 1 달성, -1 미달, -2 크게 미달
  verdict: string;
  prestigeBonus: number; // 평가에 따른 학교 수준 추가 변화
  trust: number; // 평가 뒤의 신임
}

// 다음 공식전 상대와 준비 상황
export interface PrepInfo {
  opponentId: string;
  opponent: string;
  label: string; // 어떤 경기인지 (예: 인터하이 현 예선 A조 2차전)
  daysUntil: number; // 0이면 오늘
  days: number; // 지금까지 분석한 날 수
  bonus: number; // 그 경기에서 받는 능력치 보너스 (분석한 날 수에 비례)
  canScout: boolean; // 오늘 분석할 수 있는지
  reachDays: number; // 경기 전까지 남은 훈련일을 모두 써도 채울 수 있는 분석 일수 (경기 간격이 짧으면 최대치보다 적다)
}

export interface UserMatchInfo {
  label: string;
  official: boolean;
  opponentId: string;
  opponent: string;
  opponentOverall: number;
  opener: boolean; // 대회 첫 경기
}

export interface Today {
  year: number;
  day: number;
  of: number;
  phase: string;
  type: DayType;
  camp: boolean;
  daysToNextMatch: number | null; // 0이면 오늘이 경기일. 남은 경기가 없으면 null
  daysToGraduation: number; // 졸업식까지 남은 날 (0이면 오늘)
  userTrains: boolean; // 공식전 날인데 내 팀 경기가 없으면(탈락) 훈련일이 된다
  userMatch: UserMatchInfo | null;
  prep: PrepInfo | null; // 다음 공식전 준비 상황 (상대가 정해지지 않았으면 null)
}

export interface YearSummary {
  year: number;
  final: boolean;
  results: CompetitionResult[];
  graduates: Player[];
  recruits: Player[];
  review?: YearReview;
  scouted?: string[]; // 신입생 중 영입 목표였던 선수 id
  stars?: string[]; // 신입생 중 특급 신입생(처음부터 능력치가 높은 선수)의 id
  starChance?: number; // 올해 성적으로 정해진, 신입생 한 명이 특급일 확률
  missed?: Player[]; // 영입 목표였지만 다른 학교로 간 유망주
  prestige?: [number, number]; // 우리 학교 수준 [올해, 내년]
  farewell?: Farewell; // 졸업생들이 내 임기 중에 남긴 기록
}

// 대회 대진 발표
export interface DrawInfo {
  competition: string;
  daysUntil: number; // 첫 경기까지 남은 날
  label: string; // 내 첫 경기 이름
  opponentId: string;
  opponent: string;
  group?: { name: string; teams: string[] }; // 조별 리그면 내 조
}

export interface DayReport {
  year: number;
  day: number;
  of: number;
  phase: string;
  type: DayType;
  round: Round | null;
  practice: Match | null;
  training: TrainingChoice | null;
  userBox: BoxTeam[] | null;
  moments?: string[]; // 내 팀 경기의 승부처 요약 (중계 기록이 있을 때만)
  growth: GrowthEvent[];
  injuries: InjuryEvent[];
  competitionEnd: CompetitionResult | null;
  scout: PrepInfo | null; // 오늘 상대 분석을 했으면 그 결과
  draw?: DrawInfo; // 오늘 일과 뒤에 다음 대회의 대진이 발표됐으면 그 내용
  yearEnd: YearSummary | null;
  farewell?: Farewell; // 오늘로 올해 내 팀의 경기가 모두 끝나 3학년이 은퇴했다
}

// ---------- 데이터 파일 ----------

export interface LocalName {
  kr: string;
  jp: string;
}

export interface PlayerSpec {
  name: LocalName;
  pos: number;
  year: number;
  level: number;
  potential: number;
  consistency: number;
  tweaks: Partial<Ratings>;
}

export interface SchoolSpec {
  name: LocalName;
  prestige: number;
  players: PlayerSpec[];
  benchLevel?: number;
  prefecture?: string; // 없으면 데이터의 기본 현 (Dataset.prefecture)
  draw?: number; // 전국 대회 대진표의 추첨 번호 (Dataset.draw 참고)
}

export interface Dataset {
  prefecture: string;
  schools: SchoolSpec[];
  nationals: SchoolSpec[];
  // 인터하이 본선의 고정 대진표. size 참가 학교 수, byes 1회전을 쉬는 번호. 각 학교의 자리는 SchoolSpec.draw
  draw?: { size: number; byes: number[] };
  regions?: RegionSpec[]; // prefecture 말고도 내 학교를 고를 수 있는 현
}

// 내가 맡을 수 있는 현 하나: 현 예선에 나오는 16개교
export interface RegionSpec {
  prefecture: string;
  schools: SchoolSpec[];
}
