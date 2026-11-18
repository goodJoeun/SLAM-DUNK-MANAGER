import { useState } from 'react';
import { today } from '@/game/career/season';
import { PROGRAMS, INTENSITY, RATING_LABEL } from '@/game/team/school';
import { PREPARATION } from '@/game/career/season';
import type { IntensityKey, PrepInfo, ProgramKey } from '@/game/types';
import { CondBar, Icon, PageTitle, Panel, PosBadge, Select, mean, userTeam } from '@/components/shared/ui';
import type { ViewProps } from '@/components/shared/ui';

const PROGRAM_KEYS = (Object.keys(PROGRAMS) as ProgramKey[]).filter((k) => k !== 'scout'); // 상대 분석은 따로 보여 준다
const INTENSITY_KEYS = Object.keys(INTENSITY) as IntensityKey[];
const FOCUS_PROGRAMS = Object.fromEntries(Object.entries(PROGRAMS).filter(([k]) => k !== 'rest' && k !== 'scout').map(([k, v]) => [k, v.label]));

// 다음 공식전 상대 분석: 경기 3일 전부터 하루씩, 최대 3일
function ScoutPanel({ prep, selected, onPick }: { prep: PrepInfo; selected: boolean; onPick: () => void }) {
  const max = PREPARATION.maxDays;
  const reach = prep.reachDays ?? max; // 이번 경기 전까지 실제로 채울 수 있는 일수
  const reason = prep.daysUntil === 0 ? '오늘이 경기일입니다.'
    : prep.days >= max ? '준비를 모두 마쳤습니다.'
      : prep.daysUntil > PREPARATION.window ? `경기 ${PREPARATION.window}일 전부터 분석할 수 있습니다 (지금 ${prep.daysUntil}일 전).`
        : '';
  return (
    <Panel title="다음 공식전 준비" action={<span className="pill club">{prep.daysUntil === 0 ? '오늘 경기' : `${prep.daysUntil}일 후`}</span>}>
      <div className="kv">
        <div><small>상대</small><b style={{ fontSize: 15 }}>{prep.opponent}</b><span className="muted">{prep.label}</span></div>
        <div><small>분석한 날</small><b>{prep.days} / {reach}일</b><span className="muted">하루에 능력치 +{PREPARATION.perDay}</span></div>
        <div><small>그 경기 보너스</small><b className={prep.bonus ? 'good' : ''}>+{prep.bonus.toFixed(1)}</b><span className="muted">이번 경기 최대 +{(PREPARATION.perDay * reach).toFixed(1)}</span></div>
      </div>
      {prep.days > 0 && (
        <div className="advice">
          <Icon name="bulb" />
          <span>분석 보고서는 받은 소식에 있습니다. {prep.days < reach && prep.daysUntil > 0 ? '하루 더 분석하면 더 자세한 내용이 나옵니다.' : '보고서를 보고 전술과 선발을 정하세요.'}</span>
        </div>
      )}
      <button className={`opt ${selected ? 'on' : ''}`} disabled={!prep.canScout} onClick={onPick} style={{ opacity: prep.canScout ? 1 : 0.55 }}>
        <b>{prep.opponent} 분석·대비</b>
        <span>
          {prep.canScout ? '영상 분석과 맞춤 연습. 1일째는 주요 선수와 전술, 2일째는 강점·약점과 대응 실마리, 3일째는 선수별 성향과 벤치를 알아냅니다. 분석한 만큼 그 경기에서 능력치가 오르고, 상대의 허술한 쪽을 노리는 공격과 집중 마크도 더 잘 통합니다. 그날은 성장 훈련을 하지 않고, 컨디션은 조금만 씁니다.' : reason}
          {prep.canScout && reach < max && ` 이번 경기는 남은 훈련일이 모자라 ${reach}일까지만 분석할 수 있습니다.`}
        </span>
      </button>
    </Panel>
  );
}

export default function TrainingView({ S, act }: ViewProps) {
  const c = S.career;
  const d = today(c);
  const team = userTeam(c);
  const cond = Math.round(mean(team.players.filter((p) => !p.injuredDays).map((p) => p.condition)));
  const I = INTENSITY[S.intensity];
  const matchDay = Boolean(d?.userMatch);

  // 개인 훈련을 한꺼번에 정할 선수들 (체크한 선수 id). 팀을 떠난 선수는 세지 않도록 지금 명단과 맞춰 본다
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const picked = team.players.filter((p) => checked.has(p.id));
  const allPicked = picked.length === team.players.length && picked.length > 0;
  const toggle = (id: string) => setChecked((prev) => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  // 고른 선수들의 개인 훈련이 모두 같으면 그 값을, 섞여 있으면 고르기 전 상태를 보여 준다
  const shared = picked.length && picked.every((p) => p.focus === picked[0].focus) ? picked[0].focus ?? '' : 'mixed';

  return (
    <div className="page">
      <PageTitle title="훈련" sub="정해 둔 메뉴는 상단의 계속 버튼을 누를 때마다 적용됩니다." />
      <div className="split">
        <div className="stack">
          {d?.prep && <ScoutPanel prep={d.prep} selected={S.program === 'scout'} onPick={() => act('program', 'scout')} />}
          <Panel title="팀 훈련 메뉴" action={d?.camp ? <span className="pill club">합숙 · 성장 ×1.4</span> : undefined}>
            <div className="opts">
              {PROGRAM_KEYS.map((k) => {
                const p = PROGRAMS[k];
                return (
                  <button key={k} className={`opt ${S.program === k ? 'on' : ''}`} onClick={() => act('program', k)}>
                    <b>{p.label}</b>
                    <span>{p.keys.length ? p.keys.map((x) => RATING_LABEL[x]).join(' · ') : `컨디션 회복`}</span>
                  </button>
                );
              })}
            </div>
          </Panel>
          {S.program !== 'rest' && S.program !== 'scout' && (
            <Panel title="강도">
              <div className="opts">
                {INTENSITY_KEYS.map((k) => {
                  const i = INTENSITY[k];
                  return (
                    <button key={k} className={`opt ${S.intensity === k ? 'on' : ''}`} onClick={() => act('intensity', k)}>
                      <b>{i.label}</b><span>성장 ×{i.gain} · 컨디션 -{i.cost}</span>
                    </button>
                  );
                })}
              </div>
              <p className="hint">강하게 훈련할수록 빨리 크지만 지치고 다치기 쉽고, 노력파가 아닌 선수는 사기가 떨어집니다. 지치거나 사기가 낮은 선수는 같은 훈련을 해도 덜 성장합니다. 휴식은 컨디션과 사기를 함께 회복합니다. 컨디션이 낮은 채로 경기에 나서면 경기 내내 능력이 떨어지고(컨디션 60이면 약 5%) 더 빨리 지칩니다.</p>
            </Panel>
          )}
          <Panel title="오늘 진행">
            <div className="kv">
              <div><small>팀 컨디션</small><b>{cond}</b><CondBar value={cond} wide /></div>
              <div><small>오늘 소모 예상</small><b>{S.program === 'rest' ? '+18' : S.program === 'scout' ? '-2' : `-${I.cost}`}</b></div>
            </div>
            {matchDay
              ? <p className="hint">오늘은 경기일입니다. 경기를 마친 뒤 다시 훈련할 수 있습니다.</p>
              : (
                <div className="row">
                  <button className="btn primary" onClick={() => act('train')}>이 메뉴로 하루 진행</button>
                  <button className="btn" onClick={() => act('auto')}>다음 경기까지 AI 코치에게 맡기기</button>
                </div>
              )}
          </Panel>
        </div>

        <Panel title="선수별 상태 · 개인 훈련" flush>
          <div className="bulk-bar">
            {picked.length ? (
              <>
                <b>{picked.length}명 선택</b>
                <label className="hint">개인 훈련 한꺼번에 지정
                  <select value={shared} onChange={(e) => act('playerFocus', picked.map((p) => p.id), e.target.value)}>
                    {shared === 'mixed' && <option value="mixed" disabled>훈련 고르기</option>}
                    <option value="">없음</option>
                    {Object.entries(FOCUS_PROGRAMS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </label>
                <span className="spacer" />
                <button className="btn ghost small" onClick={() => setChecked(new Set())}>선택 해제</button>
              </>
            ) : <span className="hint">선수를 체크하면 여러 명의 개인 훈련을 한꺼번에 정할 수 있습니다.</span>}
          </div>
          <div className="table-wrap"><table className="data">
            <thead><tr><th className="check"><input type="checkbox" aria-label="모든 선수 선택" checked={allPicked} onChange={() => setChecked(allPicked ? new Set() : new Set(team.players.map((p) => p.id)))} /></th><th className="l">포지션</th><th className="l name">이름</th><th>컨디션</th><th className="l">개인 훈련</th></tr></thead>
            <tbody>
              {team.players.map((p) => (
                <tr key={p.id} className={`${p.injuredDays ? 'dim' : ''} ${checked.has(p.id) ? 'picked' : ''}`}>
                  <td className="check"><input type="checkbox" aria-label={`${p.name} 선택`} checked={checked.has(p.id)} onChange={() => toggle(p.id)} /></td>
                  <td className="l"><PosBadge pos={p.pos} /></td>
                  <td className="l name"><button className="name-link" title="선수 상세 보기" onClick={() => act('player', p.id)}>{p.name}</button>{p.injuredDays ? <span className="pill bad" style={{ marginLeft: 6 }}>부상 {p.injuredDays}일</span> : null}</td>
                  <td><span className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}><span className="num">{Math.round(p.condition)}</span><CondBar value={p.condition} /></span></td>
                  <td className="l focus-cell">
                    <Select options={FOCUS_PROGRAMS} value={p.focus} onChange={(v) => act('playerFocus', p.id, v)}><option value="">없음</option></Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Panel>
      </div>
    </div>
  );
}
