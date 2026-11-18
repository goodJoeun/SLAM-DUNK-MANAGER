import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './theme.css'; // 게임풍 겉모습 (globals.css 위에 덧입힌다)

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
    <html lang="ko" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
