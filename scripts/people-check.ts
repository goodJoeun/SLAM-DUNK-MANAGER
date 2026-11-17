// 사용법: node scripts/people-check.ts
// 성격·사기·사건이 3년 캠페인 동안 탈 없이 돌아가는지 본다: 사건 빈도와 종류, 사기의 범위, 선택에 따른 차이.
import { createCareer, today, playDay } from '../src/game/season.ts';
import { describeEvent, moraleOf, resolveEvent, teamMorale, traitOf, TRAITS } from '../src/game/people.ts';
import type { IntensityKey } from '../src/game/types.ts';

function run(seed: number, pick: (n: number) => number, intensity: IntensityKey) {
  const state = createCareer({ seed, dataset: 'original' });
  const kinds: Record<string, number> = {};
  let events = 0, days = 0, wins = 0, games = 0, lo = 100, hi = 0, sum = 0;
  const sample: string[] = [];
  while (!state.finished) {
    if (state.event) {
      const view = describeEvent(state, state.event)!;
      kinds[state.event.key] = (kinds[state.event.key] ?? 0) + 1;
      const r = resolveEvent(state, pick(view.options.length));
      events++;
      if (r && sample.length < 3) sample.push(`    ${r.title} → ${r.chosen} → ${r.result.join(' / ')}`);
    }
    const d = today(state)!;
    const team = state.teams[state.userTeamId];
    const cond = team.players.reduce((s, p) => s + p.condition, 0) / team.players.length;
    const r = playDay(state, d.userTrains ? (cond < 60 ? { program: 'rest' } : { program: 'shooting', intensity }) : {})!;
    days++;
    if (r.userBox) { games++; const me = r.userBox.find((t) => t.id === state.userTeamId)!; const op = r.userBox.find((t) => t.id !== state.userTeamId)!; if (me.score > op.score) wins++; }
    const m = teamMorale(state.teams[state.userTeamId]);
    sum += m;
    for (const p of state.teams[state.userTeamId].players) { lo = Math.min(lo, moraleOf(p)); hi = Math.max(hi, moraleOf(p)); }
  }
  return { events, days, wins, games, lo, hi, avg: sum / days, kinds, sample };
}

const s0 = createCareer({ seed: 3, dataset: 'original' });
console.log('북산고 성격: ' + s0.teams[s0.userTeamId].players.map((p) => `${p.name} ${TRAITS[traitOf(p)].label}`).join(', '));
for (const [label, pick, intensity] of [
  ['첫 번째 선택지 · 보통 강도', () => 0, 'normal'],
  ['마지막 선택지 · 보통 강도', (n: number) => n - 1, 'normal'],
  ['첫 번째 선택지 · 강하게', () => 0, 'hard'],
] as const) {
  const t = { events: 0, days: 0, wins: 0, games: 0, lo: 100, hi: 0, avg: 0 };
  const kinds: Record<string, number> = {};
  let sample: string[] = [];
  for (let seed = 1; seed <= 6; seed++) {
    const r = run(seed, pick, intensity);
    t.events += r.events; t.days += r.days; t.wins += r.wins; t.games += r.games; t.lo = Math.min(t.lo, r.lo); t.hi = Math.max(t.hi, r.hi); t.avg += r.avg / 6;
    for (const [k, v] of Object.entries(r.kinds)) kinds[k] = (kinds[k] ?? 0) + v;
    if (seed === 1) sample = r.sample;
  }
  console.log(`\n[${label}] 6개 캠페인 · 사건 ${t.events}건 (훈련 ${(t.days / t.events).toFixed(1)}일에 한 번) · 승률 ${(100 * t.wins / t.games).toFixed(1)}% (${t.games}경기) · 팀 사기 평균 ${t.avg.toFixed(0)} · 개인 사기 범위 ${t.lo.toFixed(0)}~${t.hi.toFixed(0)}`);
  console.log('  ' + Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log(sample.join('\n'));
}
