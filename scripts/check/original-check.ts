// 원작 데이터의 전력 균형 확인:  node scripts/check/original-check.ts
import { createCareer, playDay } from '../../src/game/career/season.ts';
import { teamOverall } from '../../src/game/team/school.ts';
import { overall } from '../../src/game/match/engine.ts';

const first = createCareer({ seed: 1, dataset: 'original' });
console.log('[1년차 시작 전력]');
for (const id of first.regionIds) {
  const t = first.teams[id];
  const stars = t.players.filter((p) => p.fixed).sort((a, b) => overall(b) - overall(a)).slice(0, 5).map((p) => `${p.name} ${overall(p)}`).join(', ');
  console.log(`  ${t.name.padEnd(10)} 전력 ${teamOverall(t)} · ${stars || '(생성 선수)'}`);
}

// 전원 AI 운영으로 1년차를 여러 번 돌려 본다
const N = 40;
const tally: Record<string, Record<string, number>> = {};
const add = (team: string, key: string) => { ((tally[team] ??= {})[key] ??= 0); tally[team][key]++; };
let nationals: string[] | null = null;
for (let seed = 1; seed <= N; seed++) {
  const s = createCareer({ seed, dataset: 'original' });
  while (s.year === 1 && !s.finished) {
    const c = s.comp; // 연말에는 진행 후 대회 정보가 초기화되므로 미리 잡아 둔다
    const r = playDay(s)!;
    if (r.competitionEnd && c) {
      add(r.competitionEnd.prefChampion, `${c.key}_pref`);
      add(r.competitionEnd.champion, `${c.key}_nat`);
      for (const id of s.regionIds) if ((c.tier[id] ?? 0) >= 3 || c.finish[id]?.includes('진출')) add(s.teams[id].name, `${c.key}_q`);
      if (c.key === 'interhigh' && !nationals) nationals = s.guestIds.map((id) => `${s.teams[id].name} ${teamOverall(s.teams[id])}`);
    }
  }
}
const pct = (x: number | undefined) => `${Math.round((100 * (x ?? 0)) / N)}%`.padStart(4);
console.log(`\n[1년차 ${N}회 시뮬레이션, 전원 AI 운영]  인터하이: 현 1위 / 전국 진출 / 전국 우승 · 국체 전국 진출 · 윈터컵 전국 진출`);
for (const [team, t] of Object.entries(tally).sort((a, b) => (b[1].interhigh_q ?? 0) - (a[1].interhigh_q ?? 0)).slice(0, 12)) {
  console.log(`  ${team.padEnd(10)} ${pct(t.interhigh_pref)} / ${pct(t.interhigh_q)} / ${pct(t.interhigh_nat)} · ${pct(t.kokutai_q)} · ${pct(t.wintercup_q)}`);
}
console.log('\n[전국 대회 상대 예시]', nationals!.join(', '));
