// 직접 지휘하는 경기를 이어 하기 위한 조작 기록과 재생.
// 엔진의 경기는 난수와 상태를 안에 들고 있어 그대로는 저장할 수 없다. 대신 같은 시드로 만든 경기는
// 같은 조작을 같은 순서로 넣으면 똑같이 흘러가므로, 엔진에 넣은 조작만 순서대로 적어 두었다가 다시 넣는다.
import type { Game } from './engine.ts';
import type { Tactics } from './types.ts';

// 's' 공격권 하나 진행 · 't' 전술 변경 · 'a' 교체 방식(AI 코치/직접) · 'x' 교체 · 'o' 작전 타임
export type Call = 's' | ['t', number, Partial<Tactics>] | ['a', number, boolean] | ['x', number, string, string] | ['o', number];

const recorded = new WeakMap<Game, Call[]>();

// 조작을 calls에 적으면서 그대로 엔진에 넘기는 경기. 실패한 조작(이미 끝난 경기, 할 수 없는 교체)은 적지 않는다.
export function recording(game: Game, calls: Call[] = []): Game {
  const step = () => {
    const r = game.step();
    if (r) calls.push('s');
    return r;
  };
  const wrapped: Game = {
    step,
    timeout(side) {
      const ok = game.timeout(side);
      if (ok) calls.push(['o', side]);
      return ok;
    },
    get finished() { return game.finished; },
    playPeriod() {
      const events = [];
      let s;
      while ((s = step())) { events.push(...s.events); if (s.periodEnded) break; }
      return events;
    },
    playToEnd() { while (step()); return game.result(); },
    setAuto(side, auto) { game.setAuto(side, auto); calls.push(['a', side, auto]); },
    setTactics(side, patch) { game.setTactics(side, patch); calls.push(['t', side, { ...patch }]); },
    substitute(side, outId, inId) {
      const ok = game.substitute(side, outId, inId);
      if (ok) calls.push(['x', side, outId, inId]);
      return ok;
    },
    view: () => game.view(),
    result: () => game.result(),
  };
  recorded.set(wrapped, calls);
  return wrapped;
}

// recording으로 감싼 경기의 조작 기록 (감싸지 않은 경기면 null)
export const callsOf = (game: Game): Call[] | null => recorded.get(game) ?? null;

// 새로 만든 경기에 조작 기록을 다시 넣는다. 기록과 어긋나면(끝난 경기에 공격권, 안 되는 교체) false.
export function replay(game: Game, calls: Call[]): boolean {
  for (const c of calls) {
    if (c === 's') { if (!game.step()) return false; }
    else if (c[0] === 't') game.setTactics(c[1], c[2]);
    else if (c[0] === 'a') game.setAuto(c[1], c[2]);
    else if (c[0] === 'x') { if (!game.substitute(c[1], c[2], c[3])) return false; }
    else if (!game.timeout(c[1])) return false;
  }
  return true;
}
