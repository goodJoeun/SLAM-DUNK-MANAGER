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

import { makeRng } from './rng.ts';
import type { Rng } from './rng.ts';
import type {
  BasePlayer, Composites, EngineTeam, GameOptions, GameResult, GameView, LogEvent, PlayerView,
  RatingKey, ShotType, StatLine, StepResult, Tactics,
} from './types.ts';

// ---- 조정 계수: 밸런스는 여기서만 만진다 ----
export const TUNING = {
  periodSeconds: 600, // 10분 4쿼터 (FIBA·고교 규정)
  overtimeSeconds: 300,
  foulOutLimit: 5,
  bonusTeamFouls: 5, // 쿼터 내 팀 파울 5개째부터 자유투 2개
  possessionMean: 14.5,
  possessionSd: 4.5,
  secondChanceMean: 6,
  nonShootingFoul: 0.095,
  turnoverBase: 0.135,
  turnoverSkill: 0.2,
  stealShare: 0.5,
  shot: {
    //        성공 기준값, 블록 기준, 슈팅 파울, 어시스트 비율, 점수, 공격 리바운드 보정
    rim: { make: 0.6, block: 0.09, foul: 0.17, assist: 0.6, pts: 2, orb: 1.12 },
    post: { make: 0.45, block: 0.08, foul: 0.14, assist: 0.4, pts: 2, orb: 1.05 },
    mid: { make: 0.39, block: 0.03, foul: 0.05, assist: 0.45, pts: 2, orb: 0.95 },
    three: { make: 0.335, block: 0.01, foul: 0.02, assist: 0.75, pts: 3, orb: 0.92 },
  },
  shotMixWeight: { rim: 1.0, post: 0.55, mid: 0.75, three: 1.2 },
  makeSkill: 0.36, // (공격 능력 - 수비 능력) 1.0 차이당 성공률 변화
  offReboundWeight: 0.38,
  energyDrain: 0.00045,
  energyRecover: 0.0012,

  // 교체
  tiredEnergy: 0.6, // 이 아래로 떨어지면 벤치로
  restedEnergy: 0.85, // 이 위로 회복하면 다시 투입 가능
  minStint: 90, // 한 번 들어가면 최소 이만큼(초)은 뛴다
  posMismatchPenalty: 0.06, // 포지션 1칸 어긋날 때마다 가치 감소
  crunchSeconds: 180, // 4쿼터 막판 접전: 베스트 5 고정
  crunchMargin: 8,
  garbageMargin: 20, // 4쿼터 후반 이 점수 차 이상이면 벤치 가동
  formSd: 0.015, // 당일 컨디션 편차 (일관성이 낮을수록 커진다)
  formInconsistency: 0.05,

  // 흐름과 작전 타임
  runThreshold: 4, // 연속 득점이 이만큼 쌓이면 기세가 붙는다
  runBoostPerPoint: 0.004,
  runBoostMax: 0.03,
  timeoutEnergy: 0.06, // 작전 타임 때 코트 위 선수 체력 회복
  aiTimeoutRun: 8, // AI는 상대가 이만큼 연속 득점하면 타임을 부른다
  timeouts: { firstHalf: 2, secondHalf: 3, overtime: 1 },

  // 전술
  focusShotBoost: 1.6, // 중심 전술의 슛 종류 가중
  focusUsageBias: 1.0, // 중심 전술에 맞는 선수에게 공이 몰리는 정도
  keyPlayerUsage: 1.5, // 에이스 지정: 공격 비중 증가
  deny: { usage: 0.7, make: -0.03, othersMake: 0.008 }, // 집중 마크: 대상은 묶이지만 나머지가 조금 편해진다
  zone: { insideMake: -0.035, outsideMake: 0.025, threeMix: 1.25, rimMix: 0.8, defReb: 0.92, shootingFoul: 0.8, drain: 0.92 },
  press: { tovBase: 0.02, tovSkill: 0.25, rimMake: 0.04, rimMix: 1.2, foul: 1.25, drain: 1.25, paceSec: 1.5 },
};

const r = (p: BasePlayer, k: RatingKey) => p.ratings[k] / 100;

// 원본 능력치 -> 엔진이 쓰는 합성 능력치 (0~1)
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
    defInterior: 0.35 * r(p, 'hgt') + 0.2 * r(p, 'str') + 0.15 * r(p, 'jmp') + 0.3 * r(p, 'diq'),
    defPerimeter: 0.4 * r(p, 'spd') + 0.4 * r(p, 'diq') + 0.1 * r(p, 'hgt') + 0.1 * r(p, 'str'),
    stealing: 0.45 * r(p, 'spd') + 0.55 * r(p, 'diq'),
    blocking: 0.5 * r(p, 'hgt') + 0.3 * r(p, 'jmp') + 0.2 * r(p, 'diq'),
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
  const defense = Math.max(c.defInterior, c.defPerimeter) * 0.7 + c.rebounding * 0.3;
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
  ovr: number;
  form: number; // 당일 컨디션 보정
  energy: number; // 0~1
  injured: boolean;
  since: number; // 마지막으로 코트에 들어오거나 나간 시각
  stat: StatLine;
  starter: boolean;
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
}

function setupTeam(team: EngineTeam, rng: Rng, auto: boolean): GameTeam {
  const T = TUNING;
  const players: GamePlayer[] = team.players.map((p, i) => {
    // 숨겨진 능력치: 일관성이 낮을수록 그날 컨디션이 크게 흔들린다
    const consistency = (p.hidden?.consistency ?? 50) / 100;
    return {
      id: p.id, name: p.name, pos: p.pos, c: composites(p), ovr: overall(p),
      form: rng.gauss(0, T.formSd + T.formInconsistency * (1 - consistency)),
      energy: p.condition == null ? 1 : 0.85 + 0.15 * (p.condition / 100), // 지친 채로 경기에 나오면 체력이 덜 찬 상태
      injured: (p.injuredDays ?? 0) > 0,
      since: 0, stat: emptyLine(), starter: i < 5,
    };
  });
  return {
    id: team.id,
    name: team.name,
    tactics: { pace: 0, focus: 'balanced', defense: 'man', keyPlayerId: null, denyPlayerId: null, ...team.tactics },
    players,
    court: players.slice(0, 5), // 슬롯 순서 = 포지션 1~5
    auto, score: 0, teamFouls: 0, possessions: 0, subs: 0, run: 0,
    timeoutsLeft: T.timeouts.firstHalf,
  };
}

export function createGame(homeTeam: EngineTeam, awayTeam: EngineTeam, opts: GameOptions = {}) {
  const rng = makeRng(opts.seed ?? Date.now());
  const T = TUNING;
  const manual = opts.manual ?? [false, false];
  const teams = [setupTeam(homeTeam, rng, !manual[0]), setupTeam(awayTeam, rng, !manual[1])];
  const log: LogEvent[] = [];
  let period = 1;
  let clock = T.periodSeconds;
  let now = 0; // 경기 시작부터 흐른 시간(초)
  let finished = false;

  const say = (team: GameTeam, text: string) => {
    if (!opts.log) return;
    const m = Math.floor(clock / 60);
    const s = String(Math.floor(clock % 60)).padStart(2, '0');
    log.push({ period, clock: `${m}:${s}`, team: team.name, text, score: `${teams[0].score}-${teams[1].score}` });
  };

  // 피로·컨디션 반영 능력치
  const eff = (p: GamePlayer, key: keyof Composites) => p.c[key] * (0.8 + 0.2 * p.energy) * (1 + p.form);
  const avg = (team: GameTeam, key: keyof Composites) => team.court.reduce((s, p) => s + eff(p, key), 0) / 5;
  const pick = (players: GamePlayer[], weightFn: (p: GamePlayer) => number) => players[rng.weighted(players.map(weightFn))];
  const isFinal = () => period >= 4;
  const gone = (p: GamePlayer) => p.injured || p.stat.pf >= T.foulOutLimit; // 더는 뛸 수 없는 선수

  function addPoints(off: GameTeam, def: GameTeam, player: GamePlayer, pts: number) {
    player.stat.pts += pts;
    off.score += pts;
    off.run += pts;
    def.run = 0;
  }

  function elapse(sec: number) {
    for (const team of teams) {
      const d = team.tactics.defense;
      const style = d === 'press' ? T.press.drain : d === 'zone' ? T.zone.drain : 1;
      for (const p of team.players) {
        if (team.court.includes(p)) {
          p.stat.sec += sec;
          p.energy = Math.max(0, p.energy - sec * T.energyDrain * style * (1.3 - 0.6 * p.c.endurance));
        } else {
          p.energy = Math.min(1, p.energy + sec * T.energyRecover);
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
    say(team, `교체: ${cur.name} → ${incoming.name}`);
  }

  // 자동 교체: 지친 선수는 쉬게 하고, 회복한 주전은 복귀. 접전 막판엔 베스트 5, 승부가 기울면 벤치.
  // 직접 지휘하는 팀은 퇴장 선수의 빈자리만 채운다.
  function autoSubstitute(team: GameTeam, opp: GameTeam) {
    const margin = Math.abs(team.score - opp.score);
    const crunch = isFinal() && clock <= T.crunchSeconds && margin <= T.crunchMargin;
    const garbage = period === 4 && clock <= 300 && margin >= T.garbageMargin;
    const foulTrouble = (p: GamePlayer) => {
      if (crunch || period > 4 || (period === 4 && clock <= 300)) return false;
      return p.stat.pf >= Math.min(4, period + 1); // 1Q 2개, 2Q 3개, 이후 4개면 아낀다
    };
    const unavailable = (p: GamePlayer) => gone(p) || foulTrouble(p) || (garbage && p.starter);
    const mustLeave = (p: GamePlayer) =>
      unavailable(p) ||
      (crunch ? p.energy < 0.25 : p.energy < T.tiredEnergy && now - p.since >= T.minStint);
    const ready = (p: GamePlayer) => !unavailable(p) && p.energy >= (crunch ? 0.3 : garbage ? 0 : T.restedEnergy);
    const value = (p: GamePlayer, slot: number) => p.ovr * (1 - T.posMismatchPenalty * Math.abs(p.pos - (slot + 1)));

    for (let slot = 0; slot < 5; slot++) {
      const cur = team.court[slot];
      if (!team.auto && !gone(cur)) continue;
      const offCourt = team.players.filter((p) => !team.court.includes(p));
      let pool = offCourt.filter((p) => ready(p) && Math.abs(p.pos - (slot + 1)) <= 1);
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
    if (player.stat.pf >= T.foulOutLimit) say(def, `${player.name} 5반칙 퇴장`);
  }

  // 자유투. 마지막 구가 빗나가면 true (리바운드 상황)
  function freeThrows(off: GameTeam, def: GameTeam, shooter: GamePlayer, n: number) {
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
    say(off, `${shooter.name} 자유투 ${n}개 중 ${made}개 성공`);
    return lastMissed;
  }

  // 리바운드. 공격 리바운드면 true
  function rebound(off: GameTeam, def: GameTeam, orbMult = 1) {
    const zone = def.tactics.defense === 'zone' ? T.zone.defReb : 1;
    const o = avg(off, 'rebounding') * T.offReboundWeight * orbMult;
    const d = avg(def, 'rebounding') * zone;
    const offensive = rng.chance(o / (o + d));
    const team = offensive ? off : def;
    const who = pick(team.court, (p) => eff(p, 'rebounding') ** 3);
    who.stat[offensive ? 'orb' : 'drb']++;
    say(team, `${who.name} ${offensive ? '공격' : '수비'} 리바운드`);
    return offensive;
  }

  // 누가 쏠지: 공격 비중 + 전술 중심에 맞는 선수 + 에이스 지정 / 상대의 집중 마크
  function chooseShooter(off: GameTeam, def: GameTeam) {
    const focus = off.tactics.focus;
    return rng.weighted(
      off.court.map((p) => {
        let w = p.c.usage ** 3 * (0.5 + 0.5 * p.energy);
        const lean = Math.max(p.c.rim, p.c.post) - Math.max(p.c.mid, p.c.three); // +면 인사이드형
        if (focus === 'inside') w *= clamp(1 + T.focusUsageBias * lean, 0.5, 1.8);
        if (focus === 'outside') w *= clamp(1 - T.focusUsageBias * lean, 0.5, 1.8);
        if (p.id === off.tactics.keyPlayerId) w *= T.keyPlayerUsage;
        if (p.id === def.tactics.denyPlayerId) w *= T.deny.usage;
        return w;
      }),
    );
  }

  function chooseShot(off: GameTeam, def: GameTeam, shooter: GamePlayer, threeUrgency: number) {
    const w = { ...T.shotMixWeight };
    if (off.tactics.focus === 'inside') { w.rim *= T.focusShotBoost; w.post *= T.focusShotBoost; }
    if (off.tactics.focus === 'outside') { w.three *= T.focusShotBoost; }
    if (def.tactics.defense === 'zone') { w.three *= T.zone.threeMix; w.rim *= T.zone.rimMix; }
    if (def.tactics.defense === 'press') { w.rim *= T.press.rimMix; }
    w.three *= threeUrgency;
    const types: ShotType[] = ['rim', 'post', 'mid', 'three'];
    return types[rng.weighted(types.map((t) => w[t] * shooter.c[t] ** 2.5))];
  }

  // 한 번의 공격권. 공격 리바운드가 나오는 동안 계속된다.
  function possession(off: GameTeam, def: GameTeam) {
    off.possessions++;
    let secondChance = false;
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
        say(def, `${fouler.name} 파울 작전`);
        if (bonus()) {
          const shooter = pick(off.court, (p) => p.c.ballHandling ** 2);
          if (freeThrows(off, def, shooter, 2) && rebound(off, def, 0.5)) { secondChance = true; continue; }
          return;
        }
        continue;
      }

      // 공격 시간
      let seconds: number;
      if (!secondChance && clock <= 24 && !hurry) {
        seconds = Math.max(1, clock - rng.int(0, 3)); // 마지막 공격은 시간을 다 쓰고 쏜다
      } else {
        const d = def.tactics.defense;
        let mean = secondChance
          ? T.secondChanceMean
          : T.possessionMean - 2 * off.tactics.pace - def.tactics.pace - (d === 'press' ? T.press.paceSec : 0);
        let sd = T.possessionSd;
        if (hurry) { mean = Math.min(mean, 8); sd = 3; }
        if (milk && !secondChance) { mean = 20; sd = 2; }
        seconds = clamp(rng.gauss(mean, sd), 3, secondChance ? 14 : 24);
      }
      elapse(Math.min(clock, seconds));

      // 1) 일반 파울
      const pressing = def.tactics.defense === 'press';
      if (rng.chance(T.nonShootingFoul * (pressing ? T.press.foul : 1))) {
        const fouler = pick(def.court, (p) => 1.3 - p.c.defPerimeter);
        addFoul(def, fouler);
        say(def, `${fouler.name} 파울`);
        if (bonus()) {
          const shooter = pick(off.court, (p) => p.c.usage);
          if (freeThrows(off, def, shooter, 2) && rebound(off, def, 0.5)) { secondChance = true; continue; }
          return;
        }
        secondChance = true; // 사이드 아웃 후 짧은 공격
        continue;
      }

      // 2) 턴오버. 프레스는 볼 핸들링이 약한 팀을 상대로 특히 잘 먹힌다
      const gap = avg(def, 'stealing') - avg(off, 'ballHandling');
      const pressTov = pressing ? Math.max(0.005, T.press.tovBase + T.press.tovSkill * gap) : 0;
      const pTov = T.turnoverBase + pressTov + T.turnoverSkill * gap;
      if (rng.chance(clamp(pTov, 0.04, 0.4))) {
        const loser = pick(off.court, (p) => p.c.usage * (1.3 - p.c.ballHandling));
        loser.stat.tov++;
        if (rng.chance(T.stealShare)) {
          const thief = pick(def.court, (p) => eff(p, 'stealing') ** 3);
          thief.stat.stl++;
          say(def, `${thief.name} 스틸 (${loser.name} 턴오버)`);
        } else {
          say(off, `${loser.name} 턴오버`);
        }
        return;
      }

      // 3) 슛
      const slot = chooseShooter(off, def);
      const shooter = off.court[slot];
      const defender = def.court[slot];
      let threeUrgency = 1;
      if (hurry) threeUrgency = diff <= -6 ? 2.5 : 1.5;
      if (isFinal() && clock <= 30 && diff === -3) threeUrgency = 5;
      const type = chooseShot(off, def, shooter, threeUrgency);
      const S = T.shot[type];
      const inside = type === 'rim' || type === 'post';
      const zone = def.tactics.defense === 'zone';
      const defKey = inside ? 'defInterior' : 'defPerimeter';
      const defense = 0.5 * eff(defender, defKey) + 0.5 * avg(def, defKey);

      let pMake = S.make + T.makeSkill * (eff(shooter, type) - defense);
      pMake += 0.04 * (avg(off, 'passing') - 0.5); // 팀 패스 시너지
      if (zone) pMake += inside ? T.zone.insideMake : T.zone.outsideMake;
      if (pressing && type === 'rim') pMake += T.press.rimMake; // 프레스가 뚫리면 쉬운 득점
      if (def.tactics.denyPlayerId) pMake += shooter.id === def.tactics.denyPlayerId ? T.deny.make : T.deny.othersMake;
      if (off.run >= T.runThreshold) pMake += Math.min(T.runBoostMax, off.run * T.runBoostPerPoint); // 기세
      pMake = clamp(pMake, 0.05, 0.9);

      const fouled = rng.chance(S.foul * (zone ? T.zone.shootingFoul : 1));
      if (fouled) addFoul(def, pick(def.court, (p) => (p === defender ? 3 : 1)));

      if (!fouled && rng.chance(S.block * (avg(def, 'blocking') / 0.5) ** 2)) {
        const blocker = pick(def.court, (p) => eff(p, 'blocking') ** 4);
        blocker.stat.blk++;
        shooter.stat.fga++;
        if (type === 'three') shooter.stat.tpa++;
        say(def, `${blocker.name} 블록! (${shooter.name} ${SHOT_LABEL[type]})`);
        if (rebound(off, def, S.orb)) { secondChance = true; continue; }
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
        if (rng.chance(S.assist * (0.6 + 0.8 * avg(off, 'passing')))) {
          const passer = pick(mates, (p) => eff(p, 'passing') ** 4);
          passer.stat.ast++;
          text += ` (어시스트 ${passer.name})`;
        }
        say(off, fouled ? `${text} + 파울` : text);
        if (fouled && freeThrows(off, def, shooter, 1) && rebound(off, def, 0.5)) { secondChance = true; continue; }
        return;
      }
      if (fouled) {
        if (freeThrows(off, def, shooter, S.pts) && rebound(off, def, 0.5)) { secondChance = true; continue; }
        return;
      }
      say(off, `${shooter.name} ${SHOT_LABEL[type]} 실패`);
      if (rebound(off, def, S.orb)) { secondChance = true; continue; }
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
    say(team, `작전 타임 (남은 횟수 ${team.timeoutsLeft})`);
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
    return { events: log.slice(mark), periodEnded, finished };
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
