// 선수 초상화. 사용자가 올린 이미지가 있으면 그것을, 없으면 이름으로 정해지는 기본 그림을 보여 준다.
// 기본 그림은 이름에서 얼굴형·머리 모양·피부색·등번호를 고르고, 소속 학교 색 유니폼을 입힌다.
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { ORIGINAL } from '@/game/data/original';
import { PORTRAIT_SLUGS } from '@/game/data/portraits';
import portraitFiles from '@/game/data/portrait-files.json';
import type { Player } from '@/game/types';
import { clubHue } from './ui';

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

const SKIN = ['#f1c9a5', '#e6b691', '#d6a37c', '#c48b63'];
const HAIR_COLOR = ['#1c1a19', '#2b211c', '#3b2a1e', '#a8412a', '#5a4632'];
const HAIR = [
  'M21 27C20 15 27 12 32 12s12 3 11 15c-2-6-6-8-11-8s-9 2-11 8z', // 짧은 머리
  'M21.5 24c.5-9 5.5-10 10.5-10s10 1 10.5 10c-2.5-4-6.5-5-10.5-5s-8 1-10.5 5z', // 아주 짧게
  'M20 26l2-12 4 4 2-8 4 6 4-7 2 8 4-4 2 13c-3-6-7-7-12-7s-9 1-12 7z', // 삐죽 머리
  'M20 32C18 16 26 11 33 11s13 6 11 19c-2-8-6-12-13-11-5 1-8 5-9 14z', // 넘긴 머리
  'M20.5 28C19 14 26 10.5 32 10.5S45 14 43.5 28c-1-4-3-6-4.5-7-2 1.5-5 2-7 2s-5-.5-7-2c-1.5 1-3.5 3-4.5 7z', // 앞머리
];

function hash(text: string, salt: number) {
  let h = salt * 977 + 13;
  for (const ch of text) h = (h * 33 + (ch.codePointAt(0) ?? 0)) % 2147483647;
  return h;
}

// face: 작은 크기에서는 얼굴 부분만 잘라 보여 준다
function Avatar({ name, team, face }: { name: string; team: string; face: boolean }) {
  const hue = clubHue(team);
  const pick = <T,>(xs: T[], salt: number) => xs[hash(name, salt) % xs.length];
  const number = (hash(name, 5) % 15) + 4;
  return (
    <svg viewBox={face ? '13 9 38 38' : '0 0 64 64'} aria-hidden="true">
      <rect width="64" height="64" fill={`hsl(${hue} 30% 20%)`} />
      <circle cx="32" cy="30" r="26" fill={`hsl(${hue} 40% 28%)`} />
      <rect x="28" y="37" width="8" height="10" rx="2" fill={pick(SKIN, 1)} filter="brightness(.9)" />
      <path d="M5 64c2-13 12-18 27-18s25 5 27 18z" fill={`hsl(${hue} 62% 44%)`} />
      <path d="M24.5 46.5 32 53l7.5-6.5" fill="none" stroke={`hsl(${hue} 70% 78%)`} strokeWidth="2" />
      <text x="32" y="62" textAnchor="middle" fontSize="8" fontWeight="800" fill="#fff">{number}</text>
      <ellipse cx="32" cy="28" rx="11" ry="13" fill={pick(SKIN, 1)} />
      <ellipse cx="27.5" cy="29" rx="1.4" ry="1.6" fill="#2a2522" />
      <ellipse cx="36.5" cy="29" rx="1.4" ry="1.6" fill="#2a2522" />
      <path d="M29 35q3 1.5 6 0" fill="none" stroke="#7a4b3a" strokeWidth="1.2" strokeLinecap="round" />
      <path d={pick(HAIR, 2)} fill={pick(HAIR_COLOR, 3)} />
    </svg>
  );
}

export default function Portrait({ name, team, src, size = 48, round = false }: {
  name: string;
  team: string; // 유니폼 색을 정하는 소속 학교
  src?: string; // 사용자가 올린 이미지
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
        : <Avatar name={name} team={team} face={size <= 40} />}
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
