import { composites, overall } from '@/game/engine';
import { teamOverall } from '@/game/school';
import type { Composites, Defense, Focus } from '@/game/types';
import Court from './Court';
import { today } from '@/game/season';
import { Attr, CondBar, DEFENSE, FOCUS, Icon, PACE, PageTitle, Panel, PosBadge, mean, planSummary, userTeam } from './ui';
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

// AI 감독과 같은 기준으로 선발 다섯 명에 맞는 전술을 권한다
function advise(cs: Composites[]) {
  const avg = (f: (c: Composites) => number) => mean(cs.map(f));
  const lean = avg((c) => Math.max(c.rim, c.post)) - avg((c) => Math.max(c.mid, c.three));
  const focus: Focus = lean > 0.03 ? 'inside' : lean < -0.03 ? 'outside' : 'balanced';
  let defense: Defense = 'man';
  if (avg((c) => c.defInterior) - avg((c) => c.defPerimeter) > 0.02) defense = 'zone';
  else if (avg((c) => c.stealing) + avg((c) => c.endurance) > 1.1) defense = 'press';
  return { focus, defense, lean };
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
  const team = userTeam(S.career);
  const t = team.tactics;
  const starters = team.players.slice(0, 5);
  const bench = team.players.slice(5);
  const tip = advise(starters.map(composites));
  const focus = t.focus ?? 'balanced';
  const defense = t.defense ?? 'man';
  const pace = String(Math.round(t.pace ?? 0));

  return (
    <div className="page">
      <PageTitle title="전술" sub="경기 시작 때 적용됩니다. 직접 지휘하는 경기에서는 도중에 바꿀 수 있습니다." />
      {prep?.plan && (
        <div className="notice" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            <b>{prep.opponent}전 대응 계획</b> · {planSummary(prep.plan)} · 지금 전술이 {prep.followed}/3 따름 · 그 경기 보너스 +{prep.bonus.toFixed(1)} (최대 +{prep.maxBonus.toFixed(1)})
          </span>
          {prep.followed < 3 && <button className="btn small primary" onClick={() => act('applyPlan')}>계획대로 적용</button>}
        </div>
      )}
      <div className="split">
        <div className="stack">
          <Panel title="공격 중심">
            <Choice options={FOCUS} info={FOCUS_INFO} value={focus} onChange={(v) => act('tactic', 'focus', v)} />
          </Panel>
          <Panel title="수비">
            <Choice options={DEFENSE} info={DEFENSE_INFO} value={defense} onChange={(v) => act('tactic', 'defense', v)} />
          </Panel>
          <Panel title="템포">
            <Choice options={PACE} info={PACE_INFO} value={pace} onChange={(v) => act('tactic', 'pace', v)} />
          </Panel>
          <Panel title="코치 조언">
            <div className="advice">
              <Icon name="bulb" />
              <div className="stack" style={{ gap: 4 }}>
                <span>
                  선발 다섯 명은 {tip.lean > 0.03 ? '안쪽 득점' : tip.lean < -0.03 ? '외곽슛' : '안팎 고른 득점'}에 강합니다.
                  공격은 <b>{FOCUS[tip.focus]}</b>, 수비는 <b>{DEFENSE[tip.defense]}</b>를 권합니다.
                </span>
                {(focus !== tip.focus || defense !== tip.defense) && (
                  <span>
                    <button className="btn small" onClick={() => { act('tactic', 'focus', tip.focus); act('tactic', 'defense', tip.defense); }}>조언대로 바꾸기</button>
                  </span>
                )}
              </div>
            </div>
          </Panel>
        </div>

        <div className="stack">
          <Panel title={`선발 라인업 · 팀 전력 ${teamOverall(team)}`}>
            <Court players={starters.map((p) => ({ id: p.id, name: p.name, note: `종합 ${overall(p)}`, energy: p.condition }))} onPick={(id) => act('player', id)} />
            <p className="hint">고리는 컨디션입니다. 선수를 누르면 상세 정보를 봅니다.</p>
          </Panel>
          <Panel title="벤치" flush>
            {bench.map((p) => (
              <div key={p.id} className={`bench-row ${p.injuredDays ? 'off' : ''}`} onClick={() => act('player', p.id)}>
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
