// 사용법:
//   node scripts/simulate.ts           -> 대량 시뮬레이션 통계 (밸런스 검증)
//   node scripts/simulate.ts game 42   -> 시드 42로 한 경기 중계 + 박스스코어
import { makeRng } from '../src/game/rng.ts';
import { generateTeam } from '../src/game/generate.ts';
import { simulateGame } from '../src/game/engine.ts';
import type { BoxTeam, Tactics } from '../src/game/types.ts';

type Totals = Record<string, number>;

const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '-');

function teamTotals(t: BoxTeam) {
  const o: Totals = {};
  for (const k of ['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf'] as const) o[k] = t.players.reduce((s, p) => s + p[k], 0);
  o.poss = t.possessions;
  return o;
}

function batch(label: string, qa: number, qb: number, n: number, tacticsA: Partial<Tactics> = {}, tacticsB: Partial<Tactics> = {}) {
  const rng = makeRng(7);
  const tot: Totals[] = [{}, {}];
  const add = (o: Totals, k: string, v: number) => { o[k] = (o[k] ?? 0) + v; };
  let winsA = 0;
  let ot = 0;
  for (let i = 0; i < n; i++) {
    const a = generateTeam(rng, 'A', qa, tacticsA);
    const b = generateTeam(rng, 'B', qb, tacticsB);
    const g = simulateGame(a, b, { seed: 1000 + i });
    if (g.winner === 'home') winsA++;
    if (g.periods > 4) ot++;
    g.box.forEach((t, ti) => {
      const x = teamTotals(t);
      for (const k in x) add(tot[ti], k, x[k]);
      const bench = t.players.filter((p) => !p.starter);
      add(tot[ti], 'subs', t.subs);
      add(tot[ti], 'starterMin', t.players.filter((p) => p.starter).reduce((s, p) => s + p.sec, 0) / 300);
      add(tot[ti], 'benchMin', bench.reduce((s, p) => s + p.sec, 0) / 300);
      add(tot[ti], 'benchUnused', bench.filter((p) => p.sec === 0).length);
      add(tot[ti], 'fouledOut', t.players.filter((p) => p.pf >= 5).length);
    });
  }
  console.log(`\n[${label}] ${n}경기 · A 승률 ${pct(winsA, n)}% · 연장 ${pct(ot, n)}%`);
  tot.forEach((x, ti) => {
    const per = (k: string, d = 1) => (x[k] / n).toFixed(d);
    const opp = tot[1 - ti];
    console.log(
      `  ${'AB'[ti]}: 득점 ${per('pts')} · 공격권 ${per('poss')} · FG ${pct(x.fgm, x.fga)}% · 3P ${pct(x.tpm, x.tpa)}% (비중 ${pct(x.tpa, x.fga)}%) · FT ${per('fta')}개 · 공리 ${pct(x.orb, x.orb + opp.drb)}% · 어시 ${per('ast')} · 스틸 ${per('stl')} · 블록 ${per('blk')} · 턴오버 ${per('tov')} · 파울 ${per('pf')}`,
    );
    console.log(
      `     교체 ${per('subs')}회 · 주전 ${per('starterMin')}분 · 벤치 ${per('benchMin')}분 · 미출전 벤치 ${per('benchUnused', 2)}명 · 퇴장 ${per('fouledOut', 2)}명`,
    );
  });
}

function oneGame(seed: number) {
  const rng = makeRng(seed);
  const g = simulateGame(generateTeam(rng, '홈', 55), generateTeam(rng, '원정', 52), { seed, log: true });
  for (const e of g.log) console.log(`${e.period}Q ${e.clock.padStart(5)} [${e.score}] ${e.team}: ${e.text}`);
  for (const t of g.box) {
    console.log(`\n${t.name} ${t.score}점`);
    console.log('  선수        OVR  분   득점  FG     3P    FT    리바 어시 스틸 블록 턴오버 파울');
    for (const p of t.players) {
      console.log(
        `  ${p.name.padEnd(9)} ${String(p.ovr).padStart(3)} ${String(Math.round(p.sec / 60)).padStart(3)}  ${String(p.pts).padStart(3)}   ${`${p.fgm}/${p.fga}`.padEnd(6)} ${`${p.tpm}/${p.tpa}`.padEnd(5)} ${`${p.ftm}/${p.fta}`.padEnd(5)} ${String(p.orb + p.drb).padStart(3)}  ${String(p.ast).padStart(3)}  ${String(p.stl).padStart(3)}  ${String(p.blk).padStart(3)}  ${String(p.tov).padStart(3)}   ${String(p.pf).padStart(3)}`,
      );
    }
  }
}

if (process.argv[2] === 'game') {
  oneGame(Number(process.argv[3] ?? 1));
} else {
  const N = 2000;
  batch('동급 (50 vs 50)', 50, 50, N);
  batch('소폭 우세 (55 vs 50)', 55, 50, N);
  batch('우세 (58 vs 50)', 58, 50, N);
  batch('강호 vs 약체 (65 vs 40)', 65, 40, N);
  batch('전술: 외곽 중심 vs 기본', 50, 50, N, { focus: 'outside' }, {});
  batch('전술: 골밑 중심 vs 기본', 50, 50, N, { focus: 'inside' }, {});
  batch('전술: 프레스 vs 기본', 50, 50, N, { defense: 'press' }, {});
  batch('전술: 존 vs 기본', 50, 50, N, { defense: 'zone' }, {});
  batch('전술: 존 vs 외곽 중심', 50, 50, N, { defense: 'zone' }, { focus: 'outside' });
  batch('전술: 존 vs 골밑 중심', 50, 50, N, { defense: 'zone' }, { focus: 'inside' });
  batch('전술: 빠른 템포 vs 느린 템포', 50, 50, N, { pace: 1 }, { pace: -1 });
}
