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
- `src/components/` — React 화면
  - `Game.tsx`, `GameLoader.tsx` — 게임 진입점 (화면 고르기, 브라우저에서만 그리기)
  - `screens/` — 화면별 컴포넌트 (`HomeView`, `MatchView`, `SquadView` …)
  - `layout/` — 화면 틀 (`Shell`: 머리띠·메뉴, `TouchTips`: 터치 설명)
  - `court/` — 코트 그림 (`FullCourt`·`choreo`: 경기 중 풀코트 연출, `Court`: 전술 화면 하프 코트)
  - `shared/` — 여러 화면이 함께 쓰는 부품 (`ui.tsx`, `Portrait.tsx`)
- `src/state/` — 화면 상태와 입력. `useGame.ts`가 상태·세이브를 맡고, `live.ts`는 직접 지휘하는 경기의 진행, `inbox.ts`는 받은 소식을 만든다
- `src/game/` — 게임 로직(TypeScript). React나 브라우저에 의존하지 않는다
  - `types.ts`, `rng.ts` — 공용 타입과 시드 난수
  - `match/` — 경기 한 판: 엔진, 이어 하기용 조작 기록, 경기 후 총평, 코트 좌표
  - `team/` — 학교·선수: 훈련·성장, 성격·사기, 선수 생성, 이름, 데이터 명세로 팀 만들기
  - `career/` — 3년 캠페인 진행과 대회 형식
  - `coach/` — 코치의 전술 조언과 상대 분석 보고서
  - `data/` — 원작 학교·선수 데이터, 초상화 연결 목록
- `scripts/` — 엔진만 돌려 보는 Node 스크립트
  - `sim/` — 경기·캠페인 시뮬레이션 (`npm run sim`, `npm run game`)
  - `check/` — 엔진·데이터·재생이 탈 없이 도는지 확인
  - `balance/` — 전술·집중 마크·신입생 규칙 등 밸런스 측정
  - `assets/` — 초상화 연결 (`npm run portraits`)
