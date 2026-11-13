import { composites, overall } from '@/game/engine';
import { teamOverall } from '@/game/school';
import type { Composites, Defense, Focus } from '@/game/types';
import Court from './Court';
import { Attr, CondBar, DEFENSE, FOCUS, Icon, PACE, PageTitle, Panel, PosBadge, mean, userTeam } from './ui';
import type { ViewProps } from './ui';

const FOCUS_INFO: Record<Focus, string> = {
  balanced: '슛 종류를 고르게 나눕니다.',
  inside: '골밑슛과 포스트업 비중을 높이고, 안쪽에 강한 선수에게 공이 갑니다.',
  outside: '3점슛 비중을 높이고, 슈터에게 공이 갑니다.',
};
const DEFENSE_INFO: Record<Defense, string> = {
  man: '각자 맡은 선수를 막는 기본 수비입니다.',
  zone: '골밑을 단단히 지키는 대신 외곽슛을 내줍니다. 체력 소모가 조금 적습니다.',
  press: '전방부터 압박해 턴오버를 노립니다. 파울과 체력 소모가 늘고, 뚫리면 쉬운 실점을 합니다.',
};
const PACE_INFO: Record<string, string> = {
  '-1': '공격 시간을 길게 써서 경기 흐름을 늦춥니다.',
  0: '보통 속도로 공격합니다.',
  1: '빠르게 공격해 공격권 수를 늘립니다.',
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
