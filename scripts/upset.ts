// 사용법: node scripts/upset.ts [전술 고르기 경기 수=80] [평가 경기 수=600]
// 약팀 감독이 잘 준비하면 강팀을 얼마나 잡을 수 있는지 잰다 (원작 데이터, 1년차 시작 시점의 약팀 대 강팀 대진).
//   방치: AI 감독이 고른 전술 그대로, 상대 분석 없음
//   조언: 코치 조언(상대 분석 3일)대로 + 준비 보너스
//   최선: 전술 60가지 + 에이스·집중 마크를 연습 경기로 고른 뒤 새 경기로 평가 (+ 준비 보너스)
// 상대는 늘 AI 감독의 전술을 쓴다. TUNE='{json}'으로 엔진 계수를 바꿔 볼 수 있다.
import { createCareer, PREPARATION } from '../src/game/season.ts';
import { adviseTactics } from '../src/game/advice.ts';
import { composites, simulateGame, TUNING } from '../src/game/engine.ts';
import { teamOverall } from '../src/game/school.ts';
import type { Defense, Focus, Tactics, Team } from '../src/game/types.ts';

const PICK = Number(process.argv[2] ?? 80);
const EVAL = Number(process.argv[3] ?? 600);
if (process.env.TUNE) for (const [k, v] of Object.entries(JSON.parse(process.env.TUNE))) { const T = TUNING as unknown as Record<string, unknown>; T[k] = typeof v === 'object' ? { ...(T[k] as object), ...(v as object) } : v; }
const PREP = Number(process.env.PREP ?? PREPARATION.perDay * PREPARATION.maxDays);
const state = createCareer({ seed: 11, dataset: 'original' });
const byName = (name: string) => Object.values(state.teams).find((t) => t.name === name)!;
const F: Focus[] = ['balanced', 'inside', 'outside', 'spread'];
const D: Defense[] = ['man', 'zone', 'press', 'switch', 'drop'];
const pct = (x: number) => `${(100 * x).toFixed(0)}%`.padStart(4);

function winRate(a: Team, b: Team, tactics: Partial<Tactics>, seed0: number, n: number, prep = 0) {
  const A = { ...a, tactics: { ...a.tactics, keyPlayerId: null, denyPlayerId: null, roles: {}, ...tactics } };
  let wins = 0;
  for (let i = 0; i < n; i++) if (simulateGame(A, b, { seed: seed0 + i, prep: [prep, 0] }).winner === 'home') wins++;
  return wins / n;
}
const star = (t: Team) => t.players.slice(0, 5).reduce((x, y) => (composites(y).usage > composites(x).usage ? y : x)).id;

const sum = { idle: 0, tactics: 0, advised: 0, best: 0, n: 0 };
function study(a: Team, b: Team) {
  const idle = winRate(a, b, a.tactics, 900001, EVAL);
  // 최선: 전술 60가지 중 상위 3개에 에이스·집중 마크를 붙여 다시 고른다
  const pick = (prep: number) => {
    const rows = F.flatMap((focus) => D.flatMap((defense) => [-1, 0, 1].map((pace) => { const t = { focus, defense, pace }; return { t: t as Partial<Tactics>, w: winRate(a, b, t, 1, PICK, prep) }; }))).sort((x, y) => y.w - x.w);
    const variants = rows.slice(0, 3).flatMap(({ t }) => [t, { ...t, denyPlayerId: star(b) }, { ...t, keyPlayerId: star(a) }, { ...t, keyPlayerId: star(a), denyPlayerId: star(b) }]);
    return variants.map((t) => ({ t, w: winRate(a, b, t, 50001, PICK * 3, prep) })).sort((x, y) => y.w - x.w)[0].t;
  };
  const tactics = winRate(a, b, pick(0), 900001, EVAL);
  const best = winRate(a, b, pick(PREP), 900001, EVAL, PREP);
  let advised = 0;
  for (let k = 0; k < 6; k++) advised += winRate(a, b, adviseTactics(a, b, PREPARATION.maxDays, 7000 + k * 997, PREP), 900001, EVAL / 6, PREP) / 6;
  console.log(`  ${`${a.name}(${teamOverall(a)}) vs ${b.name}(${teamOverall(b)})`.padEnd(30)} | 방치 ${pct(idle)} | 전술만 최선 ${pct(tactics)} | 조언+분석 ${pct(advised)} | 최선+분석 ${pct(best)}`);
  sum.idle += idle; sum.tactics += tactics; sum.advised += advised; sum.best += best; sum.n++;
}

console.log(`[약팀 대 강팀] 전술 고르기 ${PICK}경기 · 평가 ${EVAL}경기 · 준비 보너스 +${PREP.toFixed(1)}`);
for (const [a, b] of [['북산고', '해남대부속고'], ['북산고', '상양고'], ['능남고', '해남대부속고'], ['무림고', '북산고'], ['무림고', '능남고'], ['무림고', '상양고'], ['삼포고', '무림고'], ['삼포고', '북산고']]) study(byName(a), byName(b));
console.log(`  평균: 방치 ${pct(sum.idle / sum.n)} | 전술만 최선 ${pct(sum.tactics / sum.n)} | 조언+분석 ${pct(sum.advised / sum.n)} | 최선+분석 ${pct(sum.best / sum.n)}`);
