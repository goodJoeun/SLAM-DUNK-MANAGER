// 포제션 기반 농구 경기 엔진 (UI·데이터와 분리된 순수 로직)
//
// 한 번에 끝까지:   simulateGame(home, away, { seed, log }) -> 결과
// 개입하며 진행:    const game = createGame(home, away, { seed, log: true, manual: [true, false] });
//                   game.step()            공격권 하나 진행 -> { events, periodEnded, finished }
//                   game.playPeriod()      쿼터 끝까지
//                   game.setTactics(side, { defense: 'zone' })
//                   game.substitute(side, 나갈 선수 id, 들어올 선수 id)
//                   game.timeout(side)
//                   game.view()            현재 상황 (점수, 코트·벤치, 체력, 파울)
//                   game.result()          박스스코어

import { makeRng } from '../rng.ts';
import type { Rng } from '../rng.ts';
import type {
  BasePlayer, Composites, Defense, EngineTeam, EventInfo, GameOptions, GameResult, GameView, LogEvent, PlayerView,
  RatingKey, Ratings, ShotType, StatLine, StepResult, Tactics,
} from '../types.ts';

// ---- 조정 계수: 밸런스는 여기서만 만진다 ----
export const TUNING = {
  periodSeconds: 600, // 10분 4쿼터 (FIBA·고교 규정)
  overtimeSeconds: 300,
  foulOutLimit: 5,
  bonusTeamFouls: 5, // 쿼터 내 팀 파울 5개째부터 자유투 2개
  possessionMean: 15.5,
  possessionSd: 4.5,
  secondChanceMean: 6,
  nonShootingFoul: 0.095,
  turnoverBase: 0.135,
  turnoverSkill: 0.15,
  stealShare: 0.5,
  shot: {
    //        성공 기준값, 블록 기준, 슈팅 파울, 어시스트 비율, 점수, 공격 리바운드 보정
    rim: { make: 0.6, block: 0.09, foul: 0.17, assist: 0.6, pts: 2, orb: 1.12 },
    post: { make: 0.45, block: 0.08, foul: 0.14, assist: 0.4, pts: 2, orb: 1.05 },
    mid: { make: 0.39, block: 0.03, foul: 0.05, assist: 0.45, pts: 2, orb: 0.95 },
    three: { make: 0.335, block: 0.01, foul: 0.02, assist: 0.75, pts: 3, orb: 0.92 },
  },
  shotMixWeight: { rim: 1.05, post: 0.55, mid: 1.1, three: 0.85 },
  shotComfort: 3, // 자기 주무기보다 못하는 슛은 잘 안 쏜다 (센터가 3점을 남발하지 않게). 클수록 주무기에 몰린다
  // 미들슛은 일정 수준을 넘으면 더 자주 쏘지 않고 더 잘 넣는다: 슛 선택에서는 미들슛 능력을 midVolumeCap까지만 쳐 준다
  // (넘는 부분은 midVolumeSoft 제곱으로 조금만 반영). 미들슛은 가장 비효율적인 슛이라, 실력만큼 시도가 늘면
  // 골밑슛·3점슛을 밀어내 미들슛을 훈련할수록 팀이 약해진다 (scripts/balance/training-effect.ts)
  midVolumeCap: 0.52,
  midVolumeSoft: 0.3,
  // 슛 종류별 makeSkill 배율: 점프슛은 슈터의 실력이 성공률에 더 크게 드러난다
  shotSkill: { rim: 1, post: 1, mid: 1.8, three: 1 },
  putbackChance: 0.4, // 공격 리바운드를 잡은 선수가 곧바로 골밑슛을 올려놓을 확률
  putbackMake: -0.04, // 풋백은 수비 틈에서 쏘는 슛이라 조금 어렵다
  foulCare: 0.12, // 파울이 쌓인 선수는 조심한다: 파울 1개당 파울 가능성 감소
  foulTroubleMax: 2, // 파울 관리로 동시에 벤치에 앉히는 선수 수의 상한 (셋 이상 앉히면 코트가 무너진다)
  makeSkill: 0.27, // (공격 능력 - 수비 능력) 1.0 차이당 성공률 변화. 크면 전력 차가 곧바로 큰 점수 차가 된다
  offReboundWeight: 0.38,
  conditionPlay: 0.12, // 컨디션 0인 선수의 경기력 감소 폭 (컨디션 60이면 약 5%)
  energyDrain: 0.00045,
  energyRecover: 0.0012,
  // 아래 세 묶음은 능력치를 올려도 승률이 거의 변하지 않던 지구력·골밑 기술·패스에 값어치를 준다 (scripts/balance/training-effect.ts)
  // 지구력(0~1, 0.5가 기준)이 체력에 주는 영향: 코트에서 덜 지치고, 벤치에서 더 빨리 회복한다
  enduranceDrain: 2.0, // 지구력 1.0 차이당 체력 소모 배율 변화
  enduranceRecover: 1.5, // 지구력 1.0 차이당 벤치 회복 배율 변화
  fatigue: 0.25, // 체력이 바닥났을 때 능력이 떨어지는 비율
  // 골밑 기술(insidePivot이 기준) 1.0 차이당 골밑슛·포스트업 성공률 변화. 포스트업은 비효율적인 슛이라, 시도만 늘어서는 팀에 도움이 되지 않는다
  insideTouch: 0.18, insidePivot: 0.6,
  passMake: 0.10, // 팀 패스 능력(0.5가 기준) 1.0 차이당 슛 성공률 변화: 패스가 좋은 팀은 더 좋은 슛 기회를 만든다

  // 교체
  tiredEnergy: 0.6, // 이 아래로 떨어지면 벤치로
  restedEnergy: 0.85, // 이 위로 회복하면 다시 투입 가능
  minStint: 90, // 한 번 들어가면 최소 이만큼(초)은 뛴다
  minRest: 45, // 벤치로 나온 선수는 최소 이만큼(초)은 쉰다 (나가자마자 다른 자리로 다시 들어오는 연쇄 교체를 막는다)
  posMismatchPenalty: 0.06, // 포지션 1칸 어긋날 때마다 가치 감소
  crunchSeconds: 180, // 4쿼터 막판 접전: 베스트 5 고정
  crunchMargin: 8,
  garbageMargin: 17, // 4쿼터에 이 점수 차 이상이면 양 팀 모두 벤치 가동
  garbageMarginEarly: 21, // 2쿼터 후반·3쿼터부터 이만큼 벌어지면 일찍 주전을 뺀다
  coastMargin: 15, // 후반에 이만큼 앞선 팀은 공격 시간을 더 쓴다
  coastSeconds: 4,
  coastMake: -0.04, // 크게 앞선 팀은 무리하지 않는다 (슛 성공률 보정)
  formSd: 0.015, // 당일 컨디션 편차 (일관성이 낮을수록 커진다)
  formInconsistency: 0.05,
  moraleForm: 0.02, // 사기 40 차이당 경기력 변화 (사기 100이면 +2%, 20이면 -2%). 사기가 없는 팀은 보통(60)으로 본다
  clutchBoost: 0.05, // 승부사: 4쿼터 막판 접전에서 능력 상승

  // 흐름과 작전 타임
  runThreshold: 4, // 연속 득점이 이만큼 쌓이면 기세가 붙는다
  runBoostPerPoint: 0.006,
  runBoostMax: 0.05, // 기세가 커야 작전 타임으로 흐름을 끊는 판단이 의미 있다
  timeoutEnergy: 0.06, // 작전 타임 때 코트 위 선수 체력 회복
  aiTimeoutRun: 8, // AI는 상대가 이만큼 연속 득점하면 타임을 부른다
  timeouts: { firstHalf: 2, secondHalf: 3, overtime: 1 },

  // 전술
  focusShotBoost: 2.0, // 중심 전술의 슛 종류 가중
  focusThreeBoost: 1.6, // 외곽 중심의 3점 가중. 골밑보다 작게 둬야 슛의 절반이 3점인 경기가 나오지 않는다
  focusUsageBias: 1.0, // 중심 전술에 맞는 선수에게 공이 몰리는 정도
  keyPlayerUsage: 1.35, // 에이스 지정: 공격 비중 증가. 진짜 에이스에게 몰아주면 조금 이득이고, 아닌 선수를 고르면 본전이다
  // 한 선수에게 슛이 몰리는 데는 한계가 있고(상한), 몰릴수록 수비가 쏠려 그 선수는 어렵게 쏘고 동료는 편해진다
  usageCap: 0.40, // 한 선수가 가져갈 수 있는 팀 슛 비중의 상한
  usageCapKey: 0.50, // 에이스로 지정하면 더 몰아줄 수 있다
  crowdFrom: 0.30, // 슛 비중이 이보다 크면 수비가 쏠리기 시작한다
  crowdMake: -0.3, // 넘는 비중 1.0당 그 선수의 성공률 변화
  crowdOthersMake: 0.25, // 팀에서 가장 몰리는 선수의 초과 비중 1.0당 동료의 성공률 변화
  shotEnergy: 0.004, // 슛을 만들어 쏠 때마다 드는 체력
  keyPlayerMake: 0, // 에이스 슛 성공률 보정. 수비가 몰리는 손해는 crowdMake가 이미 반영한다
  focusRead: { inside: -0.012, outside: -0.008 }, // 한쪽으로 몰면 수비가 읽는다: 골밑은 좁아지고, 외곽은 패턴으로 만든 슛이라 조금 편하다 (평균적인 팀끼리 승률을 맞추는 값)
  // 공격 중심을 상대 수비의 약한 쪽에 맞추면 얻는 성공률 보정. 잘못 맞추면 손해.
  // 약한 쪽 = 상대의 외곽 수비와 골밑 수비의 차이(softPivot이 리그 평균). 상대 전력이 아니라 '어느 쪽이 더 허술한가'만 보므로 약팀도 강팀의 빈틈을 노릴 수 있다
  focusExploit: 1.6,
  softPivot: 0.015,
  prepSharp: 0.25, // 상대 분석(준비 보너스 1.0당): 약점을 노리는 공격·집중 마크의 효과가 이만큼 커진다
  paceOffense: 2, // 템포 1단계당 공격 시간 변화(초). 빠르게 뛰어도 공격권은 1할쯤만 는다 (크면 100점대 경기가 흔해진다)
  paceDefense: 1, // 수비 팀 템포가 상대 공격 시간에 주는 영향(초)
  // 템포의 득실(1단계당). 빠르게: 속공으로 쉬운 슛이 늘지만 실책과 체력 소모도 는다. 느리게는 그 반대.
  // 볼 핸들링이 좋은 팀은 빨리 뛰어도 실책이 덜 늘고, 상대보다 체력이 남아 있을수록 속공이 잘 통한다.
  paceMake: 0.016, // 슛 성공률
  paceEnergyEdge: 0.15, // 코트 위 평균 체력이 상대보다 1.0 높을 때 속공 성공률 추가분
  paceTov: 0.012, // 턴오버
  paceTovSkill: 0.25, // (상대 스틸 - 우리 볼 핸들링) 1.0당 턴오버 추가분
  paceDrain: 0.18, // 우리 선수 체력 소모 배율 변화
  paceDrainOpp: 0.07, // 따라 뛰는 상대의 체력 소모 배율 변화
  // 집중 마크: 담당 수비수가 대상을 따라다닌다. 대상은 묶이지만 나머지가 조금 편해진다.
  //   usage·make는 효과 배율(power)이 1일 때의 값. 배율은 담당의 능력치를 대상의 능력치와 항목별로 견줘 정한다 (denyPower):
  //     수비IQ 대 공격IQ(iq), 대인 수비 대 주무기(skill), 스피드, 키, 힘. 신체 차이는 slack 이하면 없는 것으로 본다. 대상이 골밑형이냐 외곽형이냐에 따라 항목의 무게가 다르다.
  //     골밑형 = 포스트업이 중거리·3점보다 나은 선수 (돌파·덩크가 좋은 포워드는 외곽형으로 본다).
  //     담당이 뒤지는 항목은 차이만큼 그대로 깎고, 앞서는 항목은 일부만 더한다: 지능·주무기는 surplus, 신체는 bodySurplus (크다고 스피드 차이가 메워지지는 않는다).
  //   모든 항목이 같으면 배율은 even. 확실히 앞서는 수비수가 아니면 대상은 별로 묶이지 않는다.
  //   담당은 수비에 힘을 쏟는 만큼 체력이 빨리 닳고(drain), 공격에서는 덜 쏘고(markerUsage) 덜 들어간다(markerMake).
  deny: {
    usage: 0.45, make: -0.11, othersMake: 0,
    othersHelp: 0.01, // 담당이 혼자 못 막으면 동료가 도우러 가야 해서 나머지가 더 편해진다 (효과 배율 1.0 부족당 성공률)
    even: 1.1, surplus: 0.5, bodySurplus: 0.25, slack: 5, powerMin: 0.5, powerMax: 1.4,
    // powerMin: 아무리 밀려도 한 명이 내내 따라다니는 것만으로 생기는 최소 효과. 이것이 없으면 약팀은 강팀 에이스에게
    //   마크 효과가 0이 되어 쓸수록 손해였다 (scripts/balance/deny-matchups.ts: 약한 쪽 점수 차 -0.8 → +0.9, 비슷하거나 강한 쪽은 그대로).
    // 항목별 무게 (능력치 100 차이당 배율 변화)
    outside: { iq: 0.5, skill: 0.9, spd: 5.0, hgt: 1.6, str: 0.4 },
    inside: { iq: 0.5, skill: 0.9, spd: 1.0, hgt: 2.5, str: 1.5 },
    tired: 2, // 담당의 몸 상태(체력·컨디션)가 1.0 떨어질 때 깎이는 배율
    drain: 1.3, markerUsage: 0.9, markerMake: -0.015,
  },
  // 존: 골밑은 막히고 외곽은 내준다. 외곽 보정은 상대 슈터 실력에 따라 달라져, 평범한 팀에겐 중립·슈터 없는 팀에겐 강하고·슈터 팀에겐 뚫린다
  ownDefenseShare: 0.5, // 슛 수비에서 맡은 선수 개인(대인 수비)의 몫. 나머지는 팀 평균 도움 수비(팀 수비)
  zone: { ownShare: 0.25, shooterBurn: 0.7, insideMake: -0.055, outsideMake: 0.05, threeMix: 1.25, rimMix: 0.8, defReb: 0.92, shootingFoul: 0.8, drain: 0.92 },
  press: { tovBase: 0.02, tovSkill: 0.45, rimMake: 0.03, rimMix: 1.2, foul: 1.12, drain: 1.25, paceSec: 1 },
  // 5아웃: 골밑과 3점 위주로 쏘고 중거리·포스트업은 줄인다. 슈터가 많을수록 돌파 공간이 열린다
  spread: { threeMix: 1.45, rimMix: 1.25, midMix: 0.45, postMix: 0.5, rimSpacing: 0.45, spacingPivot: 0.56, read: -0.018 }, // read: 슛이 두 종류뿐이라 수비가 읽는다 (전체 슛 성공률 보정)
  // 스위치: 스크린에 오픈 3점을 덜 내주지만, 키 작은 수비수가 빅맨을 막는 미스매치를 상대가 노린다
  switchD: { outsideMake: -0.025, postMake: 0.11, postMix: 1.35 },
  // 드롭: 빅맨이 골밑을 지켜 림 공격은 막지만 중거리 풀업은 내준다
  drop: { rimMake: -0.05, midMake: 0.065, midMix: 1.5, threeMake: 0.01 },
  // 선수별 개인 지시
  roles: {
    aggressiveUsage: 1.45, aggressiveMake: -0.01, aggressiveTov: 1.3, // 적극 공격: 많이 쏘지만 무리한 슛도 섞인다
    conservativeUsage: 0.55, conservativeMake: 0.012, conservativeTov: 0.008, // 슛 자제: 좋은 기회에만 쏘지만, 미루다 실책이 는다
    passUsage: 0.6, passAssist: 2.5, // 패스 우선: 덜 쏘고 어시스트를 노린다
    specialtyMix: 2.2, // 3점 위주·돌파·포스트업: 그 슛 비중
    tightMake: -0.015, tightFoul: 1.5, tightSteal: 1.5, // 타이트 마크: 덜 내주지만 파울이 는다
    safeMake: 0.015, safeFoul: 0.65, // 파울 조심
  },
};

// 대인 수비·팀 수비가 없는 예전 데이터는 수비IQ로 읽는다
const r = (p: BasePlayer, k: RatingKey) => (p.ratings[k] ?? p.ratings.diq) / 100;

// 원본 능력치 -> 엔진이 쓰는 합성 능력치 (0~1)
// 수비 방식이 체력 소모에 주는 배율
const defenseDrain = (d: Defense | null | undefined) => (d === 'press' ? TUNING.press.drain : d === 'zone' ? TUNING.zone.drain : 1);

// 전술이 우리 팀의 체력·파울에 주는 부담 (전술 화면 안내용). 경기 중 계산(elapse, 파울 판정)과 같은 값을 쓴다.
//   drain: 체력 소모 배율 (상대 템포는 보통으로 가정), foul: 슛과 무관한 파울 배율, shootingFoul: 슈팅 파울 배율
export function tacticLoad(defense: Defense | null | undefined, pace: number) {
  const T = TUNING;
  return {
    drain: defenseDrain(defense) * (1 + T.paceDrain * pace),
    foul: defense === 'press' ? T.press.foul : 1,
    shootingFoul: defense === 'zone' ? T.zone.shootingFoul : 1,
  };
}

// 코트 위에서 1초 뛸 때 줄어드는 체력 (0~1 기준). style은 전술 배율.
export const energyPerSecond = (endurance: number, style = 1) => TUNING.energyDrain * style * Math.max(0.4, 1 + TUNING.enduranceDrain * (0.5 - endurance));

// 경기 시작 때의 체력 (0~1): 지친 채로 경기에 나오면 체력이 덜 찬 상태로 시작한다
export const startEnergy = (condition: number | null | undefined) => (condition == null ? 1 : 0.7 + 0.3 * (condition / 100));
// 컨디션이 나쁘면 경기 내내 몸이 무겁다: 컨디션 100에서 1, 0에서 1 - conditionPlay (벤치에서 쉬어도 돌아오지 않는다)
export const conditionPlay = (condition: number | null | undefined) => (condition == null ? 1 : 1 - TUNING.conditionPlay * (1 - condition / 100));

// 집중 마크에 쓰는 수비력 (0~1): 대상이 골밑형이면 골밑 수비, 외곽형이면 외곽 수비로 막는다
// 집중 마크의 항목별 비교: 담당의 능력치 - 대상의 능력치 (+면 담당이 앞선다)
function denyCompare(m: Ratings, t: Ratings, tc: Composites) {
  const inside = tc.post > Math.max(tc.mid, tc.three); // 대상이 골밑형인가
  return {
    inside,
    gaps: {
      iq: m.diq - t.oiq,
      skill: (m.mdf ?? m.diq) - Math.max(t.ins, t.dnk, t.mid, t.tp),
      spd: m.spd - t.spd,
      hgt: m.hgt - t.hgt,
      str: m.str - t.str,
    },
  };
}
// 집중 마크 효과 배율 (0 = 전혀 못 막음, even = 모든 항목이 대등). sharp는 담당의 그 순간 몸 상태(체력·컨디션)에 따른 수비력 배율
function denyPower(m: Ratings, t: Ratings, tc: Composites, sharp = 1) {
  const D = TUNING.deny;
  const { inside, gaps } = denyCompare(m, t, tc);
  const w = inside ? D.inside : D.outside;
  let power = D.even - D.tired * (1 - sharp);
  for (const k of Object.keys(gaps) as (keyof typeof gaps)[]) {
    const mind = k === 'iq' || k === 'skill';
    const gap = mind ? gaps[k] : Math.sign(gaps[k]) * Math.max(0, Math.abs(gaps[k]) - D.slack); // 신체는 조금 차이 나는 정도로는 티가 안 난다
    const g = gap / 100;
    power += w[k] * (g > 0 ? g * (mind ? D.surplus : D.bodySurplus) : g);
  }
  return Math.max(D.powerMin, Math.min(D.powerMax, power));
}
// 화면 안내용: 이 선수가 저 선수를 집중 마크할 때의 효과 배율과 항목별 차이 (체력·당일 컨디션은 빼고 본다)
export function denyOutlook(marker: BasePlayer, target: BasePlayer) {
  const tc = composites(target);
  const { inside, gaps } = denyCompare(marker.ratings, target.ratings, tc);
  return {
    power: denyPower(marker.ratings, target.ratings, tc),
    inside, gaps,
    slower: gaps.spd <= -15,
    smaller: gaps.hgt <= -15,
    weaker: inside && gaps.str <= -15,
  };
}

export function composites(p: BasePlayer): Composites {
  const c: Composites = {
    ballHandling: 0.6 * r(p, 'drb') + 0.2 * r(p, 'spd') + 0.2 * r(p, 'oiq'),
    passing: 0.7 * r(p, 'pss') + 0.3 * r(p, 'oiq'),
    rim: 0.3 * r(p, 'hgt') + 0.2 * r(p, 'jmp') + 0.3 * r(p, 'dnk') + 0.2 * r(p, 'spd'),
    post: 0.3 * r(p, 'hgt') + 0.3 * r(p, 'str') + 0.4 * r(p, 'ins'),
    mid: 0.8 * r(p, 'mid') + 0.2 * r(p, 'oiq'),
    three: 0.85 * r(p, 'tp') + 0.15 * r(p, 'oiq'),
    ft: r(p, 'ft'),
    rebounding: 0.4 * r(p, 'hgt') + 0.2 * r(p, 'jmp') + 0.15 * r(p, 'str') + 0.25 * r(p, 'reb'),
    // 1대1 수비: 맡은 상대를 막는 힘 (대인 수비)
    defInterior: 0.35 * r(p, 'hgt') + 0.2 * r(p, 'str') + 0.15 * r(p, 'jmp') + 0.3 * r(p, 'mdf'),
    defPerimeter: 0.4 * r(p, 'spd') + 0.4 * r(p, 'mdf') + 0.1 * r(p, 'hgt') + 0.1 * r(p, 'str'),
    // 도움 수비: 동료가 맡은 상대의 슛을 함께 막는 힘 (팀 수비 + 수비IQ)
    helpInterior: 0.35 * r(p, 'hgt') + 0.15 * r(p, 'jmp') + 0.1 * r(p, 'str') + 0.3 * r(p, 'tdf') + 0.1 * r(p, 'diq'),
    helpPerimeter: 0.35 * r(p, 'spd') + 0.45 * r(p, 'tdf') + 0.2 * r(p, 'diq'),
    stealing: 0.45 * r(p, 'spd') + 0.35 * r(p, 'diq') + 0.2 * r(p, 'mdf'),
    blocking: 0.5 * r(p, 'hgt') + 0.3 * r(p, 'jmp') + 0.1 * r(p, 'diq') + 0.1 * r(p, 'tdf'),
    endurance: r(p, 'end'),
    usage: 0, // 아래에서 계산한다
  };
  const best = Math.max(c.rim, c.post, c.mid, c.three);
  c.usage = 0.6 * best + 0.4 * r(p, 'oiq');
  return c;
}

export function overall(p: BasePlayer) {
  const c = composites(p);
  const offense = Math.max(c.rim, c.post, c.mid, c.three) * 0.6 + (c.ballHandling + c.passing) * 0.2;
  const defense = Math.max(c.defInterior, c.defPerimeter) * 0.45 + Math.max(c.helpInterior, c.helpPerimeter) * 0.25 + c.rebounding * 0.3;
  return Math.round((offense * 0.55 + defense * 0.45) * 100);
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const SHOT_LABEL: Record<ShotType, string> = { rim: '골밑슛', post: '포스트업', mid: '미들슛', three: '3점슛' };
const emptyLine = (): StatLine => ({
  sec: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
  orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
});

// 경기 중의 선수·팀 상태
interface GamePlayer {
  id: string;
  name: string;
  pos: number;
  c: Composites;
  raw: Ratings; // 원본 능력치 (집중 마크에서 상대와 항목별로 견준다)
  ovr: number;
  rank: number; // 교체 판단에 쓰는 가치. 선발은 감독이 고른 선수이므로 벤치보다 낮게 보지 않는다
  form: number; // 당일 컨디션 보정 (일관성에 따른 기복 + 사기)
  clutch: boolean; // 승부사
  energy: number; // 0~1
  fit: number; // 그날 컨디션에 따른 경기력 배율 (경기 중에는 변하지 않는다)
  injured: boolean;
  since: number; // 마지막으로 코트에 들어오거나 나간 시각
  stat: StatLine;
  starter: boolean;
  home: number; // 선발로 선 자리 (벤치는 -1)
}

interface GameTeam {
  id: string | undefined;
  name: string;
  tactics: Tactics;
  players: GamePlayer[];
  court: GamePlayer[];
  auto: boolean;
  score: number;
  teamFouls: number;
  possessions: number;
  subs: number;
  run: number;
  timeoutsLeft: number;
  plan: number; // 상대 분석으로 다듬은 경기 계획의 날카로움 (1 = 분석 없음)
}

// 준비 보너스: 이 경기에서만 키를 뺀 능력치를 올린 것처럼 계산한다 (표시용 종합 능력치는 그대로)
function prepared(p: BasePlayer, bonus: number): BasePlayer {
  if (!bonus) return p;
  const ratings = { ...p.ratings };
  for (const k of Object.keys(ratings) as (keyof typeof ratings)[]) if (k !== 'hgt') ratings[k] = Math.min(99, ratings[k] + bonus);
  return { ...p, ratings };
}

function setupTeam(team: EngineTeam, rng: Rng, auto: boolean, prep = 0): GameTeam {
  const T = TUNING;
  // 감독이 능력이 낮은 선수를 선발로 세웠더라도 자동 교체가 곧바로 빼 버리지 않게, 선발의 가치는 벤치 최고 선수보다 높게 본다
  const benchBest = Math.max(0, ...team.players.slice(5).map(overall));
  const players: GamePlayer[] = team.players.map((p, i) => {
    // 숨겨진 능력치: 일관성이 낮을수록 그날 컨디션이 크게 흔들린다
    const consistency = (p.hidden?.consistency ?? 50) / 100;
    return {
      id: p.id, name: p.name, pos: p.pos, c: composites(prepared(p, prep)), raw: p.ratings, ovr: overall(p),
      rank: i < 5 ? Math.max(overall(p), benchBest * 1.05) : overall(p),
      form: rng.gauss(0, T.formSd + T.formInconsistency * (1 - consistency)) + (T.moraleForm * ((p.morale ?? 60) - 60)) / 40,
      clutch: p.trait === 'clutch',
      energy: startEnergy(p.condition), fit: conditionPlay(p.condition),
      injured: (p.injuredDays ?? 0) > 0,
      since: 0, stat: emptyLine(), starter: i < 5, home: i < 5 ? i : -1,
    };
  });
  return {
    id: team.id,
    name: team.name,
    tactics: { pace: 0, focus: 'balanced', defense: 'man', keyPlayerId: null, denyPlayerId: null, denyDefenderId: null, ...team.tactics },
    players,
    court: players.slice(0, 5), // 슬롯 순서 = 포지션 1~5
    auto, score: 0, teamFouls: 0, possessions: 0, subs: 0, run: 0,
    timeoutsLeft: T.timeouts.firstHalf,
    plan: 1 + T.prepSharp * prep,
  };
}

export function createGame(homeTeam: EngineTeam, awayTeam: EngineTeam, opts: GameOptions = {}) {
  const rng = makeRng(opts.seed ?? Date.now());
  const T = TUNING;
  const manual = opts.manual ?? [false, false];
  const prep = opts.prep ?? [0, 0];
  const teams = [setupTeam(homeTeam, rng, !manual[0], prep[0]), setupTeam(awayTeam, rng, !manual[1], prep[1])];
  const log: LogEvent[] = [];
  let period = 1;
  let clock = T.periodSeconds;
  let now = 0; // 경기 시작부터 흐른 시간(초)
  let finished = false;

  const say = (team: GameTeam, text: string, info?: EventInfo) => {
    if (!opts.log) return;
    const m = Math.floor(clock / 60);
    const s = String(Math.floor(clock % 60)).padStart(2, '0');
    log.push({
      period, clock: `${m}:${s}`, team: team.name, text, score: `${teams[0].score}-${teams[1].score}`,
      side: teams.indexOf(team), at: now, info,
    });
  };

  // 피로·컨디션 반영 능력치
  const clutchTime = () => period >= 4 && clock <= T.crunchSeconds && Math.abs(teams[0].score - teams[1].score) <= T.crunchMargin;
  const eff = (p: GamePlayer, key: keyof Composites) => p.c[key] * (1 - T.fatigue * (1 - p.energy)) * p.fit * (1 + p.form + (p.clutch && clutchTime() ? T.clutchBoost : 0));
  const avg = (team: GameTeam, key: keyof Composites) => team.court.reduce((s, p) => s + eff(p, key), 0) / 5;
  const avgEnergy = (team: GameTeam) => team.court.reduce((s, p) => s + p.energy, 0) / 5;
  const pick = (players: GamePlayer[], weightFn: (p: GamePlayer) => number) => players[rng.weighted(players.map(weightFn))];
  const isFinal = () => period >= 4;
  const gone = (p: GamePlayer) => p.injured || p.stat.pf >= T.foulOutLimit; // 더는 뛸 수 없는 선수

  // 집중 마크 상황. 대상이 코트에 있을 때만 성립한다.
  //   담당(marker): 감독이 지정한 선수가 코트에 있으면 그 선수, 아니면 대상과 같은 자리의 선수.
  //   지정한 담당이 다른 자리에 있으면 대상과 같은 자리의 선수와 맡을 상대를 서로 바꾼다.
  //   power: 담당과 대상의 능력치를 항목별로 견준 효과 배율 (담당이 지치면 떨어진다)
  function denyOf(off: GameTeam, def: GameTeam) {
    const id = def.tactics.denyPlayerId;
    if (!id) return null;
    const targetSlot = off.court.findIndex((p) => p.id === id);
    if (targetSlot < 0) return null;
    const chosen = def.tactics.denyDefenderId ? def.court.findIndex((p) => p.id === def.tactics.denyDefenderId) : -1;
    const markerSlot = chosen >= 0 ? chosen : targetSlot;
    const target = off.court[targetSlot];
    const marker = def.court[markerSlot];
    const sharp = eff(marker, 'defPerimeter') / (marker.c.defPerimeter || 1); // 지치거나 컨디션이 나쁘면 덜 막는다
    const power = denyPower(marker.raw, target.raw, target.c, sharp);
    return { target, marker, targetSlot, markerSlot, power };
  }
  type Deny = ReturnType<typeof denyOf>;
  // slot 자리의 공격수를 맡는 수비수
  const guardOf = (def: GameTeam, slot: number, deny: Deny) =>
    def.court[deny ? (slot === deny.targetSlot ? deny.markerSlot : slot === deny.markerSlot ? deny.targetSlot : slot) : slot];

  function addPoints(off: GameTeam, def: GameTeam, player: GamePlayer, pts: number) {
    player.stat.pts += pts;
    off.score += pts;
    off.run += pts;
    def.run = 0;
  }

  function elapse(sec: number) {
    for (const team of teams) {
      const d = team.tactics.defense;
      const opp = teams[1 - teams.indexOf(team)];
      const tempo = 1 + T.paceDrain * team.tactics.pace + T.paceDrainOpp * opp.tactics.pace;
      const style = defenseDrain(d) * tempo;
      const marker = denyOf(opp, team)?.marker; // 집중 마크 담당은 수비에 힘을 더 쏟는다
      for (const p of team.players) {
        if (team.court.includes(p)) {
          p.stat.sec += sec;
          p.energy = Math.max(0, p.energy - sec * energyPerSecond(p.c.endurance, p === marker ? style * T.deny.drain : style));
        } else {
          p.energy = Math.min(1, p.energy + sec * T.energyRecover * Math.max(0.4, 1 + T.enduranceRecover * (p.c.endurance - 0.5)));
        }
      }
    }
    clock -= sec;
    now += sec;
  }

  function swap(team: GameTeam, slot: number, incoming: GamePlayer) {
    const cur = team.court[slot];
    team.court[slot] = incoming;
    cur.since = now;
    incoming.since = now;
    team.subs++;
    say(team, `${team.name} 교체: ${incoming.name} 투입, ${cur.name} 벤치로`, { kind: 'sub', actor: incoming.id, other: cur.id });
  }

  // 자동 교체: 지친 선수는 쉬게 하고, 회복한 주전은 복귀. 접전 막판엔 베스트 5, 승부가 기울면 벤치.
  // 직접 지휘하는 팀은 퇴장 선수의 빈자리만 채운다.
  function autoSubstitute(team: GameTeam, opp: GameTeam) {
    const margin = Math.abs(team.score - opp.score);
    const crunch = isFinal() && clock <= T.crunchSeconds && margin <= T.crunchMargin;
    const garbage = (period === 4 && margin >= T.garbageMargin) || ((period === 3 || (period === 2 && clock <= 300)) && margin >= T.garbageMarginEarly);
    // 파울 관리: 1Q 2개, 2Q 3개, 이후 4개면 아낀다. 여럿이 걸리면 파울이 많은 순(같으면 주전 먼저)으로 상한까지만 앉힌다
    const saving = crunch || period > 4 || (period === 4 && clock <= 300) ? [] : team.players
      .filter((p) => !gone(p) && p.stat.pf >= Math.min(4, period + 1))
      .sort((a, b) => b.stat.pf - a.stat.pf || b.rank - a.rank)
      .slice(0, T.foulTroubleMax);
    const foulTrouble = (p: GamePlayer) => saving.includes(p);
    const unavailable = (p: GamePlayer) => gone(p) || foulTrouble(p) || (garbage && p.starter);
    const mustLeave = (p: GamePlayer) =>
      unavailable(p) ||
      (crunch ? p.energy < 0.25 : p.energy < T.tiredEnergy && now - p.since >= T.minStint);
    const rested = (p: GamePlayer) => p.since === 0 || crunch || now - p.since >= T.minRest;
    const ready = (p: GamePlayer) => !unavailable(p) && rested(p) && p.energy >= (crunch ? 0.3 : garbage ? 0 : T.restedEnergy);
    // 선발은 자기가 선 자리(home)에서는 포지션이 어긋나도 감독의 선택으로 보고 깎지 않는다
    const value = (p: GamePlayer, slot: number) => (p.home === slot ? p.rank : p.ovr * (1 - T.posMismatchPenalty * Math.abs(p.pos - (slot + 1))));

    for (let slot = 0; slot < 5; slot++) {
      const cur = team.court[slot];
      if (!team.auto && !gone(cur)) continue;
      const offCourt = team.players.filter((p) => !team.court.includes(p));
      let pool = offCourt.filter((p) => ready(p) && (p.home === slot || Math.abs(p.pos - (slot + 1)) <= 1));
      if (!pool.length && gone(cur)) pool = offCourt.filter((p) => !gone(p));
      if (!pool.length) continue;
      const best = pool.reduce((a, b) => (value(b, slot) > value(a, slot) ? b : a));
      const upgrade = value(best, slot) > value(cur, slot) * 1.03 && (crunch || now - cur.since >= T.minStint);
      if (mustLeave(cur) || upgrade) swap(team, slot, best);
    }
  }

  function addFoul(def: GameTeam, player: GamePlayer) {
    player.stat.pf++;
    def.teamFouls++;
    if (player.stat.pf >= T.foulOutLimit) say(def, `${player.name} 5반칙 퇴장`, { kind: 'foulout', actor: player.id });
  }

  // 자유투. 마지막 구가 빗나가면 true (리바운드 상황)
  function freeThrows(off: GameTeam, def: GameTeam, shooter: GamePlayer, n: number, shot?: ShotType) {
    let lastMissed = false;
    let made = 0;
    for (let i = 0; i < n; i++) {
      shooter.stat.fta++;
      const ok = rng.chance(0.4 + 0.5 * shooter.c.ft);
      if (ok) {
        made++;
        shooter.stat.ftm++;
        addPoints(off, def, shooter, 1);
      }
      lastMissed = !ok;
    }
    say(off, `${shooter.name} 자유투 ${n}개 중 ${made}개 성공`, { kind: 'ft', actor: shooter.id, attempts: n, makes: made, shot });
    return lastMissed;
  }

  // 리바운드. 공격 리바운드면 잡은 선수, 수비 리바운드면 null
  function rebound(off: GameTeam, def: GameTeam, orbMult = 1) {
    const zone = def.tactics.defense === 'zone' ? T.zone.defReb : 1;
    const o = avg(off, 'rebounding') * T.offReboundWeight * orbMult;
    const d = avg(def, 'rebounding') * zone;
    const offensive = rng.chance(o / (o + d));
    const team = offensive ? off : def;
    const who = pick(team.court, (p) => eff(p, 'rebounding') ** 3);
    who.stat[offensive ? 'orb' : 'drb']++;
    say(team, `${who.name} ${offensive ? '공격' : '수비'} 리바운드`, { kind: 'rebound', actor: who.id, offensive });
    return offensive ? who : null;
  }

  // 누가 쏠지: 공격 비중 + 전술 중심에 맞는 선수 + 에이스 지정 / 상대의 집중 마크
  const offenseRole = (team: GameTeam, p: GamePlayer) => team.tactics.roles?.[p.id]?.offense;
  const defenseRole = (team: GameTeam, p: GamePlayer) => team.tactics.roles?.[p.id]?.defense;
  // 수비 지시에 따른 파울 가능성 배율
  const foulRisk = (team: GameTeam, p: GamePlayer) => {
    const r = defenseRole(team, p);
    const care = Math.max(0.4, 1 - T.foulCare * p.stat.pf); // 파울이 쌓일수록 몸을 사린다
    return (r === 'tight' ? T.roles.tightFoul : r === 'safe' ? T.roles.safeFoul : 1) * care;
  };

  function chooseShooter(off: GameTeam, def: GameTeam, deny: Deny, marker: GamePlayer | undefined) {
    const focus = off.tactics.focus;
    const weights = off.court.map((p) => {
        let w = p.c.usage ** 3 * (0.5 + 0.5 * p.energy);
        const role = offenseRole(off, p);
        if (role === 'aggressive') w *= T.roles.aggressiveUsage;
        else if (role === 'conservative') w *= T.roles.conservativeUsage;
        else if (role === 'pass') w *= T.roles.passUsage;
        const lean = Math.max(p.c.rim, p.c.post) - Math.max(p.c.mid, p.c.three); // +면 인사이드형
        if (focus === 'inside') w *= clamp(1 + T.focusUsageBias * lean, 0.5, 1.8);
        if (focus === 'outside') w *= clamp(1 - T.focusUsageBias * lean, 0.5, 1.8);
        if (p.id === off.tactics.keyPlayerId) w *= T.keyPlayerUsage;
        if (p === deny?.target) w *= T.deny.usage ** deny.power; // 담당의 수비가 좋을수록 공을 못 잡는다
        if (p === marker) w *= T.deny.markerUsage; // 상대 에이스를 따라다니느라 공격에 덜 가담한다
        return w;
    });
    // 상한: 가장 몰리는 선수의 비중이 상한을 넘으면 깎는다 (나머지 넷의 비율은 그대로)
    const top = weights.indexOf(Math.max(...weights));
    const others = weights.reduce((s, w) => s + w, 0) - weights[top];
    const cap = off.court[top].id === off.tactics.keyPlayerId ? T.usageCapKey : T.usageCap;
    if (others > 0) weights[top] = Math.min(weights[top], (cap / (1 - cap)) * others);
    const total = others + weights[top];
    const slot = rng.weighted(weights);
    return { slot, share: weights[slot] / total, topShare: weights[top] / total, isTop: slot === top };
  }

  function chooseShot(off: GameTeam, def: GameTeam, shooter: GamePlayer, threeUrgency: number) {
    const w = { ...T.shotMixWeight };
    if (off.tactics.focus === 'inside') { w.rim *= T.focusShotBoost; w.post *= T.focusShotBoost; }
    if (off.tactics.focus === 'outside') { w.three *= T.focusThreeBoost; }
    if (def.tactics.defense === 'zone') { w.three *= T.zone.threeMix; w.rim *= T.zone.rimMix; }
    if (def.tactics.defense === 'press') { w.rim *= T.press.rimMix; }
    if (off.tactics.focus === 'spread') { w.three *= T.spread.threeMix; w.rim *= T.spread.rimMix; w.mid *= T.spread.midMix; w.post *= T.spread.postMix; }
    if (def.tactics.defense === 'switch') w.post *= T.switchD.postMix; // 미스매치를 찾아 포스트업
    if (def.tactics.defense === 'drop') w.mid *= T.drop.midMix; // 물러난 빅맨 앞에서 풀업 점퍼
    const role = offenseRole(off, shooter);
    if (role === 'three') w.three *= T.roles.specialtyMix;
    else if (role === 'drive') w.rim *= T.roles.specialtyMix;
    else if (role === 'post') w.post *= T.roles.specialtyMix;
    w.three *= threeUrgency;
    const types: ShotType[] = ['rim', 'post', 'mid', 'three'];
    const cap = T.midVolumeCap;
    const c = { ...shooter.c, mid: shooter.c.mid <= cap ? shooter.c.mid : cap * (shooter.c.mid / cap) ** T.midVolumeSoft };
    const best = Math.max(...types.map((t) => c[t]));
    return types[rng.weighted(types.map((t) => w[t] * c[t] ** 2.5 * (c[t] / best) ** T.shotComfort))];
  }

  // 한 번의 공격권. 공격 리바운드가 나오는 동안 계속된다.
  function possession(off: GameTeam, def: GameTeam) {
    off.possessions++;
    let secondChance = false;
    let putback: GamePlayer | null = null; // 공격 리바운드를 잡아 곧바로 올려놓으려는 선수
    // 리바운드 다툼. 공격 팀이 잡으면 true (공격이 이어진다)
    const board = (orbMult: number, canPutback = true) => {
      const who = rebound(off, def, orbMult);
      if (!who) return false;
      secondChance = true;
      putback = canPutback && rng.chance(T.putbackChance) ? who : null;
      return true;
    };
    while (clock > 0) {
      const diff = off.score - def.score;
      const late = isFinal() && clock <= 120;
      const hurry = late && diff <= -4; // 지고 있으면 서두른다
      const milk = late && diff >= 1; // 이기고 있으면 시간을 쓴다
      const bonus = () => def.teamFouls >= T.bonusTeamFouls;

      // 0) 파울 작전: 막판에 근소하게 지는 수비 팀이 시계를 멈춘다
      if (isFinal() && clock <= 35 && diff >= 1 && diff <= 8) {
        elapse(Math.min(clock, rng.int(2, 5)));
        const fouler = pick(def.court, (p) => 1 / (1 + p.stat.pf));
        addFoul(def, fouler);
        say(def, `${fouler.name} 파울 작전`, { kind: 'foul', actor: fouler.id });
        if (bonus()) {
          const shooter = pick(off.court, (p) => p.c.ballHandling ** 2);
          if (freeThrows(off, def, shooter, 2) && board(0.5)) continue;
          return;
        }
        continue;
      }

      // 공격 시간
      const tip: GamePlayer | null = putback && off.court.includes(putback) ? putback : null;
      putback = null;
      let seconds: number;
      if (tip) {
        seconds = rng.int(1, 2); // 잡자마자 올려놓는다
      } else if (!secondChance && clock <= 24 && !hurry) {
        seconds = Math.max(1, clock - rng.int(0, 3)); // 마지막 공격은 시간을 다 쓰고 쏜다
      } else {
        const d = def.tactics.defense;
        let mean = secondChance
          ? T.secondChanceMean
          : T.possessionMean - T.paceOffense * off.tactics.pace - T.paceDefense * def.tactics.pace - (d === 'press' ? T.press.paceSec : 0);
        let sd = T.possessionSd;
        if (hurry) { mean = Math.min(mean, 8); sd = 3; }
        if (milk && !secondChance) { mean = 20; sd = 2; }
        else if (!secondChance && period >= 3 && diff >= T.coastMargin) mean += T.coastSeconds; // 크게 앞서면 서두르지 않는다
        seconds = clamp(rng.gauss(mean, sd), 3, secondChance ? 14 : 24);
      }
      elapse(Math.min(clock, seconds));

      // 1) 일반 파울
      const pressing = def.tactics.defense === 'press';
      if (!tip && rng.chance(T.nonShootingFoul * (pressing ? T.press.foul : 1))) {
        const fouler = pick(def.court, (p) => (1.3 - p.c.defPerimeter) * foulRisk(def, p));
        addFoul(def, fouler);
        say(def, `${fouler.name} 파울`, { kind: 'foul', actor: fouler.id });
        if (bonus()) {
          const shooter = pick(off.court, (p) => p.c.usage);
          if (freeThrows(off, def, shooter, 2) && board(0.5)) continue;
          return;
        }
        secondChance = true; // 사이드 아웃 후 짧은 공격
        continue;
      }

      // 2) 턴오버. 프레스는 볼 핸들링이 약한 팀을 상대로 특히 잘 먹힌다
      const gap = avg(def, 'stealing') - avg(off, 'ballHandling');
      const pressTov = pressing ? Math.max(0.005, T.press.tovBase + T.press.tovSkill * gap) : 0;
      // 슛 자제 지시를 받은 선수가 많으면 슛을 미루다 공격 시간에 쫓겨 실책이 는다
      const holdBack = T.roles.conservativeTov * off.court.filter((p) => offenseRole(off, p) === 'conservative').length;
      const paceTov = off.tactics.pace * Math.max(0, T.paceTov + T.paceTovSkill * gap); // 빨리 뛸수록 실책이 늘고, 천천히 하면 준다
      const pTov = T.turnoverBase + pressTov + T.turnoverSkill * gap + holdBack + paceTov;
      if (!tip && rng.chance(clamp(pTov, 0.04, 0.4))) {
        const loser = pick(off.court, (p) => p.c.usage * (1.3 - p.c.ballHandling) * (offenseRole(off, p) === 'aggressive' ? T.roles.aggressiveTov : 1));
        loser.stat.tov++;
        if (rng.chance(T.stealShare)) {
          const thief = pick(def.court, (p) => eff(p, 'stealing') ** 3 * (defenseRole(def, p) === 'tight' ? T.roles.tightSteal : 1));
          thief.stat.stl++;
          say(def, `${thief.name} 스틸 (${loser.name} 턴오버)`, { kind: 'steal', actor: thief.id, other: loser.id });
        } else {
          say(off, `${loser.name} 턴오버`, { kind: 'turnover', actor: loser.id });
        }
        return;
      }

      // 3) 슛
      const deny = denyOf(off, def); // 상대(수비 팀)가 우리 선수에게 건 집중 마크
      const marker = denyOf(def, off)?.marker; // 우리 팀에서 상대 선수를 집중 마크하고 있는 선수
      const { slot, share, topShare, isTop } = tip
        ? { slot: off.court.indexOf(tip), share: 0, topShare: 0, isTop: false }
        : chooseShooter(off, def, deny, marker);
      const shooter = off.court[slot];
      shooter.energy = Math.max(0, shooter.energy - T.shotEnergy);
      const defender = guardOf(def, slot, deny);
      let threeUrgency = 1;
      if (hurry) threeUrgency = diff <= -6 ? 2.5 : 1.5;
      if (isFinal() && clock <= 30 && diff === -3) threeUrgency = 5;
      const type: ShotType = tip ? 'rim' : chooseShot(off, def, shooter, threeUrgency);
      const S = T.shot[type];
      const inside = type === 'rim' || type === 'post';
      const zone = def.tactics.defense === 'zone';
      const defKey = inside ? 'defInterior' : 'defPerimeter';
      // 수비 = 맡은 선수의 1대1 수비 + 팀 전체의 도움 수비. 존은 지역을 나눠 막으므로 팀 수비의 몫이 더 크다
      const helpKey = inside ? 'helpInterior' : 'helpPerimeter';
      const own = zone ? T.zone.ownShare : T.ownDefenseShare;
      const defense = own * eff(defender, defKey) + (1 - own) * avg(def, helpKey);

      let pMake = S.make + T.makeSkill * T.shotSkill[type] * (eff(shooter, type) - defense);
      pMake += T.passMake * (avg(off, 'passing') - 0.5); // 팀 패스 시너지
      if (inside) pMake += T.insideTouch * (shooter.raw.ins / 100 - T.insidePivot); // 골밑 기술: 몸싸움 속에서도 마무리한다
      if (zone) pMake += inside ? T.zone.insideMake : T.zone.outsideMake + T.zone.shooterBurn * (avg(off, 'three') - 0.5); // 슈터가 좋으면 존이 뚫린다
      // 공격 중심이 상대 수비의 약한 쪽을 노리면 더 잘 들어간다 (반대로 강한 쪽을 노리면 손해)
      if (off.tactics.focus === 'inside' && inside) pMake += T.focusRead.inside;
      if (off.tactics.focus === 'outside' && !inside) pMake += T.focusRead.outside;
      // soft > 0: 상대는 골밑 수비가 상대적으로 허술하다. soft < 0: 외곽 수비가 허술하다
      const soft = avg(def, 'defPerimeter') - avg(def, 'defInterior') - T.softPivot;
      const exploit = (x: number) => T.focusExploit * (x > 0 ? x * off.plan : x);
      if (off.tactics.focus === 'inside' && inside) pMake += exploit(soft);
      if (off.tactics.focus === 'outside' && !inside) pMake += exploit(-soft);
      if (off.tactics.pace) pMake += off.tactics.pace * (T.paceMake + T.paceEnergyEdge * (avgEnergy(off) - avgEnergy(def))); // 속공: 상대가 지쳐 있을수록 잘 통한다
      if (shooter.id === off.tactics.keyPlayerId) pMake += T.keyPlayerMake;
      pMake += T.crowdMake * Math.max(0, share - T.crowdFrom); // 공이 몰리는 선수에겐 수비도 몰린다
      if (!isTop) pMake += T.crowdOthersMake * Math.max(0, topShare - T.crowdFrom); // 그만큼 동료는 편해진다
      if (off.tactics.focus === 'spread') {
        pMake += T.spread.read;
        if (type === 'rim') pMake += T.spread.rimSpacing * (avg(off, 'three') - T.spread.spacingPivot); // 슈터가 많으면 돌파 공간이 열리고, 없으면 막힌다
        if (!inside) pMake += exploit(-soft);
      }
      if (def.tactics.defense === 'switch') pMake += type === 'post' ? T.switchD.postMake : inside ? 0 : T.switchD.outsideMake;
      if (def.tactics.defense === 'drop') pMake += type === 'rim' ? T.drop.rimMake : type === 'mid' ? T.drop.midMake : type === 'three' ? T.drop.threeMake : 0;
      const shooterRole = offenseRole(off, shooter);
      if (shooterRole === 'aggressive') pMake += T.roles.aggressiveMake;
      else if (shooterRole === 'conservative') pMake += T.roles.conservativeMake;
      const guardRole = defenseRole(def, defender);
      if (guardRole === 'tight') pMake += T.roles.tightMake;
      else if (guardRole === 'safe') pMake += T.roles.safeMake;
      if (pressing && type === 'rim') pMake += T.press.rimMake; // 프레스가 뚫리면 쉬운 득점
      if (deny) pMake += shooter === deny.target ? T.deny.make * deny.power * def.plan : Math.max(0, T.deny.othersMake + T.deny.othersHelp * (1 - deny.power));
      if (shooter === marker) pMake += T.deny.markerMake; // 수비에 힘을 쏟은 만큼 슛이 무뎌진다
      if (off.run >= T.runThreshold) pMake += Math.min(T.runBoostMax, off.run * T.runBoostPerPoint); // 기세
      if (tip) pMake += T.putbackMake;
      if (period >= 3 && diff >= T.coastMargin) pMake += T.coastMake; // 크게 앞서면 무리하지 않는다
      pMake = clamp(pMake, 0.05, 0.9);

      const fouled = rng.chance(S.foul * (zone ? T.zone.shootingFoul : 1) * foulRisk(def, defender));
      if (fouled) addFoul(def, pick(def.court, (p) => (p === defender ? 3 : 1)));

      if (!fouled && rng.chance(S.block * (avg(def, 'blocking') / 0.5) ** 2)) {
        const blocker = pick(def.court, (p) => eff(p, 'blocking') ** 4);
        blocker.stat.blk++;
        shooter.stat.fga++;
        if (type === 'three') shooter.stat.tpa++;
        say(def, `${blocker.name} 블록! (${shooter.name} ${SHOT_LABEL[type]})`, { kind: 'block', actor: blocker.id, other: shooter.id, shot: type });
        if (board(S.orb)) continue;
        return;
      }

      const made = rng.chance(fouled ? pMake * 0.6 : pMake);
      if (made || !fouled) {
        shooter.stat.fga++;
        if (type === 'three') shooter.stat.tpa++;
      }
      if (made) {
        shooter.stat.fgm++;
        if (type === 'three') shooter.stat.tpm++;
        addPoints(off, def, shooter, S.pts);
        const mates = off.court.filter((p) => p !== shooter);
        let text = `${shooter.name} ${SHOT_LABEL[type]} 성공`;
        let assist: string | undefined;
        if (rng.chance(S.assist * (0.6 + 0.8 * avg(off, 'passing')))) {
          const passer = pick(mates, (p) => eff(p, 'passing') ** 4 * (offenseRole(off, p) === 'pass' ? T.roles.passAssist : 1));
          passer.stat.ast++;
          assist = passer.id;
          text += ` (어시스트 ${passer.name})`;
        }
        say(off, fouled ? `${text} + 파울` : text, { kind: 'shot', actor: shooter.id, shot: type, made: true, assist });
        if (fouled && freeThrows(off, def, shooter, 1) && board(0.5)) continue;
        return;
      }
      if (fouled) {
        if (freeThrows(off, def, shooter, S.pts, type) && board(0.5)) continue;
        return;
      }
      say(off, `${shooter.name} ${SHOT_LABEL[type]} 실패`, { kind: 'shot', actor: shooter.id, shot: type, made: false });
      if (board(S.orb)) continue;
      return;
    }
  }

  // 작전 타임: 상대의 기세를 끊고 코트 위 선수들이 숨을 돌린다
  function timeout(side: number) {
    const team = teams[side];
    if (finished || team.timeoutsLeft <= 0) return false;
    team.timeoutsLeft--;
    teams[1 - side].run = 0;
    for (const p of team.court) p.energy = Math.min(1, p.energy + T.timeoutEnergy);
    say(team, `${team.name} 작전 타임 (남은 횟수 ${team.timeoutsLeft})`, { kind: 'timeout' });
    return true;
  }

  let offense = rng.chance(0.5) ? 0 : 1; // 점프볼

  // 공격권 하나를 진행한다
  function step(): StepResult | null {
    if (finished) return null;
    const mark = log.length;
    teams.forEach((team, side) => {
      autoSubstitute(team, teams[1 - side]);
      if (team.auto && teams[1 - side].run >= T.aiTimeoutRun) timeout(side);
    });
    const side = offense;
    const startedAt = now;
    possession(teams[offense], teams[1 - offense]);
    offense = 1 - offense;
    let periodEnded = false;
    if (clock <= 0) {
      periodEnded = true;
      if (period >= 4 && teams[0].score !== teams[1].score) {
        finished = true;
      } else {
        period++;
        clock = period > 4 ? T.overtimeSeconds : T.periodSeconds;
        teams.forEach((t) => {
          t.teamFouls = 0;
          if (period === 3) t.timeoutsLeft = T.timeouts.secondHalf;
          if (period > 4) t.timeoutsLeft = T.timeouts.overtime;
        });
      }
    }
    return { events: log.slice(mark), periodEnded, finished, offense: side, elapsed: now - startedAt };
  }

  const describe = (p: GamePlayer): PlayerView => ({ id: p.id, name: p.name, pos: p.pos, ovr: p.ovr, energy: Math.round(p.energy * 100), pf: p.stat.pf, pts: p.stat.pts, out: gone(p) });

  return {
    step,
    timeout,
    get finished() { return finished; },
    playPeriod() {
      const events: LogEvent[] = [];
      let s: StepResult | null;
      while ((s = step())) { events.push(...s.events); if (s.periodEnded) break; }
      return events;
    },
    playToEnd(): GameResult { while (step()); return this.result(); },
    setAuto(side: number, auto: boolean) { teams[side].auto = auto; },
    setTactics(side: number, patch: Partial<Tactics>) { Object.assign(teams[side].tactics, patch); },
    // 직접 교체. 성공하면 true
    substitute(side: number, outId: string, inId: string) {
      const team = teams[side];
      const slot = team.court.findIndex((p) => p.id === outId);
      const incoming = team.players.find((p) => p.id === inId);
      if (finished || slot < 0 || !incoming || team.court.includes(incoming) || gone(incoming)) return false;
      swap(team, slot, incoming);
      return true;
    },
    view(): GameView {
      return {
        period, clock: Math.max(0, Math.round(clock)), finished,
        teams: teams.map((t) => ({
          id: t.id, name: t.name, score: t.score, tactics: { ...t.tactics }, auto: t.auto,
          teamFouls: t.teamFouls, timeoutsLeft: t.timeoutsLeft, run: t.run,
          court: t.court.map(describe),
          bench: t.players.filter((p) => !t.court.includes(p)).map(describe),
        })),
      };
    },
    result(): GameResult {
      return {
        finished,
        periods: period,
        score: { home: teams[0].score, away: teams[1].score },
        winner: teams[0].score > teams[1].score ? 'home' : 'away',
        box: teams.map((t) => ({
          id: t.id, name: t.name, score: t.score, possessions: t.possessions, subs: t.subs,
          players: t.players.map((p) => ({ id: p.id, name: p.name, pos: p.pos, ovr: p.ovr, starter: p.starter, ...p.stat })),
        })),
        log,
      };
    },
  };
}

export type Game = ReturnType<typeof createGame>;

export function simulateGame(homeTeam: EngineTeam, awayTeam: EngineTeam, opts: GameOptions = {}) {
  return createGame(homeTeam, awayTeam, opts).playToEnd();
}
