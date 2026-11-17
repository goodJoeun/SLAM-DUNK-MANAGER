// 선수 초상화. 이미지(올린 것이나 연결된 원작 이미지)가 있으면 그것을, 없으면 회색 사람 모양의 기본 그림을 보여 준다.
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { ORIGINAL } from '@/game/data/original';
import { PORTRAIT_SLUGS } from '@/game/data/portraits';
import portraitFiles from '@/game/data/portrait-files.json';
import type { Player } from '@/game/types';

// 원작 선수 이름(한국어판·원작 표기 모두) -> public/portraits/ 의 이미지 주소. npm run portraits 로 연결된 파일만 담긴다.
const FILES = portraitFiles as Record<string, string>;
const LICENSED = new Map<string, string>();
for (const spec of [...ORIGINAL.schools, ...ORIGINAL.nationals].flatMap((s) => s.players)) {
  const slug = PORTRAIT_SLUGS[spec.name.kr];
  const file = slug && FILES[slug];
  if (!file) continue;
  const url = `/portraits/${encodeURIComponent(file)}`;
  LICENSED.set(spec.name.kr, url);
  LICENSED.set(spec.name.jp, url);
}

// 원작 선수면 연결된 이미지 주소, 아니면 undefined
export const licensedPortrait = (p: Player) => (p.fixed ? LICENSED.get(p.name) : undefined);

// 이미지가 없는 선수의 기본 그림: 회색 사람 모양
function Avatar() {
  return (
    <svg className="blank" viewBox="0 0 64 64" aria-hidden="true">
      <rect className="bg" width="64" height="64" />
      <circle cx="32" cy="25" r="12" />
      <path d="M8 64c0-15 10-23 24-23s24 8 24 23z" />
    </svg>
  );
}

export default function Portrait({ name, src, size = 48, round = false }: {
  name: string;
  src?: string; // 보여 줄 이미지 주소
  size?: number;
  round?: boolean;
}) {
  // 이미지를 불러오지 못하면(파일이 지워졌거나 깨졌으면) 기본 그림으로 돌아간다
  const [failed, setFailed] = useState<string | null>(null);
  const show = src && src !== failed ? src : null;
  return (
    <span className={`portrait ${round ? 'round' : ''}`} style={{ width: size, height: size }}>
      {show
        // 연결된 원작 이미지는 세로로 긴 상반신이라, 작은 크기에서는 얼굴 쪽으로 당겨 보여 준다
        ? <img className={size <= 40 && show.startsWith('/portraits/') ? 'face' : undefined} src={show} alt={`${name} 이미지`} onError={() => setFailed(show)} />
        : <Avatar />}
    </span>
  );
}

const MAX_BYTES = 10 * 1024 * 1024;
const OUT_SIZE = 256;

// 올린 이미지를 정사각형으로 잘라 줄인다 (세로가 길면 얼굴이 있는 위쪽을 남긴다)
async function toPortrait(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = Math.max(0, (img.naturalHeight - side) * 0.2);
    const canvas = document.createElement('canvas');
    canvas.width = OUT_SIZE;
    canvas.height = OUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(img, sx, sy, side, side, 0, 0, OUT_SIZE, OUT_SIZE);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// 선수 상세 화면의 이미지 올리기·되돌리기
export function PortraitEditor({ hasCustom, onSet, onClear }: {
  hasCustom: boolean;
  onSet: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일을 다시 골라도 반응하도록
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('이미지 파일만 올릴 수 있습니다.'); return; }
    if (file.size > MAX_BYTES) { setError('10MB 이하의 이미지만 올릴 수 있습니다.'); return; }
    try {
      onSet(await toPortrait(file));
      setError(null);
    } catch {
      setError('이미지를 읽지 못했습니다. 다른 파일로 시도해 주세요.');
    }
  }

  return (
    <div className="portrait-edit">
      <input ref={input} type="file" accept="image/*" hidden onChange={onFile} />
      <button className="btn small" onClick={() => input.current?.click()}>{hasCustom ? '이미지 바꾸기' : '이미지 올리기'}</button>
      {hasCustom && <button className="btn small ghost" onClick={onClear}>올린 이미지 지우기</button>}
      {error && <span className="bad hint">{error}</span>}
    </div>
  );
}
