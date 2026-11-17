// 사용법: node scripts/recruits.ts ['[{"aceChance":0.3},{"mode":"prestige"}]'] [연수] [시드 수]
// 신입생 규칙(school.ts의 RECRUIT_MODEL)을 바꿔 가며 여러 해를 돌려, 학교 간 전력 차가 어떻게 변하는지 본다.
// 첫 인자의 각 항목은 RECRUIT_MODEL에 덮어쓸 값이다. 없으면 지금 설정 그대로 한 번 돌린다.
import { createCareer, playDay, SEASON } from '../src/game/season.ts';
import { RECRUIT_MODEL, teamOverall } from '../src/game/school.ts';
import { overall, simulateGame } from '../src/game/engine.ts';

const variants = JSON.parse(process.argv[2] ?? '[{}]') as Record<string, unknown>[];
const YEARS = Number(process.argv[3] ?? 9);
const SEEDS = Array.from({ length: Number(process.argv[4] ?? 4) }, (_, i) => i + 1);
(SEASON as { campaignYears: number }).campaignYears = YEARS + 1;
const base = { ...RECRUIT_MODEL };
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => { const m = avg(xs); return Math.sqrt(avg(xs.map((x) => (x - m) ** 2))); };
const range = (xs: number[]) => (xs.length ? `${Math.min(...xs)}~${Math.max(...xs)}` : '-');

type Row = { mean: number[]; top3: number[]; bot3: number[]; gap: number[]; margin: number[]; fresh: number[] };

for (const variant of variants) {
  Object.assign(RECRUIT_MODEL, base, variant);
  const Y: Record<number, Row> = {};
  const distinct: number[] = [];
  const weakRank: number[] = [];
  const strongRank: number[] = [];
  const fresh = { strong: [] as number[], weak: [] as number[], weakBest: [] as number[] };
  let weakTitles = 0;
  let titles = 0;
  let aces = 0;
  for (const seed of SEEDS) {
    const c = createCareer({ seed, dataset: 'original', userTeamIndex: 7 });
    const init = [...c.regionIds].sort((a, b) => teamOverall(c.teams[b]) - teamOverall(c.teams[a]));
    const strong0 = init.slice(0, 5);
    const weak0 = init.slice(-6);
    const names = new Set<string>();
    let year = 1;
    const snap = () => {
      const o = c.regionIds.map((id) => teamOverall(c.teams[id])).sort((a, b) => b - a);
      const y = (Y[year] ??= { mean: [], top3: [], bot3: [], gap: [], margin: [], fresh: [] });
      y.mean.push(avg(o)); y.top3.push(avg(o.slice(0, 3))); y.bot3.push(avg(o.slice(-3))); y.gap.push(o[0] - o[15]);
      y.fresh.push(avg(c.regionIds.map((id) => c.teams[id].players.slice(0, 5).filter((p) => p.year === 1).length)));
      // 무작위 대진의 평균 점수 차
      let mg = 0;
      let n = 0;
      for (let i = 0; i < 60; i++) {
        const a = c.teams[c.regionIds[i % 16]];
        const b = c.teams[c.regionIds[(i * 7 + 3) % 16]];
        if (a === b) continue;
        const g = simulateGame(a, b, { seed: seed * 1000 + year * 100 + i });
        mg += Math.abs(g.score.home - g.score.away); n++;
      }
      y.margin.push(mg / n);
      const rank = [...c.regionIds].sort((a, b) => teamOverall(c.teams[b]) - teamOverall(c.teams[a]));
      if (year >= 5) {
        for (const id of weak0) weakRank.push(rank.indexOf(id) + 1);
        for (const id of strong0) strongRank.push(rank.indexOf(id) + 1);
      }
    };
    snap();
    while (!c.finished && year <= YEARS) {
      const r = playDay(c, { events: false });
      if (!r) break;
      if (r.competitionEnd) {
        titles++;
        names.add(r.competitionEnd.prefChampion);
        const id = c.regionIds.find((x) => c.teams[x].name === r.competitionEnd!.prefChampion);
        if (id && weak0.includes(id)) weakTitles++;
      }
      if (r.yearEnd) {
        year++;
        for (const id of c.regionIds) {
          const t = c.teams[id];
          const fr = t.players.filter((p) => p.year === 1).map(overall).sort((a, b) => b - a);
          if (t.prestige >= RECRUIT_MODEL.strongAt) fresh.strong.push(...fr);
          else if (t.prestige <= RECRUIT_MODEL.weakAt) { fresh.weak.push(...fr); fresh.weakBest.push(fr[0]); if (fr[0] >= 66) aces++; }
        }
        snap();
      }
    }
    distinct.push(names.size);
  }
  const at = (y: number, k: keyof Row) => avg(Y[y][k]).toFixed(1);
  console.log('\n' + JSON.stringify(variant));
  console.log(`  신입생 종합: 강팀 ${avg(fresh.strong).toFixed(1)} ±${sd(fresh.strong).toFixed(1)} (${range(fresh.strong)}) · 약팀 ${avg(fresh.weak).toFixed(1)} ±${sd(fresh.weak).toFixed(1)} (${range(fresh.weak)}) · 약팀이 66 이상 신입생을 받은 해 ${((100 * aces) / Math.max(1, fresh.weakBest.length)).toFixed(0)}%`);
  for (const y of [1, 3, 5, 7, YEARS + 1].filter((v) => Y[v])) {
    console.log(`  ${y}년차: 평균 ${at(y, 'mean')} · 상위3 ${at(y, 'top3')} · 하위3 ${at(y, 'bot3')} · 1위-16위 ${at(y, 'gap')} · 점수 차 ${at(y, 'margin')} · 1학년 주전 ${at(y, 'fresh')}`);
  }
  console.log(`  현 예선 우승 학교 수 ${distinct.join(', ')} · 초기 하위 6개교 우승 ${weakTitles}/${titles} · 5년차 이후 순위: 초기 상위 5개교 ${avg(strongRank).toFixed(1)}, 초기 하위 6개교 ${avg(weakRank).toFixed(1)}`);
}
