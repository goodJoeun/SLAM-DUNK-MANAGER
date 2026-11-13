// 받은 소식: 하루 결과(DayReport)를 감독에게 오는 메시지 여러 통으로 나눈다.
// 메시지는 화면에만 쓰이고 따로 저장되므로, 나중에 팀이 사라져도 읽을 수 있게 이름을 미리 풀어 둔다.
import { overall } from '@/game/engine';
import { PROGRAMS, INTENSITY } from '@/game/school';
import { today } from '@/game/season';
import type { BoxTeam, Career, CompetitionResult, DayReport, GrowthEvent, InjuryEvent } from '@/game/types';

export type MessageKind = 'welcome' | 'match' | 'training' | 'round' | 'competition' | 'injury' | 'season';

export interface MatchLine {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  overtime: boolean;
  mine: boolean;
}

export interface PlayerNote {
  name: string;
  pos: number;
  ovr: number;
  potential?: number;
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
  won?: boolean;
  official?: boolean;
  growth?: GrowthEvent[];
  injuries?: InjuryEvent[];
  round?: { name: string; matches: MatchLine[] };
  competition?: CompetitionResult;
  graduates?: PlayerNote[];
  recruits?: PlayerNote[];
  final?: boolean;
  results?: CompetitionResult[];
  body?: string[];
}

export type MessageDraft = Omit<Message, 'id' | 'unread'>;

// 하루를 진행하기 전에 잡아 둔다. 진행 중에 다른 현 대표 학교가 정리될 수 있다.
export const teamNames = (career: Career): Record<string, string> =>
  Object.fromEntries(Object.values(career.teams).map((t) => [t.id, t.name]));

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
      '한 해에 인터하이, 국민체육대회, 윈터컵 세 대회가 열립니다. 현 예선을 통과해 전국 무대에 서 주십시오.',
    ],
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
        growth: r.training ? undefined : r.growth, // 경기한 날은 훈련 대신 경기 경험으로 성장한다
      });
    }
  }

  if (training && r.training) {
    const { program, intensity } = r.training;
    const label = program === 'rest' ? '휴식' : `${PROGRAMS[program].label} · ${INTENSITY[intensity].label}`;
    out.push({
      ...when, kind: 'training', from: '코치진',
      title: `훈련 보고: ${label}`,
      summary: r.growth.length ? `능력치 상승 ${r.growth.length}건` : '눈에 띄는 변화 없음',
      growth: r.growth,
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

  if (r.yearEnd) {
    const y = r.yearEnd;
    if (y.final) {
      out.push({
        ...when, kind: 'season', from: '교장',
        title: '3년의 임기를 마쳤습니다',
        summary: '그동안 수고 많으셨습니다. 지난 3년의 기록을 확인해 보세요.',
        final: true, results: career.results,
      });
    } else {
      out.push({
        ...when, kind: 'season', from: '교장',
        title: `${y.year}년차 종료 — 새 학년이 시작됩니다`,
        summary: `졸업 ${y.graduates.length}명 · 신입생 ${y.recruits.length}명`,
        graduates: y.graduates.map((p) => ({ name: p.name, pos: p.pos, ovr: overall(p) })),
        recruits: y.recruits.map((p) => ({ name: p.name, pos: p.pos, ovr: overall(p), potential: p.potential })),
        results: y.results,
      });
    }
  }
  return out;
}

// AI 코치에게 여러 날을 맡겼을 때의 훈련 요약
export function trainingDigest(last: DayReport, days: number, growth: GrowthEvent[]): MessageDraft {
  return {
    year: last.year, day: last.day, phase: last.phase,
    kind: 'training', from: 'AI 코치',
    title: `AI 코치 훈련 보고 (${days}일)`,
    summary: growth.length ? `능력치 상승 ${growth.length}건` : '눈에 띄는 변화 없음',
    growth,
  };
}
