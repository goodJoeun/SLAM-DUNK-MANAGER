// 사용법: node scripts/deny-matchups.ts ['[{},{"even":1.3}]'] [대진당 경기 수=60]
// 집중 마크가 전력 차에 따라 얼마나 쓸 만한지 잰다 (원작 데이터, 1년차 시작 시점, 현 내 16개교의 모든 대진).
//   대상은 상대 팀에서 평소 가장 많이 넣는 선수, 담당은 우리 선발 중 화면에 나오는 마크 효과가 가장 큰 선수.
//   첫 인자의 각 항목은 TUNING.deny에 덮어쓸 값이다 (outside·inside는 일부 항목만 적어도 된다).
//   우리가 약한 대진 / 비슷한 대진 / 강한 대진으로 나눠, 마크 효과와 집중 마크를 걸었을 때의 점수 차 변화를 본다.
import { createCareer } from '../src/game/season.ts';
import { teamOverall } from '../src/game/school.ts';
import { TUNING, denyOutlook, simulateGame } from '../src/game/engine.ts';
import type { Tactics, Team } from '../src/game/types.ts';

const variants = JSON.parse(process.argv[2] ?? '[{}]') as Record<string, unknown>[];
const N = Number(process.argv[3] ?? 60);
const state = createCareer({ seed: 11, dataset: 'original' });
const teams = state.regionIds.map((id) => state.teams[id]);
const base = JSON.parse(JSON.stringify(TUNING.deny));
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const f1 = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(1);

function run(a: Team, b: Team, tactics: Partial<Tactics>, seed: number) {
  const A = { ...a, tactics: { ...a.tactics, keyPlayerId: null, denyPlayerId: null, denyDefenderId: null, roles: {}, ...tactics } };
  const pts: Record<string, number> = {};
  let wins = 0, margin = 0;
  for (let i = 0; i < N; i++) {
    const g = simulateGame(A, b, { seed: seed + i });
    if (g.winner === 'home') wins++;
    margin += g.score.home - g.score.away;
    for (const p of g.box[1].players) pts[p.id] = (pts[p.id] ?? 0) + p.pts / N;
  }
  return { win: (100 * wins) / N, margin: margin / N, pts };
}

// 집중 마크 없는 기준 경기는 규칙과 상관없으므로 한 번만 돌린다
const pairs = teams.flatMap((a, i) => teams.filter((b) => b !== a).map((b, j) => {
  const seed = 10000 + i * 1000 + j * 50;
  const none = run(a, b, {}, seed);
  const target = b.players.slice(0, 5).reduce((x, y) => (none.pts[y.id] > none.pts[x.id] ? y : x));
  return { a, b, seed, none, target, diff: teamOverall(a) - teamOverall(b) };
}));
const BANDS: [string, (d: number) => boolean][] = [
  ['우리가 약함 (전력 -8 이하)', (d) => d <= -8],
  ['비슷함 (-7 ~ +7)', (d) => d > -8 && d < 8],
  ['우리가 강함 (+8 이상)', (d) => d >= 8],
];

for (const variant of variants) {
  Object.assign(TUNING.deny, JSON.parse(JSON.stringify(base)));
  for (const [k, v] of Object.entries(variant)) {
    if (k === 'outside' || k === 'inside') Object.assign(TUNING.deny[k], v);
    else (TUNING.deny as Record<string, unknown>)[k] = v;
  }
  console.log('\n' + JSON.stringify(variant));
  for (const [label, inBand] of BANDS) {
    const rows = pairs.filter((p) => inBand(p.diff)).map((p) => {
      const marker = p.a.players.slice(0, 5).reduce((x, y) => (denyOutlook(y, p.target).power > denyOutlook(x, p.target).power ? y : x));
      const power = denyOutlook(marker, p.target).power;
      const deny = run(p.a, p.b, { denyPlayerId: p.target.id, denyDefenderId: marker.id }, p.seed);
      return { power, dMargin: deny.margin - p.none.margin, dWin: deny.win - p.none.win, dTarget: deny.pts[p.target.id] - p.none.pts[p.target.id], targetPts: p.none.pts[p.target.id] };
    });
    const share = (f: (r: (typeof rows)[number]) => boolean) => `${Math.round((100 * rows.filter(f).length) / rows.length)}%`;
    console.log(
      `  ${label.padEnd(24)} ${String(rows.length).padStart(3)}대진 · 마크 효과 평균 ${Math.round(100 * avg(rows.map((r) => r.power)))}` +
      ` (0인 대진 ${share((r) => r.power === 0)}, 50 미만 ${share((r) => r.power < 0.5)}, 100 이상 ${share((r) => r.power >= 1)})` +
      ` · 대상 득점 ${avg(rows.map((r) => r.targetPts)).toFixed(1)} → ${f1(avg(rows.map((r) => r.dTarget)))}` +
      ` · 점수 차 ${f1(avg(rows.map((r) => r.dMargin)))} · 승률 ${f1(avg(rows.map((r) => r.dWin)))}%p · 이득 본 대진 ${share((r) => r.dMargin > 0.5)}`,
    );
  }
}
