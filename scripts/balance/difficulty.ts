// 학교별 체감 난이도: 각 학교를 맡아 3년 임기를 감독 수준별로 자동 진행하고 성적을 잰다 (원작 데이터).
//   node scripts/balance/difficulty.ts run [현 이름=기본 현] [시드 수=3] [학교 순번 시작=0] [끝=15]   -> 캠페인마다 JSON 한 줄
//   node scripts/balance/difficulty.ts report 결과파일...                                          -> 학교별 표
// 감독 수준
//   idle    아무것도 하지 않는다: 훈련은 AI 코치, 전술은 부임 때 그대로, 상대 분석·영입 없음
//   casual  훈련을 직접 짜고(지치면 휴식), 공식전마다 코치 조언(분석 없이)대로 전술을 바꾸고, 유망주 2명을 고른다
//   skilled casual + 공식전 전 훈련일을 상대 분석에 쓰고, 분석을 반영한 조언대로 전술을 정한다
// 경기는 모두 자동 진행이다 (직접 지휘하는 교체·작전 타임·경기 중 전술 변경은 재지 않는다).
import { readFileSync } from 'node:fs';
import { createCareer, playDay, playablePrefectures, prospectsOf, recruitChance, seasonGoal, today, toggleRecruitTarget } from '../../src/game/career/season.ts';
import { adviseTactics } from '../../src/game/coach/advice.ts';
import { overall } from '../../src/game/match/engine.ts';
import { PROGRAMS, setLineup, teamOverall } from '../../src/game/team/school.ts';
import type { DayDecision } from '../../src/game/career/season.ts';
import type { Career, ProgramKey } from '../../src/game/types.ts';

type Level = 'idle' | 'casual' | 'skilled';
const LEVELS: Level[] = ['idle', 'casual', 'skilled'];
interface YearRow { goal: number; times: number; grade: number; best: string; trust: number; ovr: number; prestige: number; w: number; l: number; ow: number; ol: number; national: number; titles: number; finishes: string[] }
interface Row { pref: string; team: string; index: number; rank: number; ovr0: number; level: Level; seed: number; years: YearRow[] }

const me = (s: Career) => s.teams[s.userTeamId];

function campaign(pref: string, index: number, seed: number, level: Level): Row {
  const s = createCareer({ seed, dataset: 'original', prefecture: pref, userTeamIndex: index });
  const rank = [...s.regionIds].sort((a, b) => teamOverall(s.teams[b]) - teamOverall(s.teams[a])).indexOf(s.userTeamId) + 1;
  const row: Row = { pref, team: me(s).name, index, rank, ovr0: teamOverall(me(s)), level, seed, years: [] };
  const menu = (Object.keys(PROGRAMS) as ProgramKey[]).filter((k) => k !== 'rest' && k !== 'scout');
  let turn = 0;
  let cur: YearRow | null = null;
  while (!s.finished) {
    const day = today(s)!;
    if (!cur) {
      cur = { goal: seasonGoal(s).tier, times: seasonGoal(s).times, grade: 0, best: '', trust: 0, ovr: teamOverall(me(s)), prestige: me(s).prestige, w: 0, l: 0, ow: 0, ol: 0, national: 0, titles: 0, finishes: [] };
      if (level !== 'idle') {
        // 올 가능성과 실력을 함께 보고 유망주 2명을 고른다
        const picks = [...prospectsOf(s)].sort((a, b) => recruitChance(s, b) * overall(b.player) - recruitChance(s, a) * overall(a.player)).slice(0, 2);
        for (const p of picks) toggleRecruitTarget(s, p.player.id);
      }
    }
    let decision: DayDecision = { events: false };
    if (level !== 'idle') {
      setLineup(me(s));
      if (day.userTrains) {
        const fit = me(s).players.filter((p) => !p.injuredDays);
        const cond = fit.reduce((sum, p) => sum + p.condition, 0) / fit.length;
        if (level === 'skilled' && day.prep?.canScout) decision = { events: false, program: 'scout' };
        else if (cond < 55) decision = { events: false, program: 'rest' };
        else if (day.daysToNextMatch === 1) decision = cond < 85 ? { events: false, program: 'rest' } : { events: false, program: menu[turn++ % menu.length], intensity: 'light' };
        else decision = { events: false, program: menu[turn++ % menu.length], intensity: 'normal' };
      } else if (day.userMatch?.official) {
        const opp = s.teams[day.userMatch.opponentId];
        const days = s.prep?.[opp.id] ?? 0;
        const tip = adviseTactics(me(s), opp, level === 'skilled' ? days : 0, seed * 7919 + s.dayIndex * 31 + s.year, level === 'skilled' ? (day.prep?.opponentId === opp.id ? day.prep.bonus : 0) : 0);
        me(s).tactics = { ...me(s).tactics, focus: tip.focus, defense: tip.defense, pace: tip.pace };
      }
    }
    const r = playDay(s, decision)!;
    if (day.userMatch && r.userBox) {
      const mine = r.userBox.find((t) => t.id === s.userTeamId)!;
      const theirs = r.userBox.find((t) => t.id !== s.userTeamId)!;
      const won = mine.score > theirs.score;
      if (won) cur.w++; else cur.l++;
      if (day.userMatch.official) { if (won) cur.ow++; else cur.ol++; }
    }
    if (r.competitionEnd) {
      const f = r.competitionEnd.userFinish ?? '';
      cur.finishes.push(f);
      if (f && !f.includes('현 예선')) cur.national++;
      if (f.endsWith('우승') && !f.includes('현 예선')) cur.titles++;
    }
    if (r.yearEnd) {
      cur.grade = r.yearEnd.review?.grade ?? 0;
      cur.best = r.yearEnd.review?.best ?? '';
      cur.trust = r.yearEnd.review?.trust ?? 0;
      row.years.push(cur);
      cur = null;
    }
  }
  return row;
}

function report(files: string[]) {
  const rows: Row[] = files.flatMap((f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const pct = (x: number) => `${Math.round(100 * x)}%`.padStart(4);
  for (const pref of [...new Set(rows.map((r) => r.pref))]) {
    console.log(`\n=== ${pref} ===  (학교: 전력 순위·시작 전력 / 수준별: 공식전 승률 · 목표 달성률 · 1년차 달성률 · 전국 진출(연 3개 대회 중) · 전국 우승(3년 합) · 3년 뒤 전력 · 최종 신임)`);
    const teams = [...new Set(rows.filter((r) => r.pref === pref).map((r) => r.team))];
    const info = (t: string) => rows.find((r) => r.pref === pref && r.team === t)!;
    for (const t of teams.sort((a, b) => info(a).rank - info(b).rank)) {
      const i = info(t);
      console.log(`${String(i.rank).padStart(2)}위 ${t} (전력 ${i.ovr0}, 목표 ${i.years[0].goal}단계 × ${i.years[0].times}번)`);
      for (const level of LEVELS) {
        const rs = rows.filter((r) => r.pref === pref && r.team === t && r.level === level);
        if (!rs.length) continue;
        const ys = rs.flatMap((r) => r.years);
        const ow = ys.reduce((a, y) => a + y.ow, 0); const ol = ys.reduce((a, y) => a + y.ol, 0);
        console.log(`     ${level.padEnd(7)} 공식전 ${pct(ow / (ow + ol))} · 목표 ${pct(mean(ys.map((y) => (y.grade > 0 ? 1 : 0))))} (초과 ${pct(mean(ys.map((y) => (y.grade === 2 ? 1 : 0))))}, 크게 미달 ${pct(mean(ys.map((y) => (y.grade === -2 ? 1 : 0))))}) · 1년차 ${pct(mean(rs.map((r) => (r.years[0].grade > 0 ? 1 : 0))))} · 전국 진출 연 ${mean(ys.map((y) => y.national)).toFixed(1)}회 · 우승 ${mean(rs.map((r) => r.years.reduce((a, y) => a + y.titles, 0))).toFixed(1)}회 · 3년차 전력 ${mean(rs.map((r) => r.years[2].ovr)).toFixed(0)} · 신임 ${mean(rs.map((r) => r.years[2].trust)).toFixed(0)}`);
      }
    }
  }
}

if (process.argv[2] === 'report') {
  report(process.argv.slice(3));
} else {
  const pref = process.argv[3] && process.argv[3] !== '-' ? process.argv[3] : playablePrefectures('original')[0];
  const seeds = Number(process.argv[4] ?? 3);
  const from = Number(process.argv[5] ?? 0);
  const to = Number(process.argv[6] ?? 15);
  for (let index = from; index <= to; index++) for (let seed = 1; seed <= seeds; seed++) for (const level of LEVELS) console.log(JSON.stringify(campaign(pref, index, seed, level)));
}
