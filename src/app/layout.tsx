import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Barlow_Condensed } from 'next/font/google';
// 본문 글꼴: Pretendard (한글 UI용 가변 글꼴, 쓰는 글자만 조각으로 내려받는다)
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';
import './theme.css'; // 게임풍 겉모습 (globals.css 위에 덧입힌다)

// 숫자·제목용 글꼴: 전광판 같은 좁은 글꼴. 한글은 들어 있지 않아 숫자와 영문에만 쓰이고, 한글은 본문 글꼴로 나온다
const display = Barlow_Condensed({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-display', display: 'swap' });

export const metadata: Metadata = {
  title: '고교 농구 매니저',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // 브라우저 확장 프로그램(클립보드 등)이 <html>에 속성을 끼워 넣어 생기는 hydration 경고를 무시
    <html lang="ko" className={display.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
