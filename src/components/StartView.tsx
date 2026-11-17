import { useMemo, useState } from 'react';
import { createCareer } from '@/game/season';
import { teamOverall } from '@/game/school';
import { overall } from '@/game/engine';
import type { Act, GameState } from './useGame';
import { Attr, Crest, NAME_STYLE, Seg, Stars, clubVars } from './ui';

const difficulty = (prestige: number) => (prestige >= 62 ? '쉬움' : prestige >= 52 ? '보통' : prestige >= 46 ? '어려움' : '매우 어려움');
const prestigeStars = (prestige: number) => Math.max(0.5, Math.min(5, Math.round(((prestige - 35) / 7) * 2) / 2));

export default function StartView({ S, act }: { S: GameState; act: Act }) {
  const { startSeed, nameStyle } = S;
  const p = useMemo(() => createCareer({ seed: startSeed, dataset: 'original', nameStyle }), [startSeed, nameStyle]);
  // 학교를 누르면 바로 시작하지 않고, 한 번 확인한다
  const [picked, setPicked] = useState<number | null>(null);
  const chosen = picked == null ? null : p.teams[p.regionIds[picked]];
  const rank = chosen ? p.regionIds.map((id) => teamOverall(p.teams[id])).filter((x) => x > teamOverall(chosen)).length + 1 : 0;
  return (
    <div className="start">
      <div className="start-hero">
        <span className="eyebrow">새 커리어</span>
        <h1>고교 농구 매니저</h1>
        <p>{p.prefecture}의 고교 농구부 감독이 되어 3년 동안 팀을 이끕니다. 매일 훈련을 정하고, 경기를 직접 지휘하고, 인터하이·국민체육대회·윈터컵 우승에 도전하세요.</p>
        <div className="row">
          <span className="muted">선수 이름 표기</span>
          <Seg options={NAME_STYLE} value={nameStyle} onChange={(v) => { if (v !== nameStyle) act('namestyle'); }} />
        </div>
      </div>
      <div className="page-title">
        <div><h1>학교 선택</h1><p>학교 수준이 낮을수록 어렵습니다. 수준은 매년 성적에 따라 오르내리고, 신입생의 질을 좌우합니다.</p></div>
      </div>
      {chosen && picked != null && (
        <div className="notice start-confirm" style={clubVars(chosen.name)}>
          <Crest name={chosen.name} size={40} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <b style={{ fontSize: 16 }}>{chosen.name} 감독으로 시작할까요?</b>
            <p className="muted" style={{ margin: '2px 0 0' }}>
              팀 전력 {teamOverall(chosen)} · 현 내 {p.regionIds.length}개교 중 {rank}위 · 난이도 {difficulty(chosen.prestige)} · 선수 {chosen.players.length}명. 시작한 뒤에는 학교를 바꿀 수 없습니다.
            </p>
          </div>
          <button className="btn" onClick={() => setPicked(null)}>다시 고르기</button>
          <button className="btn primary" onClick={() => act('start', picked)}>이 학교로 시작</button>
        </div>
      )}
      <div className="school-grid">
        {p.regionIds.map((id, i) => {
          const t = p.teams[id];
          const stars = t.players.filter((x) => x.fixed).sort((a, b) => overall(b) - overall(a)).slice(0, 3).map((x) => x.name).join(', ');
          return (
            <button key={id} className={`school-card ${picked === i ? 'on' : ''}`} style={clubVars(t.name)} onClick={() => setPicked(i)}>
              <Crest name={t.name} size={40} />
              <div className="sc-body">
                <b>{t.name}</b>
                <span>{stars || '자체 선발 선수단'}</span>
              </div>
              <div className="sc-stats">
                <span><small>팀 전력</small><Attr v={teamOverall(t)} /></span>
                <span><small>학교 수준</small><Stars value={prestigeStars(t.prestige)} /></span>
                <span><small>난이도</small><b>{difficulty(t.prestige)}</b></span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
