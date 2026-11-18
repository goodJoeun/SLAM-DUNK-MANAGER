// 사용법: node scripts/balance/coach-impact.ts [조합당 경기 수=500]
// 감독의 결정이 승률을 얼마나 바꾸는지 큰 표본으로 잰다 (원작 데이터, 1년차 시작 시점).
//   [1] 전술 60가지(공격 4 × 수비 5 × 템포 3) 전부의 승률 분포. 고르는 경기와 재는 경기를 나눠 우연히 좋았던 조합을 걸러 낸다.
//   [2] 개별 조작: 에이스 지정, 집중 마크, 개인 지시, 선발 교체, 경기 방치, 상대 분석
// 상대는 늘 AI 감독의 전술을 쓴다. 같은 시드 묶음을 써서 조작 간 차이의 잡음을 줄인다.
import { createCareer, PREPARATION } from '../../src/game/career/season.ts';
import { adviseTactics } from '../../src/game/coach/advice.ts';
import { createGame, simulateGame } from '../../src/game/match/engine.ts';
import { teamOverall } from '../../src/game/team/school.ts';
import type { Tactics, Team } from '../../src/game/types.ts';

const N = Number(process.argv[2] ?? 500);
const state = createCareer({ seed: 11, dataset: 'original' });
const teams = state.regionIds.map((id) => state.teams[id]);
const byName = (name: string) => teams.find((t) => t.name === name)!;
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const pp = (x: number) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%p`;

type Opts = { prep?: [number, number]; manual?: boolean };
function winRate(a: Team, b: Team, tactics: Partial<Tactics>, seed0: number, n: number, opts: Opts = {}) {
  const A = { ...a, tactics: { ...a.tactics, ...tactics } };
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const g = opts.manual
      ? createGame(A, b, { seed: seed0 + i, manual: [true, false] }).playToEnd()
      : simulateGame(A, b, { seed: seed0 + i, prep: opts.prep });
    if (g.winner === 'home') wins++;
  }
  return wins / n;
}

const FOCUS = { balanced: '균형', inside: '골밑', outside: '외곽', spread: '5아웃' } as const;
const DEFENSE = { man: '맨투맨', zone: '존', press: '프레스', switch: '스위치', drop: '드롭' } as const;
const PACE: [number, string][] = [[-1, '느리게'], [0, '보통'], [1, '빠르게']];
const combos: { t: Partial<Tactics>; label: string }[] = [];
for (const f of Object.keys(FOCUS) as (keyof typeof FOCUS)[]) for (const d of Object.keys(DEFENSE) as (keyof typeof DEFENSE)[]) for (const [p, pl] of PACE) {
  combos.push({ t: { focus: f, defense: d, pace: p }, label: `${FOCUS[f]}·${DEFENSE[d]}·${pl}` });
}

function tacticsStudy(a: Team, b: Team) {
  console.log(`\n=== ${a.name}(${teamOverall(a)}) vs ${b.name}(${teamOverall(b)}) ===`);
  const clean = { keyPlayerId: null, denyPlayerId: null, roles: {} };
  const rows = combos.map((c) => ({ ...c, w: winRate(a, b, { ...clean, ...c.t }, 1, N) })).sort((x, y) => y.w - x.w);
  const mean = rows.reduce((s, r) => s + r.w, 0) / rows.length;
  const varObs = rows.reduce((s, r) => s + (r.w - mean) ** 2, 0) / (rows.length - 1);
  const varNoise = rows.reduce((s, r) => s + (r.w * (1 - r.w)) / N, 0) / rows.length;
  const trueSd = Math.sqrt(Math.max(0, varObs - varNoise));
  console.log(`[전술 60가지 × ${N}경기] 평균 ${pct(mean)} · 관측 범위 ${pct(rows[rows.length - 1].w)} ~ ${pct(rows[0].w)} · 표본 오차를 뺀 조합 간 실제 편차(표준편차) ${pp(trueSd).slice(1)}`);
  console.log(`  상위: ${rows.slice(0, 4).map((r) => `${r.label} ${pct(r.w)}`).join(' / ')}`);
  console.log(`  하위: ${rows.slice(-4).map((r) => `${r.label} ${pct(r.w)}`).join(' / ')}`);
  // 요인별 평균 (다른 두 요인을 평균 낸 값)
  const avgBy = (pick: (t: Partial<Tactics>) => unknown, names: Record<string, string>) => Object.entries(names)
    .map(([k, label]) => { const xs = rows.filter((r) => String(pick(r.t)) === k); return `${label} ${pct(xs.reduce((s, r) => s + r.w, 0) / xs.length)}`; }).join(' · ');
  console.log(`  공격별: ${avgBy((t) => t.focus, FOCUS)}`);
  console.log(`  수비별: ${avgBy((t) => t.defense, DEFENSE)}`);
  console.log(`  템포별: ${avgBy((t) => t.pace, { '-1': '느리게', 0: '보통', 1: '빠르게' })}`);
  // 새 경기로 다시 잰다 (우연히 좋았던 조합 걸러 내기)
  const M = N * 4;
  const ai = winRate(a, b, {}, 900001, M);
  const top3 = rows.slice(0, 3).map((r) => winRate(a, b, { ...clean, ...r.t }, 900001, M));
  const bottom3 = rows.slice(-3).map((r) => winRate(a, b, { ...clean, ...r.t }, 900001, M));
  const best = Math.max(...top3); const worst = Math.min(...bottom3);
  console.log(`[새 ${M}경기로 재측정] AI 감독 전술(${FOCUS[a.tactics.focus ?? 'balanced']}·${DEFENSE[a.tactics.defense ?? 'man']}·템포 ${a.tactics.pace ?? 0}) ${pct(ai)} · 최선 ${pct(best)} (${pp(best - ai)}) · 최악 ${pct(worst)} (${pp(worst - ai)})`);
  return { ai, best: rows[top3.indexOf(best)].t };
}

function levers(a: Team, b: Team, bestTactics: Partial<Tactics>) {
  const M = N * 4;
  const seed = 500001;
  const base = winRate(a, b, {}, seed, M);
  const line = (label: string, w: number) => console.log(`  ${label.padEnd(34)} ${pct(w)} (${pp(w - base)})`);
  console.log(`[개별 조작 × ${M}경기] 기준(AI 전술, 조작 없음) ${pct(base)} · 표본 오차 ±${(100 * 1.96 * Math.sqrt(0.25 / M)).toFixed(1)}%p`);
  const starters = a.players.slice(0, 5);
  const oppStar = [...b.players.slice(0, 5)].sort((x, y) => y.ratings.oiq + y.ratings.tp + y.ratings.mid - (x.ratings.oiq + x.ratings.tp + x.ratings.mid))[0];
  const keys = starters.map((p) => ({ p, w: winRate(a, b, { keyPlayerId: p.id }, seed, M) })).sort((x, y) => y.w - x.w);
  line(`에이스 지정 최선 (${keys[0].p.name})`, keys[0].w);
  line(`에이스 지정 최악 (${keys[4].p.name})`, keys[4].w);
  const denies = b.players.slice(0, 5).map((p) => ({ p, w: winRate(a, b, { denyPlayerId: p.id }, seed, M) })).sort((x, y) => y.w - x.w);
  line(`집중 마크 최선 (${denies[0].p.name})`, denies[0].w);
  line(`집중 마크 최악 (${denies[4].p.name})`, denies[4].w);
  void oppStar;
  const roleAll = (offense?: string, defense?: string) => Object.fromEntries(starters.map((p) => [p.id, { offense, defense }])) as Tactics['roles'];
  line('전원 타이트 마크', winRate(a, b, { roles: roleAll(undefined, 'tight') }, seed, M));
  line('전원 파울 조심', winRate(a, b, { roles: roleAll(undefined, 'safe') }, seed, M));
  // 선수 특성에 맞춘 개인 지시: 가장 잘하는 슛 종류를 위주로
  const fitted = Object.fromEntries(starters.map((p) => {
    const r = p.ratings;
    const offense = r.tp >= 75 ? 'three' : r.ins >= 75 ? 'post' : r.dnk >= 75 ? 'drive' : r.pss >= 75 ? 'pass' : undefined;
    return [p.id, { offense }];
  })) as Tactics['roles'];
  line('특성에 맞춘 개인 지시', winRate(a, b, { roles: fitted }, seed, M));
  const misfit = Object.fromEntries(starters.map((p) => [p.id, { offense: p.ratings.tp < 55 ? 'three' : 'post' }])) as Tactics['roles'];
  line('특성과 반대인 개인 지시', winRate(a, b, { roles: misfit }, seed, M));
  // 선발: 주전 중 가장 약한 선수 대신 벤치 최하위를 세운다 / 에이스를 벤치에 둔다
  const swapIn = (out: number, inn: number) => { const ps = [...a.players]; [ps[out], ps[inn]] = [ps[inn], ps[out]]; return { ...a, players: ps }; };
  const worstStarter = starters.map((p, i) => ({ i, o: p })).sort((x, y) => teamRank(x.o) - teamRank(y.o))[0].i;
  const bestStarter = starters.map((p, i) => ({ i, o: p })).sort((x, y) => teamRank(y.o) - teamRank(x.o))[0].i;
  line(`선발 실수: ${a.players[bestStarter].name} 대신 ${a.players[a.players.length - 1].name}`, winRate(swapIn(bestStarter, a.players.length - 1), b, {}, seed, M));
  line(`선발 변경: ${a.players[worstStarter].name} 대신 ${a.players[5].name}`, winRate(swapIn(worstStarter, 5), b, {}, seed, M));
  line('경기 방치 (교체·작전 타임 없음)', winRate(a, b, {}, seed, M, { manual: true }));
  const prep1 = PREPARATION.perDay; const prep3 = PREPARATION.perDay * PREPARATION.maxDays;
  line(`상대 분석 1일 (+${prep1.toFixed(1)})`, winRate(a, b, {}, seed, M, { prep: [prep1, 0] }));
  line(`상대 분석 3일 (+${prep3.toFixed(1)})`, winRate(a, b, {}, seed, M, { prep: [prep3, 0] }));
  // 코치 조언대로: 조언은 적은 모의 경기로 정하므로 여러 번 받아 평균을 낸다
  const advised = (days: number) => { let s = 0; for (let k = 0; k < 8; k++) s += winRate(a, b, adviseTactics(a, b, days, 7000 + k * 997), seed, M / 8); return s / 8; };
  line('코치 조언대로 (분석 없음)', advised(0));
  line('코치 조언대로 (분석 3일, 보너스 제외)', advised(3));
  const stack = { ...bestTactics, keyPlayerId: keys[0].p.id, denyPlayerId: denies[0].p.id, roles: fitted };
  line('전부 최선 (전술+에이스+마크+지시)', winRate(a, b, stack, seed, M));
  line('전부 최선 + 상대 분석 3일', winRate(a, b, stack, seed, M, { prep: [prep3, 0] }));
}
const teamRank = (p: Team['players'][number]) => Object.values(p.ratings).reduce((s, v) => s + v, 0);

const me = byName('북산고');
for (const opp of ['무림고', '능남고', '해남대부속고']) {
  const { best } = tacticsStudy(me, byName(opp));
  levers(me, byName(opp), best);
}
