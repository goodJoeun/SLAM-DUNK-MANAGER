// 경기 후 코치 총평: 박스스코어에서 승부를 가른 지점, 전술이 통했는지, 눈에 띈 선수를 뽑아 몇 줄로 정리한다.
// 다음 경기의 전술·선발을 정할 때 근거가 되도록, 숫자를 붙여 사실 위주로 쓴다.
import type { BoxPlayer, BoxTeam, LogEvent, Tactics } from './types.ts';

const sum = (t: BoxTeam, f: (p: BoxPlayer) => number) => t.players.reduce((s, p) => s + f(p), 0);
const pct = (made: number, tried: number) => (tried ? Math.round((100 * made) / tried) : 0);

interface Totals { fgm: number; fga: number; tpm: number; tpa: number; fta: number; ftm: number; reb: number; orb: number; tov: number; ast: number; pf: number; bench: number }
const totals = (t: BoxTeam): Totals => ({
  fgm: sum(t, (p) => p.fgm), fga: sum(t, (p) => p.fga), tpm: sum(t, (p) => p.tpm), tpa: sum(t, (p) => p.tpa),
  fta: sum(t, (p) => p.fta), ftm: sum(t, (p) => p.ftm), reb: sum(t, (p) => p.orb + p.drb), orb: sum(t, (p) => p.orb),
  tov: sum(t, (p) => p.tov), ast: sum(t, (p) => p.ast), pf: sum(t, (p) => p.pf),
  bench: sum(t, (p) => (p.starter ? 0 : p.pts)),
});

// expected: 경기 전 팀 전력 [우리, 상대] (알 수 있을 때만)
export function reviewMatch(mine: BoxTeam, opp: BoxTeam, tactics: Partial<Tactics>, expected?: [number, number]): string[] {
  const a = totals(mine);
  const b = totals(opp);
  const won = mine.score > opp.score;
  const margin = Math.abs(mine.score - opp.score);
  const lines: string[] = [];

  // 1) 결과를 전력 차에 비춰 본다
  if (expected) {
    const gap = expected[0] - expected[1];
    if (won && gap <= -4) lines.push(`전력에서 ${-gap} 뒤지는 상대를 잡았습니다. 준비한 대로 풀린 경기입니다.`);
    else if (!won && gap >= 4) lines.push(`전력에서 ${gap} 앞서고도 졌습니다. 아래 수치에서 원인을 짚어 봐야 합니다.`);
    else if (won && margin <= 5) lines.push('끝까지 접전이었습니다. 막판 집중력으로 이겼습니다.');
    else if (!won && margin <= 5) lines.push('한두 번의 공격권 차이로 졌습니다. 내용은 대등했습니다.');
    else if (!won && gap <= -8) lines.push(`전력 차(${-gap})가 그대로 드러난 경기였습니다.`);
  }

  // 2) 승부를 가른 지점: 양 팀 수치 차이를 대략 점수로 환산해 큰 것 두 가지
  const factors: { value: number; text: string }[] = [
    { value: (pct(a.fgm, a.fga) - pct(b.fgm, b.fga)) * 0.7, text: `야투 성공률 ${pct(a.fgm, a.fga)}% 대 ${pct(b.fgm, b.fga)}%` },
    { value: (a.tpm - b.tpm) * 3, text: `3점슛 ${a.tpm}/${a.tpa} 대 ${b.tpm}/${b.tpa}` },
    { value: (a.reb - b.reb) * 0.9, text: `리바운드 ${a.reb} 대 ${b.reb} (공격 리바운드 ${a.orb} 대 ${b.orb})` },
    { value: (b.tov - a.tov) * 1.1, text: `턴오버 ${a.tov} 대 ${b.tov}` },
    { value: (a.ftm - b.ftm) * 1, text: `자유투 ${a.ftm}/${a.fta} 대 ${b.ftm}/${b.fta}` },
  ];
  const decisive = factors.filter((f) => (won ? f.value > 3 : f.value < -3)).sort((x, y) => Math.abs(y.value) - Math.abs(x.value)).slice(0, 2);
  if (decisive.length) lines.push(`${won ? '이긴' : '진'} 이유: ${decisive.map((f) => f.text).join(', ')}.`);
  const against = factors.filter((f) => (won ? f.value < -3 : f.value > 3)).sort((x, y) => Math.abs(y.value) - Math.abs(x.value))[0];
  if (against) lines.push(`${won ? '다만 밀린 부분' : '그래도 앞선 부분'}: ${against.text}.`);

  // 3) 전술이 통했는지
  const focus = tactics.focus ?? 'balanced';
  const twoPct = pct(a.fgm - a.tpm, a.fga - a.tpa);
  const threePct = pct(a.tpm, a.tpa);
  const threeShare = pct(a.tpa, a.fga);
  if (focus === 'outside' || focus === 'spread') {
    lines.push(`${focus === 'spread' ? '5아웃' : '외곽 중심'} 공격: 슛의 ${threeShare}%를 3점으로 던져 ${threePct}% 성공. ${threePct >= 36 ? '잘 통했습니다.' : threePct >= 30 ? '평범했습니다.' : '외곽이 터지지 않았습니다.'}`);
  } else if (focus === 'inside') {
    lines.push(`골밑 중심 공격: 2점슛 성공률 ${twoPct}%, 자유투 ${a.fta}개를 얻었습니다. ${twoPct >= 52 ? '안쪽을 확실히 공략했습니다.' : twoPct >= 45 ? '평범했습니다.' : '상대 골밑 수비에 막혔습니다.'}`);
  }
  const defense = tactics.defense ?? 'man';
  const oppFg = pct(b.fgm, b.fga);
  if (defense === 'press') lines.push(`프레스 수비: 상대 턴오버 ${b.tov}개를 끌어냈고, 우리 파울은 ${a.pf}개였습니다. ${b.tov >= 15 && a.pf <= 20 ? '압박이 통했습니다.' : a.pf > 20 ? '파울이 많아 자유투를 내줬습니다.' : '압박 효과가 크지 않았습니다.'}`);
  else if (defense === 'zone') lines.push(`존 수비: 상대 3점슛 ${b.tpm}/${b.tpa} (${pct(b.tpm, b.tpa)}%). ${pct(b.tpm, b.tpa) >= 37 ? '외곽을 많이 내줬습니다.' : '외곽 허용이 감당할 만했습니다.'}`);
  else if (oppFg >= 50) lines.push(`수비: 상대 야투 성공률이 ${oppFg}%였습니다. 수비 방식을 바꿔 볼 만합니다.`);
  else if (oppFg <= 38) lines.push(`수비: 상대 야투 성공률을 ${oppFg}%로 묶었습니다.`);

  // 4) 눈에 띈 선수
  const top = mine.players.reduce((x, y) => (y.pts > x.pts ? y : x));
  const topShare = pct(top.fga, a.fga);
  lines.push(`${top.name} ${top.pts}점 (야투 ${top.fgm}/${top.fga})${topShare >= 35 ? ` — 팀 슛의 ${topShare}%를 혼자 던졌습니다. 의존도가 높습니다.` : '.'}`);
  const cold = mine.players.filter((p) => p !== top && p.fga >= 8 && pct(p.fgm, p.fga) < 30).sort((x, y) => y.fga - x.fga)[0];
  if (cold) lines.push(`${cold.name}${(cold.name.charCodeAt(cold.name.length - 1) - 0xac00) % 28 > 0 ? '은' : '는'} 야투 ${cold.fgm}/${cold.fga}로 부진했습니다.`);
  const fouledOut = mine.players.filter((p) => p.pf >= 5).map((p) => p.name);
  if (fouledOut.length) lines.push(`${fouledOut.join(', ')} 5반칙 퇴장. 파울 관리가 필요합니다.`);
  const oppTop = opp.players.reduce((x, y) => (y.pts > x.pts ? y : x));
  if (oppTop.pts >= 25) lines.push(`상대 ${oppTop.name}에게 ${oppTop.pts}점을 내줬습니다. 다시 만나면 집중 마크를 고려할 만합니다.`);
  if (a.bench - b.bench >= 10) lines.push(`벤치 득점 ${a.bench} 대 ${b.bench}로 앞섰습니다.`);
  else if (b.bench - a.bench >= 10) lines.push(`벤치 득점 ${a.bench} 대 ${b.bench}로 밀렸습니다.`);
  return lines;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// 선수 평점 (3.0~10.0, 6.0이 보통). 박스스코어 한 줄을 하나의 숫자로 줄인 것으로,
// 득점뿐 아니라 슛 효율·리바운드·어시스트·수비·실책을 함께 본다.
export function playerRating(p: BoxPlayer): number {
  const score = p.pts + 0.4 * p.fgm - 0.7 * p.fga - 0.4 * (p.fta - p.ftm)
    + 0.7 * p.orb + 0.3 * p.drb + p.stl + 0.7 * p.ast + 0.7 * p.blk - 0.4 * p.pf - p.tov;
  return Math.round(clamp(5.2 + score * 0.17, 3, 10) * 10) / 10;
}

const periodName = (n: number) => (n <= 4 ? `${n}쿼터` : `연장${n > 5 ? n - 4 : ''}`);

// 승부처 요약: 중계 기록의 점수 흐름에서 가장 큰 연속 득점, 최다 점수 차, 역전 횟수를 뽑는다. side = 우리 팀 (0 홈, 1 원정)
export function keyMoments(log: LogEvent[], side: number): string[] {
  const pts: { period: number; clock: string; mine: number; opp: number }[] = [];
  for (const e of log) {
    const [h, a] = e.score.split('-').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(a)) continue;
    const mine = side === 0 ? h : a;
    const opp = side === 0 ? a : h;
    const last = pts[pts.length - 1];
    if (last ? last.mine !== mine || last.opp !== opp : mine + opp > 0) pts.push({ period: e.period, clock: e.clock, mine, opp });
  }
  if (pts.length < 2) return [];
  const final = pts[pts.length - 1];
  const won = final.mine > final.opp;
  const lines: string[] = [];

  // 1) 가장 큰 연속 득점 (상대가 한 점도 못 넣는 동안)
  interface Run { ours: boolean; points: number; from: typeof pts[number]; before: [number, number]; after: [number, number] }
  let best: Run | null = null;
  let run: Run | null = null;
  let prev = { mine: 0, opp: 0 };
  for (const p of pts) {
    const ours = p.mine > prev.mine;
    const gained = ours ? p.mine - prev.mine : p.opp - prev.opp;
    if (run && run.ours === ours) { run.points += gained; run.after = [p.mine, p.opp]; }
    else run = { ours, points: gained, from: p, before: [prev.mine, prev.opp], after: [p.mine, p.opp] };
    if (!best || run.points > best.points || (run.points === best.points && run.ours === won && best.ours !== won)) best = { ...run };
    prev = p;
  }
  if (best && best.points >= 8) {
    lines.push(`${periodName(best.from.period)} ${best.from.clock}부터 ${best.ours ? '우리가' : '상대가'} ${best.points}점을 연속으로 넣었습니다 (${best.before[0]}-${best.before[1]} → ${best.after[0]}-${best.after[1]}).`);
  }

  // 2) 리드가 바뀐 흐름
  let changes = 0;
  let leader = 0; // 1 우리, -1 상대
  let lastChange: typeof pts[number] | null = null;
  let maxLead = { diff: 0, at: pts[0] };
  let maxDeficit = { diff: 0, at: pts[0] };
  for (const p of pts) {
    const diff = p.mine - p.opp;
    if (diff > maxLead.diff) maxLead = { diff, at: p };
    if (-diff > maxDeficit.diff) maxDeficit = { diff: -diff, at: p };
    const now = Math.sign(diff);
    if (now && now !== leader) { if (leader) { changes++; lastChange = p; } leader = now; }
  }
  if (!changes) lines.push(won ? '한 번도 리드를 내주지 않았습니다.' : '경기 내내 끌려갔습니다.');
  else if (lastChange && lastChange.period === 1) lines.push(won ? '1쿼터에 잡은 리드를 끝까지 지켰습니다.' : '1쿼터에 리드를 내준 뒤 되찾지 못했습니다.');
  else if (lastChange) lines.push(`리드가 ${changes}번 바뀌었습니다. 마지막으로 뒤집힌 것은 ${periodName(lastChange.period)} ${lastChange.clock}입니다 (${won ? '우리' : '상대'} 리드, ${lastChange.mine}-${lastChange.opp}).`);

  // 3) 가장 크게 벌어진 순간 (결과와 반대 방향이면 더 눈여겨볼 만하다)
  if (won && maxDeficit.diff >= 8) lines.push(`${periodName(maxDeficit.at.period)}에 ${maxDeficit.diff}점 차까지 뒤졌다가 뒤집었습니다.`);
  else if (!won && maxLead.diff >= 8) lines.push(`${periodName(maxLead.at.period)}에 ${maxLead.diff}점 차까지 앞섰지만 지키지 못했습니다.`);
  else if (won && maxLead.diff >= 10) lines.push(`가장 크게 앞선 것은 ${periodName(maxLead.at.period)}의 ${maxLead.diff}점 차입니다.`);
  else if (!won && maxDeficit.diff >= 10) lines.push(`가장 크게 뒤진 것은 ${periodName(maxDeficit.at.period)}의 ${maxDeficit.diff}점 차입니다.`);
  return lines;
}
