// 코치의 상대 분석: 다음 상대를 가정한 짧은 모의 경기로 공격 중심·수비·집중 마크 대상을 고른다.
// 모의 경기는 커리어 난수를 쓰지 않는 고정 시드로 돌리므로, 분석해도 실제 경기 결과의 흐름은 바뀌지 않는다.
// 준비 보너스는 이 계획을 경기 시작 때 얼마나 따랐는지에 따라 달라진다 (season.ts).
import { simulateGame, composites } from './engine.ts';
import type { Composites, Defense, Focus, PrepPlan, Tactics, Team } from './types.ts';

const SIM_GAMES = 200; // 계획 하나를 비교할 때 쓰는 모의 경기 수 (계획 하나에 약 1.5초)
const FOCI: Focus[] = ['balanced', 'inside', 'outside', 'spread'];
const DEFENSES: Defense[] = ['man', 'zone', 'press', 'switch', 'drop'];

function hash(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 16777619) >>> 0;
  return h;
}

// 같은 시드 묶음으로 비교해 운의 차이를 줄인다
function winRate(me: Team, opp: Team, tactics: Partial<Tactics>, seed0: number) {
  const mine = { ...me, tactics };
  let wins = 0;
  for (let i = 0; i < SIM_GAMES; i++) {
    const home = i % 2 === 0;
    const g = home ? simulateGame(mine, opp, { seed: seed0 + i }) : simulateGame(opp, mine, { seed: seed0 + i });
    if ((g.winner === 'home') === home) wins++;
  }
  return wins / SIM_GAMES;
}

const avg = (team: Team, f: (c: Composites) => number) => team.players.slice(0, 5).map(composites).reduce((s, c) => s + f(c), 0) / 5;

export function makePlan(me: Team, opp: Team): PrepPlan {
  const seed0 = hash(`${me.id}:${opp.id}:${opp.players.map((p) => p.id).join(',')}`);
  const base: Partial<Tactics> = { ...me.tactics, keyPlayerId: null, denyPlayerId: null };
  const best = <T>(options: T[], make: (x: T) => Partial<Tactics>) =>
    options.map((x) => ({ x, r: winRate(me, opp, make(x), seed0) })).sort((a, b) => b.r - a.r)[0].x;

  const focus = best(FOCI, (f) => ({ ...base, focus: f, defense: base.defense ?? 'man' }));
  const defense = best(DEFENSES, (d) => ({ ...base, focus, defense: d }));
  const stars = [...opp.players.slice(0, 5)].sort((a, b) => composites(b).usage - composites(a).usage).slice(0, 2);
  const deny = best<string | null>([null, ...stars.map((p) => p.id)], (id) => ({ ...base, focus, defense, denyPlayerId: id }));
  const denyName = deny ? opp.players.find((p) => p.id === deny)?.name ?? null : null;

  const notes: string[] = [];
  if (focus === 'inside') notes.push('공격은 골밑 중심으로. 상대 골밑 수비를 상대로 우리 안쪽 공격이 가장 잘 통했습니다.');
  else if (focus === 'outside') notes.push('공격은 외곽 중심으로. 우리 외곽슛이 상대 외곽 수비를 이겨 냅니다.');
  else if (focus === 'spread') notes.push('공격은 5아웃으로. 다섯 명이 모두 벌려 서서 돌파와 3점만 노리세요. 중거리는 버립니다.');
  else notes.push('공격은 균형 있게. 한쪽으로 몰면 상대가 쉽게 대응합니다.');
  const theirThree = avg(opp, (c) => c.three);
  if (defense === 'zone') notes.push('수비는 존으로. 상대 슈터가 약해 골밑을 지키는 편이 유리합니다.');
  else if (defense === 'press') notes.push('수비는 프레스로. 상대 볼 핸들링이 흔들려 실책을 끌어낼 수 있습니다.');
  else if (defense === 'switch') notes.push('수비는 스위치로. 스크린마다 바꿔 막아 상대 슈터에게 오픈 찬스를 주지 마세요.');
  else if (defense === 'drop') notes.push('수비는 드롭으로. 빅맨은 골밑을 지키고, 중거리 풀업은 내줘도 됩니다.');
  else notes.push(theirThree > 0.6 ? '수비는 맨투맨으로. 상대 외곽슛이 좋아 존은 위험합니다.' : '수비는 맨투맨으로. 가장 안정적으로 막았습니다.');
  notes.push(denyName ? `${denyName}을(를) 집중 마크하세요. 상대 공격의 열쇠입니다.` : '특정 선수를 묶기보다 팀 수비로 막는 편이 나았습니다.');
  return { focus, defense, denyId: deny, denyName, notes };
}

// 경기 시작 때 전술이 계획을 몇 가지 따랐는지 (0~3)
export function followed(tactics: Partial<Tactics>, plan: PrepPlan) {
  return (
    Number((tactics.focus ?? 'balanced') === plan.focus) +
    Number((tactics.defense ?? 'man') === plan.defense) +
    Number((tactics.denyPlayerId ?? null) === plan.denyId)
  );
}
