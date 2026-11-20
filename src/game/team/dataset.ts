// 데이터 파일(src/game/data/*.ts)의 학교·선수 명세를 실제 팀으로 만든다.
import { ARCHETYPE, RATING_KEYS } from './generate.ts';
import { newPlayer, setLineup, SCHOOL } from './school.ts';
import { randomName } from './names.ts';
import { ORIGINAL } from '../data/original.ts';
import type { Rng } from '../rng.ts';
import type { Career, Dataset, DatasetKey, LocalName, NameStyle, Player, PlayerSpec, Ratings, SchoolSpec, Team } from '../types.ts';

export const DATASETS: Record<DatasetKey, Dataset> = { original: ORIGINAL };

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const label = (name: LocalName, style: NameStyle | null) => (style ? name[style] ?? name.kr : name.kr);

// 명세에 적힌 선수 한 명. grade = 지금 학년 (명세의 학년보다 높으면 그만큼 성장한 상태)
function fixedPlayer(state: Career, spec: PlayerSpec, grade: number): Player {
  const level = spec.level + SCHOOL.growthPerYear * (grade - spec.year);
  const ratings = {} as Ratings; // 아래에서 전 능력치를 채운다
  for (const k of RATING_KEYS) {
    // 대인 수비·팀 수비 보정을 따로 적지 않은 선수는 수비IQ 보정을 그대로 따른다
    const tweak = spec.tweaks[k] ?? (k === 'mdf' || k === 'tdf' ? spec.tweaks.diq : undefined) ?? 0;
    const base = level + (k === 'ft' ? 8 : 0) + (ARCHETYPE[spec.pos][k] ?? 0) + tweak;
    ratings[k] = Math.round(clamp(base, 5, 99));
  }
  return {
    id: `p${state.nextId++}`, name: label(spec.name, state.nameStyle), pos: spec.pos, ratings,
    year: grade, potential: spec.potential, hidden: { consistency: spec.consistency },
    condition: 100, injuredDays: 0, progress: {}, focus: null, fixed: true,
  };
}

// 2년차 이후에 새로 만드는 학교(전국 대회에서 만나는 다른 현 대표)의 세대교체.
//   gap    졸업한 원작 선수의 자리를 잇는 후계자가 그 선수보다 얼마나 못한가. 강호는 주축이 졸업해도 비슷한 전력을 유지한다
//          (후계자가 없으면 3년차의 산왕이 평범한 팀이 되어, 꾸준히 자라는 우리 현 대표가 전국 우승을 쉽게 가져간다)
//   growth 우리 현 학교들이 해마다 훈련으로 강해지는 만큼, 다른 현의 생성 선수 수준도 해마다 이만큼 오른다
export const SUCCESSION = { gap: 4, spread: 2, growth: 1 };

// 졸업한 원작 선수의 자리를 잇는 선수: 같은 포지션·비슷한 유형, 이름과 세부 능력은 새로 정한다
function successor(rng: Rng, state: Career, spec: PlayerSpec, grade: number): Player {
  const year = ((grade - 1) % 3) + 1; // 졸업한 뒤 몇 해가 지났는가에 따라 1~3학년
  const p = fixedPlayer(state, { ...spec, year, level: spec.level - SUCCESSION.gap + rng.gauss(0, SUCCESSION.spread) }, year);
  return { ...p, name: randomName(rng, state.nameStyle, p.id.slice(1)), fixed: false, potential: Math.round(clamp(rng.gauss(55, 15), 10, 95)) };
}

// 명세의 선수를 넣고, 학년별로 모자란 자리는 생성 선수로 채운다
export function buildSchool(rng: Rng, state: Career, spec: SchoolSpec) {
  const team: Team = { id: `t${state.nextId++}`, name: label(spec.name, state.nameStyle), prestige: spec.prestige, players: [], tactics: {} };
  for (const p of spec.players) {
    const grade = p.year + state.year - 1;
    team.players.push(grade <= 3 ? fixedPlayer(state, p, grade) : successor(rng, state, p, grade)); // 원작 시점 이후 졸업한 선수의 자리는 후계자가 잇는다
  }
  const level = (spec.benchLevel ?? spec.prestige) + SUCCESSION.growth * (state.year - 1);
  for (let year = 3; year >= 1; year--) {
    while (team.players.filter((p) => p.year === year).length < SCHOOL.classSize) {
      const count = [1, 2, 3, 4, 5].map((pos) => team.players.filter((p) => p.pos === pos).length + rng.next() * 0.5);
      team.players.push(newPlayer(rng, state, count.indexOf(Math.min(...count)) + 1, level, year));
    }
  }
  setLineup(team);
  return team;
}
