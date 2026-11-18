// 원작 선수 초상화 연결:  npm run portraits
// public/portraits/ 의 이미지 중 파일 이름이 src/game/data/portraits.ts 의 슬러그와 같은 것을 찾아
// src/game/data/portrait-files.json 에 기록한다. 게임은 이 목록에 있는 파일만 불러온다(없는 파일을 요청하지 않는다).
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORTRAIT_SLUGS } from '../../src/game/data/portraits.ts';

const root = join(fileURLToPath(import.meta.url), '..', '..', '..');
const dir = join(root, 'public', 'portraits');
const out = join(root, 'src', 'game', 'data', 'portrait-files.json');
const EXTS = ['.webp', '.png', '.jpg', '.jpeg', '.avif'];

const files = existsSync(dir) ? readdirSync(dir).filter((f) => EXTS.includes(extname(f).toLowerCase())) : [];
const bySlug = new Map<string, string>();
for (const f of files) {
  const slug = basename(f, extname(f)).toLowerCase();
  if (bySlug.has(slug)) console.warn(`  같은 이름의 파일이 여러 개입니다: ${bySlug.get(slug)}, ${f} -> ${bySlug.get(slug)} 사용`);
  else bySlug.set(slug, f);
}

const manifest: Record<string, string> = {};
const missing: string[] = [];
for (const [name, slug] of Object.entries(PORTRAIT_SLUGS)) {
  const file = bySlug.get(slug);
  if (file) manifest[slug] = file;
  else missing.push(`${name} (${slug})`);
}
const known = new Set(Object.values(PORTRAIT_SLUGS));
const unknown = files.filter((f) => !known.has(basename(f, extname(f)).toLowerCase()));

writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);

const total = Object.keys(PORTRAIT_SLUGS).length;
console.log(`연결됨 ${Object.keys(manifest).length}/${total}명 -> src/game/data/portrait-files.json`);
if (unknown.length) console.log(`\n이름이 맞지 않아 쓰지 않은 파일 ${unknown.length}개:\n  ${unknown.join('\n  ')}`);
if (missing.length && missing.length < total) console.log(`\n이미지가 없는 선수 ${missing.length}명:\n  ${missing.join('\n  ')}`);
if (missing.length === total) console.log('\npublic/portraits/ 에 이미지가 없습니다. 파일 이름 규칙은 public/portraits/README.md 를 보세요.');
