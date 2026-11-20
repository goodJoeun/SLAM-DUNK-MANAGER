// 훈련 메뉴와 능력치가 실제 경기에 어떤 효과를 내는지 잰다 (원작 데이터).
//   node scripts/balance/training-effect.ts [경기 수=1000]
// [1] 메뉴별: 한 해 훈련일(58일)을 한 메뉴에만 쓴 팀이 훈련 전의 자기 팀과 붙는다 -> 능력치 상승, 승률, 기록 변화
// [2] 능력치별: 선수 전원의 능력치 하나만 +5 한 팀이 원래 팀과 붙는다 -> 능력치 1점의 값어치
// [3] 강도별: 같은 기간을 가볍게·보통·강하게로 보냈을 때의 성장과 휴식·부상
// 경기는 두 팀 모두 균형 공격·맨투맨·보통 템포, 컨디션 100으로 치른다 (훈련 피로가 아니라 능력치의 효과만 본다).
import { createCareer } from '../../src/game/career/season.ts';
import { composites, simulateGame } from '../../src/game/match/engine.ts';
import { makeRng } from '../../src/game/rng.ts';
import { GROWTH, INTENSITY, PROGRAMS, RATING_LABEL, overnight, teamOverall, trainTeam } from '../../src/game/team/school.ts';
import type { Composites, IntensityKey, ProgramKey, RatingKey, Team } from '../../src/game/types.ts';

const N = Number(process.argv[2] ?? 1000);
const DAYS = 58; // 한 해의 훈련일 수 (SEASON.calendar의 T)
const TACTICS = { focus: 'balanced', defense: 'man', pace: 0, keyPlayerId: null, denyPlayerId: null } as const;
const career = createCareer({ seed: 11, dataset: 'original' });
const pick = (name: string) => structuredClone(Object.values(career.teams).find((t) => t.name === name)!);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sign = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;
const fresh = (t: Team): Team => ({ ...t, tactics: { ...TACTICS }, players: t.players.map((p) => ({ ...p, condition: 100, injuredDays: 0, morale: undefined })) });

// 한 메뉴로 days일을 보낸다. 지치면(평균 컨디션 55 미만) 쉰다.
function train(base: Team, program: ProgramKey, intensity: IntensityKey, seed: number, days = DAYS) {
  const team = structuredClone(base);
  const rng = makeRng(seed);
  let sessions = 0, rests = 0, injuries = 0;
  for (let d = 0; d < days; d++) {
    const fit = team.players.filter((p) => !p.injuredDays);
    const tired = mean(fit.map((p) => p.condition)) < 55;
    const r = trainTeam(rng, team, tired ? 'rest' : program, intensity);
    if (tired) rests++; else sessions++;
    injuries += r.injuries.length;
    overnight(team);
  }
  return { team, sessions, rests, injuries };
}

interface Line { win: number; margin: number; fg: number; tp: number; tpa: number; ft: number; reb: number; tov: number; ast: number; stl: number; blk: number; oppFg: number; oppTov: number; pts: number; oppPts: number }
// a가 b와 n경기 (홈·원정 번갈아). a 쪽의 승률과 기록
function play(a0: Team, b0: Team, n = N): Line {
  const a = fresh(a0), b = fresh(b0);
  const t = { w: 0, m: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, oreb: 0, tov: 0, ast: 0, stl: 0, blk: 0, ofgm: 0, ofga: 0, otov: 0, pts: 0, opts: 0 };
  for (let i = 0; i < n; i++) {
    const home = i % 2 === 0;
    const g = home ? simulateGame(a, b, { seed: 5000 + i }) : simulateGame(b, a, { seed: 5000 + i });
    const mine = g.box[home ? 0 : 1], opp = g.box[home ? 1 : 0];
    if (mine.score > opp.score) t.w++;
    t.m += mine.score - opp.score; t.pts += mine.score; t.opts += opp.score;
    for (const p of mine.players) { t.fgm += p.fgm; t.fga += p.fga; t.tpm += p.tpm; t.tpa += p.tpa; t.ftm += p.ftm; t.fta += p.fta; t.reb += p.orb + p.drb; t.tov += p.tov; t.ast += p.ast; t.stl += p.stl; t.blk += p.blk; }
    for (const p of opp.players) { t.ofgm += p.fgm; t.ofga += p.fga; t.otov += p.tov; t.oreb += p.orb + p.drb; }
  }
  return {
    win: t.w / n, margin: t.m / n, fg: t.fgm / t.fga, tp: t.tpm / t.tpa, tpa: t.tpa / n, ft: t.ftm / t.fta, reb: t.reb / (t.reb + t.oreb), tov: t.tov / n,
    ast: t.ast / n, stl: t.stl / n, blk: t.blk / n, oppFg: t.ofgm / t.ofga, oppTov: t.otov / n, pts: t.pts / n, oppPts: t.opts / n,
  };
}
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const pp = (x: number) => `${sign(100 * x)}%p`;
const statDelta = (l: Line, base: Line) =>
  `야투 ${pp(l.fg - base.fg)} · 3점 ${pp(l.tp - base.tp)} · 자유투 ${pp(l.ft - base.ft)} · 리바 점유 ${pp(l.reb - base.reb)} · 실책 ${sign(l.tov - base.tov)} · 스틸 ${sign(l.stl - base.stl)} · 블록 ${sign(l.blk - base.blk)} · 상대 야투 ${pp(l.oppFg - base.oppFg)}`;

const COMP_LABEL: Partial<Record<keyof Composites, string>> = {
  rim: '림 공격', post: '포스트', mid: '미들', three: '3점', ballHandling: '볼 핸들링', passing: '패스', rebounding: '리바운드',
  defInterior: '골밑 1대1', defPerimeter: '외곽 1대1', helpInterior: '골밑 도움', helpPerimeter: '외곽 도움', stealing: '스틸', blocking: '블록', endurance: '지구력',
};
const compAvg = (t: Team) => {
  const cs = t.players.slice(0, 8).map(composites);
  return Object.fromEntries((Object.keys(COMP_LABEL) as (keyof Composites)[]).map((k) => [k, mean(cs.map((c) => c[k]))])) as Record<keyof Composites, number>;
};

const programs = (Object.keys(PROGRAMS) as ProgramKey[]).filter((k) => PROGRAMS[k].keys.length);
const se = 100 * Math.sqrt(0.25 / N);
console.log(`경기 수 ${N} (승률 표본 오차 ±${(1.96 * se).toFixed(1)}%p) · 훈련 ${DAYS}일 · 보통 강도\n`);

for (const name of ['북산고', '삼포고']) {
  const base = pick(name);
  const mirror = play(base, base);
  console.log(`===== ${name} (전력 ${teamOverall(base)}, 주요 8명 능력치 평균 ${mean(base.players.slice(0, 8).flatMap((p) => Object.entries(p.ratings).filter(([k]) => k !== 'hgt').map(([, v]) => v))).toFixed(0)}) =====`);
  console.log(`기준(훈련 전 팀끼리): 승률 ${pct(mirror.win)} · ${mirror.pts.toFixed(1)}-${mirror.oppPts.toFixed(1)}\n`);

  console.log('[1] 메뉴 하나만 한 해 훈련 → 훈련 전의 자기 팀과 대결');
  for (const program of programs) {
    const P = PROGRAMS[program];
    // 성장량은 훈련 난수 3개의 평균, 경기는 첫 번째 팀으로
    const runs = [1, 2, 3].map((seed) => train(base, program, 'normal', seed));
    const gainOf = (k: RatingKey) => mean(runs.map((r) => mean(r.team.players.map((p, i) => p.ratings[k] - base.players[i].ratings[k]))));
    const others = (Object.keys(RATING_LABEL) as RatingKey[]).filter((k) => !P.keys.includes(k) && k !== 'hgt');
    const trained = runs[0].team;
    const line = play(trained, base);
    const c0 = compAvg(base), c1 = compAvg(trained);
    const moved = (Object.keys(COMP_LABEL) as (keyof Composites)[]).map((k) => ({ k, d: 100 * (c1[k] - c0[k]) })).filter((x) => x.d >= 0.8).sort((a, b) => b.d - a.d);
    console.log(`  ${P.label} (${P.keys.map((k) => RATING_LABEL[k]).join('·')})`);
    console.log(`    능력치: ${P.keys.map((k) => `${RATING_LABEL[k]} ${sign(gainOf(k))}`).join(' · ')} · 그 밖 평균 ${sign(mean(others.map(gainOf)))} · 팀 전력 ${teamOverall(base)}→${teamOverall(trained)}`);
    console.log(`    경기력 요소: ${moved.map((x) => `${COMP_LABEL[x.k]} ${sign(x.d)}`).join(' · ') || '뚜렷한 변화 없음'}`);
    console.log(`    승률 ${pct(line.win)} (${pp(line.win - mirror.win)}) · 득실 ${sign(line.margin)} · ${statDelta(line, mirror)}`);
  }

  console.log('\n[2] 능력치 하나만 전원 +5 → 원래 팀과 대결 (승률 변화가 큰 순)');
  const rows = (Object.keys(RATING_LABEL) as RatingKey[]).map((k) => {
    const up = structuredClone(base);
    for (const p of up.players) p.ratings[k] = Math.min(99, p.ratings[k] + 5);
    const line = play(up, base, N * 2);
    return { k, line, ovr: teamOverall(up) - teamOverall(base) };
  }).sort((a, b) => b.line.win - a.line.win);
  for (const r of rows) {
    const where = programs.filter((p) => PROGRAMS[p].keys.includes(r.k)).map((p) => PROGRAMS[p].label).join(', ') || '훈련 불가';
    console.log(`  ${RATING_LABEL[r.k].padEnd(6)} 승률 ${pp(r.line.win - 0.5).padStart(8)} · 득실 ${sign(r.line.margin).padStart(5)} · 전력 표시 ${sign(r.ovr, 0)} · ${statDelta(r.line, mirror)}  [${where}]`);
  }

  console.log('\n[3] 강도별 (슈팅만 한 해, 훈련 난수 3개 평균)');
  for (const intensity of Object.keys(INTENSITY) as IntensityKey[]) {
    const runs = [1, 2, 3].map((seed) => train(base, 'shooting', intensity, seed));
    const gain = mean(runs.map((r) => mean(PROGRAMS.shooting.keys.map((k) => mean(r.team.players.map((p, i) => p.ratings[k] - base.players[i].ratings[k]))))));
    console.log(`  ${INTENSITY[intensity].label.padEnd(4)} 훈련 ${mean(runs.map((r) => r.sessions)).toFixed(0)}일 · 휴식 ${mean(runs.map((r) => r.rests)).toFixed(0)}일 · 부상 ${mean(runs.map((r) => r.injuries)).toFixed(1)}건 · 슈팅 능력치 평균 ${sign(gain)} · 마지막 날 평균 컨디션 ${mean(runs.map((r) => mean(r.team.players.map((p) => p.condition)))).toFixed(0)}`);
  }
  console.log('');
}
void GROWTH;
