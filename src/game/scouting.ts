// 코치의 상대 분석 보고서: 상대가 어떤 팀인지 알려 주고, 그 약점이 어떤 전술과 맞물리는지 실마리를 준다.
// 실마리는 엔진이 실제로 계산하는 상성만 적는다. 무엇을 고를지는 감독이 정한다 (전술 화면의 모의 경기 조언 참고).
// 분석한 날이 늘수록 더 깊은 내용이 나온다 (1일: 주요 선수·전술, 2일: 팀의 강점과 약점과 대응 실마리, 3일: 선수별 성향과 벤치).
// 준비 보너스는 분석한 날 수에만 달려 있다 (season.ts).
import { TUNING, composites, overall } from './engine.ts';
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
    // 엔진의 '허술한 쪽' 계산과 같은 기준 (soft > 0이면 골밑이 상대적으로 허술하다)
    const soft = perimeter - inside - TUNING.softPivot;
    if (Math.abs(soft) > 0.008) lines.push(soft < 0 ? '수비는 골밑이 외곽보다 단단합니다.' : '수비는 외곽이 골밑보다 단단합니다.');
    else lines.push('수비는 안팎이 고릅니다.');
    report.sections.push({ title: '선발 다섯 명의 강점과 약점', lines });

    // 대응 실마리: 위의 강약점이 엔진에서 어떤 전술과 맞물리는지 (경계값은 grade의 '강함'·'약함'과 같다)
    const STRONG = 0.57;
    const WEAK = 0.48;
    const three = avg((c) => c.three);
    const handling = avg((c) => c.ballHandling);
    const endurance = avg((c) => c.endurance);
    const clues: string[] = [];
    if (Math.abs(soft) > 0.008) {
      const much = Math.abs(soft) > 0.02 ? '훨씬 ' : '';
      clues.push(soft < 0
        ? `외곽 수비가 ${much}더 헐겁습니다. 전력이 앞선 상대라도 외곽 중심·5아웃 공격으로 그쪽을 노리면 슛이 더 잘 들어갑니다. 반대로 골밑 중심은 손해입니다.`
        : `골밑 수비가 ${much}더 헐겁습니다. 전력이 앞선 상대라도 골밑 중심 공격으로 그쪽을 노리면 슛이 더 잘 들어갑니다. 반대로 외곽 중심·5아웃은 손해입니다.`);
    } else {
      clues.push('수비에 허술한 쪽이 따로 없어, 한쪽으로 모는 공격은 읽히기만 합니다. 균형 공격이 무난합니다.');
    }
    if (three < WEAK) clues.push('외곽슛이 약해 존 수비로 골밑을 잠가도 내줄 것이 적습니다.');
    else if (three >= STRONG) clues.push('슈터가 좋아 존 수비는 위험합니다. 외곽을 내주지 않는 수비가 낫습니다.');
    if (handling < WEAK) clues.push('볼 핸들링이 약해 프레스에 실책이 많이 나옵니다. 대신 우리 체력과 파울 부담이 커집니다.');
    else if (handling >= STRONG) clues.push('볼 핸들링이 좋아 프레스는 잘 뚫립니다.');
    if (endurance < WEAK) clues.push('체력이 약한 팀입니다. 빠른 템포로 지치게 하면 후반에 우리 속공이 살아납니다.');
    clues.push('분석한 날이 많을수록 허술한 쪽을 노리는 공격과 집중 마크가 더 잘 통합니다.');
    report.sections.push({ title: '대응 실마리', lines: clues });
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
        share >= 0.3 ? `${ace.name}에게 공격이 몰리는 팀입니다. 집중 마크로 묶으면 팀 전체의 득점이 크게 줄어듭니다.` : `공격이 여러 선수에게 나뉘어 있어 ${ace.name} 한 명을 집중 마크해도 효과가 크지 않습니다.`,
        `선발 중 가장 약한 자리는 ${weakest.name}(종합 ${overall(weakest)})입니다.`,
        `선발 평균 종합 ${Math.round(startersOvr)} · 벤치 평균 ${Math.round(benchOvr)}${startersOvr - benchOvr >= 10 ? ' — 주전 의존도가 높아 주전이 지치거나 파울에 걸리면 전력이 크게 떨어집니다.' : ' — 벤치가 두터워 교체해도 전력이 덜 떨어집니다.'}`,
      ],
    });
  }
  return report;
}
