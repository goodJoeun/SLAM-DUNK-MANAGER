// 대회 형식의 기본 부품: 토너먼트 대진, 풀리그 일정, 순위표
import type { Match, Pairing, StandingRow } from './types.ts';

// 시드 배치 순서. 16강이면 [1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11] -> 상위 시드끼리는 늦게 만난다
export function bracketOrder(n: number) {
  let order = [1];
  while (order.length < n) {
    const m = order.length * 2 + 1;
    order = order.flatMap((s) => [s, m - s]);
  }
  return order;
}

// 풀리그 일정 (원형 방식). rounds[라운드] = [[a, b], ...]
export function roundRobin(ids: string[]) {
  const list: (string | null)[] = ids.length % 2 ? [...ids, null] : [...ids];
  const rounds: Pairing[][] = [];
  for (let r = 0; r < list.length - 1; r++) {
    const round: Pairing[] = [];
    for (let i = 0; i < list.length / 2; i++) {
      const a = list[i];
      const b = list[list.length - 1 - i];
      if (a !== null && b !== null) round.push([a, b]);
    }
    rounds.push(round);
    list.splice(1, 0, list.pop() as string | null);
  }
  return rounds;
}

// 순위: 승수 -> 득실차 -> 다득점
export function standings(ids: string[], matches: Match[]) {
  const row: Record<string, StandingRow> = Object.fromEntries(ids.map((id) => [id, { id, w: 0, l: 0, pf: 0, pa: 0 }]));
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

// 16강보다 큰 대진(전국 대회 본선)은 1회전, 2회전으로 부른다
export const roundName = (slots: number) => (slots === 2 ? '결승' : slots === 4 ? '준결승' : slots === 64 ? '1회전' : slots === 32 ? '2회전' : `${slots}강`);

// 대진표의 빈자리. 짝이 BYE인 학교는 경기 없이 다음 라운드로 올라간다 (부전승)
export const BYE = '';
