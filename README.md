# 📍 릴스핀 (ReelPin) — iOS 앱 풀소스 v1.1

> **기획** 이상훈 (@odol) · **개발** 오돌
> **스택** React Native + Expo SDK 51 · AsyncStorage · expo-clipboard · React Native Web
> **v1.1 (2026-11-15)** 출처 배지 · 매장 정보 바로 열기 · 가게명 직접 검색 추가

릴스·쇼츠에서 본 맛집과 장소를 **링크 한 번**으로 내 지도에 핀으로 꽂아 두고,
그 동네에 도착하면 **"반경 300m 앞, 저장한 맛집이 있어요"** 로 알려 주는 앱입니다.

---

## 1. 10초 안에 내 아이폰에서 띄우기 (Expo Go)

```bash
cd reelpin-app
npm install
npx expo start
```

터미널에 뜬 **QR 코드**를 아이폰 카메라로 비추면 Expo Go가 열리며 실제 앱이 뜹니다.

## 2. PC 브라우저에서 바로 보기 (`w`)

```bash
npm install
npx expo start --web      # 또는 npm run web
```

브라우저가 열리면 지도·저장·내 정보 3탭을 그대로 눌러 볼 수 있습니다.
(웹에서 네이버·카카오 딥링크는 각 사의 **웹 지도**로 열립니다.)

## 3. 빌드 검증 (에러 0건 확인용)

```bash
npx expo export --platform web
```

---

## 개발 검증 (실제로 돌린 것)

```bash
npx expo export --platform web     # 번들 빌드 → 에러 0건 (22 files, dist/)
npm test                           # 추출기·딥링크·핀 152건 + 화면 렌더 스모크 22건 = 174건 통과
npm run test:extract               # 추출기 테스트만
```

> 소스가 ESM + `react-native` import 를 쓰므로 `test/run-tests.mjs` 가 esbuild 로
> react-native 를 테스트 스텁(또는 react-native-web)으로 치환해 번들한 뒤 node 로 실행합니다.

## v1.1에서 달라진 점 (2026-11-15)

1. **출처 배지** — 후보 카드·상세 시트마다 `extractor`가 돌려주는 `providers`를 읽어 `카카오`(노랑) · `네이버`(초록) · `구글`(파랑) 배지를 붙입니다.
   두 지도가 같은 가게를 확인해 주면 배지가 **나란히** 붙어 신뢰도를 보여 줍니다(오프라인/AI 후보는 회색 배지).
2. **매장 정보 바로 열기** — 카카오 `place.map.kakao.com/...` · 네이버 `link` · 구글 지도 링크를 핀에 `placeUrl`로 저장하고,
   상세 시트의 **[매장 정보 보기]** 버튼으로 바로 엽니다. (기존 네이버지도·카카오맵 길찾기 버튼은 그대로 유지)
3. **가게명으로 바로 찾기** — 캡션을 못 긁어오는 릴스 대비. 저장 탭 상단에서 `릴스 링크 ↔ 가게명으로 찾기`를 전환하고
   `성수동 소금빵`처럼 입력하면 카카오·네이버를 실시간 조회해 좌표·주소·매장 링크까지 채운 후보를 핀으로 꽂습니다.
4. 저장된 핀(v1.0)은 앱을 켤 때 새 필드(`placeUrl`·`providers`)가 자동으로 채워집니다. 같은 매장은 `placeUrl` 또는 이름+동네로 판정해 중복 저장을 막습니다.

## 화면 구성

| 탭 | 파일 | 내용 |
| --- | --- | --- |
| 📍 지도 | `src/screens/MapScreen.js` | 딥 네이비 핀 지도(성수·연남·망원·검단 샘플 4핀), 카테고리 필터(전체/맛집/카페/가볼곳), 지오펜스 알림 배너, 핀 상세 시트(출처 배지 + 원본 릴스 + **매장 정보 보기** + 네이버지도·카카오맵 딥링크) |
| 🔗 저장 | `src/screens/PasteScreen.js` | **릴스 링크 ↔ 가게명으로 찾기** 모드 전환, 클립보드 자동 감지, 장소 추출·직접 검색, **출처 배지가 붙은 후보 라디오 선택**, [지도에 핀 꽂기] → AsyncStorage 저장 후 지도 탭 이동 |
| 👤 내 정보 | `src/screens/ProfileScreen.js` | 저장 핀 카운터(N/10 무료), 지오펜스 반경 300m·500m·1km, 프로 플랜 카드(월 2,900원), 내 릴스 지도 링크 복사 |

### 핵심 파일

- `src/components/MapCanvas.js` — 좌표 → 화면 투영 지도 캔버스(드래그 팬, 핀, 이름표)
- `src/components/ProviderBadge.js` — 카카오·네이버·구글 출처 배지 (`providerIds()`로 후보의 providers를 정리)
- `src/services/extractor.js` — URL 파싱 + **어댑터 구조**(YouTube Data API / OpenAI / **카카오 로컬·네이버 지역검색·구글 Places 3사 지도 체인**) + `searchPlacesDirect()`(가게명 직접 검색) + API 키가 없어도 동작하는 **오프라인 스마트 추출기**
- `src/utils/pins.js` — 후보 → 핀 변환(`buildPin`), v1.0 핀 마이그레이션(`normalizePins`), 중복 판정(`findExistingPin`)
- `src/storage.js` — AsyncStorage 저장/불러오기 (핀·반경·플랜)
- `src/utils/links.js` — 네이버지도 `nmap://`, 카카오맵 `kakaomap://` 딥링크 + 웹 폴백, `openPlace()`(매장 정보 열기)

---

## API 키 연결 (선택)

지금은 키가 없어도 오프라인 추출기로 끝까지 동작합니다.
키를 넣으면 실제 캡션 분석·좌표 매칭으로 정확도가 올라갑니다. (`app.json`에는 키를 넣지 않습니다)

```bash
cp .env.example .env     # 그리고 값을 채운 뒤 npx expo start -c 로 재시작

EXPO_PUBLIC_KAKAO_REST_API_KEY=      # 카카오 로컬 — 국내 장소 1순위
EXPO_PUBLIC_NAVER_HUB_CLIENT_ID=     # 네이버 지역검색 (NAVER API HUB, 2026 최신 규격)
EXPO_PUBLIC_NAVER_HUB_CLIENT_SECRET=
EXPO_PUBLIC_NAVER_CLIENT_ID=         # 네이버 지역검색 (구 개발자센터 — 하위 호환, HUB 키가 있으면 안 씀)
EXPO_PUBLIC_NAVER_CLIENT_SECRET=
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=     # 구글 Places — 해외·영문/일문 장소
EXPO_PUBLIC_YOUTUBE_API_KEY=         # 쇼츠 제목·설명
EXPO_PUBLIC_OPENAI_API_KEY=          # 캡션 → 장소 JSON
```

### 네이버 지역검색 — 두 가지 규격 지원

2026년 7월 말부터 네이버 개발자센터(`developers.naver.com`)의 검색 API 신규 발급이 끝나고
네이버 클라우드 플랫폼의 **NAVER API HUB**(`console.ncloud.com`)로 이전했습니다. `naverLocalAdapter`는 두 규격을 모두 처리합니다.

| 키 | 엔드포인트 | 인증 헤더 |
| --- | --- | --- |
| `EXPO_PUBLIC_NAVER_HUB_CLIENT_ID` / `_SECRET` (우선) | `https://naverapihub.apigw.ntruss.com/search/v1/local?query=…&display=3&sort=comment&format=json` | `X-NCP-APIGW-API-KEY-ID` / `X-NCP-APIGW-API-KEY` |
| `EXPO_PUBLIC_NAVER_CLIENT_ID` / `_SECRET` (하위 호환) | `https://openapi.naver.com/v1/search/local.json?query=…&display=3` | `X-Naver-Client-Id` / `X-Naver-Client-Secret` |

HUB 키 두 개가 모두 있을 때만 HUB 규격을 쓰고, 없으면 기존 키로 자동 폴백합니다(키가 하나만 있으면 그 규격은 건너뜀).

### 지도 3사 통합 구조

- **설정된 키만** 골라 카카오·네이버·구글을 **동시에** 조회하고, 결과를 하나의 후보 목록으로 합칩니다.
  - 같은 가게가 여러 곳에서 잡히면 이름+좌표(300m) 기준으로 **중복을 합치고** 신뢰도를 올립니다.
  - 한 곳이 401·네트워크 오류로 실패해도 나머지 결과로 후보를 채웁니다.
  - 영문 검색어(해외 여행지)면 구글 후보가, 한글 검색어(국내)면 카카오 후보가 1순위가 됩니다.
  - 합쳐진 후보는 `providers: ['kakao','naver']`를 갖고, 화면에는 그대로 **출처 배지 두 개**로 보입니다.
- **매장 정보 링크(`placeUrl`)** — 카카오 `place_url`(https로 올림) · 네이버 `link` · 구글 `googleMapsUri`를 저장합니다.
  라벨은 주소로 판별합니다: 카카오맵 / 네이버 / 구글 지도 / 그 외는 **매장 홈페이지**.
- **가게명 직접 검색** — `searchPlacesDirect('성수동 소금빵')`이 위 체인을 그대로 호출합니다. 키가 없으면 안내 문구로 끝나고, 결과가 없으면 동네를 붙여 다시 찾도록 안내합니다.
- ⚠️ **네이버 지역검색은 브라우저 CORS 로 막힙니다.** iOS/Android 앱에서는 정상 동작하고,
  웹(`expo start --web`)에서는 그 요청만 건너뛰고 카카오·구글 결과를 씁니다.
  웹에서도 네이버 결과가 필요하면 키를 브라우저에 두지 말고 서버리스 프록시를 두고 호출하세요.

---

## 앱스토어 출시 (EAS Build)

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile production
eas submit --platform ios
```

- **앱 이름**: 릴스핀
- **번들 ID**: `com.odol.reelpin`
- **아이콘**: `assets/icon.png` (1024×1024, 딥네이비 + 코랄 핀)

> v1.0은 지도·저장·알림 미리보기까지의 MVP입니다.
> iOS **Share Extension**(공유 시트에서 바로 저장)과 실제 지오펜스 푸시는 v1.1에서 네이티브 타깃으로 붙입니다.

---

## 이번 버전에서 지킨 기술 규칙

1. `react-native-safe-area-context` / `SafeAreaProvider` **미사용** — iOS 17/18 Expo Go 네이티브 모듈 충돌 회피. RN 기본 `SafeAreaView` + Android `StatusBar.currentHeight` 사용.
2. `app.json`에 `extra.eas.projectId` **미포함** — `null` 매니페스트 크래시 원인 제거.
3. `bundleIdentifier: com.odol.reelpin`.
4. `expo export --platform web` 빌드 0 에러, 화면/컴포넌트 렌더 스모크 22건 통과.
5. `.env`는 `.gitignore`에 있어 커밋·ZIP에 포함되지 않습니다. 저장소·배포본에는 빈 값만 있는 `.env.example`만 들어갑니다.

> v1.1은 v1.0 MVP에 출처 배지·매장 정보 링크·가게명 직접 검색을 더한 버전입니다.
> iOS **Share Extension**(공유 시트에서 바로 저장)과 실제 지오펜스 푸시는 네이티브 타깃 작업으로 남아 있습니다.
