// 학교: 같은 현의 학교와(대회 중에는) 다른 현 대표를 한눈에 보고, 눌러서 학교 정보(선수 명단)를 연다.
import { teamOverall } from '@/game/team/school';
import { scoutReport } from '@/game/coach/scouting';
import type { Team } from '@/game/types';
import { Attr, Crest, PageTitle, clubVars } from '@/components/shared/ui';
import type { ViewProps } from '@/components/shared/ui';

export default function SchoolsView({ S, act }: ViewProps) {
  const c = S.career;
  const byOverall = (a: Team, b: Team) => teamOverall(b) - teamOverall(a);
  const local = c.regionIds.map((id) => c.teams[id]).sort(byOverall);
  const guests = Object.values(c.teams).filter((t) => !c.regionIds.includes(t.id)).sort(byOverall);

  const card = (t: Team, rank?: number) => {
    const mine = t.id === c.userTeamId;
    const stars = scoutReport(t, 0).players.map((p) => p.name).join(', ');
    const finish = c.comp?.finish[t.id];
    return (
      <button key={t.id} className={`school-card ${mine ? 'on' : ''}`} style={clubVars(t.name)} title={mine ? '선수단 화면으로' : '선수 명단과 학교 정보 보기'} onClick={() => act('school', t.id)}>
        <Crest name={t.name} size={40} />
        <div className="sc-body">
          <b>{t.name}{mine && <span className="pill club" style={{ marginLeft: 6 }}>우리 학교</span>}</b>
          <span>주요 선수 · {stars}</span>
        </div>
        <div className="sc-stats">
          <span><small>팀 전력</small><span className="sc-ovr"><Attr v={teamOverall(t)} />{rank != null && <i>{rank}위</i>}</span></span>
          <span><small>학교 수준</small><b>{t.prestige}</b></span>
          <span><small>선수</small><b>{t.players.length}명</b></span>
          {finish && <span><small>{c.comp!.name}</small><b>{finish}</b></span>}
        </div>
      </button>
    );
  };

  return (
    <div className="page">
      <PageTitle title="학교" sub={`${c.prefecture} ${local.length}개교 · 전력순 · 학교를 누르면 선수 명단과 올해 성적을 봅니다`} />
      <div className="school-grid">{local.map((t, i) => card(t, i + 1))}</div>
      {guests.length > 0 && (
        <>
          <PageTitle title="다른 현 대표" sub="전국 대회에 나온 학교입니다. 대회가 끝나면 목록에서 사라집니다." />
          <div className="school-grid">{guests.map((t) => card(t))}</div>
        </>
      )}
    </div>
  );
}
