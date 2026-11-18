// 전술이 선수 구성과 맞을 때 실제로 이득인지 확인한다.
//   node scripts/balance/fit-test.ts
import { makeRng } from '../../src/game/rng.ts';
import { generateTeam } from '../../src/game/team/generate.ts';
import { simulateGame } from '../../src/game/match/engine.ts';
import type { EngineTeam, RatingKey, Ratings, Tactics } from '../../src/game/types.ts';

type Tweak = (a: EngineTeam, b: EngineTeam) => void;

function winRate(label: string, tweak: Tweak, tacticsA: Partial<Tactics>, tacticsB: Partial<Tactics> = {}, n = 3000) {
  const rng = makeRng(11);
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const a = generateTeam(rng, 'A', 50, tacticsA);
    const b = generateTeam(rng, 'B', 50, tacticsB);
    tweak(a, b);
    if (simulateGame(a, b, { seed: 5000 + i }).winner === 'home') wins++;
  }
  console.log(`${label.padEnd(44)} A 승률 ${((100 * wins) / n).toFixed(1)}%`);
}

const bump = (team: EngineTeam, changes: Partial<Ratings>) => team.players.forEach((p) => {
  for (const k of Object.keys(changes) as RatingKey[]) p.ratings[k] = Math.max(5, Math.min(99, p.ratings[k] + changes[k]!));
});

const shooters = (a: EngineTeam) => bump(a, { tp: 12, ins: -6, dnk: -6 });
const bigs = (a: EngineTeam) => bump(a, { ins: 10, dnk: 8, str: 5, tp: -12 });
const weakHandlers: Tweak = (_a, b) => bump(b, { drb: -12, pss: -6 });
const quickA = (a: EngineTeam) => bump(a, { spd: 8, diq: 5, end: 10, hgt: -6 });

winRate('슈터 팀 · 기본 전술', shooters, {});
winRate('슈터 팀 · 외곽 중심', shooters, { focus: 'outside' });
winRate('슈터 팀 · 골밑 중심', shooters, { focus: 'inside' });
winRate('빅맨 팀 · 기본 전술', bigs, {});
winRate('빅맨 팀 · 골밑 중심', bigs, { focus: 'inside' });
winRate('빅맨 팀 · 외곽 중심', bigs, { focus: 'outside' });
winRate('상대 볼핸들링 약함 · 맨투맨', weakHandlers, {});
winRate('상대 볼핸들링 약함 · 프레스', weakHandlers, { defense: 'press' });
winRate('빠르고 체력 좋은 팀 · 맨투맨', quickA, {});
winRate('빠르고 체력 좋은 팀 · 프레스', quickA, { defense: 'press' });
winRate('상대가 슈터 팀 · 맨투맨', (_a, b) => shooters(b), {}, { focus: 'outside' });
winRate('상대가 슈터 팀 · 존', (_a, b) => shooters(b), { defense: 'zone' }, { focus: 'outside' });
winRate('상대가 빅맨 팀 · 맨투맨', (_a, b) => bigs(b), {}, { focus: 'inside' });
winRate('상대가 빅맨 팀 · 존', (_a, b) => bigs(b), { defense: 'zone' }, { focus: 'inside' });
