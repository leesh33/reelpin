# 📍 릴스핀 (ReelPin) — iOS 앱 풀소스 v1.7

> **기획** 이상훈 (@odol) · **개발** 오돌
> **스택** React Native + Expo SDK 51 · AsyncStorage · expo-clipboard · React Native Web · Vercel Serverless Functions · **네이버 지도(NAVER Maps Dynamic Map v3)** + Leaflet 폴백
> **v1.7 (2026-11-15)** `[매장 정보 보기]` 가 카카오맵 **바깥으로 나가지 않고** 앱 안 **네이버 플레이스 모달**(iframe)로 열림 — 헤더 `[새 창으로 열기]`·`[닫기]`, 차단 감지 시 `[네이버 지도로 열기]` 원탭 폴백
> **v1.6 (2026-11-15)** 웹 지도를 **네이버 지도**로 교체 — `ncpKeyId` 규격, 카테고리 색 핀·내 위치 파란 점·반경 500m 원·확대축소·`fitBounds`/`morph`, **인증 실패 시 안내 배너 + Leaflet 자동 폴백**
> **v1.5 (2026-11-15)** **실제 지도(Leaflet·OpenStreetMap)** + **내 위치(GPS)** + **반경 500m 주변 맛집 알림** — 핀마다 `320m`·`2.4km` 실제 거리, 500m 안에 들어오면 배너·브라우저 알림
> **v1.4 (2026-11-15)** **Vercel 무료 웹 배포** — PC 없이 아이폰·아이패드 사파리('홈 화면에 추가')에서 그대로 사용 · `api/*` **서버리스 프록시**로 웹에서도 네이버 지역검색·카카오 로컬·유튜브 설명글/댓글 동작 · **웹 번들에 API 키 0건**
> **v1.3 (2026-11-15)** 유튜브 **설명글(description)·댓글(고정/상위)** 파싱 · 동네 판별(`연동`)·업종 단어·불용어 보강 · `연동 엄마손횟집` 회귀 케이스
> v1.2 유튜브 무인증 oEmbed · 공유 텍스트+링크 혼합 입력 · OG 메타 · 한국어 키워드 정제기

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

## 4. Vercel 무료 웹 배포 — PC 없이 아이폰·아이패드에서 쓰기 ⭐

아이폰 **사파리로 주소만 열면** 릴스핀이 그대로 뜨고, 공유 → **홈 화면에 추가**를 누르면 앱처럼 아이콘이 생깁니다.
PC를 켜 둘 필요도, Expo Go를 설치할 필요도 없습니다.

### 4-1. 배포 (처음 5분)

1. [vercel.com](https://vercel.com) → GitHub 계정으로 로그인
2. **Add New… → Project** → `leesh33/reelpin` **Import**
3. **Environment Variables** 에 **서버 전용 이름**으로 키를 넣습니다 (아래 표). `EXPO_PUBLIC_` 은 **넣지 않습니다.**
4. **Deploy** → `https://reelpin-xxxx.vercel.app` 주소가 나옵니다
5. 아이폰 사파리에서 그 주소 열기 → 공유 버튼 → **홈 화면에 추가**

`vercel.json` 이 빌드·출력·라우팅을 이미 잡아 두었습니다.

| 설정 | 값 |
| --- | --- |
| Build Command | `npx expo export --platform web` (vercel.json) |
| Output Directory | `dist` (vercel.json) |
| `/api/*` | `api/*.js` 서버리스 함수 (자동) |
| 나머지 경로 | `index.html` (SPA 라우팅, vercel.json) |

### 4-2. Vercel 환경변수 (서버 전용 이름)

| 변수 | 쓰는 곳 | 없으면 |
| --- | --- | --- |
| `KAKAO_REST_API_KEY` | `/api/kakao-local` | 카카오 결과 없음(나머지 지도사로 계속) |
| `NAVER_HUB_CLIENT_ID` / `NAVER_HUB_CLIENT_SECRET` | `/api/naver-local` | 네이버 결과 없음 |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 위 함수의 구 규격 폴백 | (선택) |
| `YOUTUBE_API_KEY` | `/api/youtube` (설명글·댓글) | 제목·썸네일만(oEmbed) |
| `GOOGLE_MAPS_API_KEY` | (아직 없음 — 구글 Places는 네이티브에서 직접 호출) | 구글 결과 없음 |
| `EXPO_PUBLIC_NAVER_MAP_CLIENT_ID` | **웹 지도(네이버 지도)** — 빌드 시점 주입 | 기본값 `a1mxcz4n34` 사용 |

> ⚠️ **`EXPO_PUBLIC_...` 이름으로는 넣지 마세요.** Expo는 그 이름의 값을 **빌드 시점에 JS 번들에 박아 넣습니다.**
> 그러면 브라우저에서 소스 보기로 키가 보입니다. 서버 함수는 위 표의 **접두사 없는 이름**을 먼저 읽습니다.
> (로컬 `.env` 는 그대로 `EXPO_PUBLIC_...` 을 써도 됩니다 — 앱 빌드용이고, 프록시는 그 이름도 읽습니다.)
>
> 예외 — **네이버 지도 클라이언트 ID(`a1mxcz4n34`)** 는 원래 웹 JS 스크립트에 노출되는 **공개 ID**입니다(도메인 제한용).
> 그래서 `.env`/Vercel 어디에도 넣지 않으면 코드에 박힌 기본값을 씁니다. 지도가 뜨지 않으면 NCP 콘솔의 **Web 서비스 URL** 에 도메인을 등록했는지 먼저 확인하세요(아래 표).

### 4-3. 배포 확인 (2줄)

```text
https://<내주소>/api/naver-local?query=성수%20소금빵   → {"items":[...]} 이 나오면 성공
https://<내주소>/api/youtube?id=2QZPPEle9IY&hl=ko      → {"title":"...","description":"..."}
```

### 4-4. 웹에서 되는 것 / 안 되는 것

- ✅ **네이버 지역검색** — 예전에는 CORS로 웹에서 늘 막혔지만, 이제 `/api/naver-local` 프록시가 서버 키로 호출합니다.
- ✅ **카카오 로컬** — `/api/kakao-local` 프록시로 동작 (키는 브라우저에 없음).
- ✅ **유튜브 쇼츠** — `/api/youtube` 가 제목·설명글·상위/업로더 댓글을 읽어 검색어를 만듭니다. 키가 없거나 프록시가 없으면 oEmbed 제목으로 폴백합니다.
- ✅ **가게명으로 찾기·핀 저장** — 모두 그대로 (저장은 브라우저 localStorage/AsyncStorage).
- ✅ **실제 지도(네이버 지도)** — NCP **Maps Dynamic Map v3**(`ncpKeyId`)로 확대·축소·드래그, 카테고리 색 핀, 내 위치 파란 점 + **반경 500m 원(`naver.maps.Circle`)**. 도메인 미등록 등으로 인증이 실패하면 **안내 배너 + Leaflet(OSM) 임시 지도**로 자동 폴백합니다(하얀 화면 없음).
- ✅ **내 위치·500m 알림** — 사파리가 위치를 허용하면 실제 거리와 500m 진입 알림. 알림창은 iOS 16.4+ **홈 화면에 추가한 웹 앱**에서 동작하고, 그 전에는 앱 안 배너로 알려줍니다.
- ⚠️ **인스타 릴스 캡션** — 인스타는 로그인 월로 막혀 있어 웹·앱 모두 못 읽습니다. 공유할 때 복사되는 **문구+링크를 같이 붙여넣으면** 그 문구로 찾습니다.
- ⚠️ **매장 정보 열기** — 웹에서는 각 사의 **웹 지도**(네이버지도·카카오맵)로 열립니다.
- ⚠️ **로컬 개발(`npx expo start --web`)** — 개발 서버에는 `/api` 함수가 없어 네이버는 건너뜁니다. 프록시까지 로컬에서 시험하려면 `npx vercel dev` 를 쓰세요.

### 4-5. 프록시가 하는 일 (보안)

| 함수 | 입력 | 하는 일 |
| --- | --- | --- |
| `api/youtube.js` | `?id=<videoId>` | `videos?part=snippet` + `commentThreads?order=relevance&maxResults=5` 병렬 호출 → `{ title, description, thumbnail, comments, channelId }`. 키가 없으면 oEmbed만 |
| `api/kakao-local.js` | `?query=..&size=..` | 카카오 키워드 검색 → 카카오 응답 그대로 |
| `api/naver-local.js` | `?query=..&display=..` | 네이버 지역검색(HUB/구 규격) → 네이버 응답 그대로 |

- 빈 검색어 → `400`, 허용하지 않는 메서드 → `405`, 업스트림 실패 → `502`, 4초 타임아웃 → `504`
- **실패 응답에 키·업스트림 본문을 담지 않습니다.** (로그에도 키를 찍지 않음)
- CORS 헤더를 열지 않아 **우리 사이트에서만** 호출됩니다 (다른 사이트가 우리 키로 검색하지 못함).
- 공용 도우미는 `server/http.js` 에 두었습니다 (Vercel이 `api/` 안의 파일만 함수로 배포하므로 안전).

---

## 개발 검증 (실제로 돌린 것)

```bash
npx expo export --platform web     # 번들 빌드 → 에러 0건 (키 없는 상태로도 빌드 확인)
npm test                           # 단위·통합 530건 통과 (추출기 276 + 웹 프록시 38 + API 핸들러 65 + 위치·거리 76 + 화면 렌더 스모크 75) — 네트워크 안 타는 테스트
npm run test:extract               # 추출기 테스트만
npm run test:proxy                 # 웹 프록시 경로만 (Platform.OS='web')
npm run test:api                   # api/*.js 핸들러만 (fetch 스텁)
npm run test:location              # 거리 계산·반경 500m·위치 권한 안내·브라우저 알림
npm run test:live                  # 라이브 E2E: 실제 유튜브 → oEmbed+설명글(+댓글, 키 있을 때) → 카카오+네이버 HUB 실검색 (.env 키 필요)
```

> `npm run test:live` 는 `.env`의 실제 키로 **진짜 네트워크 호출**을 합니다.
> 키 값은 화면에 찍지 않고(앞 4자리만) 저장소·ZIP에도 들어가지 않습니다.

> 소스가 ESM + `react-native` import 를 쓰므로 `test/run-tests.mjs` 가 esbuild 로
> react-native 를 테스트 스텁(또는 react-native-web)으로 치환해 번들한 뒤 node 로 실행합니다.

## v1.7에서 달라진 점 (2026-11-15) — [매장 정보 보기] 를 앱 안 네이버 플레이스 모달로

상훈 님이 **매장 정보를 누를 때마다 카카오맵으로 빠져나가는** 흐름을 바꿔 달라고 한 버전입니다.

1. **앱 안 모달** — `src/components/InAppPlaceModal.web.js`. [매장 정보 보기] 를 누르면 화면 전체(모바일 폭) 모달이 뜨고,
   본문에 `<iframe src="https://m.place.naver.com/place/list?query=동네 가게명">` 를 그대로 띄웁니다. 브라우저 탭이 바뀌지 않습니다.
   (`m.place.naver.com` 은 `X-Frame-Options` / CSP `frame-ancestors` 를 보내지 않아 iframe 이 막히지 않습니다 — 2026-11-15 응답 헤더 확인)
2. **헤더** — 가게 이름 · 동네 + `[새 창으로 열기]`(외부 열기 폴백) + `[닫기]`. ESC 키로도 닫힙니다.
3. **차단 대비 두 겹** — ① 하단에 **항상 보이는** `화면이 비어 있으면 · [네이버 지도로 열기]` 줄,
   ② iframe 이 6초 안에 로드되지 않거나 `about:blank` 로 남아 있으면(= 브라우저가 거부) 상단에 안내 배너 + `[네이버 지도로 열기]` 버튼.
   iframe 은 지우지 않아 사용자가 직접 확인할 수 있습니다.
4. **버튼은 이제 항상 보입니다** — 예전에는 지도 API 가 준 `placeUrl` 이 있을 때만 [매장 정보 보기] 가 나왔지만,
   이제는 가게 이름 + 동네로 네이버 플레이스를 찾으므로 **저장된 매장 페이지가 없어도** 버튼이 뜹니다. (오른쪽 라벨 `네이버 플레이스`)
5. **아이폰·안드로이드** — `InAppPlaceModal.js` (네이티브) 는 같은 헤더를 쓰고, iframe 대신
   `[네이버 지도로 열기]` · `[네이버 플레이스 웹으로 열기]` · (있으면) `[저장된 매장 페이지 열기]` 를 제공합니다.
6. **검증** — `npm test` **530건 통과**(모달 주소·iframe·차단 감지·포털·SSR 안전 검사 30건 추가) · `npx expo export --platform web` 에러 0건
   · `https://reelpin.vercel.app` 라이브에서 핀 클릭 → [매장 정보 보기] → 모달 안에서 네이버 플레이스가 실제로 그려지는지 스크린샷 확인.

## v1.6에서 달라진 점 (2026-11-15) — 웹 지도를 네이버 지도로

상훈 님이 발급한 **NCP Maps Dynamic Map v3 키(`a1mxcz4n34`)** 로 웹 지도를 네이버 지도로 바꾼 버전입니다.

1. **네이버 지도 JS v3 규격** — `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=...`
   (2025년 3월 NCP 콘솔 개편 이후 **신규 앱은 `ncpKeyId`**, 구 콘솔 앱만 `ncpClientId` 입니다. 이 앱은 신규 키라 `ncpKeyId` 를 씁니다.)
   클라이언트 ID는 `EXPO_PUBLIC_NAVER_MAP_CLIENT_ID` → 없으면 `a1mxcz4n34`. (웹 스크립트에 그대로 노출되는 **공개 ID**이고, NCP 콘솔에 등록한 도메인에서만 동작합니다. Client Secret 은 쓰지 않습니다.)
2. **지도 위 동작** — 저장 핀은 카테고리별 색 원형 마커(`naver.maps.Marker` + HTML 아이콘, 선택 시 확대·`zIndex` 위로), 클릭하면 그 핀의 상세 시트가 열립니다.
   내 위치는 **파란 점** + **반경 500m 원**(`naver.maps.Circle`), 확대·축소는 지도 위 버튼, 핀을 고르면 `morph` 로 부드럽게 이동하고, 첫 화면에서는 핀이 한눈에 들어오도록 `fitBounds` 를 씁니다.
3. **안전 폴백** — 스크립트를 못 받아오거나(`script.onerror`) **인증 실패**(`window.navermap_authFailure`)면
   `네이버 콘솔에 도메인 등록 확인 중 · 임시 지도 표시` 배너와 함께 **기존 Leaflet(OSM) 지도로 자동 전환**합니다. 하얀 화면으로 멈추지 않습니다.
   인증 실패는 세션 동안 기억해 두어 다시 시도하지 않고, 새로고침하면 다시 네이버 지도를 먼저 시도합니다.
4. **SSR 안전** — 네이버/Leaflet 스크립트 모두 **`useEffect` 안에서만** 불러와 `npm test` 의 node 렌더(`renderToString`)에서도 `window is not defined` 가 나지 않습니다.
5. **검증** — `npm test` **500건 통과**(네이버 스크립트 규격·폴백 문구·인증 훅·비밀키 미참조 검사 15건 추가) · `npx expo export --platform web` 에러 0건.

### 네이버 지도가 뜨려면 (NCP 콘솔)

1. `console.ncloud.com` → **Services → Maps → Application** → 앱 선택
2. **Dynamic Map** 사용 체크 (꺼져 있으면 429 Quota Exceed)
3. **Web 서비스 URL** 에 실제 도메인을 **호스트만** 등록: `https://reelpin.vercel.app`, 로컬 개발용 `http://localhost`
4. 저장 후 새로고침 — 인증이 실패하면 지도 대신 폴백 배너가 뜨므로, 그 문구가 보이면 위 3번을 확인하면 됩니다.

## v1.5에서 달라진 점 (2026-11-15) — 실제 지도 + 내 위치 + 반경 500m 알림

상훈 님이 **진짜 지도에서 내 위치 기준 500m 안의 저장 맛집을 알려주는** 모습을 요청해 만든 버전입니다.

1. **실제 인터랙티브 지도** — `src/components/RealMapView.web.js` 가 웹에서 **Leaflet + OpenStreetMap 표준 타일**로 진짜 지도를 그립니다(지도 키 없음, 출처 표기).
   **지도 키가 필요 없고**, 확대·축소·드래그가 됩니다. 핀은 카테고리별 색(카페 민트 / 디저트 주황 / 베이크리 살구 / 기본 코랄)이고 선택하면 커집니다.
   Leaflet 은 **`useEffect` 안에서만** 불러오므로, `npm test` 의 node SSR 렌더에서도 `window is not defined` 가 나지 않습니다.
   네이티브(Expo Go)는 `RealMapView.js` 가 v1.4 의 `MapCanvas` 를 그대로 그립니다 — 동작 변화 없음.
2. **내 위치(GPS)** — `src/services/location.js` 의 `requestCurrentPosition()` / `watchPosition()`.
   권한 거부·미지원·타임아웃·https 아님을 모두 **한국어 안내 문구**로 돌려줍니다.
   사파리에서 위치를 허용하면 지도에 **파란 점 + 반경 500m 원**이 뜨고, [📍 내 위치] 버튼으로 부드럽게 이동합니다.
3. **실제 거리 표시** — `distanceMeters()`(Haversine) · `formatDistance()`(`320m`, `1.4km`) · `findNearbyPins()`.
   핀 상세 시트와 [주변 500m] 목록에 **내 위치에서 320m** 처럼 실제 거리가 붙습니다.
4. **500m 진입 배너** — 반경 500m 안에 저장한 곳이 있으면 상단 배너가 `반경 500m 앞, 저장한 맛집이 있어요 — 가게명 · 320m` 로 바뀌고, 탭하면 그 핀의 상세 시트가 열립니다.
   500m 안에 없으면 `가장 가까운 저장 장소: 가게명 (2.4km)` 를 보여 줍니다. 위치를 아직 안 켰을 때는 기존 시뮬레이션 배너가 그대로 나옵니다.
5. **브라우저 알림** — [주변 500m] 패널의 [🔔 근처 알림 켜기] 를 누르면 `Notification` 권한을 요청하고,
   반경 500m 에 새로 들어온 핀이 생기는 순간 1회씩 알립니다(같은 핀은 두 번 알리지 않음). 권한이 없으면 앱 안 배너로만 알려줍니다.
6. **검증** — `npm test` **485건 통과** · `npx expo export --platform web` 에러 0건 · 웹 번들에 Leaflet CDN 로더 포함(`RealMapView.web.js` 선택 확인).

## v1.4에서 달라진 점 (2026-11-15) — Vercel 웹 배포 + 서버리스 프록시

상훈 님이 **PC를 켜지 않고 아이폰·아이패드 사파리('홈 화면에 추가')에서 릴스핀을 쓰기 위해** 웹 배포를 준비한 버전입니다.

1. **`api/*.js` 서버리스 프록시 3개** — `youtube` · `kakao-local` · `naver-local`.
   서버 환경변수의 키로 대신 호출하고, **웹 번들에는 키가 한 개도 들어가지 않습니다.**
   빈 입력은 `400`, 4초 넘으면 `504`, 실패 응답에는 **키·업스트림 본문을 담지 않습니다.**
2. **`vercel.json`** — `npx expo export --platform web` → `dist`, `/api/*` 는 함수, 나머지 경로만 `index.html`.
3. **웹에서 네이버 지역검색이 실제로 동작** — `naverLocalAdapter`는 웹이면 `/api/naver-local` 을 탑니다.
   (예전엔 CORS 때문에 웹에서 조용히 건너뛰었습니다. 네이티브 앱은 그대로 직접 호출)
4. **웹에서 카카오 로컬도 프록시로** — `kakaoLocalAdapter` 웹 경로 추가(직접 호출은 CORS 로 막힘).
5. **웹에서 유튜브 설명글·댓글까지** — `EXPO_PUBLIC_YOUTUBE_API_KEY` 가 없으면 `/api/youtube` 를 먼저 시도하고,
   실패하면 oEmbed 제목으로 폴백합니다. `titleStatus` 는 여전히 `video`.
6. **검증** — `npm test` 400건 통과 · **키 없는 상태로 `expo export` → `dist/` 안 실제 키 값 0건**(스크립트로 확인) · `vercel.json` 필드(framework·buildCommand·outputDirectory·functions·rewrites)를 Vercel 스키마 정의와 대조 확인.

## v1.3에서 달라진 점 (2026-11-15)

상훈 님이 테스트한 `https://youtube.com/shorts/2QZPPEle9IY` 에서 실제 가게(`제주시 연동 “엄마손횟집”`) 대신
`제주한달살기 아리아오션뷰펜션`이 나오던 문제를 고친 버전입니다.

1. **유튜브 설명글(description) 자동 파싱** — oEmbed는 **제목만** 주고, 이 영상의 실제 상호명은 설명글 첫머리에만 있습니다.
   그래서 `sourceAdapters.youtube.fetchMetadata`가 키가 없어도 **네이티브(iOS/Android)에서 영상 페이지 HTML을 3.5초 타임아웃**으로 한 번 더 읽습니다.
   - 데스크톱 웹: `ytInitialPlayerResponse.attributedDescription`(또는 `shortDescription`)
   - 모바일 웹: `ytInitialData.attributedDescriptionBodyText` — 따옴표·중괄호가 `\x22`·`\x7b`로, 줄바꿈이 `\\n`으로 이중 이스케이프돼 와서 **두 단계까지 풀어서** 읽습니다.
   - 둘 다 없으면 `og:description`(유튜브가 넣는 사이트 소개 문구는 걸러냄) → 실패하면 조용히 oEmbed 결과만 씁니다.
   - oEmbed와 페이지 HTML은 **동시에** 요청해 체감 지연을 늘리지 않습니다. `EXPO_PUBLIC_YOUTUBE_API_KEY`가 있으면 Data API를 우선 씁니다.
2. **검색어 순서** — 설명글이 있으면 `title + '\n' + description`으로 뽑고, 상호·지역은 **앞부분(500자·8줄)** 에서 먼저 찾습니다.
   이 케이스에서는 첫 검색어가 **`연동 엄마손횟집`** → 카카오가 `엄마손횟집`(제주시 연동3길 35)을 바로 돌려줍니다.
3. **동네 판별 보강** — `제주시 연동`처럼 **주소형**일 때 한 글자 동네(`연동`)도 잡습니다.
   대신 `운동·이동·화면·드리면` 같은 일반명사는 지역명으로 쓰지 않게 막았습니다.
4. **불용어·업종 단어 보강** — `한달` `두달` `일주일` `특별한` `자연산` `무슨맛일까` `수준` `미친` 등과
   `35만원짜리` 같은 **금액+짜리** 토큰을 걸러냅니다. 업종은 `횟집` `초밥집` `이자카야` `포차` `오마카세` `스시`
   `해산물` `삼겹살` `곱창` `돈까스` `쌀국수` `피자` `버거` 등을 추가했습니다.
5. **유튜브 댓글(고정·상위 댓글) 읽기** — `EXPO_PUBLIC_YOUTUBE_API_KEY`가 있을 때 `videos`(설명글)와
   `commentThreads?part=snippet&order=relevance&maxResults=5&textFormat=plainText`를 **동시에** 호출합니다(3.5초 타임아웃).
   - YouTube API는 '고정 댓글' 플래그를 주지 않으므로, **업로더 채널(`videos.snippet.channelId`)이 쓴 댓글을 맨 앞**에 두고 나머지를 이어 붙입니다.
   - 댓글은 잡담이 섞이기 쉬워서 **제목·설명글에서 상호명을 못 잡았을 때만** 검색어에 씁니다.
     예) 제목 `평균리뷰 1000개 이상, 성수동 카페추천!` + 업로더 댓글 `여기 성수동 카모플라쥬에요!` → 첫 검색어 **`성수동 카모플라쥬`**
   - 댓글 비허용(403)·네트워크 오류는 조용히 빈 배열로 폴백해 기존 제목·설명글 추출은 그대로 동작합니다.
6. **제목만 있을 때의 회귀 테스트** — `"제주 한달"`이 절대 나오지 않고 **`제주 횟집` → `제주 돌돔`** 순으로 나오는지 단위 테스트로 고정했습니다.

## v1.2에서 달라진 점 (2026-11-15)

1. **유튜브는 API 키 없이 제목을 읽습니다** — `https://www.youtube.com/oembed?url=<영상 URL>&format=json`.
   `youtube.com/shorts/...` · `youtu.be/...` · `youtube.com/watch?v=...` 모두 같은 엔드포인트로 동작하고,
   웹/모바일 어디서든 호출됩니다. `EXPO_PUBLIC_YOUTUBE_API_KEY`가 있으면 설명(description)만 추가로 병합합니다.
2. **공유 시트 텍스트 + 링크 혼합 입력** — `"성수동 소금빵 맛집 베통 https://www.instagram.com/reel/..."`처럼
   문구와 링크가 붙어 있어도 `splitSharedText()`가 링크와 주변 문구를 나눠 **둘 다** 추출 힌트로 씁니다.
   클립보드 자동 감지도 이제 "덩어리 안에 링크가 있는지"로 판단합니다.
3. **OG 메타 파싱** — 네이티브(iOS/Android)에서 일반 웹·네이버 블로그의 `og:title` · `og:description` · `<title>`을
   **3.5초 타임아웃**으로 읽어 옵니다. 인스타 릴스처럼 로그인 월이 뜨면 예외 없이 조용히 폴백하고,
   결과 화면에 `인스타는 보안상 제목을 못 읽어와요` 안내 + **[가게명으로 찾기]** 원탭 버튼이 뜹니다.
4. **한국어 키워드 정제기(`extractSearchQueries`)** — 이모지·`#` 기호·상투적 수식어
   (`솔직후기` `웨이팅` `줄서는식당` `인생맛집` `먹방` `브이로그` `내돈내산` `shorts` 등)를 걷어내고
   **지역명(동/역/구/시) + 상호명/메뉴** 조합을 만듭니다. 예) `성수동 소금빵 맛집 베통 #성수맛집`
   → `성수동 베통` · `베통` · `성수동 소금빵` · `성수동 맛집`. 첫 후보로 결과가 없으면 **다음 후보로 자동 재시도**합니다.
5. **결과 상단 `읽어온 제목: "..."`** — 어떤 제목/페이지로 매칭했는지 사용자가 바로 볼 수 있습니다.
6. 일반 웹 페이지(가게 홈페이지 등)도 이제 링크 입력으로 받습니다. (`isSupportedUrl` = http(s) 링크 여부)

### 라이브 검증 결과 (2026-11-15, 실제 키·실제 응답)

| 입력 | 읽어온 제목 | 사용한 검색어 | 결과 |
| --- | --- | --- | --- |
| `youtube.com/shorts/3ZbtV8YXFGo` | 자영업 사장님의 매일 가는 2026 로컬 성수동 맛집 5 | 성수동 맛집 | 카카오+네이버 5건 (제스티살룬 성수 등) |
| `youtube.com/shorts/EKbeq6BnREI` | 평균리뷰 1000개 이상, 성수동 카페추천! ☕️ | 성수동 카페 | 카카오+네이버 5건 (카모플라쥬 · 블루보틀 성수 등) |
| `youtube.com/shorts/0nz3ONW9OP8` | 이태원 데이트 추천!! 호주식 브런치 카페!! #맛집 … | 이태원 호주식 → 이태원 브런치 | 1차 0건 → 2차 카카오+네이버 5건 |
| 문구+링크 혼합(`성수동 소금빵 맛집 베통 …`) | (링크의 유튜브 제목) | 성수동 베통 | **베통 성수** 카카오+네이버 병합 1건 |
| 일반 웹 문서(`icandoit-1.tistory.com/191`) | 서울 성수동 소금빵 맛집 베통 웨이팅 🥐ㅣ 기본 소금빵 (og:title) | 성수동 베통 | **베통 성수** 카카오+네이버 병합 1건 |
| 인스타 릴스(로그인 월) | (없음) — `blocked` | — | 조용히 폴백 + `인스타는 보안상 제목을 못 읽어와요` 안내와 [가게명으로 찾기] 버튼 |
| `youtube.com/shorts/2QZPPEle9IY` (v1.3) | 한달 전 예약 필수인 제주도 정말 특별한 횟집… + **설명글** `제주시 연동 “엄마손횟집”` | **연동 엄마손횟집** | **엄마손횟집** (제주특별자치도 제주시 연동3길 35) — 카카오 |

> `npm run test:live` 총 7케이스 중 6케이스에서 실제 지도 후보가 나왔고(카카오 11건·네이버 5건), 남은 1건은 의도한 인스타 차단 경로입니다.
> v1.3에서 추가한 ⑦ 케이스는 **검색어 `연동 엄마손횟집` · 후보 `엄마손횟집`** 기대값 검증까지 통과했습니다.

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
| 📍 지도 | `src/screens/MapScreen.js` | **실제 지도(웹 네이버 지도)** + **내 위치·반경 500m 원**, [📍 내 위치] · [주변 500m] 버튼, 500m 진입 배너(실제 거리), 주변 목록(거리순) + 근처 알림 토글, 핀 상세 시트(출처 배지 + **내 위치에서 320m** + 원본 릴스 + **앱 안 네이버 플레이스 모달** + 네이버지도·카카오맵) |
| 🔗 저장 | `src/screens/PasteScreen.js` | **릴스 링크 ↔ 가게명으로 찾기** 모드 전환, 클립보드 자동 감지, 장소 추출·직접 검색, **출처 배지가 붙은 후보 라디오 선택**, [지도에 핀 꽂기] → AsyncStorage 저장 후 지도 탭 이동 |
| 👤 내 정보 | `src/screens/ProfileScreen.js` | 저장 핀 카운터(N/10 무료), 지오펜스 반경 300m·500m·1km, 프로 플랜 카드(월 2,900원), 내 릴스 지도 링크 복사 |

### 핵심 파일

- `src/components/RealMapView.web.js` — **웹 실제 지도** — 1순위 **네이버 지도**(`ncpKeyId`, 핀·내 위치 점·500m 원·`fitBounds`/`morph`/확대축소) + **Leaflet 폴백**(OSM 타일), 둘 다 `useEffect` 안에서만 로드
- `src/components/RealMapView.js` — 네이티브 폴백(기존 `MapCanvas` 그대로)
- `src/components/InAppPlaceModal.web.js` — **웹 인앱 네이버 플레이스 모달** — `<iframe src={naverPlaceSearchUrl(pin)}>`, 헤더 `[새 창으로 열기]`·`[닫기]`(ESC), 6초 시간 초과·`about:blank` 차단 감지 → `[네이버 지도로 열기]` 원탭 폴백
- `src/components/InAppPlaceModal.js` — **네이티브(iOS·Android) 모달** — 같은 헤더 + 네이버 지도/플레이스 웹/저장된 매장 페이지 열기
- `src/components/MapCanvas.js` — 좌표 → 화면 투영 지도 캔버스(드래그 팬, 핀, 이름표)
- `src/services/location.js` — `distanceMeters`(Haversine) · `formatDistance` · `findNearbyPins` · `nearestPin` · `requestCurrentPosition` · `watchPosition` + 한국어 권한 안내
- `src/services/notifications.js` — 브라우저 알림 권한·500m 진입 알림(`firstNewNearby` 로 중복 방지, 미지원이면 조용히 false)
- `src/components/ProviderBadge.js` — 카카오·네이버·구글 출처 배지 (`providerIds()`로 후보의 providers를 정리)
- `src/components/ExtractedTitleNote.js` — 결과 상단 `읽어온 제목: "..."` + 인스타 안내·[가게명으로 찾기] 원탭 버튼
- `src/services/extractor.js` — URL 파싱 + **어댑터 구조**(**유튜브 무인증 oEmbed + 설명글(description) 파싱** + Data API 설명 보강 / 인스타 공유 캡션·OG / **카카오 로컬·네이버 지역검색·구글 Places 3사 지도 체인**) + `splitSharedText()` · `fetchPageMeta()` · `parseYouTubePageMeta()` · `extractSearchQueries()` + `searchPlacesDirect()`(가게명 직접 검색) + **웹 프록시 경로(`isWebPlatform()` · `proxyPathOf()`)** + API 키가 없어도 동작하는 **오프라인 스마트 추출기**
- `api/youtube.js` · `api/kakao-local.js` · `api/naver-local.js` — **Vercel 서버리스 프록시** (서버 키로 대신 호출, 웹 번들에 키 없음)
- `server/http.js` — 프록시 공용 도우미(4초 타임아웃·JSON 응답·키 비노출)
- `vercel.json` — 빌드(`npx expo export --platform web`)·출력(`dist`)·`/api/*` 함수·SPA 라우팅
- `src/utils/pins.js` — 후보 → 핀 변환(`buildPin`), v1.0 핀 마이그레이션(`normalizePins`), 중복 판정(`findExistingPin`)
- `src/storage.js` — AsyncStorage 저장/불러오기 (핀·반경·플랜)
- `src/utils/links.js` — 네이버지도 `nmap://`, 카카오맵 `kakaomap://` 딥링크 + 웹 폴백, `naverPlaceSearchUrl()`(인앱 모달 주소), `openExternalUrl()`·`openPlace()`(매장 정보 열기)

---

## API 키 연결 (선택)

지금은 키가 없어도 오프라인 추출기로 끝까지 동작합니다.
키를 넣으면 실제 캡션 분석·좌표 매칭으로 정확도가 올라갑니다. (`app.json`에는 키를 넣지 않습니다)

```bash
cp .env.example .env     # 그리고 값을 채운 뒤 npx expo start -c 로 재시작

EXPO_PUBLIC_KAKAO_REST_API_KEY=      # 카카오 로컬 — 국내 장소 1순위
EXPO_PUBLIC_NAVER_MAP_CLIENT_ID=     # 네이버 지도 Dynamic Map v3 클라이언트 ID (없으면 a1mxcz4n34)
EXPO_PUBLIC_NAVER_HUB_CLIENT_ID=     # 네이버 지역검색 (NAVER API HUB, 2026 최신 규격)
EXPO_PUBLIC_NAVER_HUB_CLIENT_SECRET=
EXPO_PUBLIC_NAVER_CLIENT_ID=         # 네이버 지역검색 (구 개발자센터 — 하위 호환, HUB 키가 있으면 안 씀)
EXPO_PUBLIC_NAVER_CLIENT_SECRET=
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=     # 구글 Places — 해외·영문/일문 장소
EXPO_PUBLIC_YOUTUBE_API_KEY=         # (선택) 유튜브 설명까지 — 제목·설명글은 키 없이도 읽습니다(oEmbed + 페이지 HTML)
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
- ⚠️ **웹(브라우저)에서는 CORS 를 피해 같은 출처 프록시를 씁니다.** (v1.4)
  네이버·카카오 모두 브라우저에 CORS 헤더를 주지 않습니다. 그래서 `Platform.OS === 'web'` 이면
  `/api/naver-local` · `/api/kakao-local` 로 호출하고, Vercel 함수가 **서버 키**로 대신 부릅니다(키는 브라우저에 없음).
  프록시가 없는 정적 호스팅·개발 서버에서는 그 요청을 실패로 기록하고 나머지 지도사 결과로 계속 진행합니다.

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
> iOS **Share Extension**(공유 시트에서 바로 저장)과 실제 지오펜스 푸시는 네이티브 타깃 작업으로 붙입니다.

---

## 이번 버전에서 지킨 기술 규칙

1. `react-native-safe-area-context` / `SafeAreaProvider` **미사용** — iOS 17/18 Expo Go 네이티브 모듈 충돌 회피. RN 기본 `SafeAreaView` + Android `StatusBar.currentHeight` 사용.
2. `app.json`에 `extra.eas.projectId` **미포함** — `null` 매니페스트 크래시 원인 제거.
3. `bundleIdentifier: com.odol.reelpin`.
4. `expo export --platform web` 빌드 0 에러, 화면/컴포넌트 렌더 스모크 75건 통과(웹 지도 `RealMapView.web.js` SSR 안전 + 네이버 지도 스크립트 규격 검사 + v1.7 인앱 네이버 플레이스 모달 검사 포함).
5. `.env`는 `.gitignore`에 있어 커밋·ZIP에 포함되지 않습니다. 저장소·배포본에는 빈 값만 있는 `.env.example`만 들어갑니다.

> v1.2는 v1.1에 **유튜브 무인증 oEmbed · 공유 텍스트+링크 혼합 입력 · OG 메타 · 한국어 키워드 정제기**를 더한 버전입니다.
> iOS **Share Extension**(공유 시트에서 바로 저장)과 실제 지오펜스 푸시는 네이티브 타깃 작업으로 남아 있습니다.
