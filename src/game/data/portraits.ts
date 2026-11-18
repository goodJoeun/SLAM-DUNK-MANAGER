// 원작 선수의 초상화 파일 이름(슬러그). 키는 original.ts의 한국어판 이름이다.
// public/portraits/ 에 "<슬러그>.webp" (또는 .png/.jpg/.jpeg/.avif) 로 이미지를 넣고 npm run portraits 를 실행하면
// src/game/data/portrait-files.json 이 갱신되어 게임에 나타난다. 자세한 내용은 public/portraits/README.md.
export const PORTRAIT_SLUGS: Record<string, string> = {
  // 북산고
  채치수: 'akagi-takenori',
  권준호: 'kogure-kiminobu',
  정대만: 'mitsui-hisashi',
  송태섭: 'miyagi-ryota',
  서태웅: 'rukawa-kaede',
  강백호: 'sakuragi-hanamichi',
  이달재: 'yasuda-yasuharu',
  신오일: 'shiozaki-tetsushi',
  정병욱: 'kakuta-satoru',
  이호식: 'ishii-kentaro',
  오중식: 'sasaoka-satoru',
  이재훈: 'kuwata-toki',
  // 능남고
  변덕규: 'uozumi-jun',
  윤대협: 'sendoh-akira',
  황태산: 'fukuda-kicchou',
  안영수: 'koshino-hiroaki',
  허태환: 'uekusa-tomoyuki',
  백정태: 'ikegami-ryoji',
  박경태: 'aida-hikoichi',
  // 해남대부속고
  이정환: 'maki-shinichi',
  신준섭: 'jin-soichiro',
  전호장: 'kiyota-nobunaga',
  고민구: 'takasago-kazuma',
  김동식: 'muto-tadashi',
  홍익현: 'miyamasu-yoshinori',
  // 상양고
  김수겸: 'fujima-kenji',
  성현준: 'hanagata-toru',
  장권혁: 'hasegawa-kazushi',
  임택중: 'takano-shoichi',
  오창석: 'nagano-mitsuru',
  심준섭: 'ito-taku',
  // 산왕공고
  정우성: 'sawakita-eiji',
  신현철: 'kawata-masashi',
  이명헌: 'fukatsu-kazunari',
  최동오: 'matsumoto-minoru',
  김낙수: 'ichinokura-satoshi',
  정성구: 'nobe-masahiro',
  신현필: 'kawata-mikio',
  // 풍전고
  남훈: 'minami-tsuyoshi',
  강동준: 'kishimoto-minori',
  나대룡: 'itakura-daijiro',
  // 대영학원
  이현수: 'tsuchiya-atsushi',
  // 지학고
  마성지: 'morohoshi-dai',
  // 명정공고
  김판석: 'morishige-hiroshi',
};
