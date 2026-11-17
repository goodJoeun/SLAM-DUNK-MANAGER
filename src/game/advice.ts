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
  wins: number; // 그중 조언한 전술로 이긴 경기 수
}

// 한 전술로 모의 경기를 games번 돌려 이긴 횟수. 조언과 같은 시드 묶음을 쓰므로 조언 전술의 전적과 바로 견줄 수 있다.
export function mockWins(team: Team, opponent: Team, tactics: Partial<Tactics>, games: number, seed = 1, prep = 0) {
  const mine = { ...team, tactics: { ...team.tactics, ...tactics } };
  let w = 0;
  for (let i = 0; i < games; i++) if (simulateGame(mine, opponent, { seed: seed + i, prep: [prep, 0] }).winner === 'home') w++;
  return w;
}

const FOCUSES: Focus[] = ['balanced', 'inside', 'outside', 'spread'];
const DEFENSES: Defense[] = ['man', 'zone', 'press', 'switch', 'drop'];

// 공격 -> 수비 -> 템포 순으로 하나씩 정한다 (앞에서 고른 것은 그대로 두고 다음 것을 비교).
// 같은 시드 묶음으로 비교해 선택지 간 차이가 운에 덜 흔들리게 한다. seed가 같으면 결과도 같다.
// prep: 상대 분석으로 얻은 준비 보너스. 분석한 팀은 약점 공략이 더 잘 통하므로 모의 경기에도 반영한다.
export function adviseTactics(team: Team, opponent: Team, scoutDays = 0, seed = 1, prep = 0): TacticsAdvice {
  const games = ADVICE.baseGames + ADVICE.gamesPerScoutDay * scoutDays;
  const wins = (tactics: Partial<Tactics>) => mockWins(team, opponent, tactics, games, seed, prep);
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
  return { focus, defense, pace, games, wins: wins({ focus, defense, pace }) };
}
