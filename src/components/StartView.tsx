import { useEffect, useMemo, useRef, useState } from 'react';
import { GOAL_LABEL, createCareer, goalTierFor } from '@/game/season';
import { teamOverall } from '@/game/school';
import { overall } from '@/game/engine';
import { SLOTS } from './useGame';
import type { Act, GameState } from './useGame';
import { Attr, Crest, NAME_STYLE, PosBadge, Seg, Stars, clubVars } from './ui';
import type { Career } from '@/game/types';

// 카드에 적는 짧은 목표 (자세한 문장은 GOAL_LABEL)
const GOAL_SHORT = ['', '현 예선 8강', '현 예선 최종 단계', '전국 대회 진출', '전국 8강', '전국 우승'];
// 목표를 이루려면 현 안에서 대략 몇 위 안에 들어야 하는가
const GOAL_NEEDS = [16, 8, 4, 2, 2, 1];
const DIFFICULTY = ['쉬움', '보통', '어려움', '매우 어려움'];
const SORTS = { base: '기본', ovr: '전력순', easy: '쉬운 순', hard: '어려운 순' };
type Sort = keyof typeof SORTS;

// 학교를 고를 때 보여 줄 정보. 난이도는 "지금 전력 순위가 올해 목표에 얼마나 못 미치는가"로 정한다.
function schoolInfo(p: Career, id: string) {
  const t = p.teams[id];
  const ovr = teamOverall(t);
  const rank = p.regionIds.filter((x) => teamOverall(p.teams[x]) > ovr).length + 1;
  const tier = goalTierFor(p, id);
  const short = rank - GOAL_NEEDS[tier]; // 목표 순위까지 올라가야 할 계단 수
  let level = short <= -2 ? 0 : short <= 1 ? 1 : short <= 4 ? 2 : 3;
  if (tier >= 4) level = Math.max(level, 1); // 전국 무대가 목표면 현 내 1위라도 쉽지 않다
  const ace = [...t.players].sort((a, b) => overall(b) - overall(a))[0];
  const top5 = [...t.players].sort((a, b) => overall(b) - overall(a)).slice(0, 5);
  const why = short <= -2
    ? `전력이 현 내 ${rank}위로, 올해 목표(${GOAL_SHORT[tier]})에 여유가 있습니다.`
    : short <= 0
    ? `전력이 현 내 ${rank}위로, 올해 목표(${GOAL_SHORT[tier]})에 닿을 만한 수준입니다.`
    : `전력은 현 내 ${rank}위인데, 올해 목표(${GOAL_SHORT[tier]})는 ${GOAL_NEEDS[tier]}위 안에 들어야 이룰 수 있습니다.`;
  return { t, ovr, rank, tier, level, ace, why, seniors: top5.filter((x) => x.year === 3).length }; // 상위 5명 중 내년에 졸업하는 선수
}
const prestigeStars = (prestige: number) => Math.max(0.5, Math.min(5, Math.round(((prestige - 35) / 7) * 2) / 2));

export default function StartView({ S, act }: { S: GameState; act: Act }) {
  const { startSeed, nameStyle } = S;
  const p = useMemo(() => createCareer({ seed: startSeed, dataset: 'original', nameStyle }), [startSeed, nameStyle]);
  // 학교를 누르면 바로 시작하지 않고, 한 번 확인한다
  const [picked, setPicked] = useState<number | null>(null);
  const chosen = picked == null ? null : p.teams[p.regionIds[picked]];
  const info = useMemo(() => Object.fromEntries(p.regionIds.map((id) => [id, schoolInfo(p, id)])), [p]);
  const ci = chosen ? info[chosen.id] : null;
  // 학교를 고르면 확인 창의 시작 버튼으로 초점을 옮긴다 (키보드로 이어서 누를 수 있게)
  const startRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (picked != null) startRef.current?.focus({ preventScroll: true }); }, [picked]);
  // 보여 주는 순서만 바꾼다. 고른 학교는 원래 순번(picked)으로 기억한다.
  const [sort, setSort] = useState<Sort>('base');
  const order = useMemo(() => {
    const idx = p.regionIds.map((_, i) => i);
    const of = (i: number) => info[p.regionIds[i]];
    if (sort === 'ovr') idx.sort((a, b) => of(b).ovr - of(a).ovr);
    if (sort === 'easy') idx.sort((a, b) => of(a).level - of(b).level || of(b).ovr - of(a).ovr);
    if (sort === 'hard') idx.sort((a, b) => of(b).level - of(a).level || of(a).ovr - of(b).ovr);
    return idx;
  }, [p, info, sort]);
  return (
    <div className="start">
      <div className="start-hero">
        <span className="eyebrow">새 커리어</span>
        <h1>고교 농구 매니저</h1>
        <p>{p.prefecture}의 고교 농구부 감독이 되어 3년 동안 팀을 이끕니다. 매일 훈련을 정하고, 경기를 직접 지휘하고, 인터하이·국민체육대회·윈터컵 우승에 도전하세요.</p>
        <div className="row">
          <span className="muted">이름 표기</span>
          <Seg options={NAME_STYLE} value={nameStyle} onChange={(v) => { if (v !== nameStyle) act('namestyle'); }} />
          <span className="hint">학교와 선수 이름을 한국어판 또는 일본 원작 이름으로 보여 줍니다. 같은 학교·같은 선수이고, 시작한 뒤에는 바꿀 수 없습니다.</span>
        </div>
      </div>
      {S.slots.some(Boolean) && (
        <section className="slots" aria-label="세이브 칸">
          {SLOTS.map((n, i) => {
            const s = S.slots[i];
            return s ? (
              <div key={n} className="slot" style={clubVars(s.team)}>
                <Crest name={s.team} size={34} />
                <div className="slot-body"><small>{n}번 칸</small><b>{s.team}</b><span>{s.when}</span></div>
                <div className="slot-acts">
                  <button className="btn primary small" onClick={() => act('load', n)}>{s.done ? '기록 보기' : '이어 하기'}</button>
                  <button className="btn ghost small" onClick={() => act('deleteSlot', n)}>지우기</button>
                </div>
              </div>
            ) : (
              <button key={n} className={`slot empty ${S.slot === n ? 'on' : ''}`} aria-pressed={S.slot === n} onClick={() => act('pickSlot', n)}>
                <div className="slot-body"><small>{n}번 칸</small><b>빈 칸</b><span>{S.slot === n ? '새 게임이 여기에 저장됩니다' : '눌러서 새 게임을 여기에 저장'}</span></div>
              </button>
            );
          })}
        </section>
      )}
      {!S.slot && <div className="notice bad">세이브 칸이 모두 찼습니다. 새 게임을 시작하려면 위에서 칸 하나를 지워야 합니다.</div>}
      <div className="page-title">
        <div><h1>학교 선택</h1><p>난이도는 지금 전력이 올해 목표에 얼마나 못 미치는지로 정해집니다. 학교 수준(별)은 매년 성적에 따라 오르내리고, 목표와 신입생의 질을 좌우합니다.</p></div>
        <div className="row"><span className="muted">정렬</span><Seg options={SORTS} value={sort} onChange={(v) => setSort(v as Sort)} />
          <button className="btn small" title="원작에 나오지 않는 학교와 선수들을 새로 만듭니다. 원작 선수는 그대로입니다." onClick={() => { setPicked(null); act('reroll'); }}>선수 구성 다시 뽑기</button>
        </div>
      </div>
      {chosen && ci && picked != null && (
        <div className="notice start-confirm" style={clubVars(chosen.name)}>
          <Crest name={chosen.name} size={40} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <b style={{ fontSize: 16 }}>{chosen.name} 감독으로 시작할까요?</b>
            <p className="muted" style={{ margin: '2px 0 0' }}>
              난이도 <b>{DIFFICULTY[ci.level]}</b> · {ci.why}
            </p>
            <p className="muted" style={{ margin: '2px 0 0' }}>
              <span className="hide-phone">올해 목표: {GOAL_LABEL[ci.tier]}. </span>시작한 뒤에는 학교를 바꿀 수 없습니다.
            </p>
          </div>
          <button className="btn" onClick={() => setPicked(null)}>다시 고르기</button>
          <button ref={startRef} className="btn primary" disabled={!S.slot} title={S.slot ? `${S.slot}번 칸에 저장됩니다` : '빈 세이브 칸이 없습니다'} onClick={() => act('start', picked)}>이 학교로 시작</button>
        </div>
      )}
      <div className="school-grid">
        {order.map((i) => {
          const id = p.regionIds[i];
          const { t, ovr, rank, tier, level, ace, why, seniors } = info[id];
          const stars = t.players.filter((x) => x.fixed).sort((a, b) => overall(b) - overall(a)).slice(0, 3).map((x) => x.name).join(', ');
          return (
            <button key={id} className={`school-card ${picked === i ? 'on' : ''}`} aria-pressed={picked === i} style={clubVars(t.name)} onClick={() => setPicked(i)}>
              <Crest name={t.name} size={40} />
              <div className="sc-body">
                <b>{t.name}</b>
                <span>{stars || '자체 선발 선수단'}</span>
              </div>
              <div className="sc-ace">
                <small>에이스</small><PosBadge pos={ace.pos} /><b>{ace.name}</b><span className="muted">{ace.year}학년</span><Attr v={overall(ace)} />
              </div>
              <div className="sc-stats">
                <span><small>팀 전력</small><span className="sc-ovr"><Attr v={ovr} /><i>{rank}위</i></span></span>
                <span><small>학교 수준</small><Stars value={prestigeStars(t.prestige)} /></span>
                <span title={why}><small>난이도</small><b className={`diff d${level}`}>{DIFFICULTY[level]}</b></span>
              </div>
              <div className="sc-goal"><span><small>올해 목표</small>{GOAL_SHORT[tier]}</span><span title="능력치 상위 5명 중 올해를 끝으로 졸업하는 선수"><small>주축 중 3학년</small>{seniors}명</span></div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
