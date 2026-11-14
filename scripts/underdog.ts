// 감독의 선택으로 약팀이 강팀을 얼마나 이길 수 있는지 측정한다.
//   node scripts/underdog.ts          전력 차이별 표 + 원작 학교 대진
//   node scripts/underdog.ts quick    표본을 줄여 빠르게
//   node scripts/underdog.ts prep     경기 전 준비(상대 분석) 효과만
//
// 감독이 한 경기 안에서 고를 수 있는 것: 공격 중심(3) × 수비(3) × 템포(3), 에이스 지정, 상대 에이스 집중 마크.
//   평범한 감독: 게임의 AI 감독과 같은 규칙으로 전술을 고른다 (pickTactics)
//   최선의 감독: 연습 경기로 가장 좋은 조합을 찾은 뒤, 새로운 경기들에서 승률을 잰다 (고른 경기와 잰 경기가 다르다)
//   최악의 감독: 같은 방법으로 가장 나쁜 조합을 고른다
// 상대(강팀)는 늘 AI 감독의 전술을 쓴다. 홈·원정은 번갈아 바꾼다.
import { makeRng } from '../src/game/rng.ts';
import { generateTeam } from '../src/game/generate.ts';
import { simulateGame, composites, overall } from '../src/game/engine.ts';
import { pickTactics, teamOverall } from '../src/game/school.ts';
import { createCareer, PREPARATION } from '../src/game/season.ts';
import { DATASETS, buildSchool } from '../src/game/dataset.ts';
import type { Defense, EngineTeam, Focus, Tactics, Team } from '../src/game/types.ts';

const QUICK = process.argv[2] === 'quick';
const PREP_ONLY = process.argv[2] === 'prep';
const FULL_PREP = PREPARATION.perDay * PREPARATION.maxDays; // 3일 모두 분석했을 때의 보너스
const TUNE_GAMES = QUICK ? 16 : 120; // 전술 조합 하나를 고를 때 쓰는 연습 경기 수
const EXTRA_GAMES = QUICK ? 30 : 200; // 에이스·집중 마크를 고를 때
const EVAL_GAMES = QUICK ? 120 : 400; // 고른 전술의 승률을 잴 때 (새 경기)
const ORIGINAL_EVAL = QUICK ? 240 : 1200; // 원작 학교 대진은 더 많이 잰다
const MATCHUPS = QUICK ? 6 : 12; // 전력 차이마다 무작위 대진 수
const GAPS = [0, 3, 6, 9, 12, 15, 20]; // 생성 수준 차이 (약팀 50 고정)

const FOCI: Focus[] = ['balanced', 'inside', 'outside'];
const DEFENSES: Defense[] = ['man', 'zone', 'press'];
const PACES = [-1, 0, 1];
const FOCUS_LABEL: Record<Focus, string> = { balanced: '균형', inside: '골밑', outside: '외곽', spread: '5아웃' };
const DEFENSE_LABEL: Record<Defense, string> = { man: '맨투맨', zone: '존', press: '프레스', switch: '스위치', drop: '드롭' };
const PACE_LABEL: Record<string, string> = { '-1': '느리게', 0: '보통', 1: '빠르게' };

let seedCounter = 1_000_000;
const freshSeeds = (n: number) => Array.from({ length: n }, () => seedCounter++);

// 약팀의 승률 (홈·원정 번갈아)
// prep: 약팀이 경기 전 상대 분석으로 얻은 보너스
function winRate(dog: EngineTeam, fav: EngineTeam, tactics: Partial<Tactics>, seeds: number[], prep = 0) {
  const me = { ...dog, tactics };
  let wins = 0;
  seeds.forEach((seed, i) => {
    const home = i % 2 === 0;
    const g = home ? simulateGame(me, fav, { seed, prep: [prep, 0] }) : simulateGame(fav, me, { seed, prep: [0, prep] });
    if ((g.winner === 'home') === home) wins++;
  });
  return wins / seeds.length;
}

// 게임 화면의 "팀 전력"과 같은 계산 (주전 5명 75%, 벤치 4명 25%)
const strength = (t: EngineTeam) => {
  const ovr = t.players.map((p) => overall(p));
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return mean(ovr.slice(0, 5)) * 0.75 + mean(ovr.slice(5, 9)) * 0.25;
};
const topScorer = (t: EngineTeam) => t.players.slice(0, 5).reduce((a, b) => (composites(b).usage > composites(a).usage ? b : a)).id;
const label = (t: Partial<Tactics>) =>
  `${FOCUS_LABEL[t.focus ?? 'balanced']}·${DEFENSE_LABEL[t.defense ?? 'man']}·${PACE_LABEL[String(Math.round(t.pace ?? 0))]}${t.keyPlayerId ? '·에이스' : ''}${t.denyPlayerId ? '·집중마크' : ''}`;

// 한 대진에서 평범한·최선·최악 감독의 승률
function study(dog: EngineTeam, fav: EngineTeam, aiTactics: Partial<Tactics>, evalGames = EVAL_GAMES, prep = 0) {
  const tuneSeeds = freshSeeds(TUNE_GAMES);
  const scored: { t: Partial<Tactics>; r: number }[] = [];
  for (const focus of FOCI) for (const defense of DEFENSES) for (const pace of PACES) {
    const t = { focus, defense, pace };
    scored.push({ t, r: winRate(dog, fav, t, tuneSeeds, prep) });
  }
  scored.sort((a, b) => b.r - a.r);
  // 가장 좋은 조합에 에이스 지정·집중 마크를 더해 본다
  const base = scored[0].t;
  const extraSeeds = freshSeeds(EXTRA_GAMES);
  const variants: Partial<Tactics>[] = [
    base,
    { ...base, keyPlayerId: topScorer(dog) },
    { ...base, denyPlayerId: topScorer(fav) },
    { ...base, keyPlayerId: topScorer(dog), denyPlayerId: topScorer(fav) },
  ];
  const best = variants.map((t) => ({ t, r: winRate(dog, fav, t, extraSeeds, prep) })).sort((a, b) => b.r - a.r)[0].t;
  const worst = scored[scored.length - 1].t;
  const evalSeeds = freshSeeds(evalGames); // 셋 다 같은 새 경기들로 잰다
  return {
    ai: winRate(dog, fav, aiTactics, evalSeeds, prep),
    best: winRate(dog, fav, best, evalSeeds, prep),
    worst: winRate(dog, fav, worst, evalSeeds, prep),
    bestTactics: best,
    worstTactics: worst,
  };
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`.padStart(6);
const t0 = performance.now();

if (!PREP_ONLY) {
// ---------- 1) 전력 차이별 ----------
console.log(`[1] 전력 차이별 약팀 승률 · 대진 ${MATCHUPS}개 × 평가 ${EVAL_GAMES}경기 (약팀 수준 50 고정)`);
console.log('  수준 차 | 팀 전력 차 | 평범한 감독 | 최선의 감독 | 최악의 감독 | 감독 효과(최선-평범)');
const rows: { gap: number; diff: number; ai: number; best: number; worst: number }[] = [];
const bestPicks: Record<string, number> = {};
for (const gap of GAPS) {
  let ai = 0, best = 0, worst = 0, diff = 0;
  for (let k = 0; k < MATCHUPS; k++) {
    const rng = makeRng(gap * 1000 + k + 1);
    const dog = generateTeam(rng, '약팀', 50);
    const fav = generateTeam(rng, '강팀', 50 + gap);
    fav.tactics = pickTactics(rng, fav as unknown as Team);
    const aiTactics = pickTactics(rng, dog as unknown as Team);
    const r = study(dog, fav, aiTactics);
    ai += r.ai; best += r.best; worst += r.worst; diff += strength(fav) - strength(dog);
    const key = label(r.bestTactics);
    bestPicks[key] = (bestPicks[key] ?? 0) + 1;
  }
  const row = { gap, diff: diff / MATCHUPS, ai: ai / MATCHUPS, best: best / MATCHUPS, worst: worst / MATCHUPS };
  rows.push(row);
  console.log(`  ${String(gap).padStart(6)} | ${row.diff.toFixed(1).padStart(9)} | ${pct(row.ai)}      | ${pct(row.best)}      | ${pct(row.worst)}      | ${(100 * (row.best - row.ai) >= 0 ? '+' : '')}${(100 * (row.best - row.ai)).toFixed(1)}%p`);
}
// 최선의 감독이 어느 전력 차까지 일정 승률을 지키는지 (선형 보간)
const reach = (target: number, key: 'ai' | 'best') => {
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (a[key] >= target && b[key] < target) return a.diff + ((a[key] - target) / (a[key] - b[key])) * (b.diff - a.diff);
  }
  return rows[rows.length - 1][key] >= target ? Infinity : 0;
};
console.log('\n  약팀이 이 승률을 지킬 수 있는 최대 팀 전력 차 (평범한 감독 → 최선의 감독):');
for (const target of [0.4, 0.3, 0.2, 0.1, 0.05]) {
  const f = (x: number) => (x === Infinity ? `${rows[rows.length - 1].diff.toFixed(1)} 이상` : x.toFixed(1));
  console.log(`    승률 ${Math.round(target * 100)}% 이상: 전력 차 ${f(reach(target, 'ai'))} → ${f(reach(target, 'best'))}`);
}
console.log('\n  최선의 감독이 고른 전술 (자주 나온 순):');
for (const [k, n] of Object.entries(bestPicks).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`    ${k} ${n}회`);

// ---------- 2) 원작 학교 대진 ----------
console.log(`\n[2] 원작 학교 대진 (1년차 시작 시점) · 평가 ${ORIGINAL_EVAL}경기`);
const career = createCareer({ seed: 1, dataset: 'original' });
const byName = (name: string) => Object.values(career.teams).find((t) => t.name === name)!;
const rng = makeRng(77);
const sanno = buildSchool(rng, career, DATASETS.original.nationals[0]);
sanno.tactics = pickTactics(rng, sanno);
const shohoku = byName('북산고');
const opponents = [byName('상양고'), byName('능남고'), byName('해남대부속고'), sanno];
console.log('  대진 | 팀 전력 | 평범한 감독 | 최선의 감독 | 최악의 감독 | 최선의 전술');
for (const opp of opponents) {
  const r = study(shohoku, opp, pickTactics(rng, shohoku), ORIGINAL_EVAL);
  console.log(`  북산고 vs ${opp.name} | ${teamOverall(shohoku)} vs ${teamOverall(opp)} | ${pct(r.ai)} | ${pct(r.best)} | ${pct(r.worst)} | ${label(r.bestTactics)}`);
}

}

// ---------- 3) 경기 전 준비 ----------
{
  const gaps = [3, 6, 9, 12];
  const M = QUICK ? 6 : 10;
  const N = QUICK ? 200 : 400;
  console.log(`\n[3] 경기 전 준비(상대 분석 ${PREPARATION.maxDays}일, 능력치 +${FULL_PREP.toFixed(1)}) · 약팀 AI 전술 · 대진 ${M}개 × ${N}경기`);
  console.log('  팀 전력 차 | 준비 없음 | 1일 | 2일 | 3일');
  for (const gap of gaps) {
    const sums = [0, 0, 0, 0]; let diff = 0;
    for (let k = 0; k < M; k++) {
      const rng = makeRng(gap * 4000 + k + 1);
      const dog = generateTeam(rng, '약팀', 50);
      const fav = generateTeam(rng, '강팀', 50 + gap);
      fav.tactics = pickTactics(rng, fav as unknown as Team);
      const ai = pickTactics(rng, dog as unknown as Team);
      const seeds = freshSeeds(N);
      for (let days = 0; days <= 3; days++) sums[days] += winRate(dog, fav, ai, seeds, days * PREPARATION.perDay);
      diff += strength(fav) - strength(dog);
    }
    console.log(`  ${(diff / M).toFixed(1).padStart(9)} | ${sums.map((x) => pct(x / M)).join(' | ')}`);
  }
  const career = createCareer({ seed: 1, dataset: 'original' });
  const byName = (name: string) => Object.values(career.teams).find((t) => t.name === name)!;
  const rng = makeRng(77);
  const sanno = buildSchool(rng, career, DATASETS.original.nationals[0]);
  sanno.tactics = pickTactics(rng, sanno);
  const shohoku = byName('북산고');
  console.log(`\n  원작 대진 (${ORIGINAL_EVAL}경기): 평범한 감독·준비 없음 → 최선의 감독·준비 없음 → 최선의 감독·준비 3일`);
  for (const opp of [byName('상양고'), byName('해남대부속고'), sanno]) {
    const plain = study(shohoku, opp, pickTactics(rng, shohoku), ORIGINAL_EVAL);
    const ready = study(shohoku, opp, pickTactics(rng, shohoku), ORIGINAL_EVAL, FULL_PREP);
    console.log(`  북산고 vs ${opp.name} (${teamOverall(shohoku)} vs ${teamOverall(opp)}): ${pct(plain.ai)} → ${pct(plain.best)} → ${pct(ready.best)}`);
  }
}

console.log(`\n총 ${((performance.now() - t0) / 1000).toFixed(0)}초`);
