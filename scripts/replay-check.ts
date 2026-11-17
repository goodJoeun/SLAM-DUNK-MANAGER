// 사용법: node scripts/replay-check.ts
// 직접 지휘하는 경기를 중간에 저장했다가 이어 해도 똑같이 흘러가는지 확인한다.
// 경기마다 무작위 조작(교체·전술·작전 타임·교체 방식)을 섞어 진행하고, 중간 지점에서 조작 기록을 JSON으로 저장한 뒤
// 새로 만든 경기에 재생해 점수·기록·중계가 같은지, 그 뒤로 끝까지 진행한 결과도 같은지 본다.
import { createCareer, playDay, prepareUserMatch, today } from '../src/game/season.ts';
import { makeRng } from '../src/game/rng.ts';
import { recording, replay, callsOf } from '../src/game/replay.ts';
import type { Call } from '../src/game/replay.ts';
import type { Game } from '../src/game/engine.ts';
import type { Rng } from '../src/game/rng.ts';

const FOCUS = ['balanced', 'inside', 'outside', 'spread'] as const;
const DEFENSE = ['man', 'zone', 'press', 'switch', 'drop'] as const;

// 감독이 할 법한 조작을 무작위로 한 번 한다
function meddle(game: Game, side: number, rng: Rng) {
  const me = game.view().teams[side];
  const roll = rng.int(0, 5);
  if (roll === 0 && me.bench.length) game.substitute(side, me.court[rng.int(0, 4)].id, me.bench[rng.int(0, me.bench.length - 1)].id);
  else if (roll === 1) game.setTactics(side, { focus: FOCUS[rng.int(0, 3)], pace: rng.int(-1, 1) });
  else if (roll === 2) game.setTactics(side, { defense: DEFENSE[rng.int(0, 4)], keyPlayerId: me.court[rng.int(0, 4)].id });
  else if (roll === 3) game.timeout(side);
  else if (roll === 4) game.setAuto(side, !me.auto);
  else game.setTactics(side, { roles: { [me.court[rng.int(0, 4)].id]: { offense: 'three', defense: 'tight' } } });
}

const snapshot = (game: Game) => {
  const r = game.result();
  return JSON.stringify({ score: r.score, periods: r.periods, box: r.box, log: r.log.length, last: r.log.at(-1), view: game.view() });
};

let matches = 0;
let failed = 0;
for (const seed of [3, 11, 27, 58]) {
  const career = createCareer({ seed, userTeamIndex: seed % 6, dataset: 'original' });
  const rng = makeRng(seed * 7919);
  while (!career.finished && matches < 400) {
    if (career.event) delete career.event; // 사건은 이 확인과 상관없다
    const d = today(career);
    if (!d) break;
    if (!d.userMatch) { playDay(career); continue; }

    const counter = career.counter; // 경기 시드는 이 값에서 나온다. 저장해 두었다가 같은 값에서 다시 만든다
    const live = prepareUserMatch(career);
    if (!live) throw new Error('경기일인데 경기를 만들지 못했습니다.');
    const game = recording(live.game);
    const stopAt = rng.int(5, 120); // 이 공격권 수에서 저장한다
    let steps = 0;
    while (!game.finished && steps < stopAt) {
      if (rng.chance(0.25)) meddle(game, live.side, rng);
      if (game.step()) steps++;
    }
    const saved = JSON.parse(JSON.stringify(callsOf(game))) as Call[]; // 저장소를 거친 것처럼
    const before = snapshot(game);

    career.counter = counter;
    const again = prepareUserMatch(career);
    if (!again) throw new Error('경기를 다시 만들지 못했습니다.');
    const ok = replay(again.game, saved);
    const same = ok && snapshot(again.game) === before;
    // 이어서 끝까지: 두 경기에 같은 조작을 넣으면 끝도 같아야 한다
    const resumed = recording(again.game, saved);
    const tail = makeRng(seed + matches);
    const tail2 = makeRng(seed + matches);
    while (!game.finished) { if (tail.chance(0.2)) meddle(game, live.side, tail); game.step(); }
    while (!resumed.finished) { if (tail2.chance(0.2)) meddle(resumed, live.side, tail2); resumed.step(); }
    const sameEnd = snapshot(game) === snapshot(resumed) && JSON.stringify(callsOf(game)) === JSON.stringify(callsOf(resumed));

    matches++;
    if (!same || !sameEnd) {
      failed++;
      console.log(`불일치: 시드 ${seed} · ${d.year}년차 ${d.day}일 · ${d.userMatch.label} · 저장 지점 ${steps}공격권 · 재생 ${ok} · 중간 ${same} · 끝 ${sameEnd}`);
    }
    playDay(career, { match: { ...live, game } });
  }
}
console.log(`${matches}경기 확인 · 불일치 ${failed}경기`);
if (failed) process.exit(1);
