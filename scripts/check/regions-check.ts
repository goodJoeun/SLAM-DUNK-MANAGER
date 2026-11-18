// 현마다 학교 구성과 대회 진행을 확인:  node scripts/check/regions-check.ts
// 맡을 수 있는 현마다 16개교가 맞는지, 학교 이름이 겹치지 않는지 보고, 전원 AI 운영으로 3년을 돌려 대회가 탈 없이 끝나는지 본다.
import { createCareer, playDay, playablePrefectures, qualifiersFor, SEASON } from '../../src/game/career/season.ts';
import { DATASETS } from '../../src/game/team/dataset.ts';
import { teamOverall } from '../../src/game/team/school.ts';

const data = DATASETS.original;
const names = [...data.schools, ...data.nationals, ...(data.regions ?? []).flatMap((r) => r.schools)].map((s) => s.name);
for (const style of ['kr', 'jp'] as const) {
  const all = [...new Set(names)].map((n) => n[style]);
  const dup = all.filter((n, i) => all.indexOf(n) !== i);
  if (dup.length) throw new Error(`학교 이름(${style})이 겹칩니다: ${dup.join(', ')}`);
}

for (const prefecture of playablePrefectures('original')) {
  const first = createCareer({ seed: 1, dataset: 'original', prefecture });
  if (first.prefecture !== prefecture) throw new Error(`${prefecture}: 현이 ${first.prefecture}로 만들어졌습니다`);
  if (first.regionIds.length !== SEASON.regionSize) throw new Error(`${prefecture}: 학교가 ${first.regionIds.length}곳입니다`);
  const top = first.regionIds.map((id) => first.teams[id]).sort((a, b) => teamOverall(b) - teamOverall(a)).slice(0, 3).map((t) => `${t.name} ${teamOverall(t)}`);
  const won: Record<string, number> = {};
  let national = 0;
  let guestsFromHome = 0;
  const N = 6;
  for (let seed = 1; seed <= N; seed++) {
    const s = createCareer({ seed, dataset: 'original', prefecture, userTeamIndex: seed % 16 });
    while (!s.finished) {
      const c = s.comp;
      const guests = s.guestIds.map((id) => s.teams[id].name);
      const r = playDay(s, { events: false })!;
      if (!r.competitionEnd || !c) continue;
      if (c.key === 'interhigh' && s.year === 1) {
        won[r.competitionEnd.prefChampion] = (won[r.competitionEnd.prefChampion] ?? 0) + 1;
        const reps = Object.values(c.finish).filter((f) => f === '인터하이 진출' || f.startsWith('인터하이 ') && !f.includes('현 예선')).length;
        if (guests.length + qualifiersFor(s, 'interhigh') !== data.draw!.size) throw new Error(`${prefecture}: 인터하이 본선이 ${guests.length + qualifiersFor(s, 'interhigh')}개교입니다`);
        if (reps < qualifiersFor(s, 'interhigh')) throw new Error(`${prefecture}: 전국 진출 학교 수가 맞지 않습니다`);
        if (prefecture !== data.prefecture && guests.includes('해남대부속고') && guests.includes('북산고')) guestsFromHome++;
        const local = s.regionIds.map((id) => s.teams[id].name);
        const clash = guests.filter((g) => local.includes(g));
        if (clash.length) throw new Error(`${prefecture}: 우리 현 학교가 다른 현 대표로도 나왔습니다 (${clash.join(', ')})`);
      }
      if (r.competitionEnd.champion && s.regionIds.some((id) => s.teams[id]?.name === r.competitionEnd!.champion)) national++;
    }
  }
  if (prefecture !== data.prefecture && guestsFromHome !== N) throw new Error(`${prefecture}: 인터하이에 가나가와현 대표가 나오지 않았습니다`);
  console.log(`${prefecture.padEnd(6)} 인터하이 ${qualifiersFor(first, 'interhigh')}곳 진출 · 전력 상위: ${top.join(', ')}`);
  console.log(`        1년차 인터하이 현 1위(${N}회): ${Object.entries(won).map(([k, v]) => `${k} ${v}`).join(', ')} · 3년간 전국 우승 ${national}회 / ${N * 9}개 대회`);
}
console.log('이상 없음');
