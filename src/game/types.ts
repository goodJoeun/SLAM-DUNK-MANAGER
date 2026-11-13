// 엔진·시즌·화면이 함께 쓰는 데이터 모양.
// 커리어(Career)는 JSON으로 그대로 저장되므로, 여기 타입을 바꾸면 기존 세이브와의 호환도 함께 따져야 한다.

// ---------- 선수·팀 ----------

export type RatingKey =
  | 'hgt' | 'str' | 'spd' | 'jmp' | 'end' | 'ins' | 'dnk' | 'ft'
  | 'mid' | 'tp' | 'oiq' | 'diq' | 'drb' | 'pss' | 'reb';
export type Ratings = Record<RatingKey, number>;

export type ProgramKey = 'shooting' | 'inside' | 'ballwork' | 'defense' | 'physical' | 'tactics' | 'rest';
export type IntensityKey = 'light' | 'normal' | 'hard';
export type NameStyle = 'kr' | 'jp';

export type Focus = 'balanced' | 'inside' | 'outside';
export type Defense = 'man' | 'zone' | 'press';

export interface Tactics {
  pace: number;
  focus: Focus;
  defense: Defense;
  keyPlayerId: string | null; // 에이스 지정
  denyPlayerId: string | null; // 집중 마크
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
}

export interface Team {
  id: string;
  name: string;
  prestige: number;
  players: Player[];
  tactics: Partial<Tactics>;
}

// 경기 엔진의 입력. Team은 그대로 넣을 수 있고, 임시 생성 팀(generateTeam)은 id 없이도 된다.
export interface EnginePlayer extends BasePlayer {
  hidden?: { consistency: number };
  condition?: number;
  injuredDays?: number;
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
}

export interface YearSummary {
  year: number;
  final: boolean;
  results: CompetitionResult[];
  graduates: Player[];
  recruits: Player[];
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
