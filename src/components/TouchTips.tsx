'use client';

// 터치 화면에는 마우스를 올려 보는 설명(title)이 없다. 설명이 달린 글자·표시를 누르면 화면 아래에 잠깐 띄운다.
import { useEffect, useState } from 'react';

const SHOW_MS = 4500;

export default function TouchTips() {
  const [tip, setTip] = useState<string | null>(null);

  useEffect(() => {
    if (!window.matchMedia('(hover: none), (max-width: 860px)').matches) return;
    let timer = 0;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[title]');
      const text = el?.getAttribute('title');
      window.clearTimeout(timer);
      // 누르면 바로 동작하는 버튼·입력은 건너뛴다 (그 동작이 설명을 대신한다)
      if (!el || !text || el.closest('button, a, select, input, label')) { setTip(null); return; }
      setTip(text);
      timer = window.setTimeout(() => setTip(null), SHOW_MS);
    };
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('click', onClick); window.clearTimeout(timer); };
  }, []);

  return tip ? <div className="touch-tip" role="status">{tip}</div> : null;
}
