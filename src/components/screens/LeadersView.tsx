// 리더보드: 선수별 경기당 기록 순위. 우리 현 선수(올해 공식전)와, 지금 대회에 나온 모든 선수를 바꿔 본다.
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { leaderboard } from '@/game/career/season';
import type { BoardKey, BoardRow } from '@/game/types';
import { Crest, PosBadge, SchoolName, Seg, Sheet } from '@/components/shared/ui';
import type { ViewProps } from '@/components/shared/ui';

type Scope = 'pref' | 'comp';
const COLS: { key: BoardKey; label: string; title: string; group?: boolean }[] = [
  { key: 'gp', label: '경기', title: '출전 경기', group: true },
  { key: 'min', label: '분', title: '경기당 출전 시간' },
  { key: 'pts', label: '득점', title: '경기당 득점', group: true },
  { key: 'reb', label: '리바운드', title: '경기당 리바운드' },
  { key: 'ast', label: '어시스트', title: '경기당 어시스트' },
  { key: 'stl', label: '스틸', title: '경기당 스틸' },
  { key: 'blk', label: '블록', title: '경기당 블록' },
  { key: 'fg', label: '야투%', title: '야투 성공률 (경기당 4개 이상 던진 선수만 순위에 든다)', group: true },
  { key: 'tp', label: '3점%', title: '3점슛 성공률 (경기당 2개 이상 던진 선수만 순위에 든다)' },
];
const LIMIT = 50; // 표에 보여 줄 줄 수

// 성공률 순위는 슛을 어느 정도 던진 선수만 (한두 개 던져 100%인 선수가 1위가 되지 않게)
const qualifies = (r: BoardRow, key: BoardKey) => (key === 'fg' ? r.fga >= 4 : key === 'tp' ? r.tpa >= 2 : true);
const value = (r: BoardRow, key: BoardKey) => r[key] ?? -1;
const show = (r: BoardRow, key: BoardKey) => {
  if (key === 'gp') return String(r.gp);
  if (key === 'fg' || key === 'tp') return r[key] == null ? '-' : `${r[key]!.toFixed(1)}%`;
  return r[key].toFixed(1);
};

export default function LeadersView({ S, act }: ViewProps) {
  const c = S.career;
  const [scope, setScope] = useState<Scope>('pref');
  const [sort, setSort] = useState<BoardKey>('pts');
  const all = useMemo(() => leaderboard(c, scope), [c, scope, c.dayIndex, c.year]);
  const rows = useMemo(
    () => all.filter((r) => qualifies(r, sort)).sort((a, b) => value(b, sort) - value(a, sort) || b.pts - a.pts).slice(0, LIMIT),
    [all, sort],
  );
  const compName = c.compStats?.name;
  const scopes = { pref: c.prefecture, comp: compName ? `${compName}` : '대회' };
  const sub = scope === 'pref'
    ? `${c.year}년차 공식전 · 2경기 이상 나온 ${c.prefecture} 선수 ${all.length}명`
    : compName ? `${compName} · 현 예선과 전국 대회에 나온 모든 선수 ${all.length}명` : '대회 기록';
  const empty = scope === 'comp' && !c.compStats
    ? ['대회 기록이 아직 없습니다', '다음 대회가 시작되면 그 대회에 나온 선수들의 기록이 여기에 쌓입니다.']
    : scope === 'pref'
      ? ['아직 순위에 든 선수가 없습니다', '공식전을 2경기 이상 치른 선수부터 순위에 오릅니다.']
      : ['아직 순위에 든 선수가 없습니다', '이 대회의 경기가 열리면 기록이 쌓입니다.'];

  return (
    <Sheet
      icon="chart"
      title="리더보드"
      sub={`${sub} · 머리글을 누르면 그 기록 순으로`}
      actions={<Seg options={scopes} value={scope} onChange={(v) => setScope(v as Scope)} />}
    >
      {rows.length ? (
        <table className="gt" style={{ '--rows': rows.length } as CSSProperties}>
          <thead>
            <tr className="gcols solo">
              <th className="rank">순위</th>
              <th className="stick">선수</th>
              <th className="l">학교</th>
              <th>포지션</th>
              {COLS.map((col) => (
                <th key={col.key} title={col.title} className={`sortable ${col.group ? 'gb' : ''} ${sort === col.key ? 'sorted' : ''}`} onClick={() => setSort(col.key)}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              // 우리 선수는 누르면 선수 상세로 간다
              <tr key={r.id} className={r.mine ? 'me click' : ''} onClick={r.mine ? () => act('player', r.id) : undefined}>
                <td className={`rank ${i < 3 ? 'top' : ''}`}>{i + 1}</td>
                <td className="stick"><span className="gt-name"><b>{r.name}</b></span></td>
                <td className="l">
                  <span className="lb-school"><Crest name={r.team} size={18} />{r.local ? <SchoolName id={r.teamId} name={r.team} onPick={(id) => act('school', id)} /> : r.team}</span>
                </td>
                <td>{r.pos ? <PosBadge pos={r.pos} /> : '-'}</td>
                {COLS.map((col) => (
                  <td key={col.key} className={`${col.group ? 'gb' : ''} ${sort === col.key ? 'hot' : ''}`}>{show(r, col.key)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="sheet-empty"><b>{empty[0]}</b><span>{empty[1]}</span></div>
      )}
    </Sheet>
  );
}
