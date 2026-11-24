// 표지: 게임을 켜면 가장 먼저 보이는 화면. 이어하기, 새로 시작, 불러오기를 고른다.
// 배경은 public/cover.webp 한 장이다. 넓은 화면에서는 그림 속 제목을 그대로 쓰고 글자 제목은 숨긴다.
// 세로 화면에서는 그림을 감독 쪽으로 잘라 화면을 채우므로 그림 속 제목이 빠진다. 그때는 글자 제목을 보여 주고 버튼을 아래쪽에 모은다.
import { useEffect, useRef, useState } from 'react';
import { SLOTS } from '@/state/useGame';
import type { Act, GameState } from '@/state/useGame';
import { Crest, Icon, clubVars, usePhone } from '@/components/shared/ui';

export default function TitleView({ S, act }: { S: GameState; act: Act }) {
  const phone = usePhone();
  const last = S.lastSlot ? S.slots[S.lastSlot - 1] : null;
  const saved = S.slots.filter(Boolean).length;
  const [open, setOpen] = useState(false);
  // 켜자마자 엔터로 바로 고를 수 있게 첫 메뉴에 초점을 둔다 (키보드가 없는 휴대폰에서는 두지 않는다)
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!phone) firstRef.current?.focus({ preventScroll: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 세이브 칸 창은 Esc로도 닫는다
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 휴대폰에서는 버튼 설명을 한 줄로 짧게 쓴다
  const lastSub = !last ? ''
    : !phone ? `${last.slot}번 칸 · ${last.team} · ${last.when}`
      : last.done ? `${last.team} · 캠페인 종료`
        : `${last.team} · ${last.when.split(' · ')[0]}${last.when.includes('경기 진행 중') ? ' · 경기 중' : ''}`;
  const newSub = !S.slot ? (phone ? '세이브 칸이 모두 찼습니다' : '세이브 칸이 모두 찼습니다 · 불러오기에서 칸을 지워야 합니다')
    : !phone ? `학교를 골라 감독으로 부임합니다 · ${S.slot}번 칸에 저장`
      : last ? '' : '학교를 골라 감독으로 부임합니다';

  return (
    <div className="cover">
      <div className="cover-art" aria-hidden="true" />

      <div className="cover-inner">
        <h1 className="cover-title"><span className="ct-logo">SLAM DUNK</span> <span className="ct-sub">BASKETBALL MANAGER</span></h1>

        <nav className="cover-menu" aria-label="시작 메뉴">
          {last && (
            <button ref={firstRef} className="cover-item main" style={clubVars(last.team)} onClick={() => act('load', last.slot)}>
              <span className="ci-crest"><Crest name={last.team} size={38} /></span>
              <b>{last.done ? '기록 보기' : '이어하기'}</b>
              <span className="ci-sub">{lastSub}</span>
              <span className="ci-go"><Icon name="next" /></span>
            </button>
          )}
          <button ref={last ? undefined : firstRef} className={`cover-item ${last ? '' : 'main'}`} onClick={() => act('newGame')}>
            <b>새로 시작</b>
            {newSub && <span className="ci-sub">{newSub}</span>}
            {!last && <span className="ci-go"><Icon name="next" /></span>}
          </button>
          {saved > 0 && (
            <button className="cover-item" aria-expanded={open} onClick={() => setOpen(!open)}>
              <b>불러오기</b>
              {!phone && <span className="ci-sub">저장된 게임 {saved}개 · 세이브 칸 {SLOTS.length}개</span>}
            </button>
          )}
          {open && saved > 0 && (
            // 넓은 화면에서는 메뉴 아래에 펼치고, 휴대폰에서는 아래에서 올라오는 창으로 띄운다
            <div className="cover-sheet" onClick={() => setOpen(false)}>
              <div className="cover-slots" role="dialog" aria-label="세이브 칸" onClick={(e) => e.stopPropagation()}>
                <div className="cover-sheet-h m-only">
                  <b>불러오기</b>
                  <button className="btn ghost small" onClick={() => setOpen(false)}>닫기</button>
                </div>
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
            </div>
          )}
        </nav>

        <footer className="cover-foot"><span className="hide-phone">Tab으로 고르고 Enter로 결정 · </span>게임은 이 브라우저에 자동으로 저장됩니다</footer>
      </div>
    </div>
  );
}
