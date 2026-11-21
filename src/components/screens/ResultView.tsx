// 경기 결과 화면: 직접 지휘한 경기든 결과만 본 경기든, 끝나면 이 화면에서 기록을 보고 홈으로 돌아간다.
// 위에 최종 점수와 쿼터별 점수, 그 아래 탭(박스스코어·슛 분포·중계 기록·코치 총평), 맨 아래에 다음으로 가는 버튼.
import { useMemo, useState } from 'react';
import { keyMoments, playerRating, reviewMatch } from '@/game/match/review';
import { teamOverall } from '@/game/team/school';
import type { BoxPlayer, BoxTeam, LogEvent, ShotType } from '@/game/types';
import type { ActiveMatch } from '@/state/useGame';
import { KEY_EVENT } from '@/state/live';
import Portrait from '@/components/shared/Portrait';
import { Attr, Crest, Icon, PosBadge, Rating, Seg, clubVars, condClass } from '@/components/shared/ui';
import type { ViewProps } from '@/components/shared/ui';

type Tab = 'box' | 'shots' | 'log' | 'review';
const TABS: [Tab, string][] = [['box', '박스스코어'], ['shots', '슛 분포'], ['log', '중계 기록'], ['review', '코치 총평']];
const SHOTS: [ShotType, string][] = [['rim', '골밑슛'], ['post', '포스트업'], ['mid', '미들슛'], ['three', '3점슛']];

const pctText = (made: number, tried: number) => (tried ? `${((100 * made) / tried).toFixed(1)}%` : '-');
const sum = (t: BoxTeam, f: (p: BoxPlayer) => number) => t.players.reduce((s, p) => s + f(p), 0);

// 쿼터별 득점: 중계 기록에서 각 쿼터의 마지막 점수를 찾아 앞 쿼터와의 차이를 구한다
function quarterScores(log: LogEvent[], final: [number, number]) {
  const ends: [number, number][] = [];
  for (const e of log) {
    const [x, y] = e.score.split('-').map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) ends[e.period - 1] = [x, y];
  }
  if (ends.length) ends[ends.length - 1] = final;
  return ends.map((q, i) => { const prev = ends[i - 1] ?? [0, 0]; return [q[0] - prev[0], q[1] - prev[1]]; });
}

// 슛 종류별 성공/시도 (블록당한 슛은 수비 쪽 줄로 적히므로 반대편의 실패로 센다)
function shotMix(log: LogEvent[]) {
  const mix = [0, 1].map(() => Object.fromEntries(SHOTS.map(([k]) => [k, { made: 0, tried: 0 }])) as Record<ShotType, { made: number; tried: number }>);
  for (const e of log) {
    const i = e.info;
    if (!i?.shot) continue;
    if (i.kind === 'shot') { mix[e.side][i.shot].tried++; if (i.made) mix[e.side][i.shot].made++; }
    else if (i.kind === 'block') mix[1 - e.side][i.shot].tried++;
  }
  return mix;
}

function BoxTable({ team, energy, faces, mvp, mine }: { team: BoxTeam; energy: Record<string, number>; faces: Record<string, string>; mvp: string | null; mine: boolean }) {
  const played = [...team.players].sort((a, b) => Number(b.starter) - Number(a.starter) || b.sec - a.sec);
  const t = (f: (p: BoxPlayer) => number) => sum(team, f);
  return (
    <section className={`rs-panel ${mine ? 'mine' : ''}`} style={clubVars(team.name)}>
      <header><Crest name={team.name} size={26} /><b>{team.name}</b>{mine && <span className="pill club">우리 팀</span>}</header>
      <div className="table-wrap">
        <table className="gt rs-table">
          <thead>
            <tr className="gcols solo">
              <th className="stick">선수</th><th>포지션</th><th>종합</th><th title="경기가 끝났을 때의 체력">체력</th>
              <th className="gb">분</th><th>득점</th><th>리바</th><th>어시</th><th>스틸</th><th>블록</th><th>실책</th><th>파울</th>
              <th className="gb">야투</th><th>야투%</th><th>3점</th><th>3점%</th><th>자유투</th><th>자유투%</th>
              <th className="gb" title="기록을 종합한 10점 만점 평점">평점</th>
            </tr>
          </thead>
          <tbody>
            {played.map((p, i) => {
              const en = energy[p.id];
              return (
                <tr key={p.id} className={`${p.sec ? '' : 'dim'} ${i === 5 ? 'sep' : ''} ${mvp === p.id ? 'mvp' : ''}`}>
                  <td className="stick">
                    <span className="name-cell">
                      <Portrait name={p.name} src={faces[p.id]} size={24} round />
                      <span className="gt-name"><b>{p.name}{mvp === p.id && <i className="rs-mvp" title="이 경기 최고 평점"> ★ MVP</i>}</b></span>
                    </span>
                  </td>
                  <td><PosBadge pos={p.pos} /></td>
                  <td><Attr v={p.ovr} /></td>
                  <td>{en == null ? '-' : <b className={`rs-en ${condClass(en)}`}>{en}</b>}</td>
                  <td className="gb">{Math.round(p.sec / 60)}</td>
                  <td><b>{p.pts}</b></td><td>{p.orb + p.drb}</td><td>{p.ast}</td><td>{p.stl}</td><td>{p.blk}</td><td>{p.tov}</td>
                  <td className={p.pf >= 5 ? 'bad' : ''}>{p.pf}</td>
                  <td className="gb">{p.fgm}/{p.fga}</td><td>{pctText(p.fgm, p.fga)}</td>
                  <td>{p.tpm}/{p.tpa}</td><td>{pctText(p.tpm, p.tpa)}</td>
                  <td>{p.ftm}/{p.fta}</td><td>{pctText(p.ftm, p.fta)}</td>
                  <td className="gb">{p.sec ? <Rating v={playerRating(p)} /> : '-'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="stick">팀 합계</td><td /><td /><td />
              <td className="gb">{Math.round(t((p) => p.sec) / 60)}</td>
              <td>{t((p) => p.pts)}</td><td>{t((p) => p.orb + p.drb)}</td><td>{t((p) => p.ast)}</td><td>{t((p) => p.stl)}</td><td>{t((p) => p.blk)}</td><td>{t((p) => p.tov)}</td><td>{t((p) => p.pf)}</td>
              <td className="gb">{t((p) => p.fgm)}/{t((p) => p.fga)}</td><td>{pctText(t((p) => p.fgm), t((p) => p.fga))}</td>
              <td>{t((p) => p.tpm)}/{t((p) => p.tpa)}</td><td>{pctText(t((p) => p.tpm), t((p) => p.tpa))}</td>
              <td>{t((p) => p.ftm)}/{t((p) => p.fta)}</td><td>{pctText(t((p) => p.ftm), t((p) => p.fta))}</td>
              <td className="gb" />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export default function ResultView({ S, act, match: m, faces }: ViewProps & { match: ActiveMatch; faces: Record<string, string> }) {
  const result = m.game.result();
  const view = m.game.view();
  const [h, a] = view.teams;
  const box = result.box;
  const log = result.log;
  const mine = view.teams[m.side];
  const won = mine.score > view.teams[1 - m.side].score;
  const [tab, setTab] = useState<Tab>('box');
  const [keyOnly, setKeyOnly] = useState(true);
  const quarters = useMemo(() => quarterScores(log, [h.score, a.score]), [log, h.score, a.score]);
  const mix = useMemo(() => shotMix(log), [log]);
  const energy = Object.fromEntries(view.teams.flatMap((t) => [...t.court, ...t.bench]).map((p) => [p.id, p.energy]));
  const everyone = box.flatMap((t) => t.players).filter((p) => p.sec > 0);
  const mvp = everyone.length ? everyone.reduce((x, y) => (playerRating(y) > playerRating(x) ? y : x)).id : null;
  const strength = (i: number) => { const t = S.career.teams[view.teams[i].id ?? '']; return t ? teamOverall(t) : null; };
  const expected = strength(m.side) != null && strength(1 - m.side) != null ? [strength(m.side)!, strength(1 - m.side)!] as [number, number] : undefined;
  const review = useMemo(() => reviewMatch(box[m.side], box[1 - m.side], mine.tactics, expected), [box, m.side]);
  const moments = useMemo(() => keyMoments(log, m.side), [log, m.side]);
  const lines = keyOnly ? log.filter((e) => KEY_EVENT.test(e.text)) : log;
  const teamSide = (i: number) => (
    <div className={`rs-team ${i === 1 ? 'away' : ''} ${view.teams[i].score < view.teams[1 - i].score ? 'lost' : ''}`} style={clubVars(view.teams[i].name)}>
      <div className="rs-who"><b>{view.teams[i].name}</b><span className="rs-score">{view.teams[i].score}</span></div>
      <Crest name={view.teams[i].name} size={60} />
    </div>
  );

  return (
    <div className="result">
      <header className="rs-head">
        {teamSide(0)}
        <div className="rs-mid">
          <span className="eyebrow">경기 종료 · {m.label}{result.periods > 4 ? ' · 연장' : ''}</span>
          <span className={`rs-pill ${won ? 'win' : 'lose'}`}>{won ? '승리' : '패배'}</span>
          {quarters.length > 1 && (
            <table className="rs-quarters">
              <thead><tr><th />{quarters.map((_, i) => <th key={i}>{i < 4 ? i + 1 : `연${i - 3}`}</th>)}</tr></thead>
              <tbody>
                {[h, a].map((t, s) => <tr key={t.name}><td>{t.name}</td>{quarters.map((q, i) => <td key={i}>{q[s]}</td>)}</tr>)}
              </tbody>
            </table>
          )}
        </div>
        {teamSide(1)}
      </header>

      <nav className="rs-tabs" role="tablist">
        {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}
      </nav>

      <div className="rs-body">
        {tab === 'box' && box.map((t, i) => <BoxTable key={t.name} team={t} energy={energy} faces={faces} mvp={mvp} mine={i === m.side} />)}

        {tab === 'shots' && (
          <section className="rs-panel">
            <header><b>슛 분포</b><span className="muted">어디서 쏘고 얼마나 넣었는지</span></header>
            <div className="table-wrap">
              <table className="gt rs-table rs-shots">
                <thead>
                  <tr className="gcols solo">
                    <th className="stick">슛 종류</th>
                    {[h, a].map((t) => <th key={t.name} className="gb" colSpan={3}>{t.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {SHOTS.map(([k, label]) => (
                    <tr key={k}>
                      <td className="stick">{label}</td>
                      {[0, 1].map((s) => {
                        const x = mix[s][k];
                        const all = SHOTS.reduce((n, [key]) => n + mix[s][key].tried, 0);
                        return [
                          <td key={`${s}a`} className="gb"><b>{x.made}/{x.tried}</b></td>,
                          <td key={`${s}b`}>{pctText(x.made, x.tried)}</td>,
                          <td key={`${s}c`} className="rs-share" title="이 팀 전체 슛 가운데 이 종류의 비중">
                            <span><i style={{ width: `${all ? (100 * x.tried) / all : 0}%` }} /></span>{all ? Math.round((100 * x.tried) / all) : 0}%
                          </td>,
                        ];
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'log' && (
          <section className="rs-panel">
            <header>
              <b>중계 기록</b><span className="muted">{lines.length}줄 · 점수는 {h.name} - {a.name} 순</span>
              <span className="spacer" />
              <Seg options={[['key', '주요 장면'], ['all', '전체']]} value={keyOnly ? 'key' : 'all'} onChange={(v) => setKeyOnly(v === 'key')} />
            </header>
            <div className="feed rs-log">
              {lines.map((e, i) => (
                <div key={i} className={`${e.team === mine.name ? 'mine' : ''} ${i > 0 && lines[i - 1].period !== e.period ? 'q-start' : ''}`}>
                  <span className="t">{e.period > 4 ? '연장' : `${e.period}Q`} {e.clock}</span>
                  <span className="t">{e.score}</span>
                  <span>{e.text}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'review' && (
          <section className="rs-panel">
            <header><b>코치 총평</b><span className="muted">승부를 가른 지점과 전술이 통했는지</span></header>
            <ul className="rs-review">{review.map((l) => <li key={l}>{l}</li>)}</ul>
            {moments.length > 0 && (
              <>
                <header><b>승부처</b></header>
                <ul className="rs-review">{moments.map((l) => <li key={l}>{l}</li>)}</ul>
              </>
            )}
          </section>
        )}
      </div>

      <footer className="rs-cta">
        <button className="btn" onClick={() => act('finish', 'report')}>받은 소식에서 보고서 보기</button>
        <button className="btn primary rs-go" autoFocus onClick={() => act('finish', 'home')}>홈으로 이동<Icon name="next" /></button>
      </footer>
    </div>
  );
}
