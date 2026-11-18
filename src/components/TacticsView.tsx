import { useEffect, useState } from 'react';
import { composites, denyOutlook, energyPerSecond, overall, startEnergy, tacticLoad } from '@/game/engine';
import { teamOverall } from '@/game/school';
import type { Composites, Defense, Focus, Player } from '@/game/types';
import Court from './Court';
import { today, userMatchDays } from '@/game/season';
import { scoutReport } from '@/game/scouting';
import { adviseTactics, mockWins } from '@/game/advice';
import type { TacticsAdvice } from '@/game/advice';
import { Attr, CondBar, DEFENSE, FOCUS, Icon, PACE, POS, PageTitle, Panel, PosBadge, Select, mean, userTeam } from './ui';
import type { ViewProps } from './ui';

const FOCUS_INFO: Record<Focus, string> = {
  balanced: '슛 종류를 고르게 나눕니다. 상대 수비에 허술한 쪽이 따로 없을 때 무난합니다.',
  inside: '골밑슛과 포스트업 비중을 높이고, 안쪽에 강한 선수에게 공이 갑니다. 상대의 골밑 수비가 외곽 수비보다 허술할 때 잘 통하고, 반대면 손해입니다.',
  outside: '3점슛 비중을 높이고, 슈터에게 공이 갑니다. 상대의 외곽 수비가 골밑 수비보다 허술할 때 잘 통하고, 반대면 손해입니다.',
  spread: '최신 5아웃 스페이싱. 다섯 명이 모두 외곽에 서서 골밑 돌파와 3점만 노리고 중거리는 버립니다. 슈터가 많을수록 돌파 공간이 넓어집니다.',
};
const DEFENSE_INFO: Record<Defense, string> = {
  man: '각자 맡은 선수를 막는 기본 수비입니다.',
  zone: '골밑을 단단히 지키는 대신 외곽슛을 내줍니다. 체력 소모가 조금 적습니다.',
  press: '전방부터 압박해 턴오버를 노립니다. 파울과 체력 소모가 늘고, 뚫리면 쉬운 실점을 합니다.',
  switch: '스크린마다 수비를 바꿔 맡아 오픈 3점을 막습니다. 대신 키 작은 수비수가 빅맨을 막는 미스매치를 상대가 노립니다.',
  drop: '빅맨이 골밑까지 물러나 림을 지킵니다. 골밑 득점은 줄지만 중거리 풀업 점퍼를 내줍니다.',
};
const PACE_INFO: Record<string, string> = {
  '-1': '공격 시간을 길게 씁니다. 실책과 체력 소모가 줄지만 쉬운 득점도 줄어듭니다. 공격권이 적어져 강팀을 상대로 이변을 노리기 좋습니다.',
  0: '보통 속도로 공격합니다.',
  1: '속공으로 쉬운 득점을 노립니다. 실책과 체력 소모가 늘어, 볼 핸들링과 체력·벤치가 좋은 팀에 맞습니다. 공격권이 많아져 전력이 앞설 때 유리합니다.',
};

// 카드에는 한 줄 요약만 적고, 자세한 설명(위의 *_INFO)은 고른 선택지 아래에 한 번만 보여 준다
const FOCUS_SHORT: Record<Focus, string> = {
  balanced: '슛을 고르게 나눔',
  inside: '골밑슛·포스트업 위주',
  outside: '3점슛 위주',
  spread: '돌파와 3점만, 중거리는 버림',
};
const DEFENSE_SHORT: Record<Defense, string> = {
  man: '각자 맡은 선수를 막음',
  zone: '골밑을 지키고 외곽을 내줌',
  press: '전방 압박으로 턴오버 유도',
  switch: '오픈 3점을 막고 미스매치를 내줌',
  drop: '림을 지키고 중거리를 내줌',
};
const PACE_SHORT: Record<string, string> = {
  '-1': '공격권을 줄여 이변을 노림',
  0: '보통 속도',
  1: '속공으로 쉬운 득점을 노림',
};

// 선발 다섯 명의 득점 성향 (+면 안쪽, -면 외곽)
function scoringLean(cs: Composites[]) {
  const avg = (f: (c: Composites) => number) => mean(cs.map(f));
  return avg((c) => Math.max(c.rim, c.post)) - avg((c) => Math.max(c.mid, c.three));
}

// 배율을 "+25%"처럼 적는다. 1에 가까우면 빈 문자열.
const pctDelta = (x: number) => (Math.abs(x - 1) < 0.005 ? '' : `${x > 1 ? '+' : '−'}${Math.round(Math.abs(x - 1) * 100)}%`);

// 선택지 카드에 붙는 부담 표시: 체력 소모와 파울이 기본(맨투맨·보통 템포)보다 얼마나 늘고 주는지
type Tag = { text: string; tone: 'bad' | 'good' };
function loadTags(defense: Defense, pace: number): Tag[] {
  const load = tacticLoad(defense, pace);
  const tags: Tag[] = [];
  const add = (label: string, x: number) => { if (pctDelta(x)) tags.push({ text: `${label} ${pctDelta(x)}`, tone: x > 1 ? 'bad' : 'good' }); };
  add('체력 소모', load.drain);
  add('파울', load.foul);
  add('슈팅 파울', load.shootingFoul);
  return tags;
}
const DEFENSE_TAGS = Object.fromEntries((['man', 'zone', 'press', 'switch', 'drop'] as Defense[]).map((d) => [d, loadTags(d, 0)])) as Record<Defense, Tag[]>;
const PACE_TAGS: Record<string, Tag[]> = { '-1': loadTags('man', -1), 0: [], 1: loadTags('man', 1) };

function Choice<K extends string>({ options, short, info, tags, value, onChange }: {
  options: Record<K, string> | [K, string][];
  short: Record<K, string>; // 카드에 적는 한 줄
  info: Record<K, string>; // 고른 선택지 아래에 적는 자세한 설명
  tags?: Record<K, Tag[]>;
  value: string;
  onChange: (v: K) => void;
}) {
  const list = Array.isArray(options) ? options : (Object.entries(options) as [K, string][]);
  const chosen = list.find(([k]) => k === value);
  return (
    <>
      <div className="opts">
        {list.map(([k, label]) => (
          <button key={k} className={`opt ${value === k ? 'on' : ''}`} aria-pressed={value === k} title={info[k]} onClick={() => onChange(k)}>
            <b>{label}</b><span>{short[k]}</span>
            {tags?.[k]?.length ? <span className="opt-tags">{tags[k].map((tag) => <i key={tag.text} className={`pill ${tag.tone}`}>{tag.text}</i>)}</span> : null}
          </button>
        ))}
      </div>
      {chosen && <p className="opt-detail"><b>{chosen[1]}</b> {info[chosen[0]]}</p>}
    </>
  );
}

export default function TacticsView({ S, act }: ViewProps) {
  const prep = today(S.career)?.prep; // 다음 공식전 상대 분석으로 세운 코치의 계획
  const oppTeam = prep && prep.days > 0 ? S.career.teams[prep.opponentId] : undefined;
  const oppTactics = oppTeam ? scoutReport(oppTeam, prep!.days).tactics : '';
  const team = userTeam(S.career);
  const t = team.tactics;
  const starters = team.players.slice(0, 5);
  const bench = team.players.slice(5);
  const lean = scoringLean(starters.map(composites));
  // 코치 조언: 다음 상대(정해지지 않았으면 현 내 중간 수준의 학교)와 모의 경기를 돌려 본 결과.
  // 수백 경기를 돌리므로 화면을 먼저 그린 뒤 계산한다. 같은 날·같은 선발·같은 상대면 다시 계산하지 않는다.
  const day = today(S.career);
  const rivals = S.career.regionIds.filter((id) => id !== team.id).map((id) => S.career.teams[id]).sort((a, b) => a.prestige - b.prestige);
  const nextId = day?.userMatch?.opponentId ?? prep?.opponentId;
  const sparring = (nextId ? S.career.teams[nextId] : undefined) ?? rivals[Math.floor(rivals.length / 2)];
  const scoutDays = prep && prep.opponentId === sparring.id ? prep.days : 0;
  const adviceKey = `${S.career.year}-${S.career.dayIndex}-${sparring.id}-${scoutDays}-${starters.map((p) => p.id).join(',')}-${t.keyPlayerId ?? ''}-${t.denyPlayerId ?? ''}-${t.denyDefenderId ?? ''}`;
  const [advice, setAdvice] = useState<{ key: string; tip: TacticsAdvice } | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setAdvice({ key: adviceKey, tip: adviseTactics(team, sparring, scoutDays, S.career.seed + S.career.dayIndex * 1000, prep?.bonus ?? 0) }), 30);
    return () => clearTimeout(timer);
    // adviceKey가 팀·상대·분석 일수를 모두 담고 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adviceKey]);
  const tip = advice?.key === adviceKey ? advice.tip : null;
  const focus = t.focus ?? 'balanced';
  const defense = t.defense ?? 'man';
  const pace = String(Math.round(t.pace ?? 0));
  // 지금 고른 전술로도 같은 모의 경기를 돌려, 조언과 얼마나 차이 나는지 보여 준다 (조언을 따를지 판단할 근거)
  const follows = !!tip && focus === tip.focus && defense === tip.defense && pace === String(tip.pace);
  const mineKey = `${adviceKey}|${focus}-${defense}-${pace}`;
  const [mineWins, setMineWins] = useState<{ key: string; wins: number } | null>(null);
  useEffect(() => {
    if (!tip || follows) return;
    const timer = setTimeout(() => setMineWins({ key: mineKey, wins: mockWins(team, sparring, { focus, defense, pace: Number(pace) }, tip.games, S.career.seed + S.career.dayIndex * 1000, prep?.bonus ?? 0) }), 30);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineKey, !!tip, follows]);
  const current = follows ? tip!.wins : mineWins?.key === mineKey ? mineWins.wins : null;
  const edge = tip && current != null ? tip.wins - current : null;
  // 집중 마크 계획: 다음에 실제로 만날 상대의 선수 중에서 대상을 고르고, 우리 선수 중에서 담당을 정한다
  const nextDay = S.career.calendar[userMatchDays(S.career)[0]];
  const denyOppId = nextId ?? (nextDay?.type === 'practice' ? nextDay.opponentId : undefined);
  const denyOpp = denyOppId ? S.career.teams[denyOppId] : undefined;
  const denyTarget = denyOpp?.players.find((p) => p.id === t.denyPlayerId);
  const fit = (p: Player) => p.injuredDays === 0;
  const power = (p: Player) => (denyTarget ? Math.round(denyOutlook(p, denyTarget).power * 100) : 0);
  const top = (ps: Player[]) => ps.filter(fit).reduce<Player | null>((a, b) => (!a || power(b) > power(a) ? b : a), null);
  // 추천 담당: 선발 중 마크 효과가 가장 큰 선수. 벤치에 훨씬 나은 선수(10 이상)가 있으면 그 선수를 권한다
  const bestStarter = denyTarget ? top(starters) : null;
  const bestBench = denyTarget ? top(bench) : null;
  const benchPick = !!bestBench && power(bestBench) >= (bestStarter ? power(bestStarter) : 0) + 10;
  const recommend = benchPick ? bestBench : bestStarter;
  const SOLID_MARK = 80; // 이보다 낮으면 대상을 확실히 묶지 못해 집중 마크가 손해가 되기 쉽다 (scripts/deny-check.ts)
  const markerLabel = (p: Player, benched: boolean) => {
    const o = denyTarget ? denyOutlook(p, denyTarget) : null;
    const miss = o ? [o.slower ? '느림' : '', o.smaller ? '작음' : '', o.weaker ? '힘 부족' : ''].filter(Boolean).join('·') : '';
    return `${recommend?.id === p.id ? '★ ' : ''}${p.name}${o ? ` · 마크 효과 ${Math.round(o.power * 100)}${miss ? ` (${miss})` : ''}` : ''}${benched ? ' [벤치]' : ''}`;
  };
  const denyTargets: [string, string][] = (denyOpp?.players ?? []).map((p, i) => [p.id, `${POS[p.pos]} ${p.name} · 종합 ${overall(p)}${i < 5 ? '' : ' [벤치]'}`]);
  const denyMarkers: [string, string][] = [...starters.map((p) => [p.id, markerLabel(p, false)] as [string, string]), ...bench.filter(fit).map((p) => [p.id, markerLabel(p, true)] as [string, string])];
  // 지금 고른 수비·템포의 부담: 체력 소모 배율과, 선발이 체력 저하 알림 기준까지 버티는 시간(쉬지 않고 뛸 때)
  const load = tacticLoad(defense, Number(pace));
  const tiredAt = S.prefs.tiredAt;
  const lasting = starters
    .map((p) => ({ name: p.name, min: Math.max(0, startEnergy(p.condition) - tiredAt / 100) / energyPerSecond(composites(p).endurance, load.drain) / 60 }))
    .sort((a, b) => a.min - b.min);
  const lastingAvg = mean(lasting.map((x) => x.min));
  const heavy = lastingAvg < 20; // 전반(20분)을 못 버틴다
  // 선발 교체: 코트의 선발을 고른 뒤 벤치 선수(교체)나 다른 선발(자리 바꿈)을 누른다
  const [picked, setPicked] = useState<string | null>(null);
  const pickedSlot = starters.findIndex((p) => p.id === picked);
  const pickedPlayer = pickedSlot >= 0 ? starters[pickedSlot] : null;
  const manual = !!team.lineup;
  const pickStarter = (id: string) => {
    if (pickedPlayer && id !== pickedPlayer.id) { act('starter', pickedSlot, id); setPicked(null); }
    else setPicked(pickedPlayer ? null : id);
  };
  const pickBench = (id: string, injured: boolean) => {
    if (!pickedPlayer) { act('player', id); return; }
    if (injured) return;
    act('starter', pickedSlot, id);
    setPicked(null);
  };

  return (
    <div className="page">
      <PageTitle title="전술" sub="경기 시작 때 적용됩니다. 직접 지휘하는 경기에서는 도중에 바꿀 수 있습니다." />
      {prep && prep.days > 0 && (
        <div className="notice">
          다음 공식전 <b>{prep.opponent}</b> · 상대 분석 {prep.days}일 · 그 경기 능력치 +{prep.bonus.toFixed(1)}.{oppTactics && <> 상대가 즐겨 쓰는 전술: <b>{oppTactics}</b>.</>} 코치의 분석 보고서는 받은 소식에 있습니다. 어떤 전술로 맞설지는 감독이 정합니다.
        </div>
      )}
      <div className="split">
        <div className="stack">
          <Panel title="코치 조언">
            <div className="advice">
              <Icon name="bulb" />
              <div className="stack" style={{ gap: 4 }}>
                <span>
                  선발 다섯 명은 {lean > 0.03 ? '안쪽 득점' : lean < -0.03 ? '외곽슛' : '안팎 고른 득점'}에 강합니다.{' '}
                  {tip
                    ? <>{nextId ? <><b>{sparring.name}</b>전을</> : <>현 내 중간 수준의 상대를</>} 가정해 모의 경기를 돌려 보니 공격은 <b>{FOCUS[tip.focus]}</b>, 수비는 <b>{DEFENSE[tip.defense]}</b>, 템포는 <b>{PACE.find(([k]) => k === String(tip.pace))?.[1]}</b>{tip.pace === 0 ? '이' : '가'} 가장 잘 통했습니다.</>
                    : <>코치가 모의 경기를 돌려 보는 중입니다…</>}
                </span>
                {tip && (
                  <span>
                    모의 {tip.games}경기: 조언 전술 <b>{tip.wins}승</b>
                    {!follows && <> · 지금 전술 <b>{current == null ? '…' : `${current}승`}</b></>}
                    {follows ? ' (지금 쓰는 전술)' : edge == null ? '' : edge < 0 ? ' — 모의 경기에서는 지금 전술이 더 나았습니다.' : edge * 8 <= tip.games ? ' — 차이가 작아 우연일 수 있습니다.' : edge * 4 >= tip.games ? ' — 차이가 큽니다.' : ' — 조언 쪽이 조금 낫습니다.'}
                  </span>
                )}
                {tip && <span className="hint">선택지마다 {tip.games}경기씩만 돌려 본 결과라 빗나갈 수 있고, 조언이 늘 가장 좋은 전술인 것도 아닙니다. 공식전 상대를 분석한 날이 늘수록 더 많이 돌려 봅니다.</span>}
                {tip && !follows && (
                  <span>
                    <button className="btn small" onClick={() => { act('tactic', 'focus', tip.focus); act('tactic', 'defense', tip.defense); act('tactic', 'pace', String(tip.pace)); }}>조언대로 바꾸기</button>
                  </span>
                )}
              </div>
            </div>
          </Panel>
          <Panel title="공격 중심">
            <Choice options={FOCUS} short={FOCUS_SHORT} info={FOCUS_INFO} value={focus} onChange={(v) => act('tactic', 'focus', v)} />
          </Panel>
          <Panel title="수비">
            <Choice options={DEFENSE} short={DEFENSE_SHORT} info={DEFENSE_INFO} tags={DEFENSE_TAGS} value={defense} onChange={(v) => act('tactic', 'defense', v)} />
          </Panel>
          <Panel title="템포">
            <Choice options={PACE} short={PACE_SHORT} info={PACE_INFO} tags={PACE_TAGS} value={pace} onChange={(v) => act('tactic', 'pace', v)} />
          </Panel>
          <Panel title="집중 마크" action={<span className="hint">{denyOpp ? `다음 상대 · ${denyOpp.name}` : '다음 상대 미정'}</span>}>
            {denyOpp ? (
              <div className="stack" style={{ gap: 8 }}>
                <div className="controls">
                  <label className="hint">막을 상대 선수
                    <Select options={denyTargets} value={denyTarget ? t.denyPlayerId : ''} onChange={(v) => act('denyPlan', 'denyPlayerId', v)}><option value="">없음</option></Select>
                  </label>
                  {denyTarget && (
                    <label className="hint">마크 담당
                      <Select options={denyMarkers} value={t.denyDefenderId} onChange={(v) => act('denyPlan', 'denyDefenderId', v)}><option value="">같은 자리 선수</option></Select>
                    </label>
                  )}
                </div>
                {denyTarget && recommend && (
                  <p className="hint" style={{ margin: 0 }}>
                    {power(recommend) >= SOLID_MARK
                      ? <>추천 담당: <b>{recommend.name}</b> (마크 효과 {power(recommend)}){benchPick && ' · 벤치 선수라 선발로 세우거나 경기 중 교체로 넣어야 합니다'}</>
                      : <>{denyTarget.name}을(를) 확실히 막을 선수가 없습니다. 그나마 <b>{recommend.name}</b> (마크 효과 {power(recommend)}) · 집중 마크가 손해일 수 있습니다</>}
                    {t.denyDefenderId !== recommend.id && <>{' '}<button className="btn small" onClick={() => act('denyPlan', 'denyDefenderId', recommend.id)}>{recommend.name}에게 맡기기</button></>}
                  </p>
                )}
                <p className="hint" style={{ margin: 0 }}>
                  담당이 대상을 따라다니며 슛 기회와 성공률을 줄입니다. 마크 효과는 담당의 대인 수비·수비IQ·스피드·키·힘을 대상과 견준 값(100이 대등)이고, 확실히 앞서는 수비수가 아니면 큰 효과가 없습니다.
                  담당은 체력이 빨리 닳고 공격이 조금 무뎌지며, 못 막는 만큼 상대의 다른 선수들이 편해집니다. 이 경기가 끝나면 풀립니다.
                </p>
              </div>
            ) : (
              <p className="hint" style={{ margin: 0 }}>다음 상대가 정해지면 그 팀 선수 중에서 집중 마크할 선수와 담당을 고를 수 있습니다. 경기 중에도 바꿀 수 있습니다.</p>
            )}
          </Panel>
          <Panel title="이 전술의 부담" action={<span className="hint">{DEFENSE[defense]} · {PACE.find(([k]) => k === pace)?.[1]} 템포</span>}>
            <div className="load">
              <div><small>체력 소모</small><b className={load.drain > 1.2 ? 'bad' : load.drain < 0.95 ? 'good' : ''}>×{load.drain.toFixed(2)}</b><span>맨투맨·보통 템포 대비 {pctDelta(load.drain) || '같음'}</span></div>
              <div><small>파울</small><b className={load.foul > 1 ? 'bad' : load.shootingFoul < 1 ? 'good' : ''}>{pctDelta(load.foul) || pctDelta(load.shootingFoul) || '기본'}</b><span>{load.foul > 1 ? '압박하다 나오는 파울' : load.shootingFoul < 1 ? '슈팅 파울이 줄어듭니다' : '늘거나 줄지 않습니다'}</span></div>
              <div><small>선발이 버티는 시간</small><b className={heavy ? 'bad' : ''}>약 {Math.round(lastingAvg)}분</b><span>쉬지 않고 뛰어 체력 {tiredAt}까지 · 평균</span></div>
            </div>
            <p className="hint">
              가장 먼저 지치는 선수: {lasting.slice(0, 2).map((x) => `${x.name} 약 ${Math.round(x.min)}분`).join(', ')}. 지금 컨디션과 지구력으로 어림한 값이고, 경기는 40분입니다.
            </p>
            {heavy && (
              <p className="notice bad" style={{ margin: '8px 0 0' }}>
                이 전술로는 선발이 전반(20분)을 다 뛰기 어렵습니다. 벤치를 자주 돌리거나, 템포를 늦추거나, 존 수비처럼 덜 지치는 수비를 함께 고려하세요.
              </p>
            )}
          </Panel>
        </div>

        <div className="stack">
          <Panel
            title={`선발 라인업 · 팀 전력 ${teamOverall(team)}`}
            action={manual
              ? <button className="btn small" onClick={() => { act('autoLineup'); setPicked(null); }}>자동 선발로 되돌리기</button>
              : <span className="hint">코치가 매일 자동으로 정하는 중</span>}
          >
            <Court
              players={starters.map((p, i) => ({
                id: p.id, name: p.name, energy: p.condition, selected: p.id === picked,
                note: p.pos === i + 1 ? `종합 ${overall(p)}` : `종합 ${overall(p)} · 본래 ${POS[p.pos]}`,
              }))}
              onPick={pickStarter}
            />
            {pickedPlayer ? (
              <p className="hint">
                <b>{POS[pickedSlot + 1]} {pickedPlayer.name}</b> 선택됨 · 벤치 선수를 누르면 교체하고, 다른 선발을 누르면 자리를 바꿉니다.{' '}
                <button className="btn small" onClick={() => act('player', pickedPlayer.id)}>상세 보기</button>{' '}
                <button className="btn small" onClick={() => setPicked(null)}>선택 해제</button>
              </p>
            ) : (
              <p className="hint">
                선발을 누른 뒤 벤치 선수를 누르면 교체합니다. 고리는 컨디션입니다.
                {manual && ' 직접 정한 선발은 계속 유지되고, 다친 선수의 자리만 나을 때까지 코치가 채웁니다.'}
              </p>
            )}
          </Panel>
          <Panel title="벤치" flush>
            {bench.map((p) => (
              <div key={p.id} className={`bench-row ${p.injuredDays ? 'off' : ''}`} onClick={() => pickBench(p.id, !!p.injuredDays)}>
                <PosBadge pos={p.pos} />
                <span className="nm">{p.name}</span>
                <CondBar value={p.condition} />
                <Attr v={overall(p)} />
                <span className="faint">{p.injuredDays ? '부상' : `${p.year}학년`}</span>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
