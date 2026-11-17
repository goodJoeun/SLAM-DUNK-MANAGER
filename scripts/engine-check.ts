// 사용법: node scripts/engine-check.ts
// 원작 데이터로 경기 내용이 그럴듯한지 본다: 포지션별 슛 종류, 파울·퇴장, 전력 차에 따른 점수 차, 벤치 빅맨의 슛 수.
import { createCareer } from '../src/game/season.ts';
import { simulateGame, overall } from '../src/game/engine.ts';
import { teamOverall } from '../src/game/school.ts';
import type { Tactics, Team } from '../src/game/types.ts';

const N = 400;
const state = createCareer({ seed: 11, dataset: 'original' });
const teams = state.regionIds.map((id) => state.teams[id]);
const byName = (name: string) => teams.find((t) => t.name === name)!;
const fmt = (x: number, d = 1) => x.toFixed(d);

function series(a: Team, b: Team, tactics: Partial<Tactics> | null, n = N) {
  const A = tactics ? { ...a, tactics: { ...a.tactics, ...tactics } } : a;
  const per: Record<string, { sec: number; fga: number; tpa: number; pts: number; pf: number; gp: number }> = {};
  const tot = { win: 0, margin: 0, big: 0, ptsA: 0, ptsB: 0, fga: 0, tpa: 0, pf: 0, out: 0, max: 0 };
  for (let i = 0; i < n; i++) {
    const g = simulateGame(A, b, { seed: 1000 + i });
    const [x, y] = g.box;
    const m = x.score - y.score;
    tot.win += m > 0 ? 1 : 0; tot.margin += m; tot.big += Math.abs(m) >= 40 ? 1 : 0; tot.max = Math.max(tot.max, Math.abs(m));
    tot.ptsA += x.score; tot.ptsB += y.score;
    for (const p of x.players) {
      tot.fga += p.fga; tot.tpa += p.tpa; tot.pf += p.pf; tot.out += p.pf >= 5 ? 1 : 0;
      const s = (per[p.name] ??= { sec: 0, fga: 0, tpa: 0, pts: 0, pf: 0, gp: 0 });
      s.sec += p.sec; s.fga += p.fga; s.tpa += p.tpa; s.pts += p.pts; s.pf += p.pf; s.gp++;
    }
  }
  return { tot, per, n };
}

function show(label: string, a: Team, b: Team, tactics: Partial<Tactics> | null, names: string[] = []) {
  const { tot, per, n } = series(a, b, tactics);
  console.log(`\n[${label}] ${a.name}(${teamOverall(a)}) vs ${b.name}(${teamOverall(b)})`);
  console.log(`  승률 ${fmt((100 * tot.win) / n)}% · 평균 ${fmt(tot.ptsA / n)}-${fmt(tot.ptsB / n)} (차 ${fmt(tot.margin / n)}) · 40점 차 이상 ${fmt((100 * tot.big) / n)}% · 최대 ${tot.max}`);
  console.log(`  3점 비중 ${fmt((100 * tot.tpa) / tot.fga)}% · 파울 ${fmt(tot.pf / n)} · 퇴장 ${fmt(tot.out / n, 2)}명`);
  for (const name of names) {
    const s = per[name];
    if (!s) continue;
    const per30 = (v: number) => fmt((v / Math.max(1, s.sec)) * 1800);
    console.log(`    ${name}: ${fmt(s.sec / n / 60)}분 · 30분당 슛 ${per30(s.fga)} (3점 ${per30(s.tpa)}) · 득점 ${fmt(s.pts / n)} · 파울 ${fmt(s.pf / n)}`);
  }
}

const me = byName('북산고');
const stars = ['채치수', '정대만', '서태웅', '송태섭', '권준호', '강백호'];
console.log(me.players.slice(0, 8).map((p) => `${p.name} ${overall(p)}`).join(', '));
show('기본 전술', me, byName('무림고'), { focus: 'balanced', defense: 'man', pace: 0 }, stars);
show('외곽 중심·프레스·빠르게', me, byName('무림고'), { focus: 'outside', defense: 'press', pace: 1 }, stars);
show('골밑 중심', me, byName('무림고'), { focus: 'inside', defense: 'man', pace: 0 }, ['채치수', '정대만', '강백호']);
show('약체 상대(빠르게·프레스)', me, byName('등택북고'), { focus: 'outside', defense: 'press', pace: 1 });
show('약체 상대(기본)', me, byName('등택북고'), { focus: 'balanced', defense: 'man', pace: 0 });
show('강호 상대', me, byName('해남대부속고'), { focus: 'balanced', defense: 'man', pace: 0 });
show('최강 대 최약', byName('해남대부속고'), byName('상모고'), null);

// 포지션별 3점 비중 (현 전체, 각 학교의 기본 전술)
const pos = [0, 0, 0, 0, 0].map(() => ({ fga: 0, tpa: 0 }));
let games = 0; let pts = 0; let tpa = 0; let fga = 0;
for (let i = 0; i < 600; i++) {
  const a = teams[i % teams.length];
  const b = teams[(i * 7 + 3) % teams.length];
  if (a === b) continue;
  const g = simulateGame(a, b, { seed: 5000 + i });
  games++;
  for (const t of g.box) {
    pts += t.score;
    for (const p of t.players) { pos[p.pos - 1].fga += p.fga; pos[p.pos - 1].tpa += p.tpa; fga += p.fga; tpa += p.tpa; }
  }
}
console.log(`\n[현 전체 ${games}경기] 팀당 ${fmt(pts / games / 2)}점 · 3점 비중 ${fmt((100 * tpa) / fga)}%`);
console.log('  포지션별 3점 비중: ' + ['PG', 'SG', 'SF', 'PF', 'C'].map((n, i) => `${n} ${fmt((100 * pos[i].tpa) / pos[i].fga)}%`).join(' · '));
