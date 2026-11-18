// 받은 소식: 하루 결과(DayReport)를 감독에게 오는 메시지 여러 통으로 나눈다.
// 메시지는 화면에만 쓰이고 따로 저장되므로, 나중에 팀이 사라져도 읽을 수 있게 이름을 미리 풀어 둔다.
import { overall } from '@/game/match/engine';
import { scoutReport } from '@/game/coach/scouting';
import { reviewMatch } from '@/game/match/review';
import type { ScoutSection } from '@/game/coach/scouting';
import { PROGRAMS, INTENSITY, teamOverall } from '@/game/team/school';
import { PREPARATION, RECRUITING, SEASON, prospectsOf, recruitChance, seasonGoal, today } from '@/game/career/season';
import type { BoxTeam, Career, CompetitionResult, DayReport, GrowthEvent, InjuryEvent, YearReview } from '@/game/types';

export type MessageKind = 'welcome' | 'match' | 'training' | 'round' | 'competition' | 'injury' | 'season' | 'scout' | 'event';

export interface MatchLine {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  overtime: boolean;
  mine: boolean;
  homeId?: string; // 화면에서 바로 만든 줄에만 있다 (받은 소식에 저장된 줄에는 없다)
  awayId?: string;
}

export interface PlayerNote {
  name: string;
  pos: number;
  ovr: number;
  potential?: number;
  scouted?: boolean; // 영입 목표로 정해 데려온 신입생
  star?: boolean; // 특급 신입생
}

export interface Message {
  id: number;
  year: number;
  day: number;
  phase: string;
  kind: MessageKind;
  from: string;
  title: string;
  summary: string;
  unread: boolean;
  box?: BoxTeam[];
  review?: string[]; // 코치 총평
  moments?: string[]; // 승부처 요약
  yearReview?: YearReview; // 연말 평가
  prestige?: [number, number]; // 학교 수준 [올해, 내년]
  won?: boolean;
  official?: boolean;
  growth?: GrowthEvent[];
  injuries?: InjuryEvent[];
  round?: { name: string; matches: MatchLine[] };
  competition?: CompetitionResult;
  graduates?: PlayerNote[];
  recruits?: PlayerNote[];
  missed?: PlayerNote[]; // 영입 목표였지만 놓친 유망주
  starChance?: number; // 올해 성적으로 정해진 특급 신입생 확률 (신입생 한 명당)
  final?: boolean;
  results?: CompetitionResult[];
  body?: string[];
  days?: number; // 훈련 보고: 이 보고에 묶인 훈련 일수
  programs?: Record<string, number>; // 훈련 보고: 메뉴별 일수
  scout?: { opponent: string; label: string; days: number; bonus: number; players: PlayerNote[]; tactics: string; hints: string[]; sections?: ScoutSection[]; more?: boolean }; // hints: 예전 저장에 남은 코치 메모
}

export type MessageDraft = Omit<Message, 'id' | 'unread'>;

// 하루를 진행하기 전에 잡아 둔다. 진행 중에 다른 현 대표 학교가 정리될 수 있다.
export const teamNames = (career: Career): Record<string, string> =>
  Object.fromEntries(Object.values(career.teams).map((t) => [t.id, t.name]));

const RECRUIT_REMINDER = 14; // 학년 종료 며칠 전에 영입 목표를 상기시킬지

export function welcomeMessage(career: Career): MessageDraft {
  const team = career.teams[career.userTeamId];
  const d = today(career);
  return {
    year: d?.year ?? 1, day: d?.day ?? 1, phase: d?.phase ?? '',
    kind: 'welcome', from: '교장',
    title: `${team.name} 농구부 감독 부임을 환영합니다`,
    summary: `${career.prefecture}에서 3년 동안 팀을 이끌어 주세요.`,
    body: [
      `${team.name} 농구부를 맡아 주셔서 감사합니다. 학교의 기대 수준은 ${team.prestige}입니다.`,
      '매일 훈련 메뉴를 정하고, 경기 날에는 벤치에서 직접 지휘하거나 코치진에게 맡길 수 있습니다.',
      '한 해에 인터하이, 국민체육대회, 윈터컵 세 대회가 열립니다.',
      `올해 목표는 "${seasonGoal(career).label}"입니다. ${seasonGoal(career).times > 1 ? '한 번의 호성적으로는 부족하고, 세 대회 중 두 번은 이 성적을 내야 합니다.' : '세 대회 중 한 번이라도 이루면 됩니다.'} 연말에 달성 여부에 따라 학교의 지원(학교 수준)이 달라지고, 학교 수준은 신입생의 질을 좌우합니다.`,
    ],
  };
}

// 올해의 중학 유망주 명단이 나왔다는 안내 (부임 첫날과 새 학년 첫날)
export function recruitMessage(career: Career): MessageDraft {
  const d = today(career);
  const best = [...prospectsOf(career)].sort((a, b) => overall(b.player) - overall(a.player))[0];
  return {
    year: d?.year ?? career.year, day: d?.day ?? 1, phase: d?.phase ?? '',
    kind: 'welcome', from: '코치진',
    title: '올해의 중학 유망주 명단이 나왔습니다',
    summary: `선수단 › 신입생 스카우트에서 영입 목표를 ${RECRUITING.maxTargets}명까지 정하세요.`,
    body: [
      `내년에 입학할 중학 유망주 ${prospectsOf(career).length}명을 추렸습니다. 이 중 ${RECRUITING.maxTargets}명까지 영입 목표로 정할 수 있습니다.`,
      best ? `가장 눈에 띄는 선수는 ${best.player.name}(종합 ${overall(best.player)})이고, 지금 우리 학교로 올 가능성은 ${Math.round(recruitChance(career, best) * 100)}%입니다.` : '',
      '학교 수준이 높고 교장의 신임이 클수록 잘 옵니다. 결과는 학년이 바뀔 때 나오고, 목표로 정하지 않은 자리는 코치가 부족한 포지션 위주로 채웁니다.',
      '선수단 화면의 "신입생 스카우트" 탭이나 홈의 팀 상태에서 정할 수 있습니다.',
    ].filter(Boolean),
  };
}

export function buildMessages(
  career: Career,
  r: DayReport,
  names: Record<string, string>,
  { training = true }: { training?: boolean } = {},
): MessageDraft[] {
  const when = { year: r.year, day: r.day, phase: r.phase };
  const me = career.userTeamId;
  const nameOf = (id: string) => career.teams[id]?.name ?? names[id] ?? '?';
  const out: MessageDraft[] = [];

  if (r.userBox) {
    const mine = r.userBox.find((t) => t.id === me);
    const opp = r.userBox.find((t) => t.id !== me);
    if (mine && opp) {
      const won = mine.score > opp.score;
      const official = r.type === 'official';
      const top = mine.players.reduce((a, b) => (b.pts > a.pts ? b : a));
      out.push({
        ...when, kind: 'match', from: '코치진',
        title: `${won ? '승리' : '패배'} · ${mine.name} ${mine.score} : ${opp.score} ${opp.name}`,
        summary: `${official ? r.round?.name ?? '공식전' : '연습 경기'} · 최다 득점 ${top.name} ${top.pts}점`,
        box: r.userBox, won, official,
        moments: r.moments,
        review: reviewMatch(mine, opp, career.teams[me].tactics, career.teams[opp.id ?? ''] ? [teamOverall(career.teams[me]), teamOverall(career.teams[opp.id!])] : undefined),
        growth: r.training ? undefined : r.growth, // 경기한 날은 훈련 대신 경기 경험으로 성장한다
      });
    }
  }

  if (r.scout) {
    const sc = r.scout;
    const opp = career.teams[sc.opponentId];
    // 오늘 분석을 마친 뒤 경기 전까지 남은 훈련일 (오늘 포함 daysUntil일 중 하루를 썼다)
    const daysLeft = Math.max(0, sc.daysUntil - 1);
    const reach = Math.min(PREPARATION.maxDays, sc.days + daysLeft);
    // 날마다 그때까지 알아낸 내용을 모두 담은 보고서를 다시 보낸다 (가장 최근 것만 보면 된다)
    out.push({
      ...when, kind: 'scout', from: '코치진',
      title: `상대 분석 보고서: ${sc.opponent} (${sc.days}/${reach}일)`,
      summary: `${sc.label} · 그 경기 능력치 +${sc.bonus.toFixed(1)}`,
      scout: {
        opponent: sc.opponent, label: sc.label, days: sc.days, bonus: sc.bonus, hints: [], more: sc.days < reach,
        ...(opp ? scoutReport(opp, sc.days) : { players: [], tactics: '', sections: [] }),
      },
    });
  }

  if (r.draw) {
    const w = r.draw;
    out.push({
      ...when, kind: 'welcome', from: '대회 운영',
      title: `${w.competition} 현 예선 대진 발표: 첫 상대 ${w.opponent}`,
      summary: `${w.daysUntil}일 뒤 ${w.label}`,
      body: [
        `${w.competition} 현 예선 대진이 나왔습니다. 우리 학교의 첫 경기는 ${w.daysUntil}일 뒤 ${w.label}, 상대는 ${w.opponent}입니다.`,
        w.group ? `${w.group.name}: ${w.group.teams.join(', ')}. 조 1위만 다음 단계로 올라갑니다.` : '지면 바로 탈락하는 토너먼트입니다.',
        `경기 전 ${PREPARATION.window}일 안의 훈련일에 훈련 대신 상대 분석을 할 수 있습니다. 대회 화면에서 전체 대진을 볼 수 있습니다.`,
      ],
    });
  }

  if (training && r.training && r.training.program !== 'scout') {
    const { program, intensity } = r.training;
    const label = program === 'rest' ? '휴식' : `${PROGRAMS[program].label} · ${INTENSITY[intensity].label}`;
    out.push({
      ...when, kind: 'training', from: '코치진',
      title: `훈련 보고: ${label}`,
      summary: milestones(r.growth) || (r.growth.length ? `능력치 상승 ${r.growth.length}건` : '눈에 띄는 변화 없음'),
      growth: r.growth, days: 1, programs: { [label]: 1 },
    });
  }

  if (r.round) {
    const matches = r.round.matches.map((m) => ({
      home: nameOf(m.home), away: nameOf(m.away), homeScore: m.homeScore, awayScore: m.awayScore,
      overtime: m.overtime, mine: m.home === me || m.away === me,
    }));
    const mine = r.round.matches.find((m) => m.home === me || m.away === me);
    out.push({
      ...when, kind: 'round', from: '대회 운영',
      title: r.round.name,
      summary: mine ? `우리 학교 ${mine.winner === me ? '승리' : '패배'} · 전체 ${matches.length}경기` : `${matches.length}경기 결과`,
      round: { name: r.round.name, matches },
    });
  }

  if (r.competitionEnd) {
    const c = r.competitionEnd;
    out.push({
      ...when, kind: 'competition', from: '대회 운영',
      title: `${c.name} 종료 · 우승 ${c.champion}`,
      summary: `우리 학교: ${c.userFinish}`,
      competition: c,
    });
  }

  if (r.injuries.length) {
    out.push({
      ...when, kind: 'injury', from: '의료진',
      title: `부상 보고: ${r.injuries.map((i) => i.name).join(', ')}`,
      summary: r.injuries.map((i) => `${i.name} ${i.days}일 결장`).join(' · '),
      injuries: r.injuries,
    });
  }

  // 학년이 끝나기 2주 전인데 영입 목표가 비어 있으면 한 번 알려 준다
  const left = career.calendar.length - career.dayIndex;
  if (!r.yearEnd && left === RECRUIT_REMINDER && career.year < SEASON.campaignYears && (career.recruitTargets?.length ?? 0) < RECRUITING.maxTargets) {
    const n = career.recruitTargets?.length ?? 0;
    out.push({
      ...when, kind: 'welcome', from: '코치진',
      title: `신입생 영입 목표가 ${n ? '한 자리 비어' : '비어'} 있습니다`,
      summary: `학년이 ${left}일 뒤에 끝납니다. 영입 목표 ${n}/${RECRUITING.maxTargets}명`,
      body: [
        `학년이 ${left}일 뒤에 끝나는데 영입 목표가 ${n}/${RECRUITING.maxTargets}명입니다. 정하지 않은 자리는 코치가 부족한 포지션 위주로 채웁니다.`,
        '선수단 화면의 "신입생 스카우트" 탭에서 정할 수 있습니다.',
      ],
    });
  }

  if (r.yearEnd) {
    const y = r.yearEnd;
    if (y.final) {
      out.push({
        ...when, kind: 'season', from: '교장',
        title: '3년의 임기를 마쳤습니다',
        summary: '그동안 수고 많으셨습니다. 지난 3년의 기록을 확인해 보세요.',
        final: true, results: career.results, yearReview: y.review,
      });
    } else {
      out.push({
        ...when, kind: 'season', from: '교장',
        title: `${y.year}년차 종료 — 새 학년이 시작됩니다`,
        summary: `졸업 ${y.graduates.length}명 · 신입생 ${y.recruits.length}명${y.scouted?.length || y.missed?.length ? ` · 영입 목표 ${y.scouted?.length ?? 0}명 성공` : ''}`,
        graduates: y.graduates.map((p) => ({ name: p.name, pos: p.pos, ovr: overall(p) })),
        recruits: y.recruits.map((p) => ({ name: p.name, pos: p.pos, ovr: overall(p), potential: p.potential, scouted: y.scouted?.includes(p.id), star: y.stars?.includes(p.id) })),
        starChance: y.starChance,
        missed: y.missed?.map((p) => ({ name: p.name, pos: p.pos, ovr: overall(p), potential: p.potential })),
        results: y.results, yearReview: y.review, prestige: y.prestige,
      });
      if (career.year < SEASON.campaignYears) out.push(recruitMessage(career));
      out.push({
        ...when, kind: 'season', from: '교장',
        title: `${y.year + 1}년차 목표: ${seasonGoal(career).label}`,
        summary: seasonGoal(career).times > 1 ? '세 대회 중 두 번 이상 이뤄야 달성입니다.' : '세 대회 중 한 번이라도 이루면 달성입니다.',
        body: [
          `새 학년의 목표는 "${seasonGoal(career).label}"입니다. 지금 선수단의 전력과 학교 수준(${career.teams[me].prestige})을 현 내 다른 학교와 견주어 정했습니다.`,
          `인터하이, 국민체육대회, 윈터컵 중 ${seasonGoal(career).times > 1 ? '두 번 이상' : '한 번이라도'} 이 성적에 닿으면 됩니다. 연말에 달성 여부로 학교의 지원과 신임이 달라집니다.`,
        ],
      });
    }
  }
  return out;
}

// 눈에 띄는 성장: 능력치가 10 단위 고비(60, 70, 80...)를 넘은 것만 추린다
export function milestones(growth: GrowthEvent[]) {
  const hit = growth.filter((g) => g.to >= 60 && g.to % 10 === 0);
  return hit.slice(0, 2).map((g) => `${g.name} ${g.label} ${g.to} 돌파`).join(' · ') + (hit.length > 2 ? ` 외 ${hit.length - 2}건` : '');
}

// ---------- 받은 소식 정리 ----------
// 소식이 날마다 한 통씩 쌓이지 않도록, 새 소식을 넣기 전에 묶거나 바꿔치기할 이전 소식을 찾는다.
const weekOf = (day: number) => Math.ceil(day / 7);

// 새 소식 d가 대신할 이전 소식 (없으면 null)
export function supersedes(inbox: Message[], d: MessageDraft): Message | null {
  // 훈련 보고는 주 단위로 한 통에 모은다 (직접 지시한 훈련만. AI 코치 보고는 이미 묶여 있다)
  if (d.kind === 'training' && d.days === 1) {
    return inbox.find((m) => m.kind === 'training' && m.programs && m.year === d.year && weekOf(m.day) === weekOf(d.day)) ?? null;
  }
  // 상대 분석 보고서는 같은 상대의 최신판만 남긴다
  if (d.kind === 'scout' && d.scout) {
    return inbox.find((m) => m.kind === 'scout' && m.year === d.year && m.scout?.opponent === d.scout!.opponent && m.scout.label === d.scout!.label) ?? null;
  }
  return null;
}

// 이전 훈련 보고에 오늘 훈련을 더한다
export function mergeTraining(old: Message, d: MessageDraft): MessageDraft {
  const programs = { ...old.programs };
  for (const [label, n] of Object.entries(d.programs ?? {})) programs[label] = (programs[label] ?? 0) + n;
  const days = (old.days ?? 1) + (d.days ?? 1);
  const all = [...(old.growth ?? []), ...(d.growth ?? [])];
  const growth = all.filter((g, i) => !all.some((x, j) => j > i && x.id === g.id && x.key === g.key)); // 같은 능력치가 또 올랐으면 최근 값만
  const menu = Object.entries(programs).sort((a, b) => b[1] - a[1]).map(([label, n]) => `${label} ${n}일`).join(', ');
  return {
    ...d,
    title: `주간 훈련 보고: ${weekOf(d.day)}주차 (${days}일)`,
    summary: `${milestones(growth) || (growth.length ? `능력치 상승 ${growth.length}건` : '눈에 띄는 변화 없음')} · ${menu}`,
    growth, days, programs,
  };
}

// 우리 학교와 상관없는 참고용 소식은 읽지 않은 소식으로 세지 않는다
export const quiet = (d: MessageDraft) => d.kind === 'round' && !d.round?.matches.some((m) => m.mine);

// AI 코치에게 여러 날을 맡겼을 때의 훈련 요약
export function trainingDigest(last: DayReport, days: number, growth: GrowthEvent[]): MessageDraft {
  return {
    year: last.year, day: last.day, phase: last.phase,
    kind: 'training', from: 'AI 코치',
    title: `AI 코치 훈련 보고 (${days}일)`,
    summary: milestones(growth) || (growth.length ? `능력치 상승 ${growth.length}건` : '눈에 띄는 변화 없음'),
    growth,
  };
}
