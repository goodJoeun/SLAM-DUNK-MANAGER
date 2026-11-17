import { useState } from 'react';
import { PREPARATION } from '@/game/season';
import type { Career } from '@/game/types';
import type { Message, MessageKind } from './inbox';
import type { Act } from './useGame';
import { Attr, BoxTable, GrowthList, Icon, PageTitle, PosBadge, ResultList, Seg, isUser, potentialStars, Stars } from './ui';
import type { IconName, ViewProps } from './ui';

const KIND_ICON: Record<MessageKind, IconName> = {
  welcome: 'inbox', match: 'ball', training: 'training', round: 'trophy', competition: 'trophy', injury: 'cross', season: 'squad', scout: 'tactics', event: 'squad',
};

// 목록 필터: 종류가 비슷한 소식끼리 묶어 본다
const FILTERS = { all: '전체', match: '경기·분석', training: '훈련·부상', comp: '대회', school: '학교' };
type FilterKey = keyof typeof FILTERS;
const FILTER_OF: Record<MessageKind, FilterKey> = {
  match: 'match', scout: 'match', training: 'training', injury: 'training', round: 'comp', competition: 'comp', welcome: 'school', season: 'school', event: 'school',
};

function MessageBody({ m, career, act }: { m: Message; career: Career; act: Act }) {
  switch (m.kind) {
    case 'match': {
      const box = m.box ?? [];
      const mine = box.find((t) => isUser(career, t.id)) ?? box[0];
      const opp = box.find((t) => t !== mine);
      return (
        <>
          <div className={`notice ${m.won ? 'good' : 'bad'}`}>{m.summary}</div>
          {m.moments && m.moments.length > 0 && <><h3>승부처</h3><ul className="lines">{m.moments.map((l) => <li key={l}><span>{l}</span></li>)}</ul></>}
          {m.review && m.review.length > 0 && <><h3>코치 총평</h3><ul className="lines">{m.review.map((l) => <li key={l}><span>{l}</span></li>)}</ul></>}
          {mine && <><h3>{mine.name}</h3><BoxTable team={mine} /></>}
          {opp && <><h3>{opp.name}</h3><BoxTable team={opp} /></>}
          {m.growth && m.growth.length > 0 && <><h3>경기 경험으로 오른 능력치</h3><GrowthList growth={m.growth} /></>}
        </>
      );
    }
    case 'training':
      return (
        <>
          <p className="muted">{m.summary}</p>
          {m.programs && (m.days ?? 1) > 1 && <p className="hint">이번 주에 지시한 훈련을 한 통에 모았습니다. 능력치는 가장 최근 값입니다.</p>}
          <GrowthList growth={m.growth ?? []} />
        </>
      );
    case 'round':
      return m.round ? <ResultList lines={m.round.matches} /> : null;
    case 'competition': {
      const c = m.competition;
      return c ? (
        <div className="kv">
          <div><small>우리 학교</small><b style={{ fontSize: 15 }}>{c.userFinish}</b></div>
          <div><small>현 예선 1위</small><b style={{ fontSize: 15 }}>{c.prefChampion}</b></div>
          <div><small>전국 우승</small><b style={{ fontSize: 15 }}>{c.champion}</b></div>
        </div>
      ) : null;
    }
    case 'injury':
      return (
        <ul className="lines">
          {(m.injuries ?? []).map((i) => <li key={i.id}><b>{i.name}</b><span className="pill bad">{i.days}일 결장</span></li>)}
        </ul>
      );
    case 'season':
      return (
        <>
          <p>{m.summary}</p>
          {m.body?.map((line) => <p key={line}>{line}</p>)}
          {m.yearReview && (
            <>
              <h3>올해의 평가</h3>
              <div className={`notice ${m.yearReview.grade > 0 ? 'good' : 'bad'}`}>{m.yearReview.verdict}</div>
              <div className="kv">
                <div><small>올해 목표</small><b style={{ fontSize: 15 }}>{m.yearReview.goal}</b></div>
                <div><small>가장 좋았던 성적</small><b style={{ fontSize: 15 }}>{m.yearReview.best}</b></div>
                <div><small>교장의 신임</small><b>{m.yearReview.trust}</b><span className="muted">100 만점</span></div>
                {m.prestige && <div><small>학교 수준</small><b>{m.prestige[0]} → {m.prestige[1]}</b><span className="muted">평가 반영 {m.yearReview.prestigeBonus > 0 ? '+' : ''}{m.yearReview.prestigeBonus}</span></div>}
              </div>
            </>
          )}
          {m.results && m.results.length > 0 && (
            <div className="table-wrap"><table className="data">
              <thead><tr><th className="l">연도</th><th className="l">대회</th><th className="l">우리 학교</th><th className="l">전국 우승</th></tr></thead>
              <tbody>{m.results.map((r, i) => <tr key={i}><td className="l">{r.year}년차</td><td className="l">{r.name}</td><td className="l">{r.userFinish}</td><td className="l">{r.champion}</td></tr>)}</tbody>
            </table></div>
          )}
          {m.graduates && <><h3>졸업생</h3>
            <ul className="lines">{m.graduates.map((p) => <li key={p.name}><span><PosBadge pos={p.pos} /> <b>{p.name}</b></span><Attr v={p.ovr} /></li>)}</ul></>}
          {m.recruits && <><h3>신입생</h3>
            <ul className="lines">{m.recruits.map((p) => (
              <li key={p.name}><span><PosBadge pos={p.pos} /> <b>{p.name}</b>{p.scouted && <span className="pill good" style={{ marginLeft: 8 }}>영입 성공</span>}</span><span className="row"><Stars value={potentialStars(p.potential ?? 50)} /><Attr v={p.ovr} /></span></li>
            ))}</ul></>}
          {m.missed && m.missed.length > 0 && <><h3>놓친 영입 목표</h3>
            <ul className="lines">{m.missed.map((p) => (
              <li key={p.name}><span><PosBadge pos={p.pos} /> <b>{p.name}</b> <span className="muted">다른 학교로 진학했습니다</span></span><span className="row"><Stars value={potentialStars(p.potential ?? 50)} /><Attr v={p.ovr} /></span></li>
            ))}</ul></>}
        </>
      );
    case 'scout': {
      const sc = m.scout;
      if (!sc) return null;
      return (
        <>
          <div className="notice good">{sc.label} · 분석 {sc.days}일 · 그 경기 능력치 +{sc.bonus.toFixed(1)}</div>
          {sc.players.length > 0 && <><h3>주요 선수</h3>
            <ul className="lines">{sc.players.map((p) => <li key={p.name}><span><PosBadge pos={p.pos} /> <b>{p.name}</b></span><Attr v={p.ovr} /></li>)}</ul></>}
          {sc.tactics && <><h3>즐겨 쓰는 전술</h3><p>{sc.tactics}</p></>}
          {(sc.sections ?? []).map((sec) => (
            <div key={sec.title}><h3>{sec.title}</h3><ul className="lines">{sec.lines.map((l) => <li key={l}><span>{l}</span></li>)}</ul></div>
          ))}
          {sc.hints.length > 0 && <><h3>코치 메모</h3><ul className="lines">{sc.hints.map((h) => <li key={h}><span>{h}</span></li>)}</ul></>}
          {/* more: 경기 전에 분석할 날이 더 남았는지 (예전 저장의 보고서에는 없어 최대 일수로 판단한다) */}
          {(sc.more ?? sc.days < PREPARATION.maxDays)
            ? <p className="hint">하루 더 분석하면 {sc.days === 1 ? '선발 다섯 명의 강점·약점과 대응 실마리' : '선수별 성향과 벤치 전력'}까지 알아내고, 그 경기 보너스도 커집니다.</p>
            : <p className="hint">{sc.days < PREPARATION.maxDays ? '경기 전까지 더 분석할 날이 없습니다.' : '분석을 모두 마쳤습니다.'} 이 정보를 바탕으로 어떤 전술과 선발로 맞설지는 감독이 정합니다.</p>}
          <p><button className="btn small" onClick={() => act('screen', 'tactics')}><Icon name="tactics" />전술 화면에서 코치의 모의 경기 조언 보기</button></p>
        </>
      );
    }
    default:
      return <>{(m.body ?? [m.summary]).map((t) => <p key={t}>{t}</p>)}</>;
  }
}

function MessageView({ m, career, act }: { m: Message; career: Career; act: Act }) {
  return (
    <article className="msg-view">
      <button className="btn small ghost msg-back" onClick={() => act('openMessage', null)}><Icon name="back" />목록</button>
      <header className="msg-head">
        <span className="meta">{m.from} · {m.year}년차 {m.day}일 · {m.phase}</span>
        <h2>{m.title}</h2>
      </header>
      <MessageBody m={m} career={career} act={act} />
    </article>
  );
}

export default function InboxView({ S, act }: ViewProps) {
  const selected = S.inbox.find((m) => m.id === S.messageId) ?? null;
  const unread = S.inbox.filter((m) => m.unread).length;
  const [filter, setFilter] = useState<FilterKey>('all');
  const list = filter === 'all' ? S.inbox : S.inbox.filter((m) => FILTER_OF[m.kind] === filter);
  return (
    <div className="page">
      <PageTitle title="받은 소식" sub={unread ? `읽지 않은 소식 ${unread}건` : '모두 읽었습니다'}>
        <Seg options={FILTERS} value={filter} onChange={(v) => setFilter(v as FilterKey)} />
        {unread > 0 && <button className="btn small" onClick={() => act('readAll')}>모두 읽음</button>}
      </PageTitle>
      <div className={`inbox ${selected ? 'has-sel' : ''}`}>
        <ul className="msg-list">
          {list.map((m) => (
            <li key={m.id} className={`${m.unread ? 'unread' : ''} ${selected?.id === m.id ? 'on' : ''}`} onClick={() => act('openMessage', m.id)}>
              <span className={`msg-ico k-${m.kind}`}><Icon name={KIND_ICON[m.kind]} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="msg-top"><span className="from">{m.from}</span><span>{m.year}년차 {m.day}일</span></div>
                <b>{m.title}</b>
                <span className="msg-sum">{m.summary}</span>
              </div>
            </li>
          ))}
          {!list.length && <li className="empty" style={{ display: 'block', cursor: 'default' }}>{S.inbox.length ? '이 분류에는 소식이 없습니다.' : '아직 받은 소식이 없습니다.'}</li>}
        </ul>
        {selected
          ? <MessageView m={selected} career={S.career} act={act} />
          : <article className="msg-view"><div className="empty">왼쪽에서 소식을 고르면 내용이 여기에 표시됩니다.</div></article>}
      </div>
    </div>
  );
}
