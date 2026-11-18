// 사용법: node scripts/balance/deny-check.ts [경기 수=600]
// 집중 마크를 누구에게 맡기느냐에 따라 결과가 얼마나 달라지는지 잰다 (원작 데이터, 1년차 시작 시점).
//   대상은 상대 팀에서 평소 가장 많이 넣는 선수. 담당 수비수를 선발 다섯 명으로 바꿔 가며 승률, 대상의 득점,
//   담당 수비수 본인의 득점·출전 시간을 본다. 교체는 양 팀 모두 자동이다.
import { createCareer } from '../../src/game/career/season.ts';
import { denyOutlook, simulateGame } from '../../src/game/match/engine.ts';
import type { Tactics, Team } from '../../src/game/types.ts';

const N = Number(process.argv[2] ?? 600);
const state = createCareer({ seed: 11, dataset: 'original' });
const teams = state.regionIds.map((id) => state.teams[id]);
const byName = (name: string) => teams.find((t) => t.name === name)!;
const f1 = (x: number) => x.toFixed(1);

function run(a: Team, b: Team, tactics: Partial<Tactics>) {
  const A = { ...a, tactics: { ...a.tactics, keyPlayerId: null, denyPlayerId: null, roles: {}, ...tactics } };
  const per: Record<string, { pts: number; fga: number; sec: number }> = {};
  let wins = 0, margin = 0;
  for (let i = 0; i < N; i++) {
    const g = simulateGame(A, b, { seed: 5000 + i });
    if (g.winner === 'home') wins++;
    margin += g.score.home - g.score.away;
    for (const t of g.box) for (const p of t.players) {
      const s = (per[p.id] ??= { pts: 0, fga: 0, sec: 0 });
      s.pts += p.pts; s.fga += p.fga; s.sec += p.sec;
    }
  }
  return { win: (100 * wins) / N, margin: margin / N, per };
}

function study(aName: string, bName: string) {
  const a = byName(aName), b = byName(bName);
  const base = run(a, b, {});
  const target = b.players.slice(0, 5).reduce((x, y) => (base.per[y.id].pts > base.per[x.id].pts ? y : x));
  const line = (label: string, r: ReturnType<typeof run>, markerId?: string) => {
    const t = r.per[target.id];
    const m = markerId ? r.per[markerId] : null;
    const mb = markerId ? base.per[markerId] : null;
    console.log(
      `  ${label.padEnd(22)} 승률 ${f1(r.win).padStart(5)}% · 점수 차 ${f1(r.margin).padStart(6)} · ${target.name} ${f1(t.pts / N).padStart(4)}점 (슛 ${f1(t.fga / N)}개)` +
      (m && mb ? ` · 담당 ${f1(m.pts / N)}점 (평소 ${f1(mb.pts / N)}) ${f1(m.sec / N / 60)}분 (평소 ${f1(mb.sec / N / 60)})` : ''),
    );
  };
  console.log(`\n=== ${a.name} vs ${b.name} · 대상 ${target.name} (${N}경기) ===`);
  line('집중 마크 없음', base);
  line('담당 미지정(같은 자리)', run(a, b, { denyPlayerId: target.id }));
  for (const p of a.players.slice(0, 5)) {
    const o = denyOutlook(p, target);
    const label = `${p.name} (효과${Math.round(o.power * 100)}${o.slower ? '·느림' : ''}${o.smaller ? '·작음' : ''}${o.weaker ? '·힘' : ''})`;
    line(label, run(a, b, { denyPlayerId: target.id, denyDefenderId: p.id } as Partial<Tactics>), p.id);
  }
}

study('북산고', '능남고');
study('북산고', '해남대부속고');
study('능남고', '상양고');
study('능남고', '북산고');
study('해남대부속고', '북산고');
