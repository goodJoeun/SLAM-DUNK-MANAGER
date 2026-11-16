// 코치의 상대 분석 보고서: 상대가 어떤 팀인지 알려 줄 뿐, 어떻게 싸울지는 감독이 정한다.
// 분석한 날이 늘수록 더 깊은 내용이 나온다 (1일: 주요 선수·전술, 2일: 팀의 강점과 약점, 3일: 선수별 성향과 벤치).
// 준비 보너스는 분석한 날 수에만 달려 있다 (season.ts).
import { composites, overall } from './engine.ts';
import type { Composites, Defense, Focus, Player, Team } from './types.ts';

export interface ScoutSection { title: string; lines: string[] }
export interface ScoutReport {
  players: { name: string; pos: number; ovr: number }[];
  tactics: string;
  sections: ScoutSection[];
}

const FOCUS_NAME: Record<Focus, string> = { balanced: '균형', inside: '골밑 중심', outside: '외곽 중심', spread: '5아웃' };
const DEFENSE_NAME: Record<Defense, string> = { man: '맨투맨', zone: '존', press: '프레스', switch: '스위치', drop: '드롭' };
const SHOT_NAME = { rim: '돌파와 골밑 마무리', post: '포스트업', mid: '미들슛', three: '3점슛' } as const;

// 합성 능력치(0~1)를 현 내 고교 기준의 말로 옮긴다
const grade = (x: number) => (x >= 0.66 ? '매우 강함' : x >= 0.57 ? '강함' : x >= 0.48 ? '보통' : x >= 0.4 ? '약함' : '매우 약함');

export function scoutReport(team: Team, days: number): ScoutReport {
  const starters = team.players.slice(0, 5);
  const cs = starters.map(composites);
  const avg = (f: (c: Composites) => number) => cs.reduce((s, c) => s + f(c), 0) / cs.length;
  const t = team.tactics;
  const pace = (t.pace ?? 0) > 0.25 ? '빠른 템포' : (t.pace ?? 0) < -0.25 ? '느린 템포' : '보통 템포';
  const report: ScoutReport = {
    players: [...team.players].sort((a, b) => overall(b) - overall(a)).slice(0, 3).map((p) => ({ name: p.name, pos: p.pos, ovr: overall(p) })),
    tactics: `${FOCUS_NAME[t.focus ?? 'balanced']} 공격 · ${DEFENSE_NAME[t.defense ?? 'man']} 수비 · ${pace}`,
    sections: [],
  };

  if (days >= 2) {
    const inside = avg((c) => c.defInterior);
    const perimeter = avg((c) => c.defPerimeter);
    const lines = [
      `골밑 공격 ${grade(avg((c) => Math.max(c.rim, c.post)))} · 외곽슛 ${grade(avg((c) => c.three))}`,
      `골밑 수비 ${grade(inside)} · 외곽 수비 ${grade(perimeter)}`,
      `볼 핸들링 ${grade(avg((c) => c.ballHandling))} · 리바운드 ${grade(avg((c) => c.rebounding))} · 체력 ${grade(avg((c) => c.endurance))}`,
    ];
    if (Math.abs(inside - perimeter) > 0.02) lines.push(inside > perimeter ? '수비는 골밑이 외곽보다 단단합니다.' : '수비는 외곽이 골밑보다 단단합니다.');
    else lines.push('수비는 안팎이 고릅니다.');
    report.sections.push({ title: '선발 다섯 명의 강점과 약점', lines });
  }

  if (days >= 3) {
    const usage = (p: Player) => composites(p).usage;
    const ace = starters.reduce((a, b) => (usage(b) > usage(a) ? b : a));
    const c = composites(ace);
    const shots = (['rim', 'post', 'mid', 'three'] as const).slice().sort((a, b) => c[b] - c[a]);
    const share = usage(ace) ** 3 / starters.reduce((s, p) => s + usage(p) ** 3, 0);
    const startersOvr = starters.reduce((s, p) => s + overall(p), 0) / starters.length;
    const bench = team.players.slice(5, 9);
    const benchOvr = bench.length ? bench.reduce((s, p) => s + overall(p), 0) / bench.length : 0;
    const weakest = starters.reduce((a, b) => (overall(b) < overall(a) ? b : a));
    report.sections.push({
      title: '선수별 성향과 벤치',
      lines: [
        `공격은 ${ace.name}(종합 ${overall(ace)})에게 가장 많이 갑니다 — 팀 슛의 약 ${Math.round(share * 100)}%. 주로 ${SHOT_NAME[shots[0]]}, 그다음 ${SHOT_NAME[shots[1]]}으로 득점합니다.`,
        `선발 중 가장 약한 자리는 ${weakest.name}(종합 ${overall(weakest)})입니다.`,
        `선발 평균 종합 ${Math.round(startersOvr)} · 벤치 평균 ${Math.round(benchOvr)}${startersOvr - benchOvr >= 10 ? ' — 주전 의존도가 높아 주전이 지치거나 파울에 걸리면 전력이 크게 떨어집니다.' : ' — 벤치가 두터워 교체해도 전력이 덜 떨어집니다.'}`,
      ],
    });
  }
  return report;
}
