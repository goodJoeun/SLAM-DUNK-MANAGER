// 표지: 게임을 켜면 가장 먼저 보이는 화면. 이어하기, 새로 시작, 불러오기를 고른다.
// 배경은 public/cover.webp 한 장이다. 제목이 그림 안에 들어 있어서 글자 제목은 화면에 보이지 않게 둔다.
import { useEffect, useRef, useState } from 'react';
import { SLOTS } from '@/state/useGame';
import type { Act, GameState } from '@/state/useGame';
import { Crest, clubVars } from '@/components/shared/ui';

export default function TitleView({ S, act }: { S: GameState; act: Act }) {
  const last = S.lastSlot ? S.slots[S.lastSlot - 1] : null;
  const saved = S.slots.filter(Boolean).length;
  const [open, setOpen] = useState(false);
  // 켜자마자 엔터로 바로 고를 수 있게 첫 메뉴에 초점을 둔다
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { firstRef.current?.focus({ preventScroll: true }); }, []);

  return (
    <div className="cover">
      <div className="cover-art" aria-hidden="true" />

      <div className="cover-inner">
        <h1 className="cover-title">SLAM BASKETBALL MANAGER</h1>

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

        <footer className="cover-foot"><span className="hide-phone">Tab으로 고르고 Enter로 결정 · </span>게임은 이 브라우저에 자동으로 저장됩니다</footer>
      </div>
    </div>
  );
}
