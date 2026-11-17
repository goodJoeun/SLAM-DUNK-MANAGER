// 표지: 게임을 켜면 가장 먼저 보이는 화면. 이어하기, 새로 시작, 불러오기를 고른다.
// 그림은 전부 CSS와 SVG로 그린다 (만화의 집중선·망점·먹선 느낌).
import { useEffect, useRef, useState } from 'react';
import { SLOTS } from './useGame';
import type { Act, GameState } from './useGame';
import { Crest, clubVars } from './ui';

function Ball() {
  return (
    <svg className="cover-ball" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <radialGradient id="cover-ball-fill" cx="36%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ffb057" />
          <stop offset="0.55" stopColor="#e8651a" />
          <stop offset="1" stopColor="#8f2f08" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="94" fill="url(#cover-ball-fill)" stroke="#111" strokeWidth="6" />
      <g fill="none" stroke="#111" strokeWidth="5" strokeLinecap="round">
        <path d="M100 6v188" />
        <path d="M6 100h188" />
        <path d="M34 33c38 30 38 104 0 134" />
        <path d="M166 33c-38 30-38 104 0 134" />
      </g>
    </svg>
  );
}

export default function TitleView({ S, act }: { S: GameState; act: Act }) {
  const last = S.lastSlot ? S.slots[S.lastSlot - 1] : null;
  const saved = S.slots.filter(Boolean).length;
  const [open, setOpen] = useState(false);
  // 켜자마자 엔터로 바로 고를 수 있게 첫 메뉴에 초점을 둔다
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { firstRef.current?.focus({ preventScroll: true }); }, []);

  return (
    <div className="cover">
      <div className="cover-art" aria-hidden="true">
        <div className="cover-slab" />
        <div className="cover-lines" />
        <div className="cover-court" />
        <Ball />
        <span className="cover-sfx">덩크!!</span>
      </div>

      <div className="cover-inner">
        <header className="cover-head">
          <span className="cover-eyebrow">HIGH SCHOOL BASKETBALL MANAGER</span>
          <h1 className="cover-title"><span>고교 농구</span><span className="hot">매니저</span></h1>
          <p className="cover-tag">전국 제패까지, 단 3년.<br />벤치에서 팀의 운명을 지휘하라.</p>
        </header>

        <nav className="cover-menu" aria-label="시작 메뉴">
          {last && (
            <button ref={firstRef} className="cover-item main" style={clubVars(last.team)} onClick={() => act('load', last.slot)}>
              <b>{last.done ? '기록 보기' : '이어하기'}</b>
              <span>{last.slot}번 칸 · {last.team} · {last.when}</span>
            </button>
          )}
          <button ref={last ? undefined : firstRef} className={`cover-item ${last ? '' : 'main'}`} onClick={() => act('newGame')}>
            <b>새로 시작</b>
            <span>{S.slot ? `학교를 골라 감독으로 부임합니다 · ${S.slot}번 칸에 저장` : '세이브 칸이 모두 찼습니다 · 불러오기에서 칸을 지워야 합니다'}</span>
          </button>
          {saved > 0 && (
            <button className="cover-item" aria-expanded={open} onClick={() => setOpen(!open)}>
              <b>불러오기</b>
              <span>저장된 게임 {saved}개 · 세이브 칸 {SLOTS.length}개</span>
            </button>
          )}
          {open && (
            <div className="cover-slots">
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
                  <div key={n} className="slot empty"><div className="slot-body"><small>{n}번 칸</small><b>빈 칸</b><span>새로 시작하면 여기에 저장됩니다</span></div></div>
                );
              })}
            </div>
          )}
        </nav>

        <footer className="cover-foot">Tab으로 고르고 Enter로 결정 · 게임은 이 브라우저에 자동으로 저장됩니다</footer>
      </div>
    </div>
  );
}
