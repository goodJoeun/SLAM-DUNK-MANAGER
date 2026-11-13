// 자동 생성 선수의 이름. style: 'kr'(한국어판 방식) | 'jp'(원작 방식) | 그 외에는 "선수 N"
import type { Rng } from './rng.ts';
import type { NameStyle } from './types.ts';

const KR = {
  family: ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍'],
  first: ['민', '서', '도', '지', '현', '준', '성', '태', '동', '재', '승', '우', '영', '상', '기', '진', '건', '경', '석', '인'],
  second: ['호', '준', '우', '현', '수', '민', '혁', '훈', '석', '기', '영', '철', '환', '규', '빈', '원', '진', '섭', '욱', '한'],
};
const JP = {
  family: ['사토', '스즈키', '다카하시', '다나카', '와타나베', '이토', '야마모토', '나카무라', '고바야시', '가토', '요시다', '야마다', '사사키', '마쓰모토', '기무라', '하야시', '시미즈', '모리', '이케다', '오카다'],
  given: ['켄타', '유우키', '다이키', '쇼타', '료', '타쿠야', '하루토', '카즈야', '신지', '마사토', '유타', '코헤이', '나오키', '쇼', '히로키', '준', '아키라', '츠바사', '케이', '소타'],
};
const one = (rng: Rng, xs: string[]) => xs[rng.int(0, xs.length - 1)];

export function randomName(rng: Rng, style: NameStyle | null, id: string) {
  if (style === 'kr') return one(rng, KR.family) + one(rng, KR.first) + one(rng, KR.second);
  if (style === 'jp') return `${one(rng, JP.family)} ${one(rng, JP.given)}`;
  return `선수 ${id}`;
}
