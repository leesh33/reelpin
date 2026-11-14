# 📍 릴스핀 (ReelPin) — iOS 앱 풀소스 v1.0

> **기획** 이상훈 (@odol) · **개발** 오돌
> **스택** React Native + Expo SDK 51 · AsyncStorage · expo-clipboard · React Native Web

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

## 개발 검증 (이번 빌드에서 실제로 돌린 것)

```bash
npx expo export --platform web          # 번들 빌드 → 에러 0건
node test/ssr-smoke.cjs                 # 11개 화면·컴포넌트 렌더 스모크 테스트
node test/extractor-test.bundle.mjs     # 추출기·딥링크 로직 테스트 17건
```

## 화면 구성

| 탭 | 파일 | 내용 |
| --- | --- | --- |
| 📍 지도 | `src/screens/MapScreen.js` | 딥 네이비 핀 지도(성수·연남·망원·검단 샘플 4핀), 카테고리 필터(전체/맛집/카페/가볼곳), 지오펜스 알림 배너, 핀 상세 시트(원본 릴스 + 네이버지도·카카오맵 딥링크) |
| 🔗 저장 | `src/screens/PasteScreen.js` | 클립보드 자동 감지, URL 입력·붙여넣기, 장소 추출, 후보 라디오 선택, [지도에 핀 꽂기] → AsyncStorage 저장 후 지도 탭 이동 |
| 👤 내 정보 | `src/screens/ProfileScreen.js` | 저장 핀 카운터(N/10 무료), 지오펜스 반경 300m·500m·1km, 프로 플랜 카드(월 2,900원), 내 릴스 지도 링크 복사 |

### 핵심 파일

- `src/components/MapCanvas.js` — 좌표 → 화면 투영 지도 캔버스(드래그 팬, 핀, 이름표)
- `src/services/extractor.js` — URL 파싱 + **어댑터 구조**(YouTube Data API / OpenAI / 네이버 로컬) + API 키가 없어도 동작하는 **오프라인 스마트 추출기**
- `src/storage.js` — AsyncStorage 저장/불러오기 (핀·반경·플랜)
- `src/utils/links.js` — 네이버지도 `nmap://`, 카카오맵 `kakaomap://` 딥링크 + 웹 폴백

---

## API 키 연결 (선택)

지금은 키가 없어도 오프라인 추출기로 끝까지 동작합니다.
키를 넣으면 실제 캡션 분석·좌표 매칭으로 정확도가 올라갑니다. (`app.json`에는 키를 넣지 않습니다)

```bash
# .env.example 참고
EXPO_PUBLIC_YOUTUBE_API_KEY=...
EXPO_PUBLIC_OPENAI_API_KEY=...
EXPO_PUBLIC_NAVER_SEARCH_KEY_ID=...
EXPO_PUBLIC_NAVER_SEARCH_SECRET=...
```

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
4. `expo export --platform web` 빌드 0 에러, 11개 화면/컴포넌트 렌더 스모크 테스트 통과.
