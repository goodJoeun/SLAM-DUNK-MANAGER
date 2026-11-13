// 임시 팀·선수 생성기. 실제 게임 데이터(이름·학교)는 이 파일만 교체하면 된다.

export const RATING_KEYS = ['hgt', 'str', 'spd', 'jmp', 'end', 'ins', 'dnk', 'ft', 'mid', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb'];

// 포지션별 능력치 보정 (1=PG ... 5=C)
export const ARCHETYPE = {
  1: { hgt: -20, str: -8, spd: 12, ins: -12, dnk: -10, mid: 5, tp: 8, drb: 15, pss: 15, reb: -12 },
  2: { hgt: -10, spd: 8, ins: -8, mid: 8, tp: 12, drb: 6, pss: 3, reb: -8 },
  3: { jmp: 3, dnk: 3 },
  4: { hgt: 10, str: 10, spd: -5, ins: 8, dnk: 6, tp: -10, drb: -8, pss: -5, reb: 10 },
  5: { hgt: 18, str: 14, spd: -10, ins: 12, dnk: 6, ft: -6, mid: -6, tp: -20, drb: -14, pss: -8, reb: 14 },
};

export function generatePlayer(rng, id, name, pos, quality) {
  const ratings = {};
  for (const k of RATING_KEYS) {
    const base = quality + (k === 'ft' ? 8 : 0) + (ARCHETYPE[pos][k] ?? 0);
    ratings[k] = Math.round(Math.max(5, Math.min(99, rng.gauss(base, 6))));
  }
  return { id, name, pos, ratings };
}

// quality: 팀 평균 수준 (대략 35=약체, 50=평균, 65=강호)
export function generateTeam(rng, name, quality, tactics = {}) {
  const players = [];
  for (let i = 0; i < 10; i++) {
    const pos = (i % 5) + 1;
    const q = i < 5 ? quality + 4 : quality - 6; // 주전 5명 + 벤치 5명
    players.push(generatePlayer(rng, `${name}-${i + 1}`, `${name} ${i + 1}번`, pos, q));
  }
  return { name, tactics, players };
}
