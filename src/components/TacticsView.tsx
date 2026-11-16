import { useEffect, useState } from 'react';
import { composites, overall } from '@/game/engine';
import { teamOverall } from '@/game/school';
import type { Composites, Defense, Focus } from '@/game/types';
import Court from './Court';
import { today } from '@/game/season';
import { scoutReport } from '@/game/scouting';
import { adviseTactics } from '@/game/advice';
import type { TacticsAdvice } from '@/game/advice';
import { Attr, CondBar, DEFENSE, FOCUS, Icon, PACE, POS, PageTitle, Panel, PosBadge, mean, userTeam } from './ui';
import type { ViewProps } from './ui';

const FOCUS_INFO: Record<Focus, string> = {
  balanced: '슛 종류를 고르게 나눕니다.',
  inside: '골밑슛과 포스트업 비중을 높이고, 안쪽에 강한 선수에게 공이 갑니다.',
  outside: '3점슛 비중을 높이고, 슈터에게 공이 갑니다.',
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

// 선발 다섯 명의 득점 성향 (+면 안쪽, -면 외곽)
function scoringLean(cs: Composites[]) {
  const avg = (f: (c: Composites) => number) => mean(cs.map(f));
  return avg((c) => Math.max(c.rim, c.post)) - avg((c) => Math.max(c.mid, c.three));
}

function Choice<K extends string>({ options, info, value, onChange }: {
  options: Record<K, string> | [K, string][];
  info: Record<K, string>;
  value: string;
  onChange: (v: K) => void;
}) {
  const list = Array.isArray(options) ? options : (Object.entries(options) as [K, string][]);
  return (
    <div className="opts">
      {list.map(([k, label]) => (
        <button key={k} className={`opt ${value === k ? 'on' : ''}`} onClick={() => onChange(k)}>
          <b>{label}</b><span>{info[k]}</span>
        </button>
      ))}
    </div>
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
  const adviceKey = `${S.career.year}-${S.career.dayIndex}-${sparring.id}-${scoutDays}-${starters.map((p) => p.id).join(',')}-${t.keyPlayerId ?? ''}-${t.denyPlayerId ?? ''}`;
  const [advice, setAdvice] = useState<{ key: string; tip: TacticsAdvice } | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setAdvice({ key: adviceKey, tip: adviseTactics(team, sparring, scoutDays, S.career.seed + S.career.dayIndex * 1000) }), 30);
    return () => clearTimeout(timer);
    // adviceKey가 팀·상대·분석 일수를 모두 담고 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adviceKey]);
  const tip = advice?.key === adviceKey ? advice.tip : null;
  const focus = t.focus ?? 'balanced';
  const defense = t.defense ?? 'man';
  const pace = String(Math.round(t.pace ?? 0));
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
                {tip && <span className="hint">선택지마다 {tip.games}경기씩 돌려 본 결과라 빗나갈 수 있습니다. 공식전 상대를 분석한 날이 늘수록 더 많이 돌려 봅니다.</span>}
                {tip && (focus !== tip.focus || defense !== tip.defense || pace !== String(tip.pace)) && (
                  <span>
                    <button className="btn small" onClick={() => { act('tactic', 'focus', tip.focus); act('tactic', 'defense', tip.defense); act('tactic', 'pace', String(tip.pace)); }}>조언대로 바꾸기</button>
                  </span>
                )}
              </div>
            </div>
          </Panel>
          <Panel title="공격 중심">
            <Choice options={FOCUS} info={FOCUS_INFO} value={focus} onChange={(v) => act('tactic', 'focus', v)} />
          </Panel>
          <Panel title="수비">
            <Choice options={DEFENSE} info={DEFENSE_INFO} value={defense} onChange={(v) => act('tactic', 'defense', v)} />
          </Panel>
          <Panel title="템포">
            <Choice options={PACE} info={PACE_INFO} value={pace} onChange={(v) => act('tactic', 'pace', v)} />
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
