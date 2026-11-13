# SLAM-DUNK-MANAGER
유명 만화 '슬램덩크'를 배경으로 하는 농구팀 운영 시뮬레이션 게임

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 프로덕션 빌드
npm run typecheck
```

## 구조

- `src/app/` — Next.js(App Router) 진입점과 전역 스타일
- `src/components/` — React 화면. `useGame.ts`가 상태와 입력을 맡고, 나머지는 화면별 컴포넌트다
- `src/game/` — 경기 엔진·시즌·학교 로직(TypeScript). React나 브라우저에 의존하지 않는다. 공용 타입은 `types.ts`에 있다
- `scripts/` — 엔진만 돌려 보는 Node 스크립트 (`npm run sim`, `npm run game`)
