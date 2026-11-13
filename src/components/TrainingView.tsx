import { today } from '@/game/season';
import { PROGRAMS, INTENSITY, RATING_LABEL } from '@/game/school';
import type { IntensityKey, ProgramKey } from '@/game/types';
import { CondBar, PageTitle, Panel, PosBadge, Select, mean, userTeam } from './ui';
import type { ViewProps } from './ui';

const PROGRAM_KEYS = Object.keys(PROGRAMS) as ProgramKey[];
const INTENSITY_KEYS = Object.keys(INTENSITY) as IntensityKey[];
const FOCUS_PROGRAMS = Object.fromEntries(Object.entries(PROGRAMS).filter(([k]) => k !== 'rest').map(([k, v]) => [k, v.label]));

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
          {S.program !== 'rest' && (
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
              <div><small>오늘 소모 예상</small><b>{S.program === 'rest' ? '+18' : `-${I.cost}`}</b></div>
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
