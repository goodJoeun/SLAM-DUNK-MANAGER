// 하프 코트 위에 다섯 자리를 그린다. 순서 = 포지션 1~5 슬롯 (엔진의 코트 순서와 같다).
import { POS, condClass } from '@/components/shared/ui';

export interface CourtPlayer {
  id: string;
  name: string;
  note: string; // 이름 아래 작은 글씨
  energy?: number; // 0~100. 있으면 체력 고리를 그린다
  selected?: boolean;
  out?: boolean;
}

const SLOTS: [number, number][] = [[150, 206], [250, 150], [50, 150], [206, 76], [94, 76]];
const RING = 2 * Math.PI * 21;

export default function Court({ players, onPick }: { players: CourtPlayer[]; onPick?: (id: string) => void }) {
  return (
    <svg className="court" viewBox="0 0 300 270" role="img" aria-label="코트 위 다섯 명의 배치">
      <rect className="floor" x="0" y="0" width="300" height="270" rx="6" />
      <rect className="ln" x="4" y="4" width="292" height="262" rx="4" />
      <path className="ln" d="M20 4V60A135 135 0 0 0 280 60V4" />
      <rect className="ln" x="110" y="4" width="80" height="112" />
      <circle className="ln" cx="150" cy="116" r="32" />
      <line className="ln" x1="128" y1="18" x2="172" y2="18" />
      <circle className="ln" cx="150" cy="26" r="6" />
      <path className="ln" d="M110 266A40 40 0 0 1 190 266" />
      {players.slice(0, 5).map((p, i) => {
        const [x, y] = SLOTS[i];
        return (
          <g
            key={p.id}
            transform={`translate(${x} ${y})`}
            className={`${onPick ? 'pick' : ''} ${p.selected ? 'sel' : ''} ${p.out ? 'out' : ''}`}
            onClick={onPick ? () => onPick(p.id) : undefined}
          >
            {p.energy != null && (
              <>
                <circle className="ring-bg" r="21" />
                <circle className={`ring ${condClass(p.energy)}`} r="21" strokeDasharray={`${(RING * p.energy) / 100} ${RING}`} transform="rotate(-90)" />
              </>
            )}
            <circle className="dot" r="16" />
            <text className="lbl" y="4">{POS[i + 1]}</text>
            <text className="nm" y="37">{p.name}</text>
            <text className="ov" y="50">{p.note}</text>
          </g>
        );
      })}
    </svg>
  );
}
