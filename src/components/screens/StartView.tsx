import { useEffect, useMemo, useRef, useState } from 'react';
import { PLAYABLE_SCHOOLS, createCareer, goalFor, goalLabel, nationalRivalOveralls, playablePrefectures, playableSchoolIds, qualifiersFor } from '@/game/career/season';
import { teamOverall } from '@/game/team/school';
import { overall } from '@/game/match/engine';
import { SLOTS } from '@/state/useGame';
import type { Act, GameState } from '@/state/useGame';
import { Attr, Crest, Icon, NAME_STYLE, PosBadge, Seg, Stars, clubVars } from '@/components/shared/ui';
import type { Career } from '@/game/types';

// 카드에 적는 짧은 목표 (자세한 문장은 goalLabel)
const GOAL_SHORT = ['', '현 예선 8강', '현 예선 최종 단계', '전국 대회 진출', '전국 8강', '전국 우승'];
// 목표를 이루려면 현 안에서 대략 몇 위 안에 들어야 하는가
const GOAL_NEEDS = [16, 8, 4, 2, 2, 1];
const PREFECTURES = playablePrefectures('original');
const DIFFICULTY = ['쉬움', '보통', '어려움', '매우 어려움'];

// 목표 순위 밖의 가장 강한 학교보다 전력이 이만큼 앞서면, 순위에 여유가 없어도(현 내 1위라 더 올라갈 데가 없어도) 쉬운 것으로 본다
const SAFE_MARGIN = 5;
// 전국 무대가 목표일 때: 전국에서의 전력 순위가 이 안이면 쉬움 / 보통 / 어려움
const NATIONAL_RANKS = [4, 8, 16];

// 학교를 고를 때 보여 줄 정보. 난이도는 "지금 전력이 올해 목표에 얼마나 못 미치는가"로 정한다.
//   현 안에서  목표를 이루는 데 필요한 순위와 지금 전력 순위의 차이. 필요한 순위 밖의 학교를 크게 앞서면 쉬움
//   전국에서   목표가 전국 8강 이상이면 다른 현 대표들 사이에서의 전력 순위도 본다. 둘 중 어려운 쪽이 난이도다
function schoolInfo(p: Career, id: string, rivals: number[]) {
  const t = p.teams[id];
  const ovr = teamOverall(t);
  const local = p.regionIds.map((x) => teamOverall(p.teams[x])).sort((a, b) => b - a);
  const rank = local.filter((x) => x > ovr).length + 1;
  const goal = goalFor(p, id);
  const tier = goal.tier;
  const goalShort = GOAL_SHORT[tier] + (goal.times > 1 ? ' 2회' : ''); // 세 대회 중 두 번 이뤄야 하는 목표
  const needs = tier >= 3 ? qualifiersFor(p, 'interhigh') : GOAL_NEEDS[tier]; // 전국에 나가려면 현 대표 자리 안에 들어야 한다
  const short = rank - needs; // 목표 순위까지 올라가야 할 계단 수
  const margin = ovr - (local[needs] ?? 0); // 목표 순위 바로 밖의 학교보다 얼마나 앞서는가
  const safe = short <= -2 || (short <= 0 && margin >= SAFE_MARGIN);
  let level = safe ? 0 : short <= 1 ? 1 : short <= 4 ? 2 : 3;
  const nationalRank = rivals.filter((x) => x > ovr).length + 1;
  const nationalLevel = tier >= 4 ? NATIONAL_RANKS.filter((r) => nationalRank > r).length : 0;
  level = Math.max(level, nationalLevel, goal.times > 1 ? 1 : 0); // 두 번 이뤄야 하는 목표는 전력에 여유가 있어도 쉽지 않다
  const ace = [...t.players].sort((a, b) => overall(b) - overall(a))[0];
  const top5 = [...t.players].sort((a, b) => overall(b) - overall(a)).slice(0, 5);
  const national = tier >= 4 ? ` 전국에서는 전력 ${nationalRank}위입니다.` : '';
  const why = (short > 0
    ? `전력은 현 내 ${rank}위인데, 올해 목표(${goalShort})는 ${needs}위 안에 들어야 이룰 수 있습니다.`
    : safe
    ? `전력이 현 내 ${rank}위로, 올해 목표(${goalShort})에 여유가 있습니다.`
    : `전력이 현 내 ${rank}위로, 올해 목표(${goalShort})에 닿을 만한 수준입니다.`) + national;
  return { t, ovr, rank, tier, goal, goalShort, level, ace, why, seniors: top5.filter((x) => x.year === 3).length }; // 상위 5명 중 내년에 졸업하는 선수
}
const prestigeStars = (prestige: number) => Math.max(0.5, Math.min(5, Math.round(((prestige - 35) / 7) * 2) / 2));

// 학교 선택 화면: 위에 현 탭, 왼쪽에 고를 수 있는 학교의 로고 격자, 오른쪽에 고른 학교의 정보와 시작 버튼.
// 로고를 누르면 바로 시작하지 않고 오른쪽에 정보를 보여 준 뒤, 시작 버튼으로 확정한다.
export default function StartView({ S, act }: { S: GameState; act: Act }) {
  const { startSeed, nameStyle, startPrefecture } = S;
  const p = useMemo(() => createCareer({ seed: startSeed, dataset: 'original', nameStyle, prefecture: startPrefecture }), [startSeed, nameStyle, startPrefecture]);
  const spots = qualifiersFor(p, 'interhigh');
  const info = useMemo(() => {
    const rivals = nationalRivalOveralls(p);
    return Object.fromEntries(p.regionIds.map((id) => [id, schoolInfo(p, id, rivals)]));
  }, [p]);
  // 고를 수 있는 학교: 현 내 전력 상위 학교만, 강한 순서로. 고른 학교는 현 안의 원래 순번(picked)으로 기억한다.
  const choices = useMemo(() => playableSchoolIds(p).map((id) => p.regionIds.indexOf(id)), [p]);
  const [picked, setPicked] = useState<number | null>(null);
  const chosen = picked != null && choices.includes(picked) ? p.teams[p.regionIds[picked]] : null;
  const ci = chosen ? info[chosen.id] : null;
  // 학교를 고르면 시작 버튼으로 초점을 옮긴다 (키보드로 이어서 누를 수 있게)
  const startRef = useRef<HTMLButtonElement>(null);
  // 좁은 화면에서는 정보 칸이 격자 아래에 있으므로, 고르면 그 칸이 보이게 내려 준다
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (picked == null) return;
    startRef.current?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 860px)').matches) detailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [picked]);
  // 현 탭이 화면보다 길면(휴대폰) 고른 현이 보이는 자리까지 옆으로 민다
  const tabsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    tabsRef.current?.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [p.prefecture]);
  const canon = chosen ? chosen.players.filter((x) => x.fixed).sort((a, b) => overall(b) - overall(a)).slice(0, 3).map((x) => x.name).join(', ') : '';

  return (
    <div className="pick">
      <header className="pick-top">
        <button className="btn ghost small pick-back" onClick={() => act('title')}><Icon name="back" />표지로</button>
        <div className="pick-brand">
          <h1>SLAM BASKETBALL <em>MANAGER</em></h1>
          <span>감독으로 부임할 학교를 고르세요</span>
        </div>
      </header>

      <nav ref={tabsRef} className="pick-tabs" role="tablist" aria-label="현 선택">
        {PREFECTURES.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={name === p.prefecture}
            className={name === p.prefecture ? 'on' : ''}
            onClick={() => { if (name !== p.prefecture) { setPicked(null); act('prefecture', name); } }}
          >
            {name}
          </button>
        ))}
      </nav>

      <main className="pick-main">
        <section className="pick-half" aria-label={`${p.prefecture}의 학교`}>
          <h2>{p.prefecture}</h2>
          <p className="pick-sub">전력 상위 {PLAYABLE_SCHOOLS}개교 · 강한 순서</p>
          <div className="logo-grid">
            {choices.map((i, order) => {
              const { t, ovr } = info[p.regionIds[i]];
              return (
                <button
                  key={t.id}
                  className={`logo-btn ${picked === i ? 'on' : ''}`}
                  aria-pressed={picked === i}
                  style={clubVars(t.name)}
                  title={`${t.name} · 팀 전력 ${ovr} (현 내 ${order + 1}위)`}
                  onClick={() => setPicked(i)}
                >
                  <span className="logo-ring"><Crest name={t.name} size={46} /></span>
                  <b>{t.name}</b>
                  <i>전력 {ovr}</i>
                </button>
              );
            })}
          </div>
          <p className="hint pick-note">
            현 예선에는 {p.regionIds.length}개교가 모두 나옵니다. 인터하이는 {spots}곳, 국민체육대회와 윈터컵은 1곳이 전국 대회에 나갑니다.
          </p>
        </section>

        <section ref={detailRef} className="pick-half pick-detail" aria-live="polite" style={chosen ? clubVars(chosen.name) : undefined}>
          {chosen && ci && picked != null ? (
            <>
              <div className="pd-head">
                <span className="logo-ring big"><Crest name={chosen.name} size={64} /></span>
                <div>
                  <span className="eyebrow">{p.prefecture} · 전력 {ci.rank}위</span>
                  <h2>{chosen.name}</h2>
                  <span className="muted">{canon || '자체 선발 선수단'}</span>
                </div>
              </div>
              <div className="pd-stats">
                <div><small>팀 전력</small><Attr v={ci.ovr} big /></div>
                <div><small>학교 수준</small><Stars value={prestigeStars(chosen.prestige)} /></div>
                <div><small>난이도</small><b className={`diff d${ci.level}`}>{DIFFICULTY[ci.level]}</b></div>
                <div><small>주축 중 3학년</small><b title="능력치 상위 5명 중 올해를 끝으로 졸업하는 선수">{ci.seniors}명</b></div>
              </div>
              <ul className="lines pd-lines">
                <li><span className="muted">에이스</span><span className="pd-ace"><PosBadge pos={ci.ace.pos} /><b>{ci.ace.name}</b><span className="muted">{ci.ace.year}학년</span><Attr v={overall(ci.ace)} /></span></li>
                <li><span className="muted">올해 목표</span><span>{goalLabel(ci.goal)}</span></li>
              </ul>
              <p className="muted pd-why">{ci.why}</p>
              <div className="pd-cta">
                <button className="btn" onClick={() => setPicked(null)}>다시 고르기</button>
                <button ref={startRef} className="btn primary" disabled={!S.slot} title={S.slot ? `${S.slot}번 칸에 저장됩니다` : '빈 세이브 칸이 없습니다'} onClick={() => act('start', picked)}>
                  {chosen.name} 감독으로 시작<Icon name="next" />
                </button>
              </div>
              <p className="hint">시작한 뒤에는 학교를 바꿀 수 없습니다.</p>
            </>
          ) : (
            <div className="pd-empty">
              <Icon name="squad" />
              <b>학교를 골라 주세요</b>
              <p className="muted">로고를 누르면 전력, 난이도, 올해 목표를 여기에서 보여 줍니다. 3년 동안 매일 훈련을 정하고 경기를 직접 지휘해 인터하이·국민체육대회·윈터컵 우승에 도전합니다.</p>
            </div>
          )}
        </section>
      </main>

      {S.slots.some(Boolean) && (
        <section className="slots pick-slots" aria-label="세이브 칸">
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

      <footer className="pick-foot">
        <div className="pick-opts">
          <span className="muted">이름 표기</span>
          <Seg options={NAME_STYLE} value={nameStyle} onChange={(v) => { if (v !== nameStyle) act('namestyle'); }} />
          <button className="btn small" title="원작에 나오지 않는 학교와 선수들을 새로 만듭니다. 원작 선수는 그대로입니다." onClick={() => { setPicked(null); act('reroll'); }}>선수 구성 다시 뽑기</button>
        </div>
        <span className={`pick-save ${S.slot ? 'ok' : 'full'}`}>
          {S.slot ? `${S.slot}번 칸에 자동 저장` : '세이브 칸이 모두 찼습니다 · 칸 하나를 지워야 시작할 수 있습니다'}
        </span>
      </footer>
    </div>
  );
}
