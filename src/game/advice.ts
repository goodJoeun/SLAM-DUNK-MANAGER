// 코치의 전술 조언: 상대와 모의 경기를 돌려 보고 가장 잘 통한 전술을 권한다.
// 모의 경기 수가 적으면 조언이 빗나갈 수 있고, 상대를 분석한 날이 늘수록 더 많이 돌려 보므로 정확해진다.
import { simulateGame } from './engine.ts';
import type { Defense, Focus, Tactics, Team } from './types.ts';

export const ADVICE = { baseGames: 24, gamesPerScoutDay: 24 };

export interface TacticsAdvice {
  focus: Focus;
  defense: Defense;
  pace: number;
  games: number; // 선택지 하나당 돌려 본 모의 경기 수
}

const FOCUSES: Focus[] = ['balanced', 'inside', 'outside', 'spread'];
const DEFENSES: Defense[] = ['man', 'zone', 'press', 'switch', 'drop'];

// 공격 -> 수비 -> 템포 순으로 하나씩 정한다 (앞에서 고른 것은 그대로 두고 다음 것을 비교).
// 같은 시드 묶음으로 비교해 선택지 간 차이가 운에 덜 흔들리게 한다. seed가 같으면 결과도 같다.
export function adviseTactics(team: Team, opponent: Team, scoutDays = 0, seed = 1): TacticsAdvice {
  const games = ADVICE.baseGames + ADVICE.gamesPerScoutDay * scoutDays;
  const wins = (tactics: Partial<Tactics>) => {
    const mine = { ...team, tactics: { ...team.tactics, ...tactics } };
    let w = 0;
    for (let i = 0; i < games; i++) if (simulateGame(mine, opponent, { seed: seed + i }).winner === 'home') w++;
    return w;
  };
  // 동률이면 앞의 선택지(기본에 가까운 쪽)를 고른다
  const best = <T,>(options: T[], patch: (o: T) => Partial<Tactics>) => {
    let top = options[0];
    let topWins = -1;
    for (const o of options) { const w = wins(patch(o)); if (w > topWins) { top = o; topWins = w; } }
    return top;
  };
  const focus = best(FOCUSES, (f) => ({ focus: f, defense: 'man', pace: 0 }));
  const defense = best(DEFENSES, (d) => ({ focus, defense: d, pace: 0 }));
  const pace = best([0, -1, 1], (p) => ({ focus, defense, pace: p }));
  return { focus, defense, pace, games };
}
