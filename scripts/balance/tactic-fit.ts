// 사용법: node scripts/balance/tactic-fit.ts [조합당 경기 수=120]
// 전술에 '누가 써도 정답'인 선택지가 있는지 본다: 여러 학교가 강한·비슷한·약한 상대를 만났을 때 선택지별 평균 승률.
// 한 선택지의 값은 나머지 두 요인의 모든 조합을 평균 낸 것이다 (공격 4 × 수비 5 × 템포 3).
import { createCareer } from '../../src/game/career/season.ts';
import { simulateGame, TUNING } from '../../src/game/match/engine.ts';
import { teamOverall } from '../../src/game/team/school.ts';
import type { Defense, Focus, Team } from '../../src/game/types.ts';

const N = Number(process.argv[2] ?? 120);
// 계수를 바꿔 가며 볼 때: TUNE='{"focusRead":{"inside":0,"outside":0}}' node scripts/balance/tactic-fit.ts
if (process.env.TUNE) for (const [k, v] of Object.entries(JSON.parse(process.env.TUNE))) { const T = TUNING as unknown as Record<string, unknown>; T[k] = typeof v === 'object' ? { ...(T[k] as object), ...(v as object) } : v; }
const state = createCareer({ seed: 11, dataset: 'original' });
const teams = state.regionIds.map((id) => state.teams[id]).sort((a, b) => teamOverall(b) - teamOverall(a));
const F: Focus[] = ['balanced', 'inside', 'outside', 'spread'];
const D: Defense[] = ['man', 'zone', 'press', 'switch', 'drop'];
const P = [-1, 0, 1];
const FN = ['균형', '골밑', '외곽', '5아웃']; const DN = ['맨', '존', '프레스', '스위치', '드롭']; const PN = ['느림', '보통', '빠름'];
const total = { f: F.map(() => 0), d: D.map(() => 0), p: P.map(() => 0), n: 0 };
const bestCount = { f: F.map(() => 0), d: D.map(() => 0), p: P.map(() => 0) };

function study(a: Team, b: Team) {
  const f = F.map(() => 0); const d = D.map(() => 0); const p = P.map(() => 0);
  F.forEach((focus, i) => D.forEach((defense, j) => P.forEach((pace, k) => {
    const A = { ...a, tactics: { focus, defense, pace } };
    let w = 0;
    for (let s = 0; s < N; s++) if (simulateGame(A, b, { seed: 100 + s }).winner === 'home') w++;
    f[i] += w / N / 15; d[j] += w / N / 12; p[k] += w / N / 20;
  })));
  const row = (xs: number[], names: string[]) => xs.map((x, i) => `${names[i]} ${(100 * x).toFixed(0)}`).join(' ');
  const mean = f.reduce((s, x) => s + x, 0) / 4;
  console.log(`${a.name}(${teamOverall(a)}) vs ${b.name}(${teamOverall(b)}) | ${row(f, FN)} | ${row(d, DN)} | ${row(p, PN)}`);
  // 평균 대비 편차를 모아 '어느 팀에나 좋은' 선택지를 찾는다
  f.forEach((x, i) => { total.f[i] += x - mean; }); d.forEach((x, i) => { total.d[i] += x - mean; }); p.forEach((x, i) => { total.p[i] += x - mean; });
  bestCount.f[f.indexOf(Math.max(...f))]++; bestCount.d[d.indexOf(Math.max(...d))]++; bestCount.p[p.indexOf(Math.max(...p))]++;
  total.n++;
}

for (const i of [0, 2, 4, 6, 9, 12, 15]) {
  const a = teams[i];
  for (const j of [Math.max(0, i - 3), i === 0 ? 1 : i - 1, Math.min(15, i + 3)]) if (j !== i) study(a, teams[j]);
}
const dev = (xs: number[], names: string[], best: number[]) => xs.map((x, i) => `${names[i]} ${x / total.n >= 0 ? '+' : ''}${((100 * x) / total.n).toFixed(1)}%p(최선 ${best[i]}회)`).join(' · ');
console.log(`\n[${total.n}개 대진 평균: 선택지별 승률 편차와 그 요인에서 최선이었던 횟수]`);
console.log('  공격: ' + dev(total.f, FN, bestCount.f));
console.log('  수비: ' + dev(total.d, DN, bestCount.d));
console.log('  템포: ' + dev(total.p, PN, bestCount.p));
