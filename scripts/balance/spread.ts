// 사용법: node scripts/balance/spread.ts [대진당 경기 수]
// 커리어 1일차의 실제 학교들(원작 데이터)끼리 모두 맞붙여, 전력 차에 따른 점수 차와 득점 분포를 본다.
// simulate.ts는 무작위 생성 팀으로 엔진만 보고, 이 스크립트는 실제 선수단·AI 전술이 얹힌 결과를 본다.
import { createCareer } from '../../src/game/career/season.ts';
import { teamOverall } from '../../src/game/team/school.ts';
import { simulateGame } from '../../src/game/match/engine.ts';

const N = Number(process.argv[2] ?? 30);
const state = createCareer({ seed: 1, dataset: 'original' });
const ids = state.regionIds;

interface Bucket { games: number; margin: number; favWins: number; fav: number; dog: number; max: number }
const buckets = new Map<string, Bucket>();
const bucketOf = (gap: number) => (gap < 3 ? ' 0~2' : gap < 6 ? ' 3~5' : gap < 10 ? ' 6~9' : gap < 15 ? '10~14' : gap < 20 ? '15~19' : '20+');

let games = 0, points = 0, over100 = 0, margin30 = 0, margin50 = 0, topScorer = 0, top40 = 0, topShare = 0;
let seed = 1;
for (const a of ids) for (const b of ids) {
  if (a === b) continue;
  const A = state.teams[a], B = state.teams[b];
  const oa = teamOverall(A), ob = teamOverall(B);
  const key = bucketOf(Math.abs(oa - ob));
  const bk = buckets.get(key) ?? { games: 0, margin: 0, favWins: 0, fav: 0, dog: 0, max: 0 };
  buckets.set(key, bk);
  for (let i = 0; i < N; i++) {
    const g = simulateGame(A, B, { seed: seed++ });
    const [sa, sb] = [g.score.home, g.score.away];
    const favScore = oa >= ob ? sa : sb, dogScore = oa >= ob ? sb : sa;
    bk.games++; bk.margin += favScore - dogScore; bk.fav += favScore; bk.dog += dogScore;
    if (favScore > dogScore) bk.favWins++;
    bk.max = Math.max(bk.max, Math.abs(sa - sb));
    games++; points += sa + sb;
    for (const s of [sa, sb]) if (s >= 100) over100++;
    if (Math.abs(sa - sb) >= 30) margin30++;
    if (Math.abs(sa - sb) >= 50) margin50++;
    for (const t of g.box) {
      const top = Math.max(...t.players.map((p) => p.pts));
      topScorer += top; topShare += top / Math.max(1, t.score);
      if (top >= 40) top40++;
    }
  }
}

const f = (x: number, d = 1) => x.toFixed(d);
console.log(`학교 ${ids.length}곳 · ${games}경기`);
console.log(`팀 평균 득점 ${f(points / games / 2)} · 100점 이상 ${f((100 * over100) / games / 2)}% · 30점 차 이상 ${f((100 * margin30) / games)}% · 50점 차 이상 ${f((100 * margin50) / games)}%`);
console.log(`팀 내 최다 득점자 평균 ${f(topScorer / games / 2)}점 (팀 득점의 ${f((100 * topShare) / games / 2)}%) · 40점 이상 ${f((100 * top40) / games / 2)}%`);
console.log('\n전력 차  경기   강팀 승률  평균 점수       평균 차  최대 차');
for (const key of [' 0~2', ' 3~5', ' 6~9', '10~14', '15~19', '20+']) {
  const b = buckets.get(key);
  if (!b) continue;
  console.log(`${key.padEnd(7)} ${String(b.games).padStart(5)}  ${f((100 * b.favWins) / b.games).padStart(6)}%   ${f(b.fav / b.games).padStart(5)} : ${f(b.dog / b.games).padEnd(5)}  ${f(b.margin / b.games).padStart(6)}  ${String(b.max).padStart(5)}`);
}

// ---- 에이스 한 명에게 득점이 얼마나 몰리는가: 평범한 팀(50)에 특급 선수(88) 한 명을 넣어 본다 ----
import { makeRng } from '../../src/game/rng.ts';
import { generatePlayer, generateTeam } from '../../src/game/team/generate.ts';

function aceTest(label: string, tactics: (aceId: string) => object) {
  const rng = makeRng(11);
  const M = 600;
  let pts = 0, fga = 0, teamFga = 0, reb = 0, wins = 0, max = 0, over40 = 0, fgm = 0;
  for (let i = 0; i < M; i++) {
    const a = generateTeam(rng, 'A', 50);
    const ace = generatePlayer(rng, 'ace', '에이스', 3, 88);
    a.players[2] = ace;
    a.tactics = { ...a.tactics, ...tactics(ace.id) };
    const b = generateTeam(rng, 'B', 55);
    const g = simulateGame(a, b, { seed: 5000 + i });
    const line = g.box[0].players.find((p) => p.id === 'ace')!;
    pts += line.pts; fga += line.fga; fgm += line.fgm; reb += line.orb + line.drb;
    teamFga += g.box[0].players.reduce((s, p) => s + p.fga, 0);
    if (g.winner === 'home') wins++;
    max = Math.max(max, line.pts);
    if (line.pts >= 40) over40++;
  }
  console.log(`${label}: 에이스 ${f(pts / M)}점 (최고 ${max}, 40점 이상 ${f((100 * over40) / M)}%) · 슛 점유 ${f((100 * fga) / teamFga)}% · 야투 ${f((100 * fgm) / fga)}% · 리바 ${f(reb / M)} · 팀 승률 ${f((100 * wins) / M)}%`);
}
console.log('\n에이스(88) + 평범한 동료(50) vs 55 팀');
aceTest('지시 없음  ', () => ({}));
aceTest('에이스 지정', (id) => ({ keyPlayerId: id }));
aceTest('지정+적극  ', (id) => ({ keyPlayerId: id, roles: { [id]: { offense: 'aggressive' } } }));
