// 오늘의 결정 팝업: 감독이 골라야 하루가 넘어가는 사건이 생기면 어느 화면에 있든 창을 띄운다.
// 고르면 같은 창에서 결과를 보여 주고, '확인'으로 닫는다.
// 선수단을 살펴보고 정하고 싶으면 잠시 닫을 수 있고, '결정 필요' 버튼(또는 스페이스)으로 다시 연다.
import { useEffect, useRef } from 'react';
import { describeEvent } from '@/game/team/people';
import type { Act, PlayingState } from '@/components/shared/ui';

// 사건마다 하나씩 붙는 이름 (같은 날 같은 사건이면 같은 값)
export const eventKey = (S: PlayingState) => (S.career.event ? `${S.career.year}-${S.career.dayIndex}-${S.career.event.key}` : null);
// 방금 고른 사건의 결과 (그날에만)
export const resultKey = (S: PlayingState) => {
  const last = S.lastEvent;
  return last && last.day === S.career.dayIndex ? `${S.career.year}-${last.day}-${last.title}` : null;
};

export default function EventModal({ S, act, onClose }: { S: PlayingState; act: Act; onClose: () => void }) {
  const c = S.career;
  const view = c.event ? describeEvent(c, c.event) : null;
  const last = !view && S.lastEvent?.day === c.dayIndex ? S.lastEvent : null;
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, [view?.title, last?.title]);
  // Esc로 닫는다 (결정은 미뤄질 뿐 사라지지 않는다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!view && !last) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal event-modal" role="dialog" aria-modal="true" aria-labelledby="event-title" onClick={(e) => e.stopPropagation()}>
        {view ? (
          <>
            <span className="eyebrow">오늘의 결정 · {view.from}</span>
            <h2 id="event-title">{view.title}</h2>
            <div>{view.body.map((line) => <p key={line} style={{ margin: '0 0 8px' }}>{line}</p>)}</div>
            <div className="opts event-opts">
              {view.options.map((o, i) => (
                <button key={o.label} ref={i === 0 ? first : undefined} className="opt" onClick={() => act('eventChoice', i)}>
                  <b>{o.label}</b><span>{o.hint}</span>
                </button>
              ))}
            </div>
            <div className="row event-foot">
              <span className="hint">결정을 내려야 오늘 하루를 진행할 수 있습니다.</span>
              <button className="btn ghost small" onClick={onClose} title="선수단 등을 살펴본 뒤 '결정 필요' 버튼으로 다시 열 수 있습니다">잠시 닫기</button>
            </div>
          </>
        ) : last && (
          <>
            <span className="eyebrow">오늘의 결정 · 결과</span>
            <h2 id="event-title">{last.title}</h2>
            <p className="muted" style={{ margin: 0 }}>감독의 결정: <b>{last.chosen}</b></p>
            <ul className="lines">{last.result.map((line) => <li key={line}><span>{line}</span></li>)}</ul>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button ref={first} className="btn primary" onClick={onClose}>확인</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
