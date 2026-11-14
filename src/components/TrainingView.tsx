import { today } from '@/game/season';
import { PROGRAMS, INTENSITY, RATING_LABEL } from '@/game/school';
import { PREPARATION } from '@/game/season';
import type { IntensityKey, PrepInfo, ProgramKey } from '@/game/types';
import { CondBar, Icon, PageTitle, Panel, PosBadge, Select, mean, planSummary, userTeam } from './ui';
import type { ViewProps } from './ui';

const PROGRAM_KEYS = (Object.keys(PROGRAMS) as ProgramKey[]).filter((k) => k !== 'scout'); // 상대 분석은 따로 보여 준다
const INTENSITY_KEYS = Object.keys(INTENSITY) as IntensityKey[];
const FOCUS_PROGRAMS = Object.fromEntries(Object.entries(PROGRAMS).filter(([k]) => k !== 'rest' && k !== 'scout').map(([k, v]) => [k, v.label]));

// 다음 공식전 상대 분석: 경기 3일 전부터 하루씩, 최대 3일
function ScoutPanel({ prep, selected, onPick, onApply }: { prep: PrepInfo; selected: boolean; onPick: () => void; onApply: () => void }) {
  const max = PREPARATION.maxDays;
  const reason = prep.daysUntil === 0 ? '오늘이 경기일입니다.'
    : prep.days >= max ? '준비를 모두 마쳤습니다.'
      : prep.daysUntil > PREPARATION.window ? `경기 ${PREPARATION.window}일 전부터 분석할 수 있습니다 (지금 ${prep.daysUntil}일 전).`
        : '';
  return (
    <Panel title="다음 공식전 준비" action={<span className="pill club">{prep.daysUntil === 0 ? '오늘 경기' : `${prep.daysUntil}일 후`}</span>}>
      <div className="kv">
        <div><small>상대</small><b style={{ fontSize: 15 }}>{prep.opponent}</b><span className="muted">{prep.label}</span></div>
        <div><small>분석한 날</small><b>{prep.days} / {max}일</b><span className="muted">하루에 능력치 +{PREPARATION.perDay}</span></div>
        <div><small>그 경기 보너스</small><b className={prep.bonus ? 'good' : ''}>+{prep.bonus.toFixed(1)}</b><span className="muted">계획대로 하면 +{prep.maxBonus.toFixed(1)}</span></div>
      </div>
      {prep.plan && (
        <div className="advice">
          <Icon name="bulb" />
          <div className="stack" style={{ gap: 6 }}>
            <span><b>코치의 대응 계획</b> · {planSummary(prep.plan)} · 지금 전술이 <b>{prep.followed}/3</b> 따름</span>
            {prep.followed < 3 && <span><button className="btn small" onClick={onApply}>계획대로 전술 적용</button></span>}
          </div>
        </div>
      )}
      <button className={`opt ${selected ? 'on' : ''}`} disabled={!prep.canScout} onClick={onPick} style={{ opacity: prep.canScout ? 1 : 0.55 }}>
        <b>{prep.opponent} 분석·대비</b>
        <span>{prep.canScout ? '영상 분석과 맞춤 연습. 그날은 성장 훈련을 하지 않고, 컨디션은 조금만 씁니다.' : reason}</span>
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

  return (
    <div className="page">
      <PageTitle title="훈련" sub="정해 둔 메뉴는 상단의 계속 버튼을 누를 때마다 적용됩니다." />
      <div className="split">
        <div className="stack">
          {d?.prep && <ScoutPanel prep={d.prep} selected={S.program === 'scout'} onPick={() => act('program', 'scout')} onApply={() => act('applyPlan')} />}
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
              <p className="hint">강하게 훈련할수록 빨리 크지만 지치고 다치기 쉽습니다. 지친 선수는 같은 훈련을 해도 덜 성장합니다.</p>
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
          <div className="table-wrap"><table className="data">
            <thead><tr><th className="l">포지션</th><th className="l">이름</th><th>컨디션</th><th className="l">개인 훈련</th></tr></thead>
            <tbody>
              {team.players.map((p) => (
                <tr key={p.id} className={p.injuredDays ? 'dim' : ''}>
                  <td className="l"><PosBadge pos={p.pos} /></td>
                  <td className="l name">{p.name}{p.injuredDays ? <span className="pill bad" style={{ marginLeft: 6 }}>부상 {p.injuredDays}일</span> : null}</td>
                  <td><span className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}><span className="num">{Math.round(p.condition)}</span><CondBar value={p.condition} /></span></td>
                  <td className="l" style={{ minWidth: 140 }}>
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
