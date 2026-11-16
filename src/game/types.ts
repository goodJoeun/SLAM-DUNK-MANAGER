// 엔진·시즌·화면이 함께 쓰는 데이터 모양.
// 커리어(Career)는 JSON으로 그대로 저장되므로, 여기 타입을 바꾸면 기존 세이브와의 호환도 함께 따져야 한다.

// ---------- 선수·팀 ----------

export type RatingKey =
  | 'hgt' | 'str' | 'spd' | 'jmp' | 'end' | 'ins' | 'dnk' | 'ft'
  | 'mid' | 'tp' | 'oiq' | 'diq' | 'drb' | 'pss' | 'reb';
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

export type DayType = 'training' | 'practice' | 'official';
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
  bracket: string[];
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
}
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
  yearPoints: Record<string, number>; // 학교별 올해 대회 성적 점수
  calendar: CalendarDay[];
  dayIndex: number;
  prep?: Record<string, number>; // 다음 공식전 상대별 분석 일수 (대회가 바뀌면 비운다)
  goal?: { tier: number }; // 교장이 정한 올해 목표 (대회 성적 등급). 세 대회 중 한 번이라도 이루면 달성
  bestTier?: number; // 올해 끝난 대회 중 우리 학교의 가장 좋은 성적 등급
  trust?: number; // 교장의 신임 0~100 (목표 달성 여부에 따라 해마다 변한다)
  prospects?: Prospect[]; // 올해 눈여겨볼 중학 유망주 (우리 학교가 영입을 시도할 수 있는 후보)
  recruitTargets?: string[]; // 영입 목표로 정한 유망주의 선수 id
  event?: CareerEvent; // 오늘 감독이 결정해야 하는 사건 (고르기 전에는 하루를 진행할 수 없다)
  lastEventDay?: number;
  lastEventKey?: EventKey;
  forcedRest?: boolean; // 사건의 결과로 오늘 훈련이 휴식으로 바뀐다
}

// 중학 유망주. level = 이 선수가 보통 진학할 학교의 수준 (우리 학교 수준이 이보다 낮을수록 데려오기 어렵다)
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
}

export interface UserMatchInfo {
  label: string;
  official: boolean;
  opponentId: string;
  opponent: string;
  opponentOverall: number;
}

export interface Today {
  year: number;
  day: number;
  of: number;
  phase: string;
  type: DayType;
  camp: boolean;
  daysToNextMatch: number | null; // 0이면 오늘이 경기일. 남은 경기가 없으면 null
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
  missed?: Player[]; // 영입 목표였지만 다른 학교로 간 유망주
  prestige?: [number, number]; // 우리 학교 수준 [올해, 내년]
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
  growth: GrowthEvent[];
  injuries: InjuryEvent[];
  competitionEnd: CompetitionResult | null;
  scout: PrepInfo | null; // 오늘 상대 분석을 했으면 그 결과
  yearEnd: YearSummary | null;
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
  prefecture?: string;
}

export interface Dataset {
  prefecture: string;
  schools: SchoolSpec[];
  nationals: SchoolSpec[];
}
