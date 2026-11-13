// 데이터 파일(src/data/*.js)의 학교·선수 명세를 실제 팀으로 만든다.
import { ARCHETYPE, RATING_KEYS } from './generate.js';
import { newPlayer, setLineup, SCHOOL } from './school.js';
import { ORIGINAL } from './data/original.js';

export const DATASETS = { original: ORIGINAL };

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const label = (name, style) => name[style] ?? name.kr;

// 명세에 적힌 선수 한 명. grade = 지금 학년 (명세의 학년보다 높으면 그만큼 성장한 상태)
function fixedPlayer(state, spec, grade) {
  const level = spec.level + SCHOOL.growthPerYear * (grade - spec.year);
  const ratings = {};
  for (const k of RATING_KEYS) {
    const base = level + (k === 'ft' ? 8 : 0) + (ARCHETYPE[spec.pos][k] ?? 0) + (spec.tweaks[k] ?? 0);
    ratings[k] = Math.round(clamp(base, 5, 99));
  }
  return {
    id: `p${state.nextId++}`, name: label(spec.name, state.nameStyle), pos: spec.pos, ratings,
    year: grade, potential: spec.potential, hidden: { consistency: spec.consistency },
    condition: 100, injuredDays: 0, progress: {}, focus: null, fixed: true,
  };
}

// 명세의 선수를 넣고, 학년별로 모자란 자리는 생성 선수로 채운다
export function buildSchool(rng, state, spec) {
  const team = { id: `t${state.nextId++}`, name: label(spec.name, state.nameStyle), prestige: spec.prestige, players: [], tactics: {} };
  for (const p of spec.players) {
    const grade = p.year + state.year - 1;
    if (grade <= 3) team.players.push(fixedPlayer(state, p, grade)); // 원작 시점 이후 졸업한 선수는 빠진다
  }
  const level = spec.benchLevel ?? spec.prestige;
  for (let year = 3; year >= 1; year--) {
    while (team.players.filter((p) => p.year === year).length < SCHOOL.classSize) {
      const count = [1, 2, 3, 4, 5].map((pos) => team.players.filter((p) => p.pos === pos).length + rng.next() * 0.5);
      team.players.push(newPlayer(rng, state, count.indexOf(Math.min(...count)) + 1, level, year));
    }
  }
  setLineup(team);
  return team;
}
