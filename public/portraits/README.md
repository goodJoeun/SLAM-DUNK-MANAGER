# 원작 선수 초상화

이 폴더에 원작 선수의 이미지를 넣으면 선수 정보 화면과 선수단 표에 나타납니다.
권리자에게 사용 허락을 받은 이미지만 넣어 주세요.

## 넣는 방법

1. 이미지 파일 이름을 아래 표의 슬러그로 맞춥니다. 확장자는 `.webp`, `.png`, `.jpg`, `.jpeg`, `.avif` 중 하나면 됩니다.
   예: `sakuragi-hanamichi.png`
2. 정사각형에 가까운 상반신 이미지가 가장 잘 맞습니다. 화면에는 가운데를 기준으로 정사각형으로 잘려 보입니다.
3. 프로젝트 폴더에서 다음을 실행합니다.

   ```bash
   npm run portraits
   ```

   연결된 선수 수와, 이름이 맞지 않는 파일·이미지가 없는 선수를 알려 줍니다.
4. 개발 서버를 켜 둔 상태라면 새로고침하면 바로 보입니다.

게임 안에서 사용자가 직접 올린 이미지가 있으면 그것이 이 폴더의 이미지보다 우선합니다.
이름 표기를 한국어판/원작 어느 쪽으로 바꿔도 같은 이미지가 쓰입니다.

## 저장소

이 폴더의 이미지 파일은 저장소에 포함되어 배포본에서도 나옵니다.
이미지를 더하거나 바꾸면 `npm run portraits`를 실행해 `src/game/data/portrait-files.json`(연결 목록)과 이미지를 함께 커밋하세요.

## 파일 이름 표

| 한국어판 | 원작 | 파일 이름(슬러그) |
| --- | --- | --- |
| 채치수 | 아카기 타케노리 | `akagi-takenori` |
| 권준호 | 코구레 키미노부 | `kogure-kiminobu` |
| 정대만 | 미츠이 히사시 | `mitsui-hisashi` |
| 송태섭 | 미야기 료타 | `miyagi-ryota` |
| 서태웅 | 루카와 카에데 | `rukawa-kaede` |
| 강백호 | 사쿠라기 하나미치 | `sakuragi-hanamichi` |
| 이달재 | 야스다 야스하루 | `yasuda-yasuharu` |
| 신오일 | 시오자키 테츠시 | `shiozaki-tetsushi` |
| 정병욱 | 카쿠타 사토루 | `kakuta-satoru` |
| 이호식 | 이시이 켄타로 | `ishii-kentaro` |
| 오중식 | 사사오카 사토루 | `sasaoka-satoru` |
| 이재훈 | 쿠와타 토키 | `kuwata-toki` |
| 변덕규 | 우오즈미 준 | `uozumi-jun` |
| 윤대협 | 센도 아키라 | `sendoh-akira` |
| 황태산 | 후쿠다 킷초 | `fukuda-kicchou` |
| 안영수 | 코시노 히로아키 | `koshino-hiroaki` |
| 허태환 | 우에쿠사 토모유키 | `uekusa-tomoyuki` |
| 백정태 | 이케가미 료지 | `ikegami-ryoji` |
| 박경태 | 아이다 히코이치 | `aida-hikoichi` |
| 이정환 | 마키 신이치 | `maki-shinichi` |
| 신준섭 | 진 소이치로 | `jin-soichiro` |
| 전호장 | 키요타 노부나가 | `kiyota-nobunaga` |
| 고민구 | 타카사고 카즈마 | `takasago-kazuma` |
| 김동식 | 무토 타다시 | `muto-tadashi` |
| 홍익현 | 미야마스 요시노리 | `miyamasu-yoshinori` |
| 김수겸 | 후지마 켄지 | `fujima-kenji` |
| 성현준 | 하나가타 토루 | `hanagata-toru` |
| 장권혁 | 하세가와 카즈시 | `hasegawa-kazushi` |
| 임택중 | 타카노 쇼이치 | `takano-shoichi` |
| 오창석 | 나가노 미츠루 | `nagano-mitsuru` |
| 심준섭 | 이토 타쿠 | `ito-taku` |
| 정우성 | 사와키타 에이지 | `sawakita-eiji` |
| 신현철 | 카와타 마사시 | `kawata-masashi` |
| 이명헌 | 후카츠 카즈나리 | `fukatsu-kazunari` |
| 최동오 | 마츠모토 미노루 | `matsumoto-minoru` |
| 김낙수 | 이치노쿠라 사토시 | `ichinokura-satoshi` |
| 정성구 | 노베 마사히로 | `nobe-masahiro` |
| 신현필 | 카와타 미키오 | `kawata-mikio` |
| 남훈 | 미나미 츠요시 | `minami-tsuyoshi` |
| 강동준 | 키시모토 미노리 | `kishimoto-minori` |
| 나대룡 | 이타쿠라 다이지로 | `itakura-daijiro` |
| 이현수 | 츠치야 아츠시 | `tsuchiya-atsushi` |
| 마성지 | 모로보시 다이 | `morohoshi-dai` |
| 김판석 | 모리시게 히로시 | `morishige-hiroshi` |
