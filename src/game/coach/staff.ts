// 코치진: 특정 분야를 맡는 코치를 영입해 훈련 효과를 높인다.
// 축구 매니저 게임의 코치 시스템에서 가져온 것: 코치마다 분야별 실력(별점)이 있고, 구단의 평판이 높을수록 더 많은·더 좋은 스태프를 둘 수 있으며,
// 훈련 코치 말고도 선수 몸을 관리하는 트레이너와 상대를 분석하는 분석 코치가 있다.
// 고교 농구부에 맞게 줄인 것: 돈 대신 학교 수준이 자리 수와 영입 가능 여부를 정하고, 코치 한 명은 한 분야만 맡는다.
import { randomName } from '../team/names.ts';
import type { Rng } from '../rng.ts';
import type { Career, Coach, CoachRole, ProgramKey } from '../types.ts';

export const STAFF = {
  gainPerStar: 0.14, // 훈련 코치: 별 하나당 그 메뉴의 성장 +14% (★5면 +70%). 개인 훈련으로 지정한 메뉴에도 적용된다
  injuryPerStar: 0.12, // 트레이너: 별 하나당 훈련 부상 확률 -12%
  costPerStar: 0.05, // 트레이너: 별 하나당 훈련 컨디션 소모 -5%
  prepPerStar: 0.1, // 분석 코치: 별 하나당 상대 분석 보너스 +10%
  candidates: 6, // 해마다 나오는 영입 후보 수
  needBase: 26, needPerStar: 7, // 코치가 오려면 필요한 학교 수준: ★1 33, ★2 40, ★3 47, ★4 54, ★5 61
  slots: [[58, 3], [0, 2]] as [prestige: number, slots: number][], // 학교 수준별 코치 자리 수
  // AI 학교는 자리 수만큼 전 메뉴가 고르게 조금 오른다. 잘 꾸린 코치진보다 작게 둬야 코치 영입이 내 팀의 강점이 된다
  // (같은 크기로 두면 영입해도 다른 학교를 따라가는 것에 그쳐, 3년 캠페인의 성적에 차이가 나지 않았다. scripts/balance/difficulty.ts)
  aiGainPerSlot: 0.03,
};

export const COACH_ROLES: Record<CoachRole, { label: string; info: string }> = {
  shooting: { label: '슈팅 코치', info: '슈팅 훈련의 성장' },
  inside: { label: '골밑 코치', info: '골밑 훈련의 성장' },
  ballwork: { label: '볼 핸들링 코치', info: '볼 핸들링·패스 훈련의 성장' },
  defense: { label: '수비 코치', info: '수비 훈련의 성장' },
  physical: { label: '체력 코치', info: '체력 훈련의 성장' },
  tactics: { label: '전술 코치', info: '전술 이해 훈련의 성장' },
  trainer: { label: '트레이너', info: '훈련 부상과 컨디션 소모 감소' },
  analyst: { label: '분석 코치', info: '상대 분석 보너스 증가' },
};
const ROLE_KEYS = Object.keys(COACH_ROLES) as CoachRole[];
const TRAINING_ROLES = ROLE_KEYS.filter((r) => r !== 'trainer' && r !== 'analyst') as (ProgramKey & CoachRole)[];
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export const slotsFor = (prestige: number) => STAFF.slots.find(([p]) => prestige >= p)![1];
export const needFor = (stars: number) => STAFF.needBase + STAFF.needPerStar * stars;

// 코치 한 명의 효과를 화면에 적을 말
export function coachEffect(c: Coach) {
  if (c.role === 'trainer') return `부상 확률 -${Math.round(100 * STAFF.injuryPerStar * c.stars)}% · 컨디션 소모 -${Math.round(100 * STAFF.costPerStar * c.stars)}%`;
  if (c.role === 'analyst') return `상대 분석 보너스 +${Math.round(100 * STAFF.prepPerStar * c.stars)}%`;
  return `${COACH_ROLES[c.role].info} +${Math.round(100 * STAFF.gainPerStar * c.stars)}%`;
}

export function makeCoach(rng: Rng, state: Career, role: CoachRole, stars: number): Coach {
  const id = `c${state.nextId++}`;
  return { id, name: randomName(rng, state.nameStyle, id.slice(1)), role, stars: clamp(Math.round(stars), 1, 5) };
}

// 부임 때 이미 있던 코치: 평범한 훈련 코치 한 명
export const starterStaff = (state: Career, rng: Rng): Coach[] => [makeCoach(rng, state, TRAINING_ROLES[rng.int(0, TRAINING_ROLES.length - 1)], rng.int(1, 2))];

// 올해의 영입 후보. 학교 수준이 높을수록 좋은 코치가 지원한다. 분야는 겹치지 않게 뽑는다.
export function makeCandidates(state: Career, rng: Rng): Coach[] {
  const prestige = state.teams[state.userTeamId].prestige;
  const center = (prestige - STAFF.needBase) / STAFF.needPerStar;
  const roles = [...ROLE_KEYS];
  for (let i = roles.length - 1; i > 0; i--) { const j = rng.int(0, i); [roles[i], roles[j]] = [roles[j], roles[i]]; }
  return roles.slice(0, STAFF.candidates).map((role) => makeCoach(rng, state, role, center + rng.gauss(0, 1)));
}

// 코치진 전체의 효과. 같은 분야에 여럿이면 가장 뛰어난 코치만 친다.
export function staffEffects(staff: Coach[]) {
  const best = (role: CoachRole) => Math.max(0, ...staff.filter((c) => c.role === role).map((c) => c.stars));
  const gain: Partial<Record<ProgramKey, number>> = {};
  for (const r of TRAINING_ROLES) gain[r] = 1 + STAFF.gainPerStar * best(r);
  return {
    gain,
    injury: 1 - STAFF.injuryPerStar * best('trainer'),
    cost: 1 - STAFF.costPerStar * best('trainer'),
    prep: 1 + STAFF.prepPerStar * best('analyst'),
  };
}

// AI 학교의 코치진: 자리 수만큼 모든 메뉴가 고르게 조금씩 오른다
export function aiStaffEffects(prestige: number) {
  const g = 1 + STAFF.aiGainPerSlot * slotsFor(prestige);
  return { gain: Object.fromEntries(TRAINING_ROLES.map((r) => [r, g])) as Partial<Record<ProgramKey, number>>, injury: 1, cost: 1 };
}

// 영입할 수 있는가. 안 되면 이유를 돌려준다
export function hireBlock(state: Career, staff: Coach[], c: Coach): string | null {
  const prestige = state.teams[state.userTeamId].prestige;
  if (staff.length >= slotsFor(prestige)) return '코치 자리가 없습니다';
  if (prestige < needFor(c.stars)) return `학교 수준 ${needFor(c.stars)} 이상이어야 옵니다`;
  return null;
}
