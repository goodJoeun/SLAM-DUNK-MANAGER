// 화면. 게임 로직은 전부 src/ 에 있고, 여기서는 상태를 그리고 입력을 전달하기만 한다.
import { createCareer, today, playDay, prepareUserMatch, leaders } from '../src/season.js';
import { PROGRAMS, INTENSITY, RATING_LABEL, teamOverall } from '../src/school.js';
import { overall } from '../src/engine.js';
import { standings } from '../src/competition.js';

const SAVE_KEY = 'hoops-manager-save-v2';
const NAME_STYLE = { kr: '한국어판 이름', jp: '원작 이름' };
const POS = ['', 'PG', 'SG', 'SF', 'PF', 'C'];
const FOCUS = { balanced: '균형', inside: '골밑 중심', outside: '외곽 중심' };
const DEFENSE = { man: '맨투맨', zone: '존', press: '프레스' };
const PACE = { '-1': '느리게', 0: '보통', 1: '빠르게' };
const TABS = { today: '오늘', squad: '선수단', comp: '대회', records: '기록' };
const STEP_MS = 320; // 경기 자동 진행 속도

const app = document.getElementById('app');

function load() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
}
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S.career)); } catch { /* 저장 공간이 없어도 게임은 계속된다 */ }
}

const S = {
  career: load(),
  tab: 'today',
  startSeed: Math.floor(Math.random() * 90000) + 1,
  preview: null,
  nameStyle: 'kr',
  program: 'shooting',
  intensity: 'normal',
  report: null,
  match: null, // 직접 지휘 중인 경기
  playerId: null,
};

const me = () => S.career.teams[S.career.userTeamId];
const teamName = (id) => S.career.teams[id]?.name ?? '?';
const isMe = (id) => id === S.career.userTeamId;
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const opt = (map, cur) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${String(cur) === k ? 'selected' : ''}>${v}</option>`).join('');
const bar = (pct, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
const condClass = (c) => (c < 50 ? 'low' : c < 75 ? 'mid' : 'green');
const grade = (potential) => (potential >= 75 ? 'S' : potential >= 60 ? 'A' : potential >= 45 ? 'B' : potential >= 30 ? 'C' : 'D');

// ---------- 시작 화면 ----------

function startView() {
  if (!S.preview || S.preview.seed !== S.startSeed || S.preview.nameStyle !== S.nameStyle) S.preview = createCareer({ seed: S.startSeed, dataset: 'original', nameStyle: S.nameStyle });
  const p = S.preview;
  const rows = p.regionIds.map((id, i) => {
    const t = p.teams[id];
    const stars = t.players.filter((x) => x.fixed).sort((a, b) => overall(b) - overall(a)).slice(0, 3).map((x) => x.name).join(', ');
    return `<tr><td><b>${t.name}</b></td><td>${t.prestige}</td><td>${teamOverall(t)}</td>
      <td class="left muted">${stars || '-'}</td>
      <td><button class="btn small" data-act="start" data-index="${i}">이 학교로 시작</button></td></tr>`;
  }).join('');
  return `<div class="start">
    <h1>고교 농구 매니저</h1>
    <p class="muted">${p.prefecture}의 고교 농구부 감독이 되어 3년 동안 팀을 이끕니다. 매일 훈련을 정하고, 경기를 직접 지휘하고, 인터하이·국민체육대회·윈터컵 우승에 도전하세요.</p>
    <div class="card">
      <div class="row between"><h2>학교 선택</h2><button class="btn small" data-act="namestyle">표기: ${NAME_STYLE[S.nameStyle]} (바꾸기)</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>학교</th><th>학교 수준</th><th>팀 전력</th><th class="left">주요 선수</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="muted">학교 수준이 낮을수록 어렵습니다. 수준은 매년 성적에 따라 오르내리고, 신입생의 질을 좌우합니다.</p>
    </div>
  </div>`;
}

// ---------- 공통 ----------

function topbar() {
  const c = S.career;
  const d = today(c);
  const date = c.finished ? '캠페인 종료' : `${d.year}년차 · ${d.day}/${d.of}일 · ${d.phase}`;
  const tabs = Object.entries(TABS).map(([k, v]) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${v}</button>`).join('');
  return `<div class="topbar">
    <span class="school">${me().name}</span><span class="date">${date}</span>
    <span class="spacer"></span>
    <nav class="tabs">${S.match ? '' : tabs}</nav>
    <button class="btn small" data-act="reset">새 게임</button>
  </div>`;
}

function calendarCard() {
  const c = S.career;
  const cells = c.calendar.map((d, i) => `<i class="${d.type} ${i < c.dayIndex ? 'past' : ''} ${i === c.dayIndex ? 'now' : ''}" title="${i + 1}일 · ${d.phase}"></i>`).join('');
  return `<div class="card"><h2>${c.year}년차 일정</h2>
    <div class="calendar">${cells}</div>
    <div class="legend"><span><i></i>훈련</span><span><i style="background:var(--info)"></i>연습 경기</span><span><i style="background:var(--accent)"></i>공식전</span></div>
  </div>`;
}

function matchLine(m) {
  const mine = isMe(m.home) || isMe(m.away);
  return `<li class="${mine ? 'me' : ''}"><span>${teamName(m.home)} vs ${teamName(m.away)}${m.overtime ? ' (연장)' : ''}</span><span class="num">${m.homeScore} - ${m.awayScore}</span></li>`;
}

function boxTable(team) {
  const rows = team.players.filter((p) => p.sec > 0).sort((a, b) => b.pts - a.pts).map((p) => `<tr>
    <td>${p.name}</td><td>${Math.round(p.sec / 60)}</td><td>${p.pts}</td><td>${p.fgm}/${p.fga}</td><td>${p.tpm}/${p.tpa}</td>
    <td>${p.orb + p.drb}</td><td>${p.ast}</td><td>${p.stl}</td><td>${p.blk}</td><td>${p.pf}</td></tr>`).join('');
  return `<div class="table-wrap"><table>
    <thead><tr><th>선수</th><th>분</th><th>득점</th><th>야투</th><th>3점</th><th>리바</th><th>어시</th><th>스틸</th><th>블록</th><th>파울</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function growthList(growth) {
  if (!growth.length) return '';
  const by = {};
  for (const g of growth) (by[g.name] ??= {})[g.label] = g.to;
  const items = Object.entries(by).map(([name, ups]) => `<li><span>${name}</span><span class="good">${Object.entries(ups).map(([l, to]) => `${l} ${to}`).join(' · ')}</span></li>`).join('');
  return `<h3>능력치 상승 ${growth.length}건</h3><ul class="list">${items}</ul>`;
}

// 하루(또는 자동 진행한 여러 날)의 결과
function reportCard() {
  const r = S.report;
  if (!r) return `<div class="card"><h2>진행 기록</h2><p class="muted">하루를 진행하면 훈련 성과와 경기 결과가 여기에 나옵니다.</p></div>`;
  const parts = [];
  if (r.autoDays) parts.push(`<p class="muted">AI 코치가 ${r.autoDays}일 동안 훈련을 맡았습니다.</p>`);
  else if (r.training) parts.push(`<p>훈련: <b>${PROGRAMS[r.training.program].label}</b>${r.training.program === 'rest' ? '' : ` (${INTENSITY[r.training.intensity].label})`}</p>`);
  if (r.userBox) {
    const [a, b] = r.userBox;
    const mine = r.userBox.find((t) => isMe(t.id));
    const won = mine.score > r.userBox.find((t) => !isMe(t.id)).score;
    parts.push(`<div class="notice">${won ? '승리' : '패배'} · ${a.name} ${a.score} - ${b.score} ${b.name}</div>`, boxTable(mine));
  }
  if (r.round) parts.push(`<h3>${r.round.name}</h3><ul class="list">${r.round.matches.map(matchLine).join('')}</ul>`);
  if (r.competitionEnd) {
    const e = r.competitionEnd;
    parts.push(`<div class="notice">${e.name} 종료 · 우승 ${e.champion} · 우리 학교: ${e.userFinish}</div>`);
  }
  for (const inj of r.injuries) parts.push(`<p class="bad">부상: ${inj.name} (${inj.days}일 결장)</p>`);
  parts.push(growthList(r.growth));
  if (r.yearEnd && !r.yearEnd.final) {
    const y = r.yearEnd;
    parts.push(`<h3>${y.year}년차 종료 — 새 학년</h3>
      <p>졸업: ${y.graduates.map((p) => `${p.name}(${overall(p)})`).join(', ')}</p>
      <p>신입생: ${y.recruits.map((p) => `${p.name} ${POS[p.pos]}(${overall(p)}, 성장 ${grade(p.potential)})`).join(', ')}</p>`);
  }
  return `<div class="card stack"><h2>${r.year}년차 ${r.day}일 결과</h2>${parts.join('')}</div>`;
}

// ---------- 오늘 ----------

function todayView() {
  const c = S.career;
  if (c.finished) return endView();
  const d = today(c);
  const team = me();
  const fit = team.players.filter((p) => !p.injuredDays);
  const cond = Math.round(mean(fit.map((p) => p.condition)));
  let main;
  if (d.userMatch) {
    const m = d.userMatch;
    const mine = teamOverall(team);
    main = `<div class="card stack">
      <div class="row between"><h2>경기일 — ${m.label}</h2><span class="pill ${m.official ? 'accent' : ''}">${m.official ? '공식전' : '연습 경기'}</span></div>
      <div class="scoreboard">
        <div><div class="team">${team.name}</div><div class="muted">팀 전력 ${mine} · 컨디션 ${cond}</div></div>
        <div class="muted">vs</div>
        <div><div class="team">${m.opponent}</div><div class="muted">팀 전력 ${m.opponentOverall}</div></div>
      </div>
      <div class="row">
        <button class="btn primary" data-act="command">직접 지휘하기</button>
        <button class="btn" data-act="simulate">결과만 보기</button>
      </div>
      <p class="muted">직접 지휘하면 교체·작전 타임·전술 변경을 경기 중에 할 수 있습니다.</p>
    </div>`;
  } else {
    const next = d.daysToNextMatch == null ? '올해 남은 경기 없음' : `다음 경기까지 ${d.daysToNextMatch}일`;
    const programs = Object.entries(PROGRAMS).map(([k, p]) => `<button class="choice ${S.program === k ? 'on' : ''}" data-act="program" data-key="${k}">
      <b>${p.label}</b><span>${p.keys.length ? p.keys.map((x) => RATING_LABEL[x]).join(' · ') : '컨디션 회복'}</span></button>`).join('');
    const intensities = Object.entries(INTENSITY).map(([k, i]) => `<button class="choice ${S.intensity === k ? 'on' : ''}" data-act="intensity" data-key="${k}">
      <b>${i.label}</b><span>성장 ×${i.gain} · 컨디션 -${i.cost}</span></button>`).join('');
    main = `<div class="card stack">
      <div class="row between"><h2>훈련일</h2><span class="row">${d.camp ? '<span class="pill accent">합숙 · 성장 ×1.4</span>' : ''}<span class="pill">${next}</span></span></div>
      ${d.type === 'official' ? '<p class="muted">오늘은 다른 학교들의 대회 경기가 열립니다. 우리 팀은 훈련합니다.</p>' : ''}
      <div class="row"><span>팀 컨디션 <b>${cond}</b></span><div style="flex:1">${bar(cond, condClass(cond))}</div>
        ${team.players.some((p) => p.injuredDays) ? `<span class="pill bad">부상 ${team.players.filter((p) => p.injuredDays).length}명</span>` : ''}</div>
      <h3>훈련 메뉴</h3><div class="choices">${programs}</div>
      ${S.program === 'rest' ? '' : `<h3>강도</h3><div class="choices">${intensities}</div>`}
      <div class="row">
        <button class="btn primary" data-act="train">하루 진행</button>
        <button class="btn" data-act="auto">다음 경기일까지 AI 코치에게 맡기기</button>
      </div>
    </div>`;
  }
  return `<main><div class="grid2"><div class="stack">${main}${calendarCard()}</div>${reportCard()}</div></main>`;
}

function endView() {
  const c = S.career;
  const rows = c.results.map((r) => `<tr><td>${r.year}년차</td><td class="left">${r.name}</td><td class="left">${r.userFinish}</td><td class="left">${r.champion}</td></tr>`).join('');
  return `<main><div class="card stack">
    <h2>3년의 기록 — ${me().name}</h2>
    <div class="table-wrap"><table><thead><tr><th>연도</th><th class="left">대회</th><th class="left">우리 학교</th><th class="left">전국 우승</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="row"><button class="btn primary" data-act="reset">새 게임 시작</button></div>
  </div>${reportCard()}</main>`;
}

// ---------- 선수단 ----------

function squadView() {
  const team = me();
  const rows = team.players.map((p, i) => {
    const status = p.injuredDays ? `<span class="pill bad">부상 ${p.injuredDays}일</span>` : i < 5 ? '<span class="pill accent">주전</span>' : '<span class="pill">벤치</span>';
    return `<tr class="clickable ${i === 5 ? 'sep' : ''}" data-act="player" data-id="${p.id}">
      <td>${p.name}</td><td>${p.year}학년</td><td>${POS[p.pos]}</td><td><b>${overall(p)}</b></td><td>${grade(p.potential)}</td>
      <td><div class="row" style="justify-content:flex-end"><span>${Math.round(p.condition)}</span>${bar(p.condition, condClass(p.condition))}</div></td>
      <td>${status}</td><td class="left">${p.focus ? PROGRAMS[p.focus].label : '-'}</td></tr>`;
  }).join('');
  const t = team.tactics;
  const p = team.players.find((x) => x.id === S.playerId);
  const detail = p ? `<div class="card stack">
      <div class="row between"><h2>${p.name} · ${p.year}학년 ${POS[p.pos]} · 종합 ${overall(p)}</h2><button class="btn small" data-act="player" data-id="">닫기</button></div>
      <div class="ratings">${Object.entries(p.ratings).map(([k, v]) => `<div class="rating"><span>${RATING_LABEL[k]}</span><b class="num">${v}</b>${bar(v)}</div>`).join('')}</div>
      <label class="row">개인 훈련 <select data-change="pfocus" data-id="${p.id}" style="width:auto">
        <option value="">없음</option>${opt(Object.fromEntries(Object.entries(PROGRAMS).filter(([k]) => k !== 'rest').map(([k, v]) => [k, v.label])), p.focus ?? '')}</select>
        <span class="muted">팀 훈련 때마다 이 메뉴의 능력치가 추가로 오릅니다.</span></label>
    </div>` : '';
  return `<main>
    <div class="card stack"><h2>기본 전술</h2>
      <div class="controls">
        <label>공격 중심<select data-change="tactic" data-key="focus">${opt(FOCUS, t.focus)}</select></label>
        <label>수비<select data-change="tactic" data-key="defense">${opt(DEFENSE, t.defense)}</select></label>
        <label>템포<select data-change="tactic" data-key="pace">${opt(PACE, Math.round(t.pace ?? 0))}</select></label>
      </div>
      <p class="muted">경기 시작 때 적용되고, 직접 지휘하는 경기에서는 도중에 바꿀 수 있습니다. 주전은 능력과 포지션에 따라 매일 자동으로 정해집니다.</p>
    </div>
    ${detail}
    <div class="card"><h2>선수단 · 팀 전력 ${teamOverall(team)}</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>선수</th><th>학년</th><th>포지션</th><th>종합</th><th>성장</th><th>컨디션</th><th>상태</th><th class="left">개인 훈련</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="muted">선수를 누르면 세부 능력치를 보고 개인 훈련을 정할 수 있습니다. 성장 등급(S~D)이 높을수록 빨리 큽니다.</p>
    </div></main>`;
}

// ---------- 대회 ----------

function standingsTable(title, ids, matches) {
  const rows = standings(ids, matches).map((r, i) => `<tr class="${isMe(r.id) ? 'me' : ''}"><td>${i + 1}. ${teamName(r.id)}</td><td>${r.w}</td><td>${r.l}</td><td>${r.pf - r.pa > 0 ? '+' : ''}${r.pf - r.pa}</td></tr>`).join('');
  return `<div><h3>${title}</h3><table><thead><tr><th>학교</th><th>승</th><th>패</th><th>득실</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function compView() {
  const c = S.career.comp;
  if (!c) return `<main>${calendarCard()}<div class="card"><h2>대회</h2><p class="muted">아직 올해 대회가 시작되지 않았습니다. 봄 훈련이 끝나면 인터하이 현 예선이 열립니다.</p></div></main>`;
  const stage = { group: '현 예선 조별 리그', finalLeague: '현 예선 결승 리그', playoff: '현 예선 플레이오프', knockout: '현 예선 토너먼트', national: '전국 대회', done: '종료' }[c.stage];
  const mine = c.finish[S.career.userTeamId];
  const groups = c.groups ? `<div class="choices" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">${c.groups.map((g) => standingsTable(g.name, g.ids, g.matches)).join('')}</div>` : '';
  const league = c.league ? standingsTable('결승 리그', c.league.ids, c.league.matches) : '';
  const rounds = [...c.rounds].reverse().map((r) => `<div><h3>${r.name}</h3><ul class="list">${r.matches.map(matchLine).join('')}</ul></div>`).join('');
  return `<main>
    <div class="card stack">
      <div class="row between"><h2>${c.name}</h2><span class="pill accent">${stage}</span></div>
      ${mine ? `<div class="notice">우리 학교: ${mine}</div>` : ''}
      ${league}${groups}
    </div>
    <div class="card stack"><h2>경기 결과</h2>${rounds || '<p class="muted">아직 치른 경기가 없습니다.</p>'}</div>
  </main>`;
}

// ---------- 기록 ----------

function recordsView() {
  const c = S.career;
  const rows = c.results.map((r) => `<tr><td>${r.year}년차</td><td class="left">${r.name}</td><td class="left">${r.userFinish}</td><td class="left">${r.prefChampion}</td><td class="left">${r.champion}</td></tr>`).join('');
  const board = (title, key) => `<div><h3>${title}</h3><ul class="list">${leaders(c, key).map((s) => `<li class="${isMe(s.teamId) ? 'me' : ''}"><span>${s.name} <span class="muted">${s.team}</span></span><span class="num">${s.avg.toFixed(1)}</span></li>`).join('') || '<li class="muted">기록 없음</li>'}</ul></div>`;
  return `<main>
    <div class="card"><h2>대회 기록</h2>
      ${rows ? `<div class="table-wrap"><table><thead><tr><th>연도</th><th class="left">대회</th><th class="left">우리 학교</th><th class="left">현 예선 1위</th><th class="left">전국 우승</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">아직 끝난 대회가 없습니다.</p>'}
    </div>
    <div class="card"><h2>${c.year}년차 현 내 선수 순위 (공식전 경기당)</h2>
      <div class="choices" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">${board('득점', 'pts')}${board('리바운드', 'reb')}${board('어시스트', 'ast')}</div>
    </div></main>`;
}

// ---------- 경기 지휘 ----------

function matchView() {
  const m = S.match;
  const v = m.game.view();
  const mine = v.teams[m.side];
  const opp = v.teams[1 - m.side];
  const clock = `${Math.floor(v.clock / 60)}:${String(v.clock % 60).padStart(2, '0')}`;
  const side = (t, isMine) => `<div class="${isMine ? 'mine' : ''}"><div class="team">${t.name}</div><div class="score">${t.score}</div>
    <div class="muted">팀 파울 ${t.teamFouls} · 타임 ${t.timeoutsLeft}${t.run >= 4 ? ` · <b class="${isMine ? 'good' : 'bad'}">연속 ${t.run}점</b>` : ''}</div></div>`;
  const row = (p, where) => `<div class="player-row ${m.selected === p.id ? 'sel' : ''} ${p.out ? 'off' : ''}" data-act="pick" data-where="${where}" data-id="${p.id}">
    <span class="muted">${POS[p.pos]}</span><span>${p.name} <span class="muted">${p.ovr}</span></span>
    ${bar(p.energy, condClass(p.energy))}<span class="num">${p.pts}점</span><span class="num ${p.pf >= 4 ? 'bad' : 'muted'}">${p.pf}F</span></div>`;
  const feed = m.feed.slice(0, 80).map((e) => `<div class="${e.team === mine.name ? 'mine' : ''}"><span class="t">${e.period > 4 ? '연장' : `${e.period}Q`} ${e.clock}</span><span class="t">${e.score}</span><span>${e.text}</span></div>`).join('');
  const everyone = Object.fromEntries([['', '없음'], ...[...mine.court, ...mine.bench].map((p) => [p.id, p.name])]);
  const rivals = Object.fromEntries([['', '없음'], ...[...opp.court, ...opp.bench].map((p) => [p.id, `${p.name} (${p.pts}점)`])]);
  const t = mine.tactics;
  const buttons = v.finished
    ? `<button class="btn primary" data-act="finish">경기 종료 — 결과 반영</button>`
    : `<button class="btn" data-act="step" ${m.timer ? 'disabled' : ''}>공격권 하나</button>
       <button class="btn primary" data-act="run">${m.timer ? '일시정지' : '쿼터 끝까지 진행'}</button>
       <button class="btn" data-act="timeout" ${mine.timeoutsLeft ? '' : 'disabled'}>작전 타임 (${mine.timeoutsLeft})</button>
       <button class="btn" data-act="autosub">교체: ${mine.auto ? 'AI 코치' : '직접'}</button>
       <button class="btn" data-act="skip">끝까지 AI에게 맡기기</button>`;
  return `<main>
    <div class="card stack">
      <div class="row between"><h2>${m.label}</h2><span class="pill accent">${v.finished ? '경기 종료' : v.period > 4 ? '연장' : `${v.period}쿼터`}</span></div>
      <div class="scoreboard">${side(v.teams[0], m.side === 0)}<div class="clock">${clock}</div>${side(v.teams[1], m.side === 1)}</div>
      <div class="row">${buttons}</div>
    </div>
    <div class="grid2">
      <div class="stack">
        <div class="card"><h2>중계</h2><div class="feed">${feed || '<p class="muted">경기를 진행하면 중계가 나옵니다.</p>'}</div></div>
        <div class="card stack"><h2>전술</h2><div class="controls">
          <label>공격 중심<select data-change="mtactic" data-key="focus">${opt(FOCUS, t.focus)}</select></label>
          <label>수비<select data-change="mtactic" data-key="defense">${opt(DEFENSE, t.defense)}</select></label>
          <label>템포<select data-change="mtactic" data-key="pace">${opt(PACE, Math.round(t.pace ?? 0))}</select></label>
          <label>에이스 지정<select data-change="mtactic" data-key="keyPlayerId">${opt(everyone, t.keyPlayerId ?? '')}</select></label>
          <label>집중 마크<select data-change="mtactic" data-key="denyPlayerId">${opt(rivals, t.denyPlayerId ?? '')}</select></label>
        </div></div>
      </div>
      <div class="stack">
        <div class="card"><h2>코트</h2>${mine.court.map((p) => row(p, 'court')).join('')}
          <h2 style="margin-top:12px">벤치</h2>${mine.bench.map((p) => row(p, 'bench')).join('')}
          <p class="muted">코트의 선수를 고른 뒤 벤치 선수를 누르면 교체됩니다. 막대는 체력입니다.</p></div>
        <div class="card"><h2>${opp.name} 코트</h2>${opp.court.map((p) => `<div class="player-row" style="cursor:default"><span class="muted">${POS[p.pos]}</span><span>${p.name} <span class="muted">${p.ovr}</span></span>${bar(p.energy, condClass(p.energy))}<span class="num">${p.pts}점</span><span class="num muted">${p.pf}F</span></div>`).join('')}</div>
      </div>
    </div></main>`;
}

function stopMatchTimer() {
  if (S.match?.timer) { clearInterval(S.match.timer); S.match.timer = null; }
}

function stepMatch() {
  const m = S.match;
  const s = m.game.step();
  if (!s) { stopMatchTimer(); return; }
  m.feed.unshift(...[...s.events].reverse());
  if (s.periodEnded || s.finished) stopMatchTimer();
}

// ---------- 입력 ----------

const actions = {
  namestyle() { S.nameStyle = S.nameStyle === 'kr' ? 'jp' : 'kr'; },
  start(el) { S.career = createCareer({ seed: S.startSeed, userTeamIndex: Number(el.dataset.index), dataset: 'original', nameStyle: S.nameStyle }); S.tab = 'today'; S.report = null; save(); },
  reset() {
    if (!confirm('지금 진행 중인 게임을 지우고 새로 시작할까요?')) return;
    stopMatchTimer();
    localStorage.removeItem(SAVE_KEY);
    Object.assign(S, { career: null, match: null, report: null, playerId: null, startSeed: Math.floor(Math.random() * 90000) + 1 });
  },
  tab(el) { S.tab = el.dataset.tab; },
  program(el) { S.program = el.dataset.key; },
  intensity(el) { S.intensity = el.dataset.key; },
  train() { S.report = playDay(S.career, { program: S.program, intensity: S.intensity }); save(); },
  auto() {
    const growth = [];
    const injuries = [];
    let last = null;
    let days = 0;
    while (!S.career.finished && !today(S.career).userMatch) {
      last = playDay(S.career);
      days++;
      growth.push(...last.growth);
      injuries.push(...last.injuries);
      if (last.yearEnd) break;
    }
    if (last) S.report = { ...last, growth, injuries, autoDays: days, training: null };
    save();
  },
  simulate() { S.report = playDay(S.career); save(); },
  command() { S.match = { ...prepareUserMatch(S.career), feed: [], selected: null, timer: null }; },
  player(el) { S.playerId = el.dataset.id || null; },
  // 경기 중
  step() { stepMatch(); },
  run() {
    if (S.match.timer) { stopMatchTimer(); return; }
    S.match.timer = setInterval(() => { stepMatch(); render(); }, STEP_MS);
  },
  timeout() { if (S.match.game.timeout(S.match.side)) S.match.feed.unshift({ ...S.match.game.result().log.at(-1) }); },
  autosub() { const m = S.match; m.game.setAuto(m.side, !m.game.view().teams[m.side].auto); },
  skip() { const m = S.match; stopMatchTimer(); m.game.setAuto(m.side, true); while (!m.game.finished) stepMatch(); },
  pick(el) {
    const m = S.match;
    const { where, id } = el.dataset;
    if (m.game.finished) return;
    if (where === 'court') { m.selected = m.selected === id ? null : id; return; }
    if (!m.selected) return;
    if (m.game.substitute(m.side, m.selected, id)) m.feed.unshift({ ...m.game.result().log.at(-1) });
    m.selected = null;
  },
  finish() {
    const m = S.match;
    stopMatchTimer();
    S.match = null;
    S.report = playDay(S.career, { match: m });
    S.tab = 'today';
    save();
  },
};

const changes = {
  tactic(el) {
    const { key } = el.dataset;
    me().tactics[key] = key === 'pace' ? Number(el.value) : el.value;
    save();
  },
  mtactic(el) {
    const { key } = el.dataset;
    const value = key === 'pace' ? Number(el.value) : el.value || null;
    S.match.game.setTactics(S.match.side, { [key]: value });
  },
  pfocus(el) {
    me().players.find((p) => p.id === el.dataset.id).focus = el.value || null;
    save();
  },
};

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  actions[el.dataset.act]?.(el);
  render();
});
app.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  changes[el.dataset.change]?.(el);
  render();
});

function render() {
  if (!S.career) { app.innerHTML = startView(); return; }
  const view = S.match ? matchView() : { today: todayView, squad: squadView, comp: compView, records: recordsView }[S.tab]();
  app.innerHTML = topbar() + view;
}

render();
