// 사용법:
//   node scripts/campaign.ts [시드]   -> 3년 캠페인을 자동 진행하며 내 팀 위주로 출력
//   node scripts/campaign.ts check    -> 성장 속도·훈련 방침·경기 개입 검증
import { createCareer, today, playDay, prepareUserMatch, leaders } from '../src/game/season.ts';
import { teamOverall, PROGRAMS } from '../src/game/school.ts';
import { overall } from '../src/game/engine.ts';
import type { DayDecision } from '../src/game/season.ts';
import type { BoxTeam, Career, IntensityKey, Player, ProgramKey } from '../src/game/types.ts';

type Decide = (state: Career) => DayDecision;

const me = (state: Career) => state.teams[state.userTeamId];
const avgRating = (p: Player) => Object.entries(p.ratings).filter(([k]) => k !== 'hgt').reduce((s, [, v]) => s + v, 0) / 14;
const userWon = (state: Career, box: BoxTeam[]) => box.find((t) => t.id === state.userTeamId)!.score > box.find((t) => t.id !== state.userTeamId)!.score;

// 간단한 감독 방침: 지치면 쉬고, 아니면 메뉴를 순서대로 돌린다
function policy(intensity: IntensityKey, restBelow: number): Decide {
  const menu = (Object.keys(PROGRAMS) as ProgramKey[]).filter((k) => k !== 'rest' && k !== 'scout');
  let i = 0;
  return (state) => {
    const fit = me(state).players.filter((p) => !p.injuredDays);
    const cond = fit.reduce((s, p) => s + p.condition, 0) / fit.length;
    if (cond < restBelow) return { program: 'rest' };
    if (today(state)!.daysToNextMatch === 1) return cond < 85 ? { program: 'rest' } : { program: menu[i++ % menu.length], intensity: 'light' }; // 경기 전날은 조절
    return { program: menu[i++ % menu.length], intensity };
  };
}

function runCampaign(seed: number, decide: Decide, verbose: boolean) {
  const state = createCareer({ seed });
  const totals = { days: 0, matches: 0, official: 0, wins: 0, injuries: 0, growth: 0 };
  let phase = '';
  let phaseGrowth: Record<string, number> = {};
  const flush = () => {
    if (!verbose || !Object.keys(phaseGrowth).length) return;
    const top = Object.entries(phaseGrowth).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n} +${c}`).join(', ');
    console.log(`    성장: ${top} · 팀 전력 ${teamOverall(me(state))}`);
    phaseGrowth = {};
  };
  while (!state.finished) {
    const day = today(state)!;
    if (day.day === 1 && verbose) {
      console.log(`\n===== ${day.year}년차 (${day.of}일) · 학교 수준 ${me(state).prestige} · 팀 전력 ${teamOverall(me(state))} =====`);
      console.log(`  주전: ${me(state).players.slice(0, 5).map((p) => `${p.name}(${p.year}학년 ${overall(p)})`).join(', ')}`);
    }
    if (day.phase !== phase) {
      flush();
      phase = day.phase;
      if (verbose) console.log(`  [${phase}]`);
    }
    const report = playDay(state, day.userTrains ? decide(state) : {})!;
    totals.days++;
    totals.growth += report.growth.length;
    totals.injuries += report.injuries.length;
    for (const g of report.growth) phaseGrowth[g.name] = (phaseGrowth[g.name] ?? 0) + 1;
    if (day.userMatch) {
      const mine = report.userBox!.find((t) => t.id === state.userTeamId)!;
      const theirs = report.userBox!.find((t) => t.id !== state.userTeamId)!;
      totals.matches++;
      if (day.userMatch.official) totals.official++;
      if (mine.score > theirs.score) totals.wins++;
      if (verbose) {
        const top = mine.players.reduce((a, b) => (b.pts > a.pts ? b : a));
        console.log(`    ${String(day.day).padStart(2)}일 ${day.userMatch.label}: ${mine.score > theirs.score ? '승' : '패'} ${mine.score}-${theirs.score} vs ${theirs.name}(전력 ${day.userMatch.opponentOverall}) · ${top.name} ${top.pts}점`);
      }
    }
    if (verbose && report.round?.groups && report.round.name.endsWith('3차전')) {
      const mine = report.round.groups.find((g) => g.table.some((row) => row.id === state.userTeamId))!;
      console.log(`    ${mine.name} 최종: ${mine.table.map((row, i) => `${i + 1}위 ${state.teams[row.id].name} ${row.w}승${row.l}패`).join(' · ')}`);
    }
    if (verbose && report.competitionEnd) {
      const r = report.competitionEnd;
      console.log(`  >> ${r.name} 결과: ${r.userFinish} · 현 예선 1위 ${r.prefChampion} · 전국 우승 ${r.champion}`);
    }
    if (verbose) for (const inj of report.injuries) console.log(`    ${String(day.day).padStart(2)}일 부상: ${inj.name} ${inj.days}일 결장`);
    if (report.yearEnd) {
      flush();
      const y = report.yearEnd;
      if (verbose) {
        if (!y.final) console.log(`  >> 졸업 ${y.graduates.map((p) => `${p.name}(${overall(p)})`).join(', ')} / 신입생 ${y.recruits.map((p) => `${p.name}(${overall(p)}, 잠재력 ${p.potential})`).join(', ')}`);
      }
      phase = '';
    }
  }
  return { state, totals };
}

// 한 해에 내 팀이 치르는 경기 수 (AI 운영, 여러 캠페인의 1년차)
function countGames(campaigns = 60) {
  const rows: { official: number; practice: number; days: number }[] = [];
  const byComp: Record<string, number[]> = {};
  for (let seed = 1; seed <= campaigns; seed++) {
    const state = createCareer({ seed });
    const row = { official: 0, practice: 0, days: 0 };
    while (state.year === 1 && !state.finished) {
      const day = today(state)!;
      if (day.userMatch) {
        if (day.userMatch.official) {
          row.official++;
          const comp = state.comp!.name;
          (byComp[comp] ??= []).length < seed && byComp[comp].push(0);
          byComp[comp][byComp[comp].length - 1]++;
        } else row.practice++;
      }
      row.days++;
      playDay(state);
    }
    rows.push(row);
  }
  const stat = (xs: number[]) => `최소 ${Math.min(...xs)} · 평균 ${(xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1)} · 최대 ${Math.max(...xs)}`;
  console.log(`[경기 수] 한 해 ${rows[0].days}일 기준, ${campaigns}개 캠페인의 1년차`);
  console.log(`  공식전   ${stat(rows.map((r) => r.official))}`);
  console.log(`  연습 경기 ${stat(rows.map((r) => r.practice))}`);
  console.log(`  합계     ${stat(rows.map((r) => r.official + r.practice))}`);
  for (const [name, xs] of Object.entries(byComp)) console.log(`  ${name.padEnd(8)} ${stat(xs)}`);
  const total = rows.map((r) => r.official + r.practice).sort((a, b) => a - b);
  console.log(`  합계 분포: 하위 25% ${total[Math.floor(total.length * 0.25)]}경기 · 중앙값 ${total[Math.floor(total.length / 2)]}경기 · 상위 25% ${total[Math.floor(total.length * 0.75)]}경기
`);
}

function check() {
  countGames();
  // 1) 한 해 동안 능력치가 얼마나 오르는가 (1년차 시작 -> 2년차 시작, 졸업하지 않은 선수)
  console.log('[성장 속도] 능력치 평균(키 제외)의 1년간 변화, 시드 5개 평균');
  const policies: [string, () => Decide][] = [
    ['보통 강도', () => policy('normal', 55)],
    ['강하게, 거의 안 쉼', () => policy('hard', 25)],
    ['가볍게', () => policy('light', 55)],
    ['계속 휴식', () => () => ({ program: 'rest' })],
  ];
  for (const [label, make] of policies) {
    const sum = { starters: 0, bench: 0, n1: 0, n2: 0, inj: 0, cond: 0, wins: 0, matches: 0 };
    for (let seed = 1; seed <= 5; seed++) {
      const decide = make();
      const state = createCareer({ seed });
      const before = Object.fromEntries(me(state).players.map((p, i) => [p.id, { avg: avgRating(p), starter: i < 5 }]));
      let condSum = 0;
      let days = 0;
      while (state.year === 1) {
        const day = today(state)!;
        const r = playDay(state, day.userTrains ? decide(state) : {})!;
        sum.inj += r.injuries.length;
        if (day.userMatch) {
          sum.matches++;
          if (userWon(state, r.userBox!)) sum.wins++;
        }
        if (state.year === 1) {
          condSum += me(state).players.reduce((s, p) => s + p.condition, 0) / 12;
          days++;
        }
      }
      sum.cond += condSum / days;
      for (const p of me(state).players) {
        const b = before[p.id];
        if (!b) continue;
        if (b.starter) { sum.starters += avgRating(p) - b.avg; sum.n1++; } else { sum.bench += avgRating(p) - b.avg; sum.n2++; }
      }
    }
    console.log(`  ${label.padEnd(12)} 주전 +${(sum.starters / sum.n1).toFixed(1)} · 벤치 +${(sum.bench / sum.n2).toFixed(1)} · 평균 컨디션 ${(sum.cond / 5).toFixed(0)} · 부상 ${(sum.inj / 5).toFixed(1)}건/년 · ${sum.wins}승/${sum.matches}경기`);
  }

  // 2) 집중 훈련: 한 메뉴만 반복하면 그 능력치가 얼마나 오르는가
  {
    const state = createCareer({ seed: 2 });
    const p = me(state).players.find((x) => x.year === 1)!;
    const before = { ...p.ratings };
    let n = 0;
    while (state.year === 1) {
      const decision: DayDecision = n++ % 4 === 3 ? { program: 'rest' } : { program: 'shooting', intensity: 'normal' };
      playDay(state, today(state)!.userTrains ? decision : {});
    }
    console.log(`\n[집중 훈련] 1년 내내 슈팅만 (1학년 ${p.name}): 3점슛 ${before.tp}→${p.ratings.tp}, 미들슛 ${before.mid}→${p.ratings.mid}, 드리블 ${before.drb}→${p.ratings.drb}, 힘 ${before.str}→${p.ratings.str}`);
  }

  // 3) 3년 뒤 지역 전체 전력
  {
    const first = createCareer({ seed: 4 });
    const start = first.regionIds.map((id) => teamOverall(first.teams[id]));
    const { state, totals } = runCampaign(4, policy('normal', 55), false);
    const end = state.regionIds.map((id) => teamOverall(state.teams[id]));
    const mean = (xs: number[]) => (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1);
    console.log(`\n[3년 뒤] 지역 평균 전력: 시작 ${mean(start)} → 3년차 말 ${mean(end)} (최강 ${Math.max(...end)}, 최약 ${Math.min(...end)}) · 내 팀 ${teamOverall(me(state))} · 총 ${totals.days}일 ${totals.matches}경기`);
  }

  // 4) 경기 개입: 쿼터 사이에 멈춰서 교체·작전 타임·전술 변경
  {
    const state = createCareer({ seed: 6 });
    while (!today(state)!.userMatch) playDay(state);
    const match = prepareUserMatch(state)!;
    const { game, side } = match;
    console.log(`\n[경기 개입] ${match.label}`);
    game.playPeriod();
    const v = game.view();
    const my = v.teams[side];
    const opp = v.teams[1 - side];
    console.log(`  1쿼터 종료 ${v.teams[0].score}-${v.teams[1].score} · 코트: ${my.court.map((p) => `${p.name}(체력 ${p.energy})`).join(', ')}`);
    const tired = my.court.reduce((a, b) => (b.energy < a.energy ? b : a));
    const fresh = my.bench.filter((p) => !p.out).reduce((a, b) => (b.ovr > a.ovr ? b : a));
    console.log(`  교체 ${tired.name} → ${fresh.name}: ${game.substitute(side, tired.id, fresh.id) ? '성공' : '실패'}`);
    game.setTactics(side, { defense: 'zone', keyPlayerId: my.court[1].id, denyPlayerId: opp.court[0].id });
    console.log(`  전술 변경: 존 디펜스, 에이스 ${my.court[1].name}, 집중 마크 ${opp.court[0].name}`);
    game.step();
    game.step();
    console.log(`  작전 타임: ${game.timeout(side) ? '성공' : '실패'} (남은 횟수 ${game.view().teams[side].timeoutsLeft})`);
    game.setAuto(side, true); // 나머지는 AI에게 맡긴다
    const report = playDay(state, { match })!;
    const box = report.userBox!;
    const grew = report.growth.map((g) => `${g.name} ${g.label} ${g.to}`).slice(0, 4).join(', ') || '없음';
    console.log(`  최종 ${box[0].name} ${box[0].score} - ${box[1].score} ${box[1].name} · 경기 후 성장: ${grew}`);
  }
}

if (process.argv[2] === 'check') {
  check();
} else {
  const { state, totals } = runCampaign(Number(process.argv[2] ?? 1), policy('normal', 55), true);
  console.log(`\n캠페인 종료: ${totals.days}일 · ${totals.matches}경기(공식전 ${totals.official}) ${totals.wins}승 · 능력치 상승 ${totals.growth}회 · 부상 ${totals.injuries}건`);
  for (let y = 1; y <= 3; y++) console.log(`${y}년차:`, state.results.filter((r) => r.year === y).map((r) => r.userFinish).join(' / '));
  console.log('마지막 해 지역 득점 순위:', leaders(state, 'pts', 3).map((s) => `${s.name}(${s.team}) ${s.avg.toFixed(1)}`).join(', '));
}
