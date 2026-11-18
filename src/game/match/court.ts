// 풀코트 좌표와 "장면" 형식. 화면은 장면(선수 10명과 공의 위치)만 받아서 그린다.
//
// 지금은 components/court/choreo.ts 가 엔진의 경기 기록을 보고 장면을 연출해 만든다(연출형).
// 나중에 선수 위치를 직접 계산하는 엔진(공간 시뮬레이션형)을 만들면, 그 엔진이 같은 Timeline을 내놓기만 하면
// 화면은 그대로 쓸 수 있다.

// FIBA 규격 (m). 원점은 왼쪽 아래 모서리, x는 길이 방향(0~28), y는 폭 방향(0~15).
export const COURT = {
  length: 28,
  width: 15,
  basketInset: 1.575, // 끝선에서 림 중심까지
  three: 6.75, // 3점 라인 반지름
  threeCorner: 6.6, // 코너 3점 라인이 가운데 선에서 떨어진 거리
  keyWidth: 4.9,
  keyLength: 5.8, // 끝선에서 자유투 라인까지
  circle: 1.8, // 자유투·센터 서클 반지름
  restricted: 1.25,
} as const;

export interface Point { x: number; y: number }

// 공격 방향 기준 좌표: u = 공격하는 쪽 끝선에서 떨어진 거리, v = 코트 가운데 선에서 옆으로 떨어진 거리
export interface AttackPoint { u: number; v: number }

// 홈(0)은 전반에 오른쪽 림을 공격하고, 후반·연장에 왼쪽을 공격한다
export const attacksRight = (side: number, period: number) => (side === 0) === (period <= 2);

export const toCourt = (p: AttackPoint, right: boolean): Point =>
  right ? { x: COURT.length - p.u, y: COURT.width / 2 - p.v } : { x: p.u, y: COURT.width / 2 + p.v };

export const fromCourt = (p: Point, right: boolean): AttackPoint =>
  right ? { u: COURT.length - p.x, v: COURT.width / 2 - p.y } : { u: p.x, v: p.y - COURT.width / 2 };

// ---------- 장면 ----------

export interface ScenePlayer extends Point {
  id: string;
  side: number; // 0 홈, 1 원정
  slot: number; // 코트 위 자리 0~4 (= 포지션 1~5)
}

export interface SceneBall extends Point {
  holder: string | null; // 공을 가진 선수. 없으면 공중이나 바닥에 있다
  z?: number; // 0~1, 슛한 공의 높이 (그리기용)
}

export interface Scene {
  players: ScenePlayer[];
  ball: SceneBall;
  caption?: string; // 지금 무슨 장면인지 짧은 설명 (픽앤롤, 작전 타임 ...)
}

export interface TimelineKey {
  t: number; // 시작부터 ms
  scene: Scene;
  arc?: boolean; // 이 키까지 공이 포물선으로 날아간다 (슛·자유투)
  caption?: string; // 이 키로 가는 동안 보여 줄 설명
}

// 한 공격권 동안의 움직임. 키 사이는 화면이 부드럽게 이어 그린다.
export interface Timeline {
  duration: number; // ms
  keys: TimelineKey[];
}
