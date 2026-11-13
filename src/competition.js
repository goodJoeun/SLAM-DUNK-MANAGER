// 대회 형식의 기본 부품: 토너먼트 대진, 풀리그 일정, 순위표

// 시드 배치 순서. 16강이면 [1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11] -> 상위 시드끼리는 늦게 만난다
export function bracketOrder(n) {
  let order = [1];
  while (order.length < n) {
    const m = order.length * 2 + 1;
    order = order.flatMap((s) => [s, m - s]);
  }
  return order;
}

// 풀리그 일정 (원형 방식). rounds[라운드] = [[a, b], ...]
export function roundRobin(ids) {
  const list = ids.length % 2 ? [...ids, null] : [...ids];
  const rounds = [];
  for (let r = 0; r < list.length - 1; r++) {
    const round = [];
    for (let i = 0; i < list.length / 2; i++) {
      const a = list[i];
      const b = list[list.length - 1 - i];
      if (a !== null && b !== null) round.push([a, b]);
    }
    rounds.push(round);
    list.splice(1, 0, list.pop());
  }
  return rounds;
}

// 순위: 승수 -> 득실차 -> 다득점
export function standings(ids, matches) {
  const row = Object.fromEntries(ids.map((id) => [id, { id, w: 0, l: 0, pf: 0, pa: 0 }]));
  for (const m of matches) {
    const h = row[m.home];
    const a = row[m.away];
    h.pf += m.homeScore; h.pa += m.awayScore;
    a.pf += m.awayScore; a.pa += m.homeScore;
    (m.winner === m.home ? h : a).w++;
    (m.winner === m.home ? a : h).l++;
  }
  return Object.values(row).sort((x, y) => y.w - x.w || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf);
}

export const roundName = (teamsLeft) => (teamsLeft === 2 ? '결승' : teamsLeft === 4 ? '준결승' : `${teamsLeft}강`);
