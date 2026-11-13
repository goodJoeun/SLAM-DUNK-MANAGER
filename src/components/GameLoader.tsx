'use client';

// 게임은 localStorage 세이브와 무작위 시드에 의존하므로 서버에서 미리 그리지 않는다.
import dynamic from 'next/dynamic';

const Game = dynamic(() => import('./Game'), { ssr: false });

export default function GameLoader() {
  return <Game />;
}
