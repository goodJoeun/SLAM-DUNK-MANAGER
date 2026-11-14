import { PREPARATION } from '@/game/season';
import type { Career } from '@/game/types';
import type { Message, MessageKind } from './inbox';
import type { Act } from './useGame';
import { Attr, BoxTable, GrowthList, Icon, PageTitle, PosBadge, ResultList, isUser, potentialStars, Stars } from './ui';
import type { IconName, ViewProps } from './ui';

const KIND_ICON: Record<MessageKind, IconName> = {
  welcome: 'inbox', match: 'ball', training: 'training', round: 'trophy', competition: 'trophy', injury: 'cross', season: 'squad', scout: 'tactics',
};

function MessageBody({ m, career }: { m: Message; career: Career }) {
  switch (m.kind) {
    case 'match': {
      const box = m.box ?? [];
      const mine = box.find((t) => isUser(career, t.id)) ?? box[0];
      const opp = box.find((t) => t !== mine);
      return (
        <>
          <div className={`notice ${m.won ? 'good' : 'bad'}`}>{m.summary}</div>
          {mine && <><h3>{mine.name}</h3><BoxTable team={mine} /></>}
          {opp && <><h3>{opp.name}</h3><BoxTable team={opp} /></>}
          {m.growth && m.growth.length > 0 && <><h3>경기 경험으로 오른 능력치</h3><GrowthList growth={m.growth} /></>}
        </>
      );
    }
    case 'training':
      return <><p className="muted">{m.summary}</p><GrowthList growth={m.growth ?? []} /></>;
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
              <li key={p.name}><span><PosBadge pos={p.pos} /> <b>{p.name}</b></span><span className="row"><Stars value={potentialStars(p.potential ?? 50)} /><Attr v={p.ovr} /></span></li>
            ))}</ul></>}
        </>
      );
    case 'scout': {
      const sc = m.scout;
      if (!sc) return null;
      return (
        <>
          <div className="notice good">{sc.label} · 분석 {sc.days}일 · 계획대로 하면 그 경기 능력치 +{sc.bonus.toFixed(1)}</div>
          {sc.players.length > 0 && <><h3>주요 선수</h3>
            <ul className="lines">{sc.players.map((p) => <li key={p.name}><span><PosBadge pos={p.pos} /> <b>{p.name}</b></span><Attr v={p.ovr} /></li>)}</ul></>}
          {sc.tactics && <><h3>즐겨 쓰는 전술</h3><p>{sc.tactics}</p></>}
          {sc.hints.length > 0 && <><h3>코치의 대응 계획</h3><ul className="lines">{sc.hints.map((h) => <li key={h}><span>{h}</span></li>)}</ul></>}
          {sc.hints.length > 0 && <p className="hint">경기 시작 때 팀 전술이 이 계획(공격 중심·수비·집중 마크)을 따를수록 준비 보너스가 커집니다. 하나도 따르지 않으면 {Math.round(PREPARATION.baseShare * 100)}%만 받습니다. 훈련·전술 화면에서 한 번에 적용할 수 있습니다.</p>}
          {!sc.players.length && <p className="muted">분석을 하루 더 하면 그 경기에서 받는 보너스가 커집니다 (최대 {Math.round(sc.bonus / sc.days * 3 * 10) / 10}).</p>}
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
      <MessageBody m={m} career={career} />
    </article>
  );
}

export default function InboxView({ S, act }: ViewProps) {
  const selected = S.inbox.find((m) => m.id === S.messageId) ?? null;
  const unread = S.inbox.filter((m) => m.unread).length;
  return (
    <div className="page">
      <PageTitle title="받은 소식" sub={unread ? `읽지 않은 소식 ${unread}건` : '모두 읽었습니다'}>
        {unread > 0 && <button className="btn small" onClick={() => act('readAll')}>모두 읽음</button>}
      </PageTitle>
      <div className={`inbox ${selected ? 'has-sel' : ''}`}>
        <ul className="msg-list">
          {S.inbox.map((m) => (
            <li key={m.id} className={`${m.unread ? 'unread' : ''} ${selected?.id === m.id ? 'on' : ''}`} onClick={() => act('openMessage', m.id)}>
              <span className={`msg-ico k-${m.kind}`}><Icon name={KIND_ICON[m.kind]} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="msg-top"><span className="from">{m.from}</span><span>{m.year}년차 {m.day}일</span></div>
                <b>{m.title}</b>
                <span className="msg-sum">{m.summary}</span>
              </div>
            </li>
          ))}
          {!S.inbox.length && <li className="empty" style={{ display: 'block', cursor: 'default' }}>아직 받은 소식이 없습니다.</li>}
        </ul>
        {selected
          ? <MessageView m={selected} career={S.career} act={act} />
          : <article className="msg-view"><div className="empty">왼쪽에서 소식을 고르면 내용이 여기에 표시됩니다.</div></article>}
      </div>
    </div>
  );
}
