// 선수의 사람다움: 성격, 사기, 그리고 감독이 결정을 내려야 하는 사건.
//
//   성격(trait)  선수마다 하나. 훈련·경기·사건에서 반응이 달라진다.
//   사기(morale) 0~100, 60이 보통. 출전 시간·승패·훈련 강도·사건으로 오르내리고, 경기력과 훈련 효율에 영향을 준다.
//   사건(event)  훈련일 아침에 가끔 생긴다. 감독이 선택지를 골라야 하루를 진행할 수 있다.
//
// 사기와 사건은 내 학교에만 적용한다 (AI 학교는 늘 보통 사기로 계산된다). 성격은 모든 선수에게 있다.
// 예전 저장에는 성격·사기가 없으므로, 읽을 때 그 자리에서 정한다.
import { makeRng } from '../rng.ts';
import { overall } from '../match/engine.ts';
import type { Rng } from '../rng.ts';
import type { Career, CareerEvent, EventKey, Player, RatingKey, Team, TraitKey } from '../types.ts';

export const MORALE = {
  base: 60, // 보통 사기. 이 값일 때 경기력·훈련 효율 보정이 0이다
  drift: 0.04, // 하루에 보통 사기 쪽으로 돌아가는 비율
  win: 3, loss: -3, officialMult: 1.7, // 승패 (공식전은 더 크게)
  expectGap: 8, // 전력 차가 이만큼이면 결과가 뻔한 경기로 본다 (이길 만한 승리·질 만한 패배는 사기를 움직이지 않는다)
  played: 0.5, // 10분 이상 뛰었다
  benched: -2, benchedSenior: -4, // 공식전에서 한 번도 못 뛰었다 (3학년은 더 속상하다)
  hard: -1.5, light: 0.5, rest: 2, // 훈련 강도
  growth: 0.2, // 사기 40 차이당 훈련 성장 배율 변화 (사기 100이면 ×1.2, 20이면 ×0.8)
  eventChance: 0.25, // 경기 없는 날 아침에 사건이 생길 확률
  eventCooldown: 2, // 사건 사이의 최소 간격(일)
};

export const TRAITS: Record<TraitKey, { label: string; info: string }> = {
  steady: { label: '성실함', info: '특별한 기복 없이 꾸준합니다.' },
  worker: { label: '노력파', info: '훈련 성장 +15%. 강한 훈련에도 사기가 떨어지지 않습니다.' },
  genius: { label: '천재형', info: '경기 경험으로 배우는 속도가 1.5배입니다.' },
  clutch: { label: '승부사', info: '4쿼터 막판 접전에서 능력이 5% 오릅니다.' },
  moody: { label: '기분파', info: '사기가 남들보다 두 배로 오르내립니다.' },
  leader: { label: '리더', info: '주전으로 뛰면 패배 뒤 팀 사기 하락이 절반으로 줄고, 갈등을 잘 풉니다.' },
  lazy: { label: '게으름', info: '훈련 성장 -10%. 강한 훈련을 특히 싫어합니다.' },
  ironman: { label: '강철 체력', info: '컨디션 소모 -20%, 부상 확률 절반.' },
};

// 원작 선수의 성격 (한국어판·원작 이름 모두)
const KNOWN: [string[], TraitKey][] = [
  [['채치수', '아카기 타케노리', '변덕규', '우오즈미 준', '김수겸', '후지마 켄지'], 'leader'],
  [['강백호', '사쿠라기 하나미치', '윤대협', '센도 아키라'], 'genius'],
  [['정대만', '미츠이 히사시'], 'clutch'],
  [['서태웅', '루카와 카에데', '권준호', '코구레 키미노부', '신준섭', '진 소이치로'], 'worker'],
  [['송태섭', '미야기 료타', '전호장', '키요타 노부나가', '황태산', '후쿠다 킷초'], 'moody'],
  [['이정환', '마키 신이치'], 'ironman'],
];
const KNOWN_TRAIT = new Map(KNOWN.flatMap(([names, trait]) => names.map((n) => [n, trait] as const)));
// 생성 선수의 성격 분포 (합 100)
const RANDOM_TRAITS: [TraitKey, number][] = [['steady', 40], ['worker', 12], ['moody', 12], ['lazy', 10], ['clutch', 8], ['ironman', 8], ['leader', 6], ['genius', 4]];

export function traitOf(p: Player): TraitKey {
  if (p.trait) return p.trait;
  const known = KNOWN_TRAIT.get(p.name);
  if (known) return (p.trait = known);
  let roll = makeRng((Number(p.id.slice(1)) || 1) * 7919).int(0, 99);
  for (const [trait, weight] of RANDOM_TRAITS) { if (roll < weight) return (p.trait = trait); roll -= weight; }
  return (p.trait = 'steady');
}

export const moraleOf = (p: Player) => p.morale ?? MORALE.base;
export const teamMorale = (team: Team) => team.players.reduce((s, p) => s + moraleOf(p), 0) / Math.max(1, team.players.length);
export const moraleLabel = (m: number) => (m >= 80 ? '최고' : m >= 68 ? '좋음' : m >= 52 ? '보통' : m >= 38 ? '가라앉음' : '바닥');
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
// 이름 뒤의 조사: 받침이 있으면 withFinal, 없으면 without
export const josa = (word: string, withFinal: string, without: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 > 0 ? withFinal : without);
};

export function addMorale(p: Player, delta: number) {
  const scale = traitOf(p) === 'moody' ? 2 : 1;
  p.morale = clamp(moraleOf(p) + delta * scale, 0, 100);
}

// 성격·사기에 따른 배율 (school.ts가 쓴다)
export const trainingFactor = (p: Player) => {
  const t = traitOf(p);
  return (t === 'worker' ? 1.15 : t === 'lazy' ? 0.9 : 1) * (1 + (MORALE.growth * (moraleOf(p) - MORALE.base)) / 40);
};
export const matchLearning = (p: Player) => (traitOf(p) === 'genius' ? 1.5 : 1);
export const staminaCost = (p: Player) => (traitOf(p) === 'ironman' ? 0.8 : 1);
export const injuryRisk = (p: Player) => (traitOf(p) === 'ironman' ? 0.5 : 1);

// ---------- 사기의 변화 (내 학교) ----------

export function moraleAfterTraining(team: Team, program: string, intensity: string) {
  for (const p of team.players) {
    if (p.injuredDays) continue;
    const t = traitOf(p);
    if (program === 'rest') addMorale(p, MORALE.rest);
    else if (program === 'scout') continue;
    else if (intensity === 'hard') addMorale(p, t === 'worker' ? 0 : t === 'lazy' ? MORALE.hard * 2 : MORALE.hard);
    else if (intensity === 'light') addMorale(p, MORALE.light);
  }
}

// minutes: 선수 id -> 뛴 시간(초). gap = 상대 전력 - 우리 전력
export function moraleAfterMatch(team: Team, minutes: Record<string, number>, won: boolean, official: boolean, gap: number) {
  const mult = official ? MORALE.officialMult : 1;
  const leader = team.players.slice(0, 5).some((p) => traitOf(p) === 'leader');
  // 기대와 견준 결과만 사기를 움직인다: 이길 만한 상대를 이긴 것, 질 만한 상대에게 진 것은 거의 영향이 없고,
  // 강한 상대를 잡으면 두 배로 오르고 약한 상대에게 지면 두 배로 떨어진다.
  // (승패를 그대로 반영하면 강팀은 늘 사기가 최고라 가만히 있어도 더 강해지고, 약팀은 지면서 더 약해진다)
  const surprise = clamp(gap / MORALE.expectGap, -1, 1); // +1: 훨씬 강한 상대, -1: 훨씬 약한 상대
  let result = (won ? MORALE.win * (1 + surprise) : MORALE.loss * (1 - surprise)) * mult;
  if (!won && leader) result /= 2;
  for (const p of team.players) {
    if (p.injuredDays) continue;
    const sec = minutes[p.id] ?? 0;
    addMorale(p, result);
    if (sec >= 600) addMorale(p, MORALE.played);
    else if (official && sec === 0) addMorale(p, p.year >= 3 ? MORALE.benchedSenior : MORALE.benched);
  }
}

export function moraleOvernight(team: Team) {
  for (const p of team.players) p.morale = moraleOf(p) + (MORALE.base - moraleOf(p)) * MORALE.drift;
}

// ---------- 사건 ----------

interface EventCtx { state: Career; team: Team; a: Player; b: Player | null; rng: Rng; out: string[] }
interface EventDef {
  from: string;
  title: (a: Player, b: Player | null) => string;
  body: (a: Player, b: Player | null) => string[];
  // 이 사건의 주인공이 될 수 있는 선수 (b가 필요한 사건은 pickB도 준다)
  pickA: (team: Team) => Player[];
  pickB?: (team: Team, a: Player) => Player[];
  options: { label: string; hint: string; apply: (c: EventCtx) => void }[];
}

const healthy = (team: Team) => team.players.filter((p) => !p.injuredDays);
const starters = (team: Team) => healthy(team).filter((p) => team.players.indexOf(p) < 5);
const bench = (team: Team) => healthy(team).filter((p) => team.players.indexOf(p) >= 5);
const everyone = (c: EventCtx, f: (p: Player) => void) => healthy(c.team).forEach(f);
const cond = (p: Player, d: number) => { p.condition = clamp(p.condition + d, 0, 100); };
const trust = (c: EventCtx, d: number) => { c.state.trust = clamp((c.state.trust ?? 50) + d, 0, 100); };
// 능력치 성장: 그 자리에서 amount만큼의 성장량을 쌓는다 (1이면 능력치 1)
function grow(c: EventCtx, p: Player, keys: RatingKey[], amount: number) {
  const up: string[] = [];
  for (const k of keys) {
    p.progress[k] = (p.progress[k] ?? 0) + amount;
    while (p.progress[k]! >= 1 && p.ratings[k] < 99) { p.progress[k]! -= 1; p.ratings[k]++; up.push(k); }
  }
  if (up.length) c.out.push(`${p.name}의 능력치가 올랐습니다 (${up.length}건).`);
}
const weakest = (p: Player, keys: RatingKey[]) => [...keys].sort((x, y) => p.ratings[x] - p.ratings[y]).slice(0, 2);
const SKILLS: RatingKey[] = ['ins', 'dnk', 'ft', 'mid', 'tp', 'oiq', 'diq', 'mdf', 'tdf', 'drb', 'pss', 'reb'];

const EVENTS: Record<EventKey, EventDef> = {
  benchTalk: {
    from: '선수 면담',
    title: (a) => `${a.name}의 면담 요청`,
    body: (a) => [`${a.name}(${a.year}학년)이 찾아왔습니다. "감독님, 저도 경기에 나가고 싶습니다. 요즘 통 기회가 없어서요."`],
    pickA: (team) => bench(team).filter((p) => moraleOf(p) < 62),
    options: [
      { label: '다음 연습 경기에서 기회를 주겠다고 한다', hint: '사기가 크게 오릅니다. 약속을 지킬지는 감독의 몫입니다.', apply: (c) => { addMorale(c.a, 12); c.out.push(`${c.a.name}의 표정이 밝아졌습니다.`); } },
      { label: '훈련에서 실력으로 증명하라고 한다', hint: '노력파·승부사에게는 자극이 되지만, 다른 선수는 상처받을 수 있습니다.', apply: (c) => {
        const t = traitOf(c.a);
        if (t === 'worker' || t === 'clutch') { addMorale(c.a, 6); grow(c, c.a, weakest(c.a, SKILLS), 0.8); c.out.push(`${josa(c.a.name, '이', '가')} 이를 악물고 훈련에 매달립니다.`); }
        else { addMorale(c.a, -7); c.out.push(`${josa(c.a.name, '은', '는')} 말없이 고개를 숙이고 나갔습니다.`); }
      } },
      { label: '팀 사정을 차분히 설명한다', hint: '무난합니다.', apply: (c) => { addMorale(c.a, 3); c.out.push(`${josa(c.a.name, '은', '는')} 수긍하고 돌아갔습니다.`); } },
    ],
  },
  nightPractice: {
    from: '체육관',
    title: (a) => `${a.name}의 야간 개인 연습`,
    body: (a) => [`훈련이 끝난 뒤에도 ${josa(a.name, '이', '가')} 체육관에 남아 혼자 슛을 던지고 있습니다. 내일도 훈련이 있는데 몸이 버틸지 걱정입니다.`],
    pickA: (team) => healthy(team).filter((p) => p.condition >= 60),
    options: [
      { label: '체육관 열쇠를 맡긴다', hint: '능력치가 오르지만 컨디션이 떨어집니다.', apply: (c) => { grow(c, c.a, ['mid', 'tp', 'ft'], traitOf(c.a) === 'worker' ? 1.3 : 0.9); cond(c.a, -12); addMorale(c.a, 4); } },
      { label: '옆에서 폼을 봐 준다', hint: '약한 능력치가 조금 오르고 사기도 오릅니다. 컨디션 소모는 적습니다.', apply: (c) => { grow(c, c.a, weakest(c.a, SKILLS), 0.6); cond(c.a, -5); addMorale(c.a, 6); } },
      { label: '몸이 먼저라며 돌려보낸다', hint: '컨디션을 지킵니다. 노력파는 아쉬워합니다.', apply: (c) => { cond(c.a, 6); addMorale(c.a, traitOf(c.a) === 'worker' ? -5 : -1); c.out.push(`${josa(c.a.name, '은', '는')} 아쉬운 얼굴로 공을 내려놓았습니다.`); } },
    ],
  },
  quarrel: {
    from: '주장',
    title: (a, b) => `${josa(a.name, '과', '와')} ${b!.name}의 다툼`,
    body: (a, b) => [`연습 중에 ${josa(a.name, '과', '와')} ${josa(b!.name, '이', '가')} 패스 문제로 언성을 높였습니다. 다른 부원들이 눈치를 보고 있습니다.`],
    pickA: (team) => starters(team),
    pickB: (team, a) => starters(team).filter((p) => p !== a),
    options: [
      { label: '둘을 불러 끝까지 이야기하게 한다', hint: '둘 다 풀립니다. 주전에 리더가 있으면 효과가 큽니다.', apply: (c) => {
        const led = starters(c.team).some((p) => traitOf(p) === 'leader');
        addMorale(c.a, led ? 8 : 4); addMorale(c.b!, led ? 8 : 4);
        c.out.push(led ? '주장이 나서서 둘을 화해시켰습니다. 팀 분위기가 오히려 좋아졌습니다.' : '어색하지만 일단 악수는 했습니다.');
      } },
      { label: '연습으로 풀라며 1대1을 시킨다', hint: '둘 다 능력치가 조금 오르지만 지칩니다. 기분파가 끼어 있으면 감정이 남습니다.', apply: (c) => {
        for (const p of [c.a, c.b!]) { grow(c, p, ['drb', 'diq'], 0.6); cond(p, -8); addMorale(p, traitOf(p) === 'moody' ? -4 : 2); }
        c.out.push('둘은 땀범벅이 될 때까지 맞붙었습니다.');
      } },
      { label: '모른 척한다', hint: '시간이 해결해 주길 기다립니다.', apply: (c) => { addMorale(c.a, -4); addMorale(c.b!, -4); everyone(c, (p) => addMorale(p, -1)); c.out.push('며칠 동안 연습 분위기가 서먹했습니다.'); } },
    ],
  },
  exam: {
    from: '교무실',
    title: () => '중간고사가 코앞입니다',
    body: () => ['담임 선생님들이 농구부 성적을 걱정하고 있습니다. 낙제점을 받으면 보충 수업으로 훈련에 빠져야 할 수도 있습니다.'],
    pickA: (team) => healthy(team),
    options: [
      { label: '오늘은 훈련을 쉬고 다 같이 공부한다', hint: '오늘 훈련이 휴식으로 바뀝니다. 교장의 신임과 사기가 오릅니다.', apply: (c) => { c.state.forcedRest = true; trust(c, 3); everyone(c, (p) => addMorale(p, 2)); c.out.push('체육관 대신 교실에 모여 문제집을 풀었습니다. 교장이 흐뭇해합니다.'); } },
      { label: '훈련은 그대로, 공부는 각자 알아서', hint: '훈련은 지키지만, 낙제자가 나오면 며칠 빠집니다.', apply: (c) => {
        if (c.rng.chance(0.4)) { const days = c.rng.int(2, 3); c.a.injuredDays = Math.max(c.a.injuredDays, days); trust(c, -3); c.out.push(`${josa(c.a.name, '이', '가')} 낙제점을 받아 ${days}일 동안 보충 수업을 받습니다. 그동안 훈련과 경기에 나올 수 없습니다.`); }
        else c.out.push('다행히 낙제자는 없었습니다.');
      } },
    ],
  },
  alumni: {
    from: '졸업생',
    title: () => '졸업한 선배의 방문',
    body: () => ['대학에서 뛰고 있는 졸업생이 체육관에 들렀습니다. 후배들에게 뭐든 도와주고 싶다고 합니다.'],
    pickA: (team) => healthy(team),
    options: [
      { label: '같이 뛰며 한 수 가르쳐 달라고 한다', hint: '전원의 공격·수비 이해가 오르고 조금 지칩니다.', apply: (c) => { everyone(c, (p) => { grow({ ...c, out: [] }, p, ['oiq', 'diq'], 0.5); cond(p, -5); }); c.out.push('대학 무대의 속도를 직접 겪었습니다. 전원의 공격·수비 이해가 조금씩 늘었습니다.'); } },
      { label: '선배의 경험담을 들려 달라고 한다', hint: '전원의 사기가 오릅니다.', apply: (c) => { everyone(c, (p) => addMorale(p, 5)); c.out.push('전국 대회 이야기에 부원들의 눈이 반짝였습니다.'); } },
    ],
  },
  slump: {
    from: '코치진',
    title: (a) => `${a.name}의 슬럼프`,
    body: (a) => [`${josa(a.name, '이', '가')} 요즘 연습에서 슛이 통 들어가지 않습니다. 본인도 초조해하는 기색입니다.`],
    pickA: (team) => starters(team),
    options: [
      { label: '될 때까지 특훈을 시킨다', hint: '성공하면 슬럼프를 털고 능력치도 오릅니다. 실패하면 더 깊이 빠집니다. 지칩니다.', apply: (c) => {
        cond(c.a, -12);
        if (c.rng.chance(traitOf(c.a) === 'worker' ? 0.8 : 0.55)) { addMorale(c.a, 10); grow(c, c.a, ['mid', 'tp'], 0.8); c.out.push(`${josa(c.a.name, '이', '가')} 감을 되찾았습니다.`); }
        else { addMorale(c.a, -8); c.out.push(`${josa(c.a.name, '은', '는')} 끝내 감을 찾지 못하고 체육관을 나섰습니다.`); }
      } },
      { label: '하루 쉬게 한다', hint: '컨디션과 사기가 회복됩니다.', apply: (c) => { cond(c.a, 15); addMorale(c.a, 5); c.out.push(`${josa(c.a.name, '은', '는')} 하루 푹 쉬고 돌아왔습니다.`); } },
      { label: '믿는다는 말만 건넨다', hint: '대부분에게는 힘이 되지만, 기분파는 방치로 느낍니다.', apply: (c) => { const moody = traitOf(c.a) === 'moody'; c.a.morale = clamp(moraleOf(c.a) + (moody ? -6 : 4), 0, 100); c.out.push(moody ? `${josa(c.a.name, '은', '는')} 건성으로 대답했습니다.` : `${josa(c.a.name, '이', '가')} 고개를 끄덕였습니다.`); } },
    ],
  },
  rookie: {
    from: '코치진',
    title: (a) => `신입생 ${a.name}의 적응`,
    body: (a) => [`1학년 ${josa(a.name, '이', '가')} 고교 훈련 강도에 좀처럼 적응하지 못하고 있습니다.`],
    pickA: (team) => healthy(team).filter((p) => p.year === 1 && overall(p) < 55), // 이미 잘하는 신입생은 적응을 걱정할 일이 없다
    options: [
      { label: '3학년 선배를 멘토로 붙인다', hint: '신입생의 사기와 이해도가 오릅니다.', apply: (c) => { addMorale(c.a, 7); grow(c, c.a, ['oiq', 'diq'], 0.7); c.out.push(`선배가 ${josa(c.a.name, '을', '를')} 살뜰히 챙기기 시작했습니다.`); } },
      { label: '기초 체력부터 다시 시킨다', hint: '체력 능력치가 오르지만 지칩니다. 게으른 선수는 반발합니다.', apply: (c) => { grow(c, c.a, ['end', 'str', 'spd'], 0.7); cond(c.a, -10); addMorale(c.a, traitOf(c.a) === 'lazy' ? -8 : -1); } },
      { label: '알아서 적응하게 둔다', hint: '아무 일도 일어나지 않을 수 있습니다.', apply: (c) => { addMorale(c.a, c.rng.chance(0.5) ? -4 : 2); c.out.push(`${josa(c.a.name, '은', '는')} 혼자서 방법을 찾고 있습니다.`); } },
    ],
  },
  friendly: {
    from: '타 학교 감독',
    title: () => '연습 경기 제안',
    body: () => ['다른 학교 감독에게서 전화가 왔습니다. 내일 연습 경기를 하자고 합니다. 일정이 비는 기간에 실전 감각을 유지할 기회입니다.'],
    pickA: (team) => healthy(team),
    options: [
      { label: '현 내 강호를 불러 달라고 한다', hint: '내일이 연습 경기가 됩니다. 강한 상대일수록 경기 경험이 많이 쌓입니다.', apply: (c) => bookFriendly(c, true) },
      { label: '비슷한 수준의 학교와 한다', hint: '내일이 연습 경기가 됩니다. 이기면 사기가 오릅니다.', apply: (c) => bookFriendly(c, false) },
      { label: '훈련 일정을 지키겠다고 거절한다', hint: '일정은 그대로입니다.', apply: (c) => { c.out.push('정중히 거절했습니다.'); } },
    ],
  },
  ache: {
    from: '의료진',
    title: (a) => `${a.name}의 무릎이 좋지 않습니다`,
    body: (a) => [`${josa(a.name, '이', '가')} 훈련 중에 무릎을 자꾸 만집니다. 큰 부상은 아니지만 무리하면 탈이 날 수 있다고 합니다.`],
    pickA: (team) => healthy(team).filter((p) => p.condition < 80),
    options: [
      { label: '이틀 쉬게 한다', hint: '이틀 동안 훈련과 경기에 빠지고 컨디션을 회복합니다.', apply: (c) => { c.a.injuredDays = Math.max(c.a.injuredDays, 2); cond(c.a, 20); c.out.push(`${josa(c.a.name, '은', '는')} 이틀 동안 치료에 전념합니다.`); } },
      { label: '테이핑을 하고 계속 뛰게 한다', hint: '훈련을 이어 가지만, 30% 확률로 4~8일 부상을 입습니다.', apply: (c) => {
        if (c.rng.chance(traitOf(c.a) === 'ironman' ? 0.12 : 0.3)) { c.a.injuredDays = c.rng.int(4, 8); addMorale(c.a, -5); c.out.push(`${josa(c.a.name, '이', '가')} 결국 무릎을 다쳤습니다. ${c.a.injuredDays}일 결장합니다.`); }
        else { addMorale(c.a, 2); c.out.push(`${josa(c.a.name, '은', '는')} 별 탈 없이 훈련을 마쳤습니다.`); }
      } },
    ],
  },
  late: {
    from: '주장',
    title: (a) => `${a.name}의 무단 지각`,
    body: (a) => [`${josa(a.name, '이', '가')} 오늘도 훈련에 늦었습니다. 이번 주에만 세 번째입니다.`],
    pickA: (team) => { const lazy = healthy(team).filter((p) => traitOf(p) === 'lazy'); return lazy.length ? lazy : healthy(team).filter((p) => moraleOf(p) < 50); },
    options: [
      { label: '오늘 훈련에서 빼고 체육관 청소를 시킨다', hint: '본인의 사기는 떨어지지만 팀의 기강이 섭니다.', apply: (c) => { addMorale(c.a, -8); everyone(c, (p) => { if (p !== c.a) addMorale(p, 2); }); c.out.push('부원들이 훈련에 임하는 태도가 달라졌습니다.'); } },
      { label: '따로 불러 사정을 듣는다', hint: '사기가 오릅니다. 다만 다른 부원들이 봐준다고 느낄 수 있습니다.', apply: (c) => { addMorale(c.a, 6); everyone(c, (p) => { if (p !== c.a) addMorale(p, -1); }); c.out.push(`${josa(c.a.name, '은', '는')} 다시는 늦지 않겠다고 약속했습니다.`); } },
      { label: '눈감아 준다', hint: '당장은 조용하지만 기강이 흐트러집니다.', apply: (c) => { everyone(c, (p) => { if (p !== c.a) addMorale(p, -3); }); c.out.push('부원들 사이에서 불만이 나오고 있습니다.'); } },
    ],
  },
};

// 내일을 연습 경기로 바꾼다 (훈련일일 때만)
function bookFriendly(c: EventCtx, strong: boolean) {
  const { state } = c;
  const tomorrow = state.calendar[state.dayIndex + 1];
  if (!tomorrow || tomorrow.type !== 'training' || tomorrow.start) { c.out.push('일정이 맞지 않아 성사되지 않았습니다.'); return; }
  const rivals = state.regionIds.filter((id) => id !== state.userTeamId).map((id) => state.teams[id]);
  const strength = (t: Team) => t.players.slice(0, 5).reduce((s, p) => s + overall(p), 0) / 5;
  const myStrength = strength(c.team);
  const pool = strong
    ? [...rivals].sort((x, y) => strength(y) - strength(x)).slice(0, 4)
    : [...rivals].sort((x, y) => Math.abs(strength(x) - myStrength) - Math.abs(strength(y) - myStrength)).slice(0, 4);
  const opp = pool[c.rng.int(0, pool.length - 1)];
  tomorrow.type = 'practice';
  tomorrow.opponentId = opp.id;
  c.out.push(`내일 ${josa(opp.name, '과', '와')} 연습 경기를 치릅니다.`);
}

const EVENT_KEYS = Object.keys(EVENTS) as EventKey[];

// 오늘 아침의 사건을 정한다 (없으면 null). 내일이 훈련일이어야 하는 사건은 일정을 본다.
export function rollEvent(state: Career, rng: Rng): CareerEvent | null {
  const team = state.teams[state.userTeamId];
  const day = state.calendar[state.dayIndex];
  // 날짜는 해마다 1일로 돌아가므로, 지난해의 기록(오늘보다 뒤 날짜)은 무시한다
  const since = state.dayIndex - (state.lastEventDay ?? -99);
  if (!day || (since >= 0 && since < MORALE.eventCooldown) || !rng.chance(MORALE.eventChance)) return null;
  const tomorrow = state.calendar[state.dayIndex + 1];
  for (let tries = 0; tries < 6; tries++) {
    const key = EVENT_KEYS[rng.int(0, EVENT_KEYS.length - 1)];
    if (key === state.lastEventKey) continue;
    if (key === 'friendly' && (!tomorrow || tomorrow.type !== 'training' || tomorrow.start)) continue;
    const def = EVENTS[key];
    const as = def.pickA(team);
    if (!as.length) continue;
    const a = as[rng.int(0, as.length - 1)];
    const bs = def.pickB?.(team, a) ?? [];
    if (def.pickB && !bs.length) continue;
    return { key, a: a.id, b: def.pickB ? bs[rng.int(0, bs.length - 1)].id : undefined };
  }
  return null;
}

export interface EventView {
  from: string;
  title: string;
  body: string[];
  options: { label: string; hint: string }[];
}

// 화면에 보여 줄 사건 내용. 주인공이 팀을 떠났으면 null
export function describeEvent(state: Career, ev: CareerEvent): EventView | null {
  const team = state.teams[state.userTeamId];
  const def = EVENTS[ev.key];
  const a = team.players.find((p) => p.id === ev.a);
  const b = ev.b ? team.players.find((p) => p.id === ev.b) ?? null : null;
  if (!def || !a || (ev.b && !b)) return null;
  return { from: def.from, title: def.title(a, b), body: def.body(a, b), options: def.options.map((o) => ({ label: o.label, hint: o.hint })) };
}

// 감독의 선택을 적용한다. 결과 문장을 돌려준다 (받은 소식에 남긴다)
export function resolveEvent(state: Career, choice: number): (EventView & { chosen: string; result: string[] }) | null {
  const ev = state.event;
  if (!ev) return null;
  const view = describeEvent(state, ev);
  delete state.event;
  state.lastEventDay = state.dayIndex;
  state.lastEventKey = ev.key;
  if (!view) return null;
  const team = state.teams[state.userTeamId];
  const def = EVENTS[ev.key];
  const option = def.options[choice] ?? def.options[0];
  const a = team.players.find((p) => p.id === ev.a)!;
  const b = ev.b ? team.players.find((p) => p.id === ev.b) ?? null : null;
  const before = new Map(team.players.map((p) => [p, moraleOf(p)]));
  const ctx: EventCtx = { state, team, a, b, rng: makeRng((state.seed + state.dayIndex * 7919 + state.year * 104729) >>> 0), out: [] };
  option.apply(ctx);
  // 사기가 눈에 띄게 변한 선수를 덧붙인다
  const moved = team.players.map((p) => ({ p, d: Math.round(moraleOf(p) - before.get(p)!) })).filter((x) => Math.abs(x.d) >= 3);
  if (moved.length && moved.length <= 3) ctx.out.push(moved.map((x) => `${x.p.name} 사기 ${x.d > 0 ? '+' : ''}${x.d}`).join(' · '));
  else if (moved.length > 3) { const avg = Math.round(moved.reduce((s, x) => s + x.d, 0) / moved.length); ctx.out.push(`부원 ${moved.length}명의 사기 ${avg > 0 ? '+' : ''}${avg}`); }
  return { ...view, chosen: option.label, result: ctx.out };
}
