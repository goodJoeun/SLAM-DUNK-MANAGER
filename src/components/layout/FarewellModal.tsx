// 3학년의 마지막 경기: 올해 내 팀의 마지막 경기가 끝나면 은퇴하는 3학년을 돌아보는 창을 띄운다.
// 같은 내용이 받은 소식에도 남는다 (FarewellList).
import { useEffect, useRef } from 'react';
import type { Farewell } from '@/game/types';
import { farewellLead, farewellNext } from '@/state/inbox';
import { Attr, PosBadge } from '@/components/shared/ui';

export function FarewellList({ f }: { f: Farewell }) {
  return (
    <ul className="lines">
      {f.players.map((p) => (
        <li key={p.id}>
          <span>
            <PosBadge pos={p.pos} /> <b>{p.name}</b>
            <span className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>
              {p.games
                ? `공식전 ${p.games}경기 · 평균 ${p.pts.toFixed(1)}점 ${p.reb.toFixed(1)}리바운드 ${p.ast.toFixed(1)}어시스트`
                : '공식전 출전 없음 · 묵묵히 훈련을 함께했습니다'}
              {p.best && ` · 최고 ${p.best.pts}점 (${p.best.year}년차 ${p.best.opponent}전)`}
            </span>
          </span>
          <span className="row" style={{ flexWrap: 'nowrap' }}>
            {p.from && p.from.ovr !== p.ovr && <span className="muted" title={p.from.joined ? '입학 때의 종합 능력치' : '감독 부임 때의 종합 능력치'}>{p.from.joined ? '입학' : '부임'} {p.from.ovr} →</span>}
            <Attr v={p.ovr} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function FarewellModal({ f, onClose }: { f: Farewell; onClose: () => void }) {
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => { ok.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal event-modal" role="dialog" aria-modal="true" aria-labelledby="farewell-title" onClick={(e) => e.stopPropagation()}>
        <span className="eyebrow">{f.year}년차 · 시즌 종료</span>
        <h2 id="farewell-title">3학년의 마지막 경기</h2>
        <p style={{ margin: 0 }}>{farewellLead(f)}</p>
        <FarewellList f={f} />
        <p className="hint" style={{ margin: 0 }}>{farewellNext(f)}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button ref={ok} className="btn primary" onClick={onClose}>수고했다</button>
        </div>
      </div>
    </div>
  );
}
