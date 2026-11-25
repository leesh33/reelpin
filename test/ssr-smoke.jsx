import React from 'react';
import { renderToString } from 'react-dom/server';
import App from '../App';
import MapScreen from '../src/screens/MapScreen';
import PasteScreen from '../src/screens/PasteScreen';
import ProfileScreen from '../src/screens/ProfileScreen';
import PinDetailSheet, { shortUrlForDisplay } from '../src/components/PinDetailSheet';
import ProviderBadges from '../src/components/ProviderBadge';
import ExtractedTitleNote from '../src/components/ExtractedTitleNote';
// v2.28.0 — 반경 500m 알림은 큰 배너 대신 **3초 한줄 토스트**로 (GeofenceBanner 는 걷어냈습니다)
import GeofenceToast, {
  GEOFENCE_TOAST_MS,
  nearbyToastMessage,
  shouldToastNearby,
} from '../src/components/GeofenceToast';
// v2.28.0 — 상세 시트가 열린 동안 하단 탭바를 숨기는 규칙
import { TAB_BAR_LAYERS, tabBarHiddenReason, tabBarVisibility } from '../src/utils/tabBarVisibility';
import FilterChips from '../src/components/FilterChips';
// v2.17 — 지도 왼쪽 하단 펌찄 메뉴(가본 곳만 보기 · 지도 공유하기)
import MapToolsMenu, { TOOLS_ANIM_MS, TOOLS_TOGGLE_SIZE, toolsSummary } from '../src/components/MapToolsMenu';
import CategoryPicker from '../src/components/CategoryPicker';
import CategoryColorPicker from '../src/components/CategoryColorPicker';
// v2.5 — 🔍 내 핀 검색 · 📋 목록 보기
import PinSearchBar from '../src/components/PinSearchBar';
// v2.35.0 — 지도 상단 통합 검색창(내 핀 + 새 장소 찾기) + 결과 드롭다운
import MapSearchBar, { MAP_SEARCH_BAR_HEIGHT, MAP_SEARCH_PLACEHOLDER } from '../src/components/MapSearchBar';
import MapSearchPanel from '../src/components/MapSearchPanel';
import {
  MAP_SEARCH_EMPTY_HINT,
  newPlaceSearchLabel,
  pasteSearchRequest,
  shouldShowMapSearchPanel,
} from '../src/utils/mapSearch';
import PinListView from '../src/components/PinListView';
import PinSearchResults from '../src/components/PinSearchResults';
import TabBar from '../src/components/TabBar';
// v2.19 — 📂 컬렉션 탭 (테마·코스별 핀 묶음)
import CollectionsScreen, { collectionsHeadline } from '../src/screens/CollectionsScreen';
// v2.15 — 전 탭 공통 상단 다크 헤더 · 🔔 알림 모음
// v2.16 — 호갱노노처럼 헤더(🔍 · 🔔 · ☰) + 🔍 검색 레이어 팝업 · ☰ 메뉴 시트
import AppHeader, { HEADER_ACTIONS, alertBadgeLabel, HEADER_TABS } from '../src/components/AppHeader';
import AlertInbox from '../src/components/AlertInbox';
import SearchOverlayModal from '../src/components/SearchOverlayModal';
import MenuDrawerModal, { APP_VERSION_LABEL } from '../src/components/MenuDrawerModal';
// v2.21 — 🛡️ 어드민(/admin) 화면
import AdminScreen from '../src/screens/AdminScreen';
// v2.23 — 💬 제안 · 버그 제보 게시판
import FeedbackBoardModal from '../src/components/FeedbackBoardModal';
import { APP_VERSION_NAME as FEEDBACK_APP_VERSION } from '../src/services/feedback';
// v2.31 — 🗂️ 기획전·공유 컬렉션 미리보기
import CollectionPreviewSheet from '../src/components/CollectionPreviewSheet';
// v2.33.0 — 📍 지도 꾹 눌러 장소 등록
import LongPressPlaceSheet, {
  PLACE_LOOKUP_FAILED,
  PLACE_SHEET_HEIGHT,
} from '../src/components/LongPressPlaceSheet';
import {
  NEARBY_PLACE_LIMIT,
  buildLongPressPin as buildLongPressPin233,
  visitedToggleText as visitedToggleText233,
  suggestedCategoryOf as suggestedCategoryOf233,
  suggestedNameOf as suggestedNameOf233,
} from '../src/utils/longPressPlace';
import { bindLongPress } from '../src/components/longPressGesture';
// v2.33.4 — ✅ 저장 화면(링크·사진·가게명)에 더한 `가봤어요` 토글 카드 + 그 저장 페이로드
import VisitedToggleCard from '../src/components/VisitedToggleCard';
import { buildResultPins as buildResultPins334 } from '../src/utils/saveResult';
// v2.19.1 — 네 화면(내 정보·돋보기·알림 모음·목록 보기)이 함께 쓰는 레이어 팝업 틀
import LayerSheet, {
  SHEET_BACKDROP_COLOR,
  SHEET_CORNER_RADIUS,
  SHEET_HEIGHT,
} from '../src/components/LayerSheet';
// v2.19.1 — 장소 검색 추천의 `시·군·구·동` 지역 라벨
import { addressRegions, placeAreaLabel, placeMetaLabel } from '../src/utils/areaLabel';
import { APP_INFO_BUNDLE, APP_INFO_VERSION } from '../src/screens/ProfileScreen';
// v2.20.1 — 프로필 이름은 로그인한 계정에서만 (로그아웃 = 게스트)
import { GUEST_HINT, GUEST_NAME, profileIdentity } from '../src/utils/profileIdentity';
// v2.20.1 — Apple 로그인은 준비 중 (카카오·구글만 Supabase 로)
import { OAUTH_PENDING_MESSAGE, OAUTH_PROVIDERS as OAUTH_PROVIDERS_2201, oauthProviderReady } from '../src/services/cloudSync';
import {
  OVERLAY_RESULT_MAX,
  RECOMMEND_MAX,
  overlaySearchResults,
  popularPlaceRows,
  recommendPlaces,
} from '../src/utils/searchOverlay';
import {
  POPULAR_PLACES,
  POPULAR_PLACES_SUB,
  POPULAR_PLACES_TITLE,
  popularPlaceLabel,
  popularPlaceQuery,
} from '../src/data/popularPlaces';
import { ALERT_FEED_LIMIT, buildAlertFeed } from '../src/utils/alertFeed';
import MapCanvas from '../src/components/MapCanvas';
// v2.20.2 — 토스트를 핀 상세 시트 헤더 **아래**로 내리는 위치 계산
import Toast, {
  SHEET_HEADER_HEIGHT,
  SHEET_MAX_HEIGHT_RATIO,
  TOAST_TOP,
  toastTopBelowSheetHeader,
} from '../src/components/Toast';
import { CLUSTER_THRESHOLD_PX } from '../src/utils/cluster';
import RealMapViewWeb, {
  NAVER_MAP_CLIENT_ID,
  buildNaverScriptUrl,
  resolveNaverClientId,
  pinColor,
  FALLBACK_NOTICE,
  FALLBACK_NOTICE_NETWORK,
  PIN_LABEL_MAX_WIDTH,
  PIN_LABEL_FONT_SIZE,
  PIN_LABEL_GAP,
  escapeHtml,
  pinSize,
  pinAnchor,
  pinIconHtml,
  pinLabelHtml,
} from '../src/components/RealMapView.web';
import InAppPlaceModalWeb, {
  BLANK_SETTLE_MS,
  BLOCKED_HINT,
  BLOCKED_NOTICE,
  IFRAME_LOAD_TIMEOUT_MS,
  looksLikeBlockedFrame,
  placeModalTitle,
} from '../src/components/InAppPlaceModal.web';
import fs from 'node:fs';
import path from 'node:path';
import {
  FONT_FILES,
  FONT_REQUIRED_MARKERS,
  injectPwaHead,
  PWA_REQUIRED_MARKERS,
  PWA_APP_TITLE,
  VIBEAICLUB_VERIFY_CODE,
  VIBEAICLUB_VERIFY_PATH,
} from '../scripts/patch-web-html.mjs';
import { colors, mapControls, tabBar } from '../src/theme';
import { SEED_PINS } from '../src/data/seedPins';
// v2.17 — '가본 곳만 보기' Y/N 이 쓰는 방문 필터 규칙
import { VISIT_ALL, VISIT_DONE, filterByVisit } from '../src/utils/searchPins';
import {
  CUSTOM_CATEGORY_COLORS,
  CUSTOM_PIN_COLORS,
  DEFAULT_CATEGORY_COLORS,
  allCategories,
  getCategoryColor,
  matchesFilter,
} from '../src/utils/categories';

const noop = () => {};

const SEARCH_PIN = {
  id: 'pin-search-1',
  name: '베통 성수',
  area: '성수동',
  category: '카페',
  menuTags: ['소금빵'],
  address: '서울특별시 성동구 연무장7가길 8',
  lat: 37.5429356,
  lng: 127.0552214,
  placeUrl: 'https://place.map.kakao.com/12345',
  placeUrlLabel: '카카오맵',
  providers: ['kakao', 'naver'],
  sourceUrl: '',
  platform: 'search',
  note: '',
  createdAt: '2026-11-15T00:00:00+09:00',
};

// v2.0 — 공유받은 지도 미리보기 핀
const SHARED_PINS = [
  { ...SEARCH_PIN, id: 'share-0', name: '공유받은 베통', shared: true, platform: 'share', naverPlaceId: '1736095566' },
  { ...SEARCH_PIN, id: 'share-1', name: '공유받은 뚜레쥬르', shared: true, platform: 'share', lat: 37.56, lng: 126.925 },
];

// v2.6 — 검색 결과 목록 검사용 핀 ('한성' 으로 두 곳)
const SEARCH_PINS = [
  { ...SEARCH_PIN, id: 'sr-1', name: '한성치킨', category: '맛집', area: '검단', lat: 37.58282, lng: 126.71412, menuTags: ['후라이드'] },
  { ...SEARCH_PIN, id: 'sr-2', name: '한성돈까스', category: '카페', area: '마전동', lat: 37.5825, lng: 126.7131 },
  { ...SEARCH_PIN, id: 'sr-3', name: '한성곱창', category: '맛집', area: '검단', lat: 37.5831, lng: 126.7155 },
  { ...SEARCH_PIN, id: 'sr-4', name: '한성냉면', category: '맛집', area: '검단', lat: 37.5842, lng: 126.7161 },
  { ...SEARCH_PIN, id: 'sr-5', name: '한성왕족발', category: '맛집', area: '검단', lat: 37.5855, lng: 126.7172 },
];

const cases = [
  ['App(첫 화면 = 스플래시)', <App />, false],
  ['MapScreen', <MapScreen pins={SEED_PINS} selectedPinId={SEED_PINS[0].id} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} />],
  ['MapScreen(empty)', <MapScreen pins={[]} selectedPinId={null} onSelectPin={noop} radiusMeters={500} onGoPaste={noop} onDeletePin={noop} onToast={noop} />],
  ['PasteScreen', <PasteScreen active pinCount={4} isPro={false} onSaved={noop} onClose={noop} onGoProfile={noop} onToast={noop} />],
  ['PasteScreen(가게명 찾기)', <PasteScreen active pinCount={4} isPro={false} initialMode="search" onSaved={noop} onClose={noop} onGoProfile={noop} onToast={noop} />],
  ['PasteScreen(limit)', <PasteScreen active pinCount={10} isPro={false} onSaved={noop} onClose={noop} onGoProfile={noop} onToast={noop} />],
  ['ProfileScreen', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} />],
  // v2.1 — 계정 · 클라우드 동기화 카드 (비로그인 / 로그인)
  ['ProfileScreen(로그인 전)', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured cloudUser={null} cloudPinCount={0} onSignIn={noop} onSignUp={noop} onMagicLink={noop} onOAuth={noop} onSignOut={noop} onSyncNow={noop} />],
  ['ProfileScreen(로그인 후)', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured cloudUser={{ id: 'u-1', email: 'andy@example.com' }} cloudPinCount={4} cloudSyncing={false} cloudMessage="" onSignIn={noop} onSignUp={noop} onMagicLink={noop} onOAuth={noop} onSignOut={noop} onSyncNow={noop} />],
  ['ProfileScreen(로그인 후·동기화 중)', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured cloudUser={{ id: 'u-1', email: 'andy@example.com' }} cloudPinCount={4} cloudSyncing cloudMessage="클라우드에 올리지 못했어요 · 기기에는 저장돼 있어요" onSignIn={noop} onSignUp={noop} onMagicLink={noop} onOAuth={noop} onSignOut={noop} onSyncNow={noop} />],
  ['PinDetailSheet', <PinDetailSheet pin={SEED_PINS[0]} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />],
  ['PinDetailSheet(매장정보·배지)', <PinDetailSheet pin={SEARCH_PIN} radiusMeters={500} onClose={noop} onDelete={noop} onToast={noop} />],
  ['PinDetailSheet(매장정보 없음)', <PinDetailSheet pin={{ ...SEARCH_PIN, placeUrl: '', providers: [] }} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />],
  ['ProviderBadges(2곳)', <ProviderBadges item={SEARCH_PIN} />],
  ['ExtractedTitleNote(읽어온 제목)', <ExtractedTitleNote title="성수동 소금빵 맛집 베통" />],
  ['ExtractedTitleNote(인스타 안내)', <ExtractedTitleNote notice="인스타는 보안상 제목을 못 읽어와요 — 가게명으로 바로 찾아보세요." onSearchByName={noop} />],
  ['ExtractedTitleNote(없음)', <ExtractedTitleNote />, true],
  ['ProviderBadges(없음)', <ProviderBadges item={{ name: 'x' }} />, true],
  // v2.2 — 분류 직접 고르기 · 내 분류 만들기
  ['CategoryPicker(기본+커스텀)', <CategoryPicker value="아이랑" onChange={noop} categories={['맛집', '카페', '가볼곳', '아이랑']} onAddCategory={noop} />],
  ['FilterChips(커스텀 분류)', <FilterChips value="아이랑" onChange={noop} categories={['맛집', '카페', '가볼곳', '아이랑']} counts={{ '전체': 6, '맛집': 3, '카페': 1, '가볼곳': 0, '아이랑': 1 }} />],
  ['MapScreen(커스텀 분류 필터)', <MapScreen pins={SEED_PINS.concat([{ ...SEARCH_PIN, id: 'custom-1', category: '아이랑' }])} categories={['맛집', '카페', '가볼곳', '아이랑']} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} onChangePinCategory={noop} onAddCategory={noop} />],
  ['PinDetailSheet(분류 변경)', <PinDetailSheet pin={{ ...SEARCH_PIN, category: '아이랑' }} categories={['맛집', '카페', '가볼곳', '아이랑']} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} onChangeCategory={noop} onAddCategory={noop} />],
  ['ProfileScreen(분류 관리)', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} categories={['맛집', '카페', '가볼곳', '아이랑']} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} onAddCategory={noop} onRenameCategory={noop} onRemoveCategory={noop} />],
  ['GeofenceToast(반경 500m 알림)', <GeofenceToast message="반경 500m 안에 2곳 있어요" onPress={noop} />],
  ['GeofenceToast(보기 버튼 포함)', <GeofenceToast message={nearbyToastMessage(3)} onPress={noop} />],
  ['FilterChips', <FilterChips value="전체" onChange={noop} counts={{ 전체: 4 }} />],
  ['TabBar', <TabBar active="map" onChange={noop} />],
  ['MapCanvas', <MapCanvas pins={SEED_PINS} selectedId={SEED_PINS[0].id} onSelect={noop} radius={300} />],
  // v1.5 — Leaflet 지도(웹)가 node 렌더에서 window/document 를 건드리지 않는지
  ['RealMapView.web(SSR 안전)', <RealMapViewWeb pins={SEED_PINS} selectedId={SEED_PINS[0].id} onSelect={noop} myCoords={{ lat: 37.5824, lng: 126.7144 }} radiusMeters={500} />],
  ['RealMapView.web(핀 없음)', <RealMapViewWeb pins={[]} selectedId={null} onSelect={noop} />],
  ['PinDetailSheet(내 위치 거리)', <PinDetailSheet pin={SEED_PINS[0]} radiusMeters={300} distanceMeters={320} onClose={noop} onDelete={noop} onToast={noop} />],
  ['GeofenceToast(짧은 안내)', <GeofenceToast message={nearbyToastMessage(1)} onPress={noop} />],
  // v2.28.0 — 반경 밖·위치 없음은 큰 안내 카드 없이 헤더 🔔 뱃지가 맡습니다(토스트 미노출)
  ['GeofenceToast(문구 없음 → 미노출)', <GeofenceToast message="" onPress={noop} />, true],
  // v1.7 — 인앱 네이버 플레이스 모달이 node 렌더에서 window 를 건드리지 않는지
  ['InAppPlaceModal.web(SSR 안전)', <InAppPlaceModalWeb pin={SEARCH_PIN} onClose={noop} onToast={noop} />],
  // v2.0 — 공유받은 지도 배너 · 상세 시트 전화/주소 · 네이버 플레이스 상세 직행
  ['MapScreen(공유받은 지도)', <MapScreen pins={SEED_PINS} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} sharedPins={SHARED_PINS} onAddSharedPins={noop} onDismissShared={noop} />],
  ['PinDetailSheet(전화·주소·placeId)', <PinDetailSheet pin={{ ...SEARCH_PIN, phone: '0507-1375-1660', naverPlaceId: '1736095566' }} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />],
  ['PinDetailSheet(공유받은 핀 읽기 전용)', <PinDetailSheet pin={{ ...SHARED_PINS[0], phone: '02-123-4567' }} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} readOnly />],
  ['InAppPlaceModal.web(핀 없음)', <InAppPlaceModalWeb pin={null} onClose={noop} onToast={noop} />, true],
  // v2.5 — 검색창 · 목록 보기 (node 렌더에서 window/document 를 건드리지 않는지)
  ['PinSearchBar', <PinSearchBar value="" onChange={noop} />],
  ['PinSearchBar(검색어 있음 · ✕)', <PinSearchBar value="베통" onChange={noop} onClear={noop} />],
  ['PinListView', <PinListView pins={SEED_PINS} categories={['맛집', '카페', '가볼곳', '아이랑']} filter="전체" counts={{ '전체': 4 }} myCoords={{ lat: 37.5828, lng: 126.7141 }} onSelectPin={noop} onChangeFilter={noop} onQueryChange={noop} />],
  ['PinListView(검색 결과 없음)', <PinListView pins={[]} query="없는가게" filter="전체" myCoords={null} onSelectPin={noop} onClearQuery={noop} />],
  ['PinListView(핀 없음 · 위치 없음)', <PinListView pins={[]} filter="전체" myCoords={null} onSelectPin={noop} onGoPaste={noop} />],
  // v2.6 — 검색 결과 2곳 이상이면 지도 위 콤팩트 결과 목록
  ['PinSearchResults(검색 결과 2곳)', <PinSearchResults pins={SEARCH_PINS} query="한성" categories={['맛집', '카페']} myCoords={{ lat: 37.5828, lng: 126.7141 }} onOpenPin={noop} onShowAll={noop} />],
  ['PinSearchResults(최대 4행만)', <PinSearchResults pins={SEARCH_PINS} query="" max={1} onOpenPin={noop} onShowAll={noop} />],
  // v2.35.0 — 지도 상단 통합 검색창 + 결과 드롭다운
  ['MapSearchBar(빈 입력)', <MapSearchBar value="" onChange={noop} />],
  ['MapSearchBar(검색어 있음 · ✕)', <MapSearchBar value="한성" onChange={noop} onClear={noop} />],
  ['MapSearchPanel(내 핀 2곳 + 새 장소 찾기)', <MapSearchPanel pins={SEARCH_PINS.slice(0, 2)} query="한성" categories={['맛집', '카페']} myCoords={{ lat: 37.5828, lng: 126.7141 }} onOpenPin={noop} onShowAll={noop} onSearchNewPlace={noop} />],
  ['MapSearchPanel(0곳 → 안내 + 새 장소 찾기)', <MapSearchPanel pins={[]} query="없는가게" onOpenPin={noop} onSearchNewPlace={noop} />],
  ['MapSearchPanel(검색어 없음 → 미노출)', <MapSearchPanel pins={SEARCH_PINS} query="   " onSearchNewPlace={noop} />, true],
];

let failed = 0;
for (const [label, element, allowEmpty] of cases) {
  try {
    const html = renderToString(element);
    // 출처가 없는 항목은 배지를 그리지 않으므로(빈 출력) 정상입니다.
    if (allowEmpty ? html !== '' : !html || html.length < 20) throw new Error('empty output');
    console.log('OK   ' + label + '  (' + html.length + ' chars)');
  } catch (err) {
    failed += 1;
    console.log('FAIL ' + label + '  -> ' + (err && err.message));
  }
}
// ── 내용 확인: v1.1에서 새로 넣은 UI가 실제 렌더에 나오는지 ────────
const contentCases = [
  ['PinDetailSheet: [매장 정보 보기] 버튼', <PinDetailSheet pin={SEARCH_PIN} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />, ['매장 정보 보기', '카카오맵']],
  ['PinDetailSheet: 출처 배지 두 개', <PinDetailSheet pin={SEARCH_PIN} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />, ['카카오', '네이버']],
  ['PinDetailSheet: 링크 핀에는 원본 릴스 행', <PinDetailSheet pin={SEED_PINS[0]} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />, ['인스타 릴스', 'instagram.com/reel']],
  ['PasteScreen: 3탭(릴스·사진·가게명)', <PasteScreen active pinCount={4} isPro={false} onSaved={noop} onClose={noop} onGoProfile={noop} onToast={noop} />, ['릴스 링크', '사진으로 찾기', '가게명 찾기']],
  ['PasteScreen(가게명 찾기): 검색 입력·버튼', <PasteScreen active pinCount={4} isPro={false} initialMode="search" onSaved={noop} onClose={noop} onGoProfile={noop} onToast={noop} />, ['가게명 · 동네', '가게 찾기', '성수동 소금빵']],
  ['PasteScreen: 혼합 붙여넣기 안내', <PasteScreen active pinCount={4} isPro={false} onSaved={noop} onClose={noop} onGoProfile={noop} onToast={noop} />, ['문구를 통째로 붙여넣어도 돼요', '유튜브는 제목을']],
  ['ExtractedTitleNote: 읽어온 제목 표기', <ExtractedTitleNote title="성수동 소금빵 맛집 베통" />, ['읽어온 제목:', '성수동 소금빵 맛집 베통']],
  ['ExtractedTitleNote: 인스타 안내 + 원탭 버튼', <ExtractedTitleNote notice="인스타는 보안상 제목을 못 읽어와요" onSearchByName={noop} />, ['인스타는 보안상 제목을 못 읽어와요', '가게명으로 찾기']],
  // v2.17.1 — `주변 500m` 는 오른쪽 스택에서 왼쪽 하단 도구 메뉴 안으로 들어갔습니다(접힌 상태에는 안 보임).
  ['MapScreen: 목록 보기 · 내 위치 버튼(주변 500m 는 왼쪽 메뉴 안)', <MapScreen pins={SEED_PINS} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} />, ['목록 보기', '내 위치 찾기', '핀 표시 중']],
  ['PinDetailSheet: 내 위치에서의 실제 거리', <PinDetailSheet pin={SEED_PINS[0]} radiusMeters={300} distanceMeters={321.4} onClose={noop} onDelete={noop} onToast={noop} />, ['내 위치에서 321m']],
  ['GeofenceToast: 한 줄 문구 + 보기 버튼', <GeofenceToast message={nearbyToastMessage(2)} onPress={noop} />, ['반경 500m 안에 2곳 있어요', '보기']],
  ['GeofenceToast: 지도 버튼 이름(읽어 주는 문구)', <GeofenceToast message={nearbyToastMessage(4)} onPress={noop} />, ['반경 500m 알림 보기', 'geofence-toast']],
  // v1.7 — [매장 정보 보기] 가 앱 안 모달(네이버 플레이스 iframe)을 여는지
  ['PinDetailSheet: 매장 정보 보기 버튼은 앱 안 모달', <PinDetailSheet pin={SEARCH_PIN} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />, ['매장 정보 보기', '네이버 플레이스']],
  ['PinDetailSheet: 저장된 매장 페이지가 없어도 버튼 표시', <PinDetailSheet pin={{ ...SEARCH_PIN, placeUrl: '' }} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />, ['매장 정보 보기']],
  ['InAppPlaceModal.web: 헤더·iframe·폴백', <InAppPlaceModalWeb pin={SEARCH_PIN} onClose={noop} onToast={noop} />, ['베통 성수', '새 창으로 열기', 'm.place.naver.com/place/list?query=', 'iframe', '네이버 지도로 열기']],
  // v1.8 — [새 창으로 열기] 는 다크 헤더 안에서도 반투명 필(인라인 스타일)로 그려집니다.
  ['InAppPlaceModal.web: 새 창 버튼 반투명 다크 필', <InAppPlaceModalWeb pin={SEARCH_PIN} onClose={noop} onToast={noop} />, ['background-color:rgba(255,255,255,0.14)']],
  // v2.0
  ['MapScreen: 공유받은 지도 배너 + 모두 추가', <MapScreen pins={[]} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} sharedPins={SHARED_PINS} onAddSharedPins={noop} onDismissShared={noop} />, ['공유받은 맛집 지도 (2곳)', '내 지도에 모두 추가', '지도에 미리보기로 띄웠어요']],
  ['MapScreen(v2.17): 왼쪽 하단 지도 도구 버튼', <MapScreen pins={SEED_PINS} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} />, ['지도 도구 펼치기', '4 / 4 핀 표시 중']],
  // v2.1.3 — 위치를 아직 모를 때의 정직한 안내 배너 (가짜 '뚝섬' 문구 금지)
  // v2.17 — 위치를 모를 때의 안내 배너는 지도를 가리지 않게 **없어지고**, 상단은 분류 칩 한 줄만 남습니다.
  ['MapScreen(v2.17): 위치 전 — 상단 분류 칩 한 줄', <MapScreen pins={SEED_PINS} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} />, ['전체', '맛집', '카페']],
  ['PinDetailSheet: 전화 걸기(tel 링크)', <PinDetailSheet pin={{ ...SEARCH_PIN, phone: '0507-1375-1660' }} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />, ['0507-1375-1660', '전화 걸기 0507-1375-1660', '전화']],
  ['PinDetailSheet: 주소 원탭 복사', <PinDetailSheet pin={SEARCH_PIN} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />, ['서울특별시 성동구 연무장7가길 8', '주소 복사', '복사']],
  ['PinDetailSheet: naverPlaceId 있으면 상세 페이지 표기', <PinDetailSheet pin={{ ...SEARCH_PIN, naverPlaceId: '1736095566' }} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />, ['네이버 플레이스 상세']],
  ['PinDetailSheet: 공유받은 핀은 삭제 대신 안내', <PinDetailSheet pin={SHARED_PINS[0]} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} readOnly />, ['공유받은 맛집이에요']],
  // v2.34.0 — 헤더를 잡아 아래로 쓸어내려 닫는 시트 (루트·헤더에 testID 가 그대로 있어야 제스처를 붙일 수 있음)
  ['PinDetailSheet(v2.34): 시트 루트·헤더 testID', <PinDetailSheet pin={SEED_PINS[0]} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />, ['pin-detail-sheet', 'pin-sheet-header']],
  ['InAppPlaceModal.web: placeId 있으면 상세 페이지 직행', <InAppPlaceModalWeb pin={{ ...SEARCH_PIN, naverPlaceId: '1736095566' }} onClose={noop} onToast={noop} />, ['m.place.naver.com/place/1736095566/home']],
  // v2.1 — 계정 · 클라우드 동기화 카드
  ['ProfileScreen: 계정 카드 + 로그인/회원가입 전환', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured cloudUser={null} onSignIn={noop} onSignUp={noop} onMagicLink={noop} onOAuth={noop} onSignOut={noop} onSyncNow={noop} />, ['계정 · 클라우드 동기화', '로그인', '회원가입']],
  ['ProfileScreen: 매직링크 안내', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured cloudUser={null} onMagicLink={noop} />, ['매직링크']],
  ['ProfileScreen: 소셜 로그인 3개(카카오·구글·Apple)', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured cloudUser={null} onOAuth={noop} />, ['카카오', '구글', 'Apple']],
  ['ProfileScreen(미설정): 기기 안에만 저장 안내', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured={false} cloudUser={null} />, ['지금은 기기 안에만 저장돼요', 'SUPABASE_URL']],
  ['ProfileScreen(로그인 후): 이메일·동기화 켜짐·N개', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured cloudUser={{ id: 'u-1', email: 'andy@example.com' }} cloudPinCount={7} onSyncNow={noop} onSignOut={noop} />, ['andy@example.com', '클라우드 동기화 켜짐', '개 저장됨', '지금 동기화', '로그아웃', '계정 · 클라우드 동기화']],
  ['ProfileScreen(로그인 후): 동기화 실패 안내', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured cloudUser={{ id: 'u-1', email: 'a@b.com' }} cloudPinCount={3} cloudMessage="클라우드 저장 실패 · 기기에는 저장돼 있어요" />, ['기기에는 저장돼 있어요']],
  // v2.1.1 — 클립보드는 사용자가 버튼을 눌렀을 때만 (아이폰 사파리 붙여넣기 팝업 방지)
  // v2.18 — [클립보드에서 붙여넣기] 버튼은 없앴습니다(상훈 님 요청). 링크 입력창 + 추출 흐름만 남습니다.
  ['PasteScreen: 릴스·쇼츠로 찾기 탭 + 링크 입력창', <PasteScreen pinCount={4} isPro={false} onSaved={noop} onSavedMany={noop} onClose={noop} onGoProfile={noop} onToast={noop} />, ['릴스·쇼츠로 찾기', '릴스 · 쇼츠 링크', '장소 추출하기']],
  // v2.14 — 📸 사진으로 찾기 탭 (웹 = react-native-web 렌더에서 탭·카드·버튼이 보입니다)
  ['PasteScreen(사진으로 찾기): 업로드 카드 + 큰 버튼', <PasteScreen pinCount={4} isPro={false} initialMode="photo" onSaved={noop} onSavedMany={noop} onClose={noop} onGoProfile={noop} onToast={noop} />, ['인스타 캡처·스크린샷 올리기', '사진 속 가게 이름과 동네를 AI가 읽어', '사진·캡처 고르기']],
  // v2.2 — 분류 직접 고르기 · 만들기 · 관리
  ['CategoryPicker: 기본 3개 + 내 분류 + [분류 추가]', <CategoryPicker value="아이랑" onChange={noop} categories={['맛집', '카페', '가볼곳', '아이랑']} onAddCategory={noop} label="저장할 분류" hint="고른 분류로 저장해요" />, ['맛집', '카페', '가볼곳', '아이랑', '분류 추가', '저장할 분류', '고른 분류로 저장해요']],
  ['FilterChips: 커스텀 분류가 이어서 + 개수', <FilterChips value="아이랑" onChange={noop} categories={['맛집', '카페', '가볼곳', '아이랑']} counts={{ '전체': 6, '맛집': 3, '아이랑': 1 }} />, ['아이랑 1', '아이랑 필터']],
  ['MapScreen: 커스텀 분류 칩', <MapScreen pins={SEED_PINS.concat([{ ...SEARCH_PIN, id: 'custom-1', category: '아이랑' }])} categories={['맛집', '카페', '가볼곳', '아이랑']} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} onChangePinCategory={noop} onAddCategory={noop} />, ['아이랑 1']],
  ['PinDetailSheet: 분류 칩으로 바로 변경', <PinDetailSheet pin={{ ...SEARCH_PIN, category: '아이랑' }} categories={['맛집', '카페', '가볼곳', '아이랑']} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} onChangeCategory={noop} onAddCategory={noop} />, ['누르면 바로 바뀌어요', '분류 추가', '분류 아이랑']],
  ['PinDetailSheet: 공유받은 핀은 분류 변경 없음', <PinDetailSheet pin={SHARED_PINS[0]} categories={['맛집', '카페', '가볼곳', '아이랑']} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} readOnly onChangeCategory={noop} />, ['공유받은 맛집이에요']],
  // v2.18 — 분류 관리는 `분류 관리 ›` 행을 눌러 들어가는 **별도 서브 페이지**입니다.
  ['ProfileScreen: 분류 관리 서브 페이지(수정·삭제·추가)', <ProfileScreen initialSub="categories" name="이상훈" handle="odol" pins={SEED_PINS.concat([{ ...SEARCH_PIN, id: 'custom-1', category: '아이랑' }])} categories={['맛집', '카페', '가볼곳', '아이랑']} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} onAddCategory={noop} onRenameCategory={noop} onRemoveCategory={noop} />, ['분류 관리', '뒤로', '아이랑', '기본', '수정', '삭제', '새 분류 이름', '핀 1개']],
  // v2.5 — 🔍 검색 · 📋 목록 보기
  ['MapScreen: 헤더 🔍 돋보기(지도 위 검색창은 없음)', <MapScreen pins={SEED_PINS} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} header={{ onPressSearch: noop, onPressAlerts: noop, onPressMenu: noop }} />, ['장소 검색', '알림 모음', '메뉴', '맛집']],
  ['MapScreen: [목록 보기] 버튼', <MapScreen pins={SEED_PINS} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} />, ['목록 보기']],
  ['PinListView: 가까운 순 + 거리 + 분류 색 점', <PinListView pins={SEED_PINS} categories={['맛집', '카페', '가볼곳', '아이랑']} filter="전체" myCoords={{ lat: 37.5828, lng: 126.7141 }} onSelectPin={noop} />, ['가까운 순', '성수동 소금빵집', '맛집']],
  ['PinListView: 내 위치 없으면 최신순', <PinListView pins={SEED_PINS} filter="전체" myCoords={null} onSelectPin={noop} />, ['최신순']],
  ['PinListView: 검색 결과 없음 안내', <PinListView pins={[]} query="없는가게" filter="전체" myCoords={null} onSelectPin={noop} onClearQuery={noop} />, ['검색 결과가 없어요', '검색어 지우기']],
  ['PinListView: 핀 없음 안내', <PinListView pins={[]} filter="전체" myCoords={null} onSelectPin={noop} onGoPaste={noop} />, ['아직 저장한 핀이 없어요', '링크 붙여넣으러 가기']],
  // v2.6 — 검색 결과 2곳 이상 → 지도 위 결과 목록
  ['PinSearchResults: 검색어 + N곳 + [전체 N곳]', <PinSearchResults pins={SEARCH_PINS.slice(0, 2)} query="한성" categories={['맛집', '카페']} myCoords={{ lat: 37.5828, lng: 126.7141 }} onOpenPin={noop} onShowAll={noop} />, ['‘한성’ 검색 · 2곳', '한성치킨', '한성돈까스', '전체 2곳']],
  ['PinSearchResults: 4행까지만 + 남은 개수 안내', <PinSearchResults pins={SEARCH_PINS} query="한성" myCoords={null} onOpenPin={noop} onShowAll={noop} />, ['전체 5곳', '한성냉면', '외 1곳 더 있어요']],
  // v2.35.0 — 지도 상단 통합 검색창
  ['MapSearchBar: 알약(아이콘·안내문구·✕)', <MapSearchBar value="한성" onChange={noop} onClear={noop} />, ['map-search-bar', 'map-search-input', '검색어 지우기', '한성']],
  ['MapSearchPanel: 내 핀 결과 + [전체 N곳] + 새 장소 찾기', <MapSearchPanel pins={SEARCH_PINS.slice(0, 2)} query="한성" categories={['맛집', '카페']} myCoords={{ lat: 37.5828, lng: 126.7141 }} onOpenPin={noop} onShowAll={noop} onSearchNewPlace={noop} />, ['‘한성’ 검색 · 2곳', '한성치킨', '가게명으로 찾아 등록하기', 'map-search-new-place']],
  ['MapSearchPanel: 내 핀 0곳이어도 새 장소 찾기 버튼', <MapSearchPanel pins={[]} query="없는가게" onOpenPin={noop} onSearchNewPlace={noop} />, [MAP_SEARCH_EMPTY_HINT, '가게명으로 찾아 등록하기']],
  ['MapScreen(v2.35): 지도 상단 통합 검색창이 분류 칩 위에', <MapScreen pins={SEED_PINS} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} onSearchNewPlace={noop} />, ['map-search-input', MAP_SEARCH_PLACEHOLDER, '전체', '맛집']],
];

for (const [label, element, needles] of contentCases) {
  try {
    const html = renderToString(element);
    const missing = needles.filter((n) => html.indexOf(n) < 0);
    if (missing.length) throw new Error('없음: ' + missing.join(', '));
    console.log('OK   ' + label);
  } catch (err) {
    failed += 1;
    console.log('FAIL ' + label + '  -> ' + (err && err.message));
  }
}

// ── v2.1.3: 위치를 모를 때의 배너는 사실만 ─────────────────────
// (사용자 제보: 소래포구에 있는데 "반경 300m 앞 · 뚝섬 카페" 가 떴습니다)
const noLocationHtml = renderToString(
  <MapScreen pins={SEED_PINS} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} />
);
const fakeBannerChecks = [
  ['MapScreen(위치 전): "반경 300m 앞" 가짜 배너 없음', noLocationHtml.indexOf('반경 300m 앞') < 0],
  ['MapScreen(위치 전): "저장한 맛집이 있어요" 가짜 배너 없음', noLocationHtml.indexOf('저장한 맛집이 있어요') < 0],
  ['MapScreen(위치 전): "뚝섬" 가짜 가게명 없음', noLocationHtml.indexOf('뚝섬') < 0],
  ['MapScreen(위치 전): 가짜 "지금" 배지 없음', noLocationHtml.indexOf('>지금<') < 0],
  ['MapScreen(위치 전): 칩 아래 중복 안내 제거', noLocationHtml.indexOf('내 위치를 켜면 실제 거리와 반경') < 0],
  ['MapScreen(v2.17, 위치 전): 반경 밖 안내 배너 없음(지도를 가리지 않음)', noLocationHtml.indexOf('내 위치를 켜면 가까운 맛집과 500m 알림이 보여요') < 0],
];
for (const [label, ok] of fakeBannerChecks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label);
  }
}

// v2.28.0 — 토스트도 스스로 문구를 만들지 않습니다 (문구는 지도 화면이 개수로 만듭니다)
const v228RuleChecks = [
  ['v2.28 토스트: 반경 안에 0곳이면 안 띄움', shouldToastNearby(0) === false && nearbyToastMessage(0) === ''],
  ['v2.28 토스트: 반경 안 N곳 → 한 줄 문구', nearbyToastMessage(2) === '반경 500m 안에 2곳 있어요'],
  ['v2.32.2 토스트: 6초 뒤 스스로 사라짐(5~6초)', GEOFENCE_TOAST_MS === 6000, String(GEOFENCE_TOAST_MS)],
  ['v2.28 토스트: 문구가 비면 아무것도 안 그림', renderToString(<GeofenceToast message="" onPress={noop} />) === ''],
];
for (const [label, ok, extra] of v228RuleChecks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// 직접 검색 핀은 원본 릴스 링크가 없으므로 그 자리가 비어야 합니다.
const searchPinHtml = renderToString(<PinDetailSheet pin={SEARCH_PIN} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />);
if (searchPinHtml.indexOf('instagram.com') >= 0) {
  failed += 1;
  console.log('FAIL PinDetailSheet: 원본 링크 없는 핀에 링크가 나옴');
} else {
  console.log('OK   PinDetailSheet: 원본 링크 없는 핀은 링크 행 없음');
}

// ── v1.6: 네이버 지도(NAVER Maps Dynamic Map v3) 스크립트 규격 ──────
const mapSource = fs.readFileSync(path.join(process.cwd(), 'src/components/RealMapView.web.js'), 'utf8');

const mapChecks = [
  ['네이버 지도: 신규 규격 ncpKeyId 사용', buildNaverScriptUrl('a1mxcz4n34') === 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=a1mxcz4n34', buildNaverScriptUrl('a1mxcz4n34')],
  ['네이버 지도: 구 규격 ncpClientId 미사용', buildNaverScriptUrl(NAVER_MAP_CLIENT_ID).indexOf('ncpClientId') < 0],
  ['네이버 지도: 기본 클라이언트 ID', NAVER_MAP_CLIENT_ID === 'a1mxcz4n34', NAVER_MAP_CLIENT_ID],
  ['네이버 지도: 값 없으면 기본 ID 로 폴백', buildNaverScriptUrl('').indexOf('ncpKeyId=a1mxcz4n34') > 0],
  ['폴백 배너: 도메인 등록 안내 문구', FALLBACK_NOTICE === '네이버 콘솔에 도메인 등록 확인 중 · 임시 지도 표시', FALLBACK_NOTICE],
  ['폴백 배너: 네트워크 실패 문구', FALLBACK_NOTICE_NETWORK.indexOf('임시 지도 표시') > 0, FALLBACK_NOTICE_NETWORK],
  ['인증 실패 훅: window.navermap_authFailure 처리', mapSource.indexOf('navermap_authFailure') > 0],
  ['스크립트 로드 실패 처리(onerror)', mapSource.indexOf("script.onerror") > 0],
  ['반경 500m 원: naver.maps.Circle', mapSource.indexOf('new nv.Circle') > 0],
  ['fitBounds · morph · panTo 사용', mapSource.indexOf('fitBounds') > 0 && mapSource.indexOf('morph') > 0 && mapSource.indexOf('panTo') > 0],
  ['내 위치 파란 점 마커', mapSource.indexOf('myDotIcon') > 0],
  ['폴백 지도(Leaflet) 유지', mapSource.indexOf('leaflet.js') > 0 && mapSource.indexOf('tile.openstreetmap.org') > 0],
  ['비밀키 참조 없음', !/CLIENT_SECRET|Client-Secret|SECRET/.test(mapSource)],
];

for (const [label, ok, extra] of mapChecks) {
  if (ok) {
    console.log('OK   ' + label);
  } else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// EXPO_PUBLIC_NAVER_MAP_CLIENT_ID 가 있으면 그 값이 우선합니다.
process.env.EXPO_PUBLIC_NAVER_MAP_CLIENT_ID = 'env-key-999';
if (resolveNaverClientId() === 'env-key-999' && buildNaverScriptUrl(resolveNaverClientId()).indexOf('ncpKeyId=env-key-999') > 0) {
  console.log('OK   네이버 지도: EXPO_PUBLIC_NAVER_MAP_CLIENT_ID 우선');
} else {
  failed += 1;
  console.log('FAIL 네이버 지도: EXPO_PUBLIC_NAVER_MAP_CLIENT_ID 우선 -> ' + resolveNaverClientId());
}
delete process.env.EXPO_PUBLIC_NAVER_MAP_CLIENT_ID;
if (resolveNaverClientId() === NAVER_MAP_CLIENT_ID) {
  console.log('OK   네이버 지도: env 없으면 기본 ID 로 복귀');
} else {
  failed += 1;
  console.log('FAIL 네이버 지도: env 없으면 기본 ID 로 복귀');
}

// ── v1.7: 인앱 네이버 플레이스 모달 ──────────────────────────
const webModalSource = fs.readFileSync(path.join(process.cwd(), 'src/components/InAppPlaceModal.web.js'), 'utf8');
const nativeModalSource = fs.readFileSync(path.join(process.cwd(), 'src/components/InAppPlaceModal.js'), 'utf8');
const sheetSource = fs.readFileSync(path.join(process.cwd(), 'src/components/PinDetailSheet.js'), 'utf8');
const linksSource = fs.readFileSync(path.join(process.cwd(), 'src/utils/links.js'), 'utf8');

const placeChecks = [
  ['모달 주소: m.place.naver.com/place/list', linksSource.indexOf('m.place.naver.com/place/list?query=') > 0],
  ['웹 모달: iframe 으로 네이버 플레이스 렌더', webModalSource.indexOf("'iframe'") > 0 && webModalSource.indexOf('naverPlaceSearchUrl') > 0],
  ['웹 모달: 헤더 [새 창으로 열기]·[닫기]', webModalSource.indexOf('새 창으로 열기') > 0 && webModalSource.indexOf('accessibilityLabel="닫기"') > 0],
  ['웹 모달: 외부 열기는 진짜 링크(target=_blank)', webModalSource.indexOf("target: '_blank'") > 0 && webModalSource.indexOf('rel: \'noopener noreferrer\'') > 0],
  ['웹 모달: 차단 감지(about:blank + 시간 초과)', webModalSource.indexOf('about:blank') > 0 && IFRAME_LOAD_TIMEOUT_MS >= 3000],
  ['웹 모달: 차단 안내 문구 + 원탱 폴백', BLOCKED_NOTICE.indexOf('열리지 않아요') > 0 && BLOCKED_HINT.indexOf('네이버 지도로 열기') > 0],
  ['웹 모달: ESC 로 닫기', webModalSource.indexOf("'Escape'") > 0],
  ['웹 모달: 전체 화면 fixed 오버레이', webModalSource.indexOf("position: 'fixed'") > 0],
  ['웹 모달: document.body 포털(탭바 위에 올림)', webModalSource.indexOf('createPortal') > 0],
  ['웹 모달: 바깥(어두운 곳) 누르면 닫기', webModalSource.indexOf('backdropFill') > 0],
  ['웹 모달: iframe sandbox 미사용(네이버 로그인·지도 동작)', webModalSource.indexOf('sandbox') < 0],
  ['네이티브 모달: 같은 헤더·네이버 지도 열기', nativeModalSource.indexOf('새 창으로 열기') > 0 && nativeModalSource.indexOf('네이버 지도로 열기') > 0],
  ['PinDetailSheet: 모달 사용, openPlace 직접 호출 없음', sheetSource.indexOf('InAppPlaceModal') > 0 && sheetSource.indexOf('openPlace') < 0],
  ['모달 제목: 가게명 · 동네', placeModalTitle(SEARCH_PIN) === '베통 성수 · 성수동', placeModalTitle(SEARCH_PIN)],
  ['차단 판정: 다른 출처(doc null)는 차단 아님', looksLikeBlockedFrame(null, 99999, true) === false],
  ['차단 판정: 빈 about:blank + 시간 경과 → 차단', looksLikeBlockedFrame({ location: { href: 'about:blank' }, body: { childElementCount: 0 } }, BLANK_SETTLE_MS, false) === true],
  ['차단 판정: 로드 직후 about:blank 는 오판 없음', looksLikeBlockedFrame({ location: { href: 'about:blank' }, body: { childElementCount: 0 } }, 300, false) === false],
  ['차단 판정: 내용이 있으면 차단 아님', looksLikeBlockedFrame({ location: { href: 'about:blank' }, body: { childElementCount: 3 } }, 99999, true) === false],
  // v1.8 — 모달 헤더를 다크 차콜로: 네이버 플레이스(흰 배경)와 확실히 구분
  ['테마: 모달 헤더 다크 차콜 #1C1C1E', colors.charcoal === '#1C1C1E', colors.charcoal],
  ['테마: 헤더 보조 텍스트 #A1A1AA · 반투명 필', colors.charcoalSub === '#A1A1AA' && colors.charcoalPill === 'rgba(255,255,255,0.14)', colors.charcoalSub + ' / ' + colors.charcoalPill],
  ['웹 모달: 헤더 배경 charcoal + 차콜 구분선', webModalSource.indexOf('backgroundColor: colors.charcoal,') > 0 && webModalSource.indexOf('borderBottomColor: colors.charcoalLine') > 0],
  ['웹 모달: 가게명 흰색 · 헤더 부텍스트 없음', /title: \{\s*\.\.\.typography\.h3,[\s\S]{0,60}?color: colors\.white/.test(webModalSource) && webModalSource.indexOf('styles.subtitle') < 0],
  ['웹 모달: [새 창] 반투명 필 · 닫기 흰 ✕', webModalSource.indexOf('backgroundColor: colors.charcoalPill') > 0 && /name="close"[^>]*color=\{colors\.white\}/.test(webModalSource)],
  ['네이티브 모달: 헤더 블록 다크 차콜 + 흰 ✕', nativeModalSource.indexOf('backgroundColor: colors.charcoal,') > 0 && nativeModalSource.indexOf('backgroundColor: colors.charcoalPill') > 0 && /name="close"[^>]*color=\{colors\.white\}/.test(nativeModalSource)],
];

for (const [label, ok, extra] of placeChecks) {
  if (ok) {
    console.log('OK   ' + label);
  } else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// ── v2.0: 여러 곳 선택 저장 UI · PWA 메타 · 아이콘 ─────────────────
const pasteSource = fs.readFileSync(path.join(process.cwd(), 'src/screens/PasteScreen.js'), 'utf8');
const mapSource2 = fs.readFileSync(path.join(process.cwd(), 'src/screens/MapScreen.js'), 'utf8');
const profileSource = fs.readFileSync(path.join(process.cwd(), 'src/screens/ProfileScreen.js'), 'utf8');
const appSource = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');

const v2Checks = [
  ['PasteScreen: 후보마다 체크박스(전체 선택 토글)', pasteSource.indexOf("'전체 선택'") > 0 && pasteSource.indexOf('toggleAll') > 0],
  ['PasteScreen: 선택한 N곳 한 번에 저장', pasteSource.indexOf('곳 한 번에 저장') > 0 && pasteSource.indexOf('savePins') > 0],
  ['PasteScreen: 선택 개수 표시', pasteSource.indexOf('선택 {selectedCandidates.length}곳') > 0],
  ['PasteScreen: 일괄 저장은 onSavedMany 로', pasteSource.indexOf('onSavedMany') > 0],
  ['PasteScreen: 못 찾은 항목 안내', pasteSource.indexOf('못 찾은 항목') > 0],
  ['MapScreen: 공유받은 지도를 지도에 합쳐 그림', mapSource2.indexOf('previewPins.concat(filtered)') > 0],
  ['MapScreen: 공유받은 핀은 읽기 전용 시트', mapSource2.indexOf('readOnly={selectedIsShared}') > 0],
  ['MapScreen: navigator.share 지원 시 공유 시트', mapSource2.indexOf('canNativeShare') > 0 && mapSource2.indexOf('buildShareUrl') > 0],
  ['ProfileScreen: [내 지도 공유하기] 버튼', profileSource.indexOf('내 지도 공유하기') > 0 && profileSource.indexOf('buildShareUrl(pins)') > 0],
  ['App: 공유 링크(?share=) 읽어 배너로', appSource.indexOf('readShareFromLocation') > 0 && appSource.indexOf('handleAddSharedPins') > 0],
  ['App: 일괄 저장 시 이름+좌표 중복 제거', appSource.indexOf('splitNewPins') > 0 || appSource.indexOf('planPinAddition') > 0],
  // v2.8 — 추출 결과 히어로 카드: 영상 썸네일을 배경 사진으로, 없으면 분류 이모지 폴백
  [
    'PasteScreen: 히어로 카드 썸네일 배경(Image + cover)',
    pasteSource.indexOf('heroThumbnail') > 0 &&
      pasteSource.indexOf('source={{ uri: heroThumbnail }}') > 0 &&
      pasteSource.indexOf('resizeMode="cover"') > 0,
  ],
  [
    'PasteScreen(v2.20.2): 사진·썸네일 없으면 큰 히어로 배너 미노출(이모지 타일 폴백 제거)',
    pasteSource.indexOf('{!!heroThumbnail && (') > 0 &&
      pasteSource.indexOf('styles.heroTile') < 0 &&
      pasteSource.indexOf('heroImage') > 0,
  ],
  [
    'PasteScreen: 사진 위 라벨 가독용 스크림',
    pasteSource.indexOf('heroScrim') > 0 && pasteSource.indexOf('rgba(20, 16, 12, 0.28)') > 0,
  ],
  [
    'PasteScreen: 추출 메타의 thumbnail 을 화면 상태로',
    pasteSource.indexOf('thumbnail: result.sourceThumbnail') > 0,
  ],
];

for (const [label, ok] of v2Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label);
  }
}

// ── v2.1: Supabase 로그인 · 클라우드 동기화 배선 ──────────────────
const cloudSyncSource = fs.readFileSync(path.join(process.cwd(), 'src/services/cloudSync.js'), 'utf8');
const supabaseSource = fs.readFileSync(path.join(process.cwd(), 'src/services/supabase.js'), 'utf8');
const authConfigSource = fs.readFileSync(path.join(process.cwd(), 'api/auth-config.js'), 'utf8');
const schemaSource = fs.readFileSync(path.join(process.cwd(), 'supabase/schema.sql'), 'utf8');

const v21Checks = [
  ['ProfileScreen: 계정 카드 컴포넌트', profileSource.indexOf('function AccountCard') > 0 && profileSource.indexOf('계정 · 클라우드 동기화') > 0],
  ['ProfileScreen: 미설정이면 안내 토스트만', profileSource.indexOf('로그인 연결이 아직 준비되지 않았어요') > 0],
  ['ProfileScreen: 로그인 후 [지금 동기화]·[로그아웃]', profileSource.indexOf('지금 동기화') > 0 && profileSource.indexOf('로그아웃') > 0],
  ['App: 로그인 세션 복원·구독', appSource.indexOf('getSession') > 0 && appSource.indexOf('onAuthStateChange') > 0],
  ['App: 로컬·클라우드 병합', appSource.indexOf('planCloudSync') > 0 && appSource.indexOf('syncWithCloud') > 0],
  ['App: 핀 저장/일괄/공유/삭제 → 백그라운드 sync', ['pushPinsToCloud', 'removePinFromCloud'].every((k) => appSource.indexOf(k) > 0) && (appSource.match(/pushPinsToCloud\(/g) || []).length >= 3],
  ['App: 설정 조회는 ready 뒤에 (웹 /api/auth-config)', appSource.indexOf('loadSupabaseConfig()') > 0 && /if \(!ready\) return;[\s\S]{0,80}loadSupabaseConfig/.test(appSource)],
  ['cloudSync: 로그인 4종 + 세션', ['signInWithEmail', 'signUpWithEmail', 'signInWithMagicLink', 'signInWithOAuth', 'signOut', 'getSession'].every((k) => cloudSyncSource.indexOf('export async function ' + k) > 0)],
  ['cloudSync: 핀 CRUD 4종', ['fetchCloudPins', 'upsertCloudPin', 'upsertCloudPins', 'deleteCloudPin'].every((k) => cloudSyncSource.indexOf('export async function ' + k) > 0)],
  ['cloudSync: mergeLocalAndCloudPins 공개', cloudSyncSource.indexOf('export function mergeLocalAndCloudPins') > 0],
  ['cloudSync: 삭제는 user_id + id 두 조건', /\.delete\(\)\s*\.eq\('user_id', userId\)\s*\.eq\('id'/.test(cloudSyncSource)],
  ['supabase: window·localStorage 를 import 시점에 읽지 않음', !/^\s*(const|let|var)\s+\w+\s*=\s*window\./m.test(supabaseSource) && supabaseSource.indexOf('typeof window') > 0],
  ['supabase: detectSessionInUrl 은 브라우저에서만', supabaseSource.indexOf('detectSessionInUrl: isBrowser()') > 0],
  ['supabase: 미설정이면 null (로컬 전용 모드)', supabaseSource.indexOf('if (!cfg.url || !cfg.anonKey) return null') > 0],
  ['api/auth-config: service_role 은 반환하지 않음', authConfigSource.indexOf('SERVICE_ROLE') > 0 && /refusing/.test(authConfigSource) && authConfigSource.indexOf('service_role":') < 0],
  ['스키마: public.pins + RLS 4정책', schemaSource.indexOf('create table if not exists public.pins') > 0 && (schemaSource.match(/create policy /g) || []).length === 4],
  ['README: v2.1 안내', fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8').indexOf('v2.1') > 0],
];

for (const [label, ok] of v21Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label);
  }
}

// ── v2.1.1: 탭 진입 시 자동 클립보드 읽기 제거 (아이폰 사파리 붙여넣기 팝업) ──
// 주석은 빼고 '실제 코드'만 검사합니다. (설명 주석에 적힌 옛 코드 때문에 오탐하지 않게)
const pasteCode = pasteSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const v211Checks = [
  // v2.18 — 붙여넣기 버튼을 없애면서 클립보드 읽기 코드 자체를 걷어냈습니다(0건이 정상).
  ['PasteScreen: 클립보드 읽기 코드 없음(getStringAsync 0건)', (pasteCode.match(/getStringAsync\(/g) || []).length === 0, String((pasteCode.match(/getStringAsync\(/g) || []).length)],
  ['PasteScreen: useEffect 로 클립보드를 읽지 않음', !/useEffect\([\s\S]{0,120}readClipboard/.test(pasteCode) && pasteCode.indexOf('if (active && !isSearch)') < 0],
  ['PasteScreen: navigator.clipboard.readText 직접 호출 없음', pasteCode.indexOf('readText(') < 0],
  ['PasteScreen: [클립보드에서 붙여넣기] 버튼 없음', pasteCode.indexOf('클립보드에서 붙여넣기') < 0],
  ['PasteScreen: 자동 감지 배너 문구 제거', pasteSource.indexOf('방금 복사한 링크가 있어요') < 0],
  ['App: PasteScreen 에 active(자동 읽기 트리거) 미전달', /<PasteScreen[\s\S]{0,120}?active=/.test(appSource) === false],
];
for (const [label, ok, extra] of v211Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// ── v2.1.2: 지도 우측 하단 컨트롤 일직선 정렬 + 알림 토스트 다크 대비 (v2.28.0: 배너 → 한줄 토스트) ──
const bannerSource = fs.readFileSync(path.join(process.cwd(), 'src/components/GeofenceToast.js'), 'utf8');
const bannerCode = bannerSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const v212Checks = [
  ['지도 우측 하단: +/− 박스가 목록 보기·주변 500m·내 위치와 같은 rightInset',
    mapSource.indexOf('right: mapControls.rightInset') > 0 && mapSource2.indexOf('right: mapControls.rightInset') > 0 && mapSource.indexOf('right: 68') < 0,
    'zoomCol/actionCol 둘 다 mapControls.rightInset'],
  ['지도 우측 하단: +/− 는 NAVER 로고 위로 충분히 띄움 (≥20px)',
    mapControls.zoomBottom >= 20, String(mapControls.zoomBottom)],
  // v2.19.2 — 자리를 맞바꿔 `내 위치` FAB 가 맨 아래, 그 위에 +/− 박스
  ['지도 우측 하단: 내 위치 FAB(아래) 와 +/− 박스(위) 가 겹치지 않음',
    mapControls.zoomBottom >= mapControls.actionBottom + mapControls.fabSize + 4,
    String(mapControls.zoomBottom) + ' vs ' + String(mapControls.actionBottom + mapControls.fabSize)],
  ['반경 알림 토스트: 다크 알약 + 흰 글씨',
    bannerCode.indexOf("backgroundColor: 'rgba(17,24,39,0.94)'") > 0 && /text: \{[\s\S]{0,160}color: colors\.white/.test(bannerCode), bannerSource.length + ' bytes'],
  ['반경 알림 토스트: 점(●)은 브랜드 딥 틸',
    /dot: \{[\s\S]{0,120}colors\.brand/.test(bannerCode), '딥 틸 점'],
  ['지도 우측 하단: 주변 목록 패널이 버튼 스택을 가리지 않음',
    mapControls.panelBottom >= mapControls.actionBottom + mapControls.actionStackHeight && mapSource2.indexOf('bottom: mapControls.panelBottom') > 0,
    String(mapControls.panelBottom) + ' vs ' + String(mapControls.actionBottom + mapControls.actionStackHeight)],
];
for (const [label, ok, extra] of v212Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// ── v2.3: 지도 핀 아래 가게 이름 라벨 ─────────────────────
const SAMPLE_PIN = { id: 'pin-label-1', name: '한성치킨', category: '맛집' };
const LONG_PIN = { id: 'pin-label-2', name: '황금코다리 인천논현점', category: '맛집' };
const plainIcon = pinIconHtml(SAMPLE_PIN, false);
const onIcon = pinIconHtml(SAMPLE_PIN, true);
const longLabel = pinLabelHtml(LONG_PIN, false);
const anchorOff = pinAnchor(false);
const anchorOn = pinAnchor(true);
const mapCanvasSource = fs.readFileSync(path.join(process.cwd(), 'src/components/MapCanvas.js'), 'utf8');
const v23Checks = [
  ['핀 라벨: 마커 content 에 가게 이름이 함께 들어감',
    plainIcon.indexOf('한성치킨') > 0 && plainIcon.indexOf('border-radius:50%') > 0,
    String(plainIcon.length) + ' bytes'],
  ['핀 라벨: 이름은 HTML 이스케이프 (XSS·깨짐 방지)',
    escapeHtml('<b>&"x"') === '&lt;b&gt;&amp;&quot;x&quot;' && pinLabelHtml({ name: 'A&B <C>' }, false).indexOf('A&amp;B &lt;C&gt;') > 0,
    escapeHtml('A&B <C>')],
  ['핀 라벨: 동그라미 아래(마진) 가운데 정렬',
    plainIcon.indexOf('flex-direction:column') > 0 && plainIcon.indexOf('align-items:center') > 0 &&
      plainIcon.indexOf('margin-top:' + PIN_LABEL_GAP + 'px') > 0 && plainIcon.indexOf('translateX(-50%)') > 0,
    'gap ' + PIN_LABEL_GAP + 'px'],
  ['핀 라벨: 11px 굵은 글씨 + 흰 알약(그림자·얇은 테두리)',
    longLabel.indexOf('font-size:' + PIN_LABEL_FONT_SIZE + 'px') > 0 && longLabel.indexOf('font-weight:800') > 0 &&
      longLabel.indexOf('background:rgba(255,255,255,0.96)') > 0 && longLabel.indexOf('border:1px solid') > 0 &&
      longLabel.indexOf('box-shadow') > 0,
    'font ' + PIN_LABEL_FONT_SIZE + 'px/800'],
  ['핀 라벨: 긴 이름은 max-width + 말줄임(…)',
    longLabel.indexOf('max-width:' + PIN_LABEL_MAX_WIDTH + 'px') > 0 && longLabel.indexOf('white-space:nowrap') > 0 &&
      longLabel.indexOf('overflow:hidden') > 0 && longLabel.indexOf('text-overflow:ellipsis') > 0,
    'max-width ' + PIN_LABEL_MAX_WIDTH + 'px'],
  ['핀 라벨: `한성치킨`(4글자)은 말줄임 없이 다 보이는 폭',
    PIN_LABEL_MAX_WIDTH >= 4 * PIN_LABEL_FONT_SIZE + 12,
    PIN_LABEL_MAX_WIDTH + 'px ≥ ' + (4 * PIN_LABEL_FONT_SIZE + 12) + 'px'],
  ['핀 라벨: 선택된 핀은 그 분류 색 알약 + 흰 글씨로 강조',
    onIcon.indexOf('background:' + DEFAULT_CATEGORY_COLORS['맛집']) > 0 && onIcon.indexOf('color:#FFFFFF') > 0 &&
      plainIcon.indexOf('color:' + colors.charcoal) > 0,
    DEFAULT_CATEGORY_COLORS['맛집']],
  ['핀 앵커: 라벨이 붙어도 동그라미 중심 = 위경도 (0, size/2)',
    anchorOff.x === 0 && anchorOff.y === pinSize(false) / 2 && anchorOn.x === 0 && anchorOn.y === pinSize(true) / 2 &&
      pinSize(false) === 18 && pinSize(true) === 26,
    JSON.stringify([anchorOff, anchorOn])],
  ['핀 앵커: 네이버 마커가 위 anchor 를 그대로 사용',
    mapSource.indexOf('new nv.Point(anchor.x, anchor.y)') > 0 && mapSource.indexOf('pinIconHtml(pin, selected, categories)') > 0],
  ['핀 라벨: 라벨도 마커 content 라 탭하면 핀 상세가 열림',
    mapSource.indexOf("nv.Event.addListener(marker, 'click'") > 0 && plainIcon.indexOf('cursor:pointer') > 0 &&
      mapSource.indexOf('clickable: true') > 0],
  ['폴백 지도(Leaflet)도 같은 라벨 divIcon 사용',
    mapSource.indexOf('L.divIcon(') > 0 && mapSource.indexOf('iconAnchor: [anchor.x, anchor.y]') > 0 &&
      mapSource.indexOf('pinIconHtml(pin, isOn, categories)') > 0],
  ['네이티브 도식 지도(MapCanvas)도 핀 아래 이름 라벨',
    mapCanvasSource.indexOf('pinLabelWrap') > 0 && mapCanvasSource.indexOf('pinLabelText') > 0 &&
      /\+ pin\.name\}/.test(mapCanvasSource)],
];
for (const [label, ok, extra] of v23Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// PWA: index.html 메타 주입 (Expo 기본 템플릿에 실제로 들어가는지)
const EXPO_TEMPLATE =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />' +
  '<title>릴스핀</title><link rel="shortcut icon" href="/favicon.ico" /></head><body><div id="root"></div></body></html>';
const injected = injectPwaHead(EXPO_TEMPLATE);
const missingPwa = PWA_REQUIRED_MARKERS.filter((marker) => injected.html.indexOf(marker) < 0);
const pwaChecks = [
  ['PWA: apple-touch-icon · manifest · theme-color 주입', missingPwa.length === 0, missingPwa.join(', ')],
  ['PWA: <html lang="ko">', injected.html.indexOf('<html lang="ko">') > 0, injected.html.slice(0, 60)],
  ['PWA: viewport-fit=cover', injected.html.indexOf('viewport-fit=cover') > 0],
  ['PWA: 주입 태그 목록 기록', injected.added.length >= 8, String(injected.added.length)],
  ['PWA: 두 번 실행해도 중복 없음(idempotent)', injectPwaHead(injected.html).added.length === 0, String(injectPwaHead(injected.html).added.length)],
  ['PWA: 빈 HTML 은 그대로', injectPwaHead('').html === '' && injectPwaHead(null).added.length === 0],
];
for (const [label, ok, extra] of pwaChecks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// 2026-11-21 — VibeAiClub 사이트 소유 인증: <head> meta(방법 1) + /.well-known 정적 파일(방법 2)
const verifyMeta = '<meta name="vibeaiclub-verify" content="' + VIBEAICLUB_VERIFY_CODE + '" />';
const verifyFilePath = path.join(process.cwd(), 'public', VIBEAICLUB_VERIFY_PATH);
const verifyFileBody = fs.existsSync(verifyFilePath) ? fs.readFileSync(verifyFilePath, 'utf8').trim() : '';
const verifyChecks = [
  ['소유 인증: <head> 에 vibeaiclub-verify meta (방법 1)', injected.html.indexOf(verifyMeta) >= 0, injected.added.join(', ')],
  ['소유 인증: meta 의 content 가 발급 코드와 같음', (injected.html.match(/<meta name="vibeaiclub-verify" content="([^"]*)"/) || [])[1] === VIBEAICLUB_VERIFY_CODE],
  ['소유 인증: public/' + VIBEAICLUB_VERIFY_PATH + ' 본문 = 코드 (방법 2)', verifyFileBody === VIBEAICLUB_VERIFY_CODE, JSON.stringify(verifyFileBody)],
  ['소유 인증: meta 는 한 번만 들어감(idempotent)', (injected.html.match(/name="vibeaiclub-verify"/g) || []).length === 1],
];
for (const [label, ok, extra] of verifyChecks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// v2.38.0 — Gmarket Sans 주입 (본문 Medium · 제목/버튼 Bold, 아이콘 폰트는 건드리지 않음)
const missingFontMarkers = FONT_REQUIRED_MARKERS.filter((marker) => injected.html.indexOf(marker) < 0);
const fontCss = (injected.html.match(/@font-face\{font-family:'Gmarket Sans'[^}]*\}/g) || []).join('');
const fontChecks = [
  ['폰트: Gmarket Sans 주입 표식 전부', missingFontMarkers.length === 0, missingFontMarkers.join(', ')],
  ['폰트: 굵기별 @font-face 6개(400~900)', (fontCss.match(/@font-face/g) || []).length === 6, String((fontCss.match(/@font-face/g) || []).length)],
  ['폰트: Medium(500) · Bold(800) 파일 연결', fontCss.indexOf('font-weight:500') >= 0 && fontCss.indexOf('GmarketSans-Bold.woff2') >= 0],
  ['폰트: font-display:swap (첫 화면은 시스템 글꼴로 먼저)', fontCss.indexOf('font-weight:500;font-display:swap') >= 0],
  ['폰트: 본문 규칙이 !important 를 쓰지 않음 (아이콘 인라인 ionicons 보호)', injected.html.indexOf('!important') < 0],
  ['폰트: 두 번 실행해도 중복 없음(idempotent)', injectPwaHead(injected.html).added.length === 0],
];
for (const [label, ok, extra] of fontChecks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// v2.38.0 — 폰트 파일이 실제 WOFF/WOFF2 인지 (빈 파일·404 HTML 이 아닌지)
const woffMagic = (relPath) => {
  const buf = fs.readFileSync(path.join(process.cwd(), 'public', 'fonts', relPath));
  if (buf.slice(0, 4).toString('latin1') === 'wOFF') return true;
  return buf.slice(0, 4).toString('latin1') === 'wOF2';
};
const fontFileChecks = FONT_FILES.map((name) => [
  '폰트 파일: public/fonts/' + name,
  fs.existsSync(path.join(process.cwd(), 'public', 'fonts', name)) && woffMagic(name),
]);
for (const [label, ok] of fontFileChecks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label);
  }
}

// v2.38.0 — 상세 시트 원본 주소는 `https://www.` 를 빼고 보여 줍니다(폰트가 넓어져 한 줄에서 잘리던 문제)
const urlChecks = [
  ['원본 주소 표기: https://www. 제거', shortUrlForDisplay('https://www.instagram.com/reel/C6aRaCafe9/') === 'instagram.com/reel/C6aRaCafe9'],
  ['원본 주소 표기: youtu.be 유지', shortUrlForDisplay('https://youtu.be/abc123') === 'youtu.be/abc123'],
  ['원본 주소 표기: 빈 값은 빈 문자열', shortUrlForDisplay('') === '' && shortUrlForDisplay(null) === ''],
  ['원본 주소 표기: 데이터는 그대로(표시만 짧게)', SEED_PINS[0].sourceUrl.startsWith('https://')],
];
for (const [label, ok] of urlChecks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label);
  }
}

// PWA: manifest.json · 아이콘 파일 실제 크기
const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'manifest.json'), 'utf8'));
function pngSize(relPath) {
  const buf = fs.readFileSync(path.join(process.cwd(), relPath));
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
const icon1024 = pngSize('assets/icon.png');
const appleIcon = pngSize('public/apple-touch-icon.png');
const icon192 = pngSize('public/icon-192.png');
const icon512 = pngSize('public/icon-512.png');
const manifestIcons = (manifest.icons || []).map((i) => i.src + '@' + i.sizes);
const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const expoConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'app.json'), 'utf8')).expo;

const assetChecks = [
  ['아이콘: assets/icon.png 1024×1024', icon1024.width === 1024 && icon1024.height === 1024, JSON.stringify(icon1024)],
  ['아이콘: apple-touch-icon 180×180', appleIcon.width === 180 && appleIcon.height === 180, JSON.stringify(appleIcon)],
  ['아이콘: icon-192 192×192', icon192.width === 192 && icon192.height === 192, JSON.stringify(icon192)],
  ['아이콘: icon-512 512×512', icon512.width === 512 && icon512.height === 512, JSON.stringify(icon512)],
  ['manifest: 이름·테마 딥 틸', manifest.name.indexOf('릴스핀') >= 0 && manifest.theme_color === '#0D9488' && manifest.short_name === '릴스핀', JSON.stringify(manifest.theme_color)],
  ['manifest: standalone + 세로', manifest.display === 'standalone' && manifest.orientation === 'portrait', manifest.display],
  ['manifest: 192 · 512 · maskable 아이콘', manifestIcons.indexOf('/icon-192.png@192x192') >= 0 && manifestIcons.indexOf('/icon-512.png@512x512') >= 0 && (manifest.icons || []).some((i) => i.purpose === 'maskable'), manifestIcons.join(', ')],
  ['manifest: start_url·scope', manifest.start_url.indexOf('/') === 0 && manifest.scope === '/', manifest.start_url],
  ['버전: package.json 2.20.1', pkg.version === '2.40.0', pkg.version],
  ['버전: app.json 2.20.1', expoConfig.version === '2.40.0', expoConfig.version],
  ['의존성: @supabase/supabase-js 설치됨', !!((pkg.dependencies || {})['@supabase/supabase-js']), JSON.stringify((pkg.dependencies || {})['@supabase/supabase-js'])],
  ['배포: export:web 이 PWA 메타까지 주입', String(pkg.scripts['export:web']).indexOf('patch-web-html') > 0, String(pkg.scripts['export:web'])],
  ['아이콘: app.json 이 assets/icon.png 사용', expoConfig.icon === './assets/icon.png', String(expoConfig.icon)],
];
for (const [label, ok, extra] of assetChecks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// ── v2.1.3: 웹 재방문 시 자동 위치 잡기 ─────────────────────────
const locationSource = fs.readFileSync(path.join(process.cwd(), 'src/services/location.js'), 'utf8');
const mapCode = mapSource2.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const v213Checks = [
  ['자동 위치: MapScreen 이 permissions.query 결과를 확인',
    mapCode.indexOf('geolocationPermissionState()') > 0 && mapCode.indexOf('shouldAutoLocate(') > 0],
  ['자동 위치: 허용 이력(localStorage) 보조 플래그 사용',
    mapCode.indexOf('readLocationGrantedFlag()') > 0 && mapCode.indexOf('writeLocationGrantedFlag(true)') > 0 && locationSource.indexOf("reelpin:location_granted") > 0],
  ['자동 위치: 웹에서만 (Platform.OS)',
    mapCode.indexOf("Platform.OS !== 'web'") > 0 && /import \{[^}]*Platform[^}]*\} from 'react-native'/.test(mapCode)],
  ['자동 위치: 실패해도 조용히 (silent — 오류 칩 없이 안내 배너 유지)',
    mapCode.indexOf('silent: true') > 0 && mapCode.indexOf('if (silent) return null') > 0],
  ['자동 위치: denied 면 시도하지 않음',
    locationSource.indexOf("if (permission === 'denied') return false") > 0],
  ['가짜 알림: 토스트가 가게 이름을 지어내지 않음(개수만 — 반경 값은 NEARBY_RADIUS_M)', bannerCode.indexOf('pin.name') < 0 && bannerCode.indexOf('NEARBY_RADIUS_M') > 0],
  ['가짜 알림: 지도는 위치를 모를 때 반경 알림을 만들지 않음',
    mapCode.indexOf('const nearKey = useMemo(() => {') > 0 && mapCode.indexOf('if (!nearby.length) return \'\';') > 0],
  ['중복 안내: 칩 아래 locationHint 제거',
    mapSource2.indexOf('locationHint') < 0],
  // v2.1.3 — 계정 · 클라우드 동기화 카드는 '내 정보' 스크롤 맨 아래로
  // v2.18 — 프로필(이름) + 계정·클라우드 동기화(로그인/로그아웃)를 **맨 위 한 카드**로 통합
  ['내 정보 탭: 통합 계정 카드가 맨 위', 
    (() => {
      const html = renderToString(
        <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured cloudUser={null} cloudPinCount={0} onSignIn={noop} onSignUp={noop} onMagicLink={noop} onOAuth={noop} onSignOut={noop} onSyncNow={noop} />
      );
      const at = html.indexOf('계정 · 클라우드 동기화');
      return (
        at > 0 &&
        at < html.indexOf('분류 관리') &&
        at < html.indexOf('저장한 장소') &&
        at < html.indexOf('지오펜스 알림 반경') &&
        // 2026-11-21 프로 카드 숨김 — 🙈 프로 카드는 숨김(SHOW_PRO_CARD=false) — 계정 카드는 그 위에 그대로
        html.indexOf('프로 시작하기') < 0 &&
        html.indexOf('무료 플랜') > 0 && html.indexOf('무료 플랜') < at
      );
    })()],
];
for (const [label, ok, extra] of v213Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// ── v2.2: 분류 직접 선택 · 만들기 · 이름 변경(핀 일괄) · 삭제(핀 안전 폴백) ──
const categorySource = fs.readFileSync(path.join(process.cwd(), 'src/utils/categories.js'), 'utf8');
const pickerSource = fs.readFileSync(path.join(process.cwd(), 'src/components/CategoryPicker.js'), 'utf8');
const v22Checks = [
  ['분류: 기본 3개 + 내가 만든 분류', allCategories(['아이랑']).join('|') === '맛집|카페|가볼곳|아이랑', allCategories(['아이랑']).join('|')],
  ['분류: 베이커리·디저트는 맛집 필터에 함께', matchesFilter({ category: '베이커리' }, '맛집') && matchesFilter({ category: '디저트' }, '맛집')],
  ['분류: 커스텀은 이름이 정확히 같을 때만', matchesFilter({ category: '아이랑' }, '아이랑') && !matchesFilter({ category: '아이랑' }, '가볼곳')],
  ['분류: 기본은 지우기·이름 변경 금지', categorySource.indexOf('기본 분류(맛집·카페·가볼곳)는 지울 수 없어요') > 0 && categorySource.indexOf('기본 분류(맛집·카페·가볼곳)는 이름을 바꿀 수 없어요') > 0],
  ['분류: 이름을 바꾸면 핀 일괄 반영', categorySource.indexOf('applyCategoryRename') > 0 && categorySource.indexOf('category: to, updatedAt') > 0],
  ['분류: 지우면 핀은 맛집으로 안전 이동', categorySource.indexOf('applyCategoryRemoval') > 0 && categorySource.indexOf('CATEGORY_FALLBACK') > 0],
  ['핀 색: 커스텀 분류는 고정 팔레트 색', CUSTOM_PIN_COLORS.indexOf(pinColor({ category: '아이랑' })) >= 0, pinColor({ category: '아이랑' })],
  ['핀 색: 기본 분류는 고유 색 (맛집 코랄·카페 민트·가볼곳 블루)',
    pinColor({ category: '맛집' }) === DEFAULT_CATEGORY_COLORS['맛집'] &&
      pinColor({ category: '카페' }) === DEFAULT_CATEGORY_COLORS['카페'] &&
      pinColor({ category: '가볼곳' }) === DEFAULT_CATEGORY_COLORS['가볼곳'],
    [pinColor({ category: '맛집' }), pinColor({ category: '카페' }), pinColor({ category: '가볼곳' })].join(' ')],
  ['분류 고르기: 이름 입력 + [추가] + 글자 수 제한', pickerSource.indexOf('새 분류 이름 (예: 아이랑)') > 0 && pickerSource.indexOf('maxLength={CATEGORY_MAX_LENGTH}') > 0],
];
for (const [label, ok, extra] of v22Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// ── v2.4: 분류별 색 통일 (핀 = 칩 = 배지 = 내 정보) ──────────────
const CUSTOMS = ['아이랑', '술집', '데이트'];
const chipsSource24 = fs.readFileSync(path.join(process.cwd(), 'src/components/FilterChips.js'), 'utf8');
const pickerSource24 = fs.readFileSync(path.join(process.cwd(), 'src/components/CategoryPicker.js'), 'utf8');
const sheetSource24 = fs.readFileSync(path.join(process.cwd(), 'src/components/PinDetailSheet.js'), 'utf8');
const profileSource24 = fs.readFileSync(path.join(process.cwd(), 'src/screens/ProfileScreen.js'), 'utf8');
const pasteSource24 = fs.readFileSync(path.join(process.cwd(), 'src/screens/PasteScreen.js'), 'utf8');
const baseColors = ['맛집', '카페', '가볼곳'].map((c) => getCategoryColor(c, CUSTOMS));
const customColors = CUSTOMS.map((c) => getCategoryColor(c, CUSTOMS));
const stripSpaces = (html) => String(html).replace(/\s+/g, '', '').toLowerCase();
const chipsHtml = stripSpaces(renderToString(<FilterChips value="카페" onChange={noop} categories={CUSTOMS} />));
const pickerHtml = stripSpaces(renderToString(<CategoryPicker value="가볼곳" onChange={noop} categories={CUSTOMS} />));
const sheetHtmlPin = { id: 'pin-color-1', name: '색 확인', category: '가볼곳', area: '검단', platform: 'instagram' };
const sheetHtml = stripSpaces(renderToString(<PinDetailSheet pin={sheetHtmlPin} radiusMeters={500} onClose={noop} categories={CUSTOMS} />));
const rgbOf = (hex) => {
  const h = String(hex).replace('#', '');
  return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16);
};
const v24Checks = [
  ['색: 맛집·카페·가볼곳은 서로 다른 고유 색', new Set(baseColors).size === 3, baseColors.join(' ')],
  ['색: 맛집=딥 틸 #0D9488 · 카페=앰버 #D97706 · 가볼곳=블루 #3B82F6',
    DEFAULT_CATEGORY_COLORS['맛집'] === '#0D9488' && DEFAULT_CATEGORY_COLORS['카페'] === '#D97706' &&
      DEFAULT_CATEGORY_COLORS['가볼곳'] === '#3B82F6', Object.values(DEFAULT_CATEGORY_COLORS).join(' ')],
  ['색: 커스텀 분류끼리 서로 다른 색', new Set(customColors).size === customColors.length, customColors.join(' ')],
  ['색: 커스텀 색은 기본 3색과 겹치지 않음',
    customColors.every((c) => baseColors.indexOf(c) < 0) &&
      CUSTOM_CATEGORY_COLORS.every((c) => baseColors.indexOf(c) < 0), customColors.join(' ')],
  ['색: 목록에 없는 커스텀(공유 지도)도 팔레트 안의 고정 색',
    CUSTOM_CATEGORY_COLORS.indexOf(getCategoryColor('낯선분류', CUSTOMS)) >= 0, getCategoryColor('낯선분류', CUSTOMS)],
  ['색: 베이커리·디저트는 맛집 색', getCategoryColor('베이커리', CUSTOMS) === baseColors[0] && getCategoryColor('디저트', CUSTOMS) === baseColors[0]],
  ['색: 카페 색과 예전 민트 토큰은 다름(핀·칩 혼동 방지)', DEFAULT_CATEGORY_COLORS['카페'] !== colors.mint, colors.mint],
  ['핀: 선택해도 분류 색 유지 (선택 표시는 크기·라벨)', pinColor({ category: '카페' }, true, CUSTOMS) === getCategoryColor('카페', CUSTOMS) &&
    pinColor({ category: '가볼곳' }, true, CUSTOMS) === getCategoryColor('가볼곳', CUSTOMS)],
  ['핀: 커스텀 분류도 내 목록 순서 색', pinColor({ category: '술집' }, false, CUSTOMS) === getCategoryColor('술집', CUSTOMS)],
  ['핀: MapCanvas 도 같은 함수 사용', mapCanvasSource.indexOf('getCategoryColor') > 0 && mapCanvasSource.indexOf('pinColor(pin, isOn, categories)') > 0],
  ['핀: 웹 지도도 같은 함수 사용', mapSource.indexOf('getCategoryColor') > 0 && mapSource.indexOf('getCategoryColor((pin && pin.category)') > 0],
  ['칩: 필터 칩이 분류 색 점 + 켜지면 그 색 배경', chipsSource24.indexOf('getCategoryColor') > 0 && chipsSource24.indexOf('backgroundColor: color') > 0],
  ['칩: 분류 고르기도 색 점 + 켜지면 그 색 배경', pickerSource24.indexOf('getCategoryColor') > 0 && pickerSource24.indexOf('backgroundColor: chipColor') > 0],
  ['배지: 핀 상세 분류 배지가 그 분류 색 틴트 + 진한 글씨', sheetSource24.indexOf('categoryTint') > 0 && sheetSource24.indexOf('categoryTextColor') > 0],
  ['내 정보: 분류 관리 점이 같은 함수', profileSource24.indexOf('getCategoryColor') > 0 && profileSource24.indexOf('category-dot-') > 0],
  ['저장 화면: 후보 행의 분류 색 점', pasteSource24.indexOf('getCategoryColor') > 0 && pasteSource24.indexOf('candCatDot') > 0],
  ['렌더: 필터 칩 — 켜진 카페 칩이 민트 배경', chipsHtml.indexOf('background-color:' + rgbOf(DEFAULT_CATEGORY_COLORS['카페'])) > 0 && chipsHtml.indexOf('카페') > 0],
  ['렌더: 분류 고르기 — 켜진 가볼곳 칩이 블루 배경', pickerHtml.indexOf('background-color:' + rgbOf(DEFAULT_CATEGORY_COLORS['가볼곳'])) > 0],
  ['렌더: 핀 상세 — 가볼곳 배지가 블루 계열', sheetHtml.indexOf('가볼곳') > 0 && sheetHtml.indexOf(rgbOf(DEFAULT_CATEGORY_COLORS['가볼곳'])) > 0],
];
for (const [label, ok, extra] of v24Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// ── v2.4.1: 브랜드 표기 통일 — 눈에 보이는 이름은 Reelspin · 릴스핀, 기술 식별자(reelpin 소문자)는 그대로 ──
const brandSources = (() => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|jsx)$/.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(process.cwd(), 'src'));
  files.push(path.join(process.cwd(), 'App.js'));
  return files;
})();
const brandOffenders = brandSources.filter((file) => /Reel[Pp]in/.test(fs.readFileSync(file, 'utf8')));
const pasteBrandHtml = renderToString(
  <PasteScreen active pinCount={4} isPro={false} onSaved={noop} onClose={noop} onGoProfile={noop} onToast={noop} />
);
const brandChecks = [
  ['브랜드: src·App.js 에 ReelPin/Reelpin 표기 0건', brandOffenders.length === 0, brandOffenders.map((f) => path.relative(process.cwd(), f)).join(' ')],
  // v2.18 — 저장 화면 헤더는 🔍 장소 검색과 같은 OverlayHeader(제목 '저장')를 씁니다.
  ['브랜드: 저장 화면 헤더는 OverlayHeader(저장) · ReelPin 0건', pasteSource.indexOf('<OverlayHeader') > 0 && pasteBrandHtml.indexOf('ReelPin') < 0],
  ['브랜드: 스플래시 로고 Reelspin', appSource.indexOf('splashTitle}>Reelspin<') > 0],
  ['브랜드: 앱 이름(app.json)·PWA 이름은 릴스핀', expoConfig.name === '릴스핀' && manifest.short_name === '릴스핀' && PWA_APP_TITLE === '릴스핀', expoConfig.name + ' / ' + manifest.short_name],
  ['브랜드: 기술 식별자는 그대로 (스킴·번들 ID·저장 키·배포 주소)',
    expoConfig.scheme === 'reelpin' && expoConfig.ios.bundleIdentifier === 'com.odol.reelpin' &&
      fs.readFileSync(path.join(process.cwd(), 'src/storage.js'), 'utf8').indexOf("'reelpin.pins.v1'") > 0 &&
      fs.readFileSync(path.join(process.cwd(), 'src/utils/shareMap.js'), 'utf8').indexOf("'https://reelpin.vercel.app'") > 0],
];
for (const [label, ok, extra] of brandChecks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// ── v2.10: ✅ 가봤어요 · 📝 한줄 메모 · 🔓 무료 10개 한도 해제 ──────────────
const pasteSource210 = fs.readFileSync(path.join(process.cwd(), 'src/screens/PasteScreen.js'), 'utf8');
const profileSource210 = fs.readFileSync(path.join(process.cwd(), 'src/screens/ProfileScreen.js'), 'utf8');
const sheetSource210 = fs.readFileSync(path.join(process.cwd(), 'src/components/PinDetailSheet.js'), 'utf8');
const listSource210 = fs.readFileSync(path.join(process.cwd(), 'src/components/PinListView.js'), 'utf8');
const VISIT_PIN = {
  ...SEARCH_PIN,
  id: 'pin-visited-1',
  name: '연남동 딸기 케이크',
  category: '카페',
  visited: true,
  visitedAt: '2026-11-14T10:00:00.000Z',
  memo: '아기의자 있음 · 주말 웨이팅 30분',
};
const plainPinHtml = renderToString(
  <PinDetailSheet pin={{ ...SEARCH_PIN, visited: false, memo: '' }} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />
);
const visitedPinHtml = renderToString(
  <PinDetailSheet pin={VISIT_PIN} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />
);
const readOnlyPinHtml = renderToString(
  <PinDetailSheet pin={{ ...VISIT_PIN, shared: true }} radiusMeters={300} onClose={noop} onDelete={noop} readOnly />
);
const listVisitHtml = stripSpaces(
  renderToString(
    <PinListView
      pins={[VISIT_PIN, SEED_PINS[0]]}
      categories={['맛집', '카페', '가볼곳']}
      filter="전체"
      counts={{ '전체': 2 }}
      visitFilter="전체"
      visitCounts={{ '전체': 2, 미방문: 1, 가봤어요: 1 }}
      myCoords={null}
      onSelectPin={noop}
     
      onChangeFilter={noop}
      onChangeVisitFilter={noop}
    />
  )
);
const paste12Html = renderToString(
  <PasteScreen pinCount={12} onSaved={noop} onClose={noop} onToast={noop} />
);
const profile12Html = renderToString(
  <ProfileScreen name="이상훈" handle="odol" pins={new Array(12).fill(0).map((_, i) => ({ ...SEED_PINS[i % 4], id: 'p12-' + i }))} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} />
);
const v210Checks = [
  ['한도: App 이 무료 10개 한도에 기대지 않음', appSource.indexOf('FREE_PIN_LIMIT') < 0 && appSource.indexOf('planPinAddition') > 0],
  ['한도: 저장 화면에 잠금 배너·무료 한도 문구 없음', pasteSource210.indexOf('FREE_PIN_LIMIT') < 0 && plainPinHtml.indexOf('핀 10개까지') < 0 && pasteSource210.indexOf('핀 10개까지') < 0],
  ['한도: 내 정보에 무료 한도·프로그레스 없음', profileSource210.indexOf('FREE_PIN_LIMIT') < 0 && profileSource210.indexOf('무료 한도를 다 채웠어요') < 0],
  ['한도: 12개 저장해도 저장 화면이 막지 않음', paste12Html.indexOf('핀 10개까지') < 0 && paste12Html.indexOf('저장된 장소 12곳') > 0],
  ['한도: 내 정보가 12곳을 그대로 셈', profile12Html.indexOf('>12<') > 0 && profile12Html.indexOf('저장된 핀') > 0 && profile12Html.indexOf('무료 한도') < 0],
  // v2.19.1 — 미방문이어도 라벨은 `가봤어요` (빈 체크박스). '아직 안 가봤어요' 로 뒤집혀 보이지 않습니다
  ['가봤어요: 상세 시트에 체크박스 토글', sheetSource210.indexOf('pin-visited-toggle') > 0 && plainPinHtml.indexOf('가봤어요') > 0 && plainPinHtml.indexOf('아직 안 가봤어요') < 0],
  ['가봤어요: 체크된 핀은 가봤어요 + 체크 날짜', visitedPinHtml.indexOf('가봤어요') > 0 && visitedPinHtml.indexOf('2026.11.14') > 0],
  ['가봤어요: 읽기 전용(공유) 핀도 표시만', readOnlyPinHtml.indexOf('가봤어요') > 0 && readOnlyPinHtml.indexOf('pin-visited-toggle') < 0],
  ['메모: 상세 시트 입력칸 + 안내 문구', sheetSource210.indexOf('pin-memo-input') > 0 && plainPinHtml.indexOf('추천 메뉴, 아기의자') > 0],
  ['메모: 저장된 메모가 상세 시트에 보임', visitedPinHtml.indexOf('아기의자 있음') > 0],
  ['메모: 목록 행에 ✓ 방문완료 배지와 1줄 미리보기', listVisitHtml.indexOf('✓방문완료') > 0 && listVisitHtml.indexOf('📝아기의자있음') > 0],
  ['v2.37.0 방문 필터: 목록의 방문 줄은 `방문` 머리말 + 안 가본 곳/가본 곳 (전체 칩 없음)',
    listVisitHtml.indexOf('visit-chip-미방문') > 0 && listVisitHtml.indexOf('안가본곳') > 0 && listVisitHtml.indexOf('가본곳') > 0 && listVisitHtml.indexOf('visit-chip-전체') < 0 && listVisitHtml.indexOf('방문') > 0],
  ['메모: 저장 화면에도 선택 입력칸', pasteSource210.indexOf('paste-memo-input') > 0 && pasteSource210.indexOf('한줄 메모') > 0],
];
for (const [label, ok, extra] of v210Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// ── v2.11: 오른쪽 위 ✕ 가 있는 헤더는 모두 다크 차콜(#1C1C1E) ─────────────
const pasteSource211 = fs.readFileSync(path.join(process.cwd(), 'src/screens/PasteScreen.js'), 'utf8');
const sheetSource211 = fs.readFileSync(path.join(process.cwd(), 'src/components/PinDetailSheet.js'), 'utf8');
const webModalSource211 = fs.readFileSync(path.join(process.cwd(), 'src/components/InAppPlaceModal.web.js'), 'utf8');
const nativeModalSource211 = fs.readFileSync(path.join(process.cwd(), 'src/components/InAppPlaceModal.js'), 'utf8');

/** 헤더에 ✕ 닫기 버튼이 있는 화면들 — 소스에서 같은 다크 차콜 헤더를 쓰는지 봅니다. */
const headerSource215 = fs.readFileSync(path.join(process.cwd(), 'src/components/AppHeader.js'), 'utf8');
// v2.19.1 — 내 정보 · 돋보기 · 알림 모음 · 목록 보기가 같이 쓰는 레이어 팝업 시트(헤더 포함)
const layerSheetSource2191 = fs.readFileSync(
  path.join(process.cwd(), 'src/components/LayerSheet.js'),
  'utf8'
);
// v2.16 — 🔍 검색 레이어 팝업도 저장 화면과 같은 다크 차콜 헤더 + ✕ 를 씁니다.
const searchOverlaySource216 = fs.readFileSync(
  path.join(process.cwd(), 'src/components/SearchOverlayModal.js'),
  'utf8'
);
// v2.18 — 저장 화면 · 🔍 장소 검색이 함께 쓰는 다크 차콜 헤더
const overlayHeaderSource218 = fs.readFileSync(
  path.join(process.cwd(), 'src/components/OverlayHeader.js'),
  'utf8'
);
const CLOSE_HEADER_FILES = [
  // v2.15 — 저장 화면의 ✕ 헤더는 공통 AppHeader 로 옮겼습니다(지도·내 정보 탭도 같은 헤더).
  ['공통 헤더(AppHeader)', headerSource215, 'styles.header'],
  ['핀 상세 시트', sheetSource211, 'styles.headerBar'],
  ['인앱 매장 정보 모달(웹)', webModalSource211, 'styles.header'],
  ['인앱 매장 정보 모달(iOS·안드로이드)', nativeModalSource211, 'styles.header'],
  // v2.16 — 저장 화면 형태의 검색 레이어 팝업
  // v2.18 — 헤더 몸통은 OverlayHeader.js 로 옮겼습니다(저장 화면과 같은 컴포넌트).
  ['검색 레이어 팝업(🔍)', overlayHeaderSource218, 'charcoal'],
  // v2.19.1 — 돋보기·알림 모음·목록 보기·내 정보가 함께 쓰는 시트 헤더
  ['레이어 팝업 시트(LayerSheet)', layerSheetSource2191, 'backgroundColor: colors.charcoal'],
];
// v2.14.1 — 핀 상세 시트만 상훈 님 요청으로 **브랜드 주황 헤더**를 씁니다(나머지 3곳은 다크 차콜).
const CHARCOAL_HEADER_FILES = CLOSE_HEADER_FILES.filter(([label]) => label !== '핀 상세 시트');

const v211HeaderChecks = [
  ['헤더 통일: 공통 헤더가 다크 차콜', /header: \{[\s\S]{0,400}?backgroundColor: colors\.charcoal,/.test(headerSource215)],
  ['헤더 통일: 공통 헤더 로고 흰색 · 탭 뱃지 반투명', /brandText: \{[\s\S]{0,120}?color: colors\.white/.test(headerSource215) && /brandBadge: \{[\s\S]{0,80}?backgroundColor: colors\.charcoalPill/.test(headerSource215)],
  ['헤더 통일: 공통 헤더 닫기 = 반투명 원 + 흰 ✕', /iconBtn: \{[\s\S]{0,200}?backgroundColor: colors\.charcoalPill/.test(headerSource215) && /name="close" size=\{18\} color=\{colors\.white\}/.test(headerSource215)],
  // v2.14.1 — 상세 시트 헤더는 다크 차콜이 아니라 브랜드 주황입니다(아래 v2.14.1 검사에서 확인).
  // ✕ 헤더를 가진 나머지 화면은 빠짐없이 charcoal 을 써야 합니다 (색을 되돌리면 여기서 걸립니다)
  ...CHARCOAL_HEADER_FILES.map(([label, source, styleKey]) => [
    '헤더 통일: ' + label + ' 도 다크 차콜',
    source.indexOf(styleKey) > 0 && source.indexOf('colors.charcoal') > 0,
    styleKey,
  ]),
  // 다크 헤더 위 닫기 버튼은 흰 ✕ (예전 회색 ✕ 가 남아 있으면 실패)
  ['헤더 통일: ✕ 닫기 아이콘은 모두 흰색', CLOSE_HEADER_FILES.every(([, source]) => !/name="close"[^>]*color=\{colors\.(textSub|textMuted|text)\}/.test(source))],
  // 앱 전체(src)에서 ✕ 닫기를 가진 헤더 화면을 빠짐없이 찾습니다 — 새로 생기면 여기서 확인하게 됩니다
  [
    '헤더 통일: ✕ 닫기 헤더는 넣은 6곳뿐 (전수 검사)',
    (() => {
      const files = [];
      const walk = (dir) => {
        for (const name of fs.readdirSync(dir)) {
          const full = path.join(dir, name);
          if (fs.statSync(full).isDirectory()) walk(full);
          else if (/\.jsx?$/.test(name)) files.push(full);
        }
      };
      walk(path.join(process.cwd(), 'src'));
      // v2.15 — 저장 화면의 ✕ 는 공통 AppHeader 로 옮겼습니다(closeLabel 기본값 '닫기').
      const withCloseHeader = files.filter((f) =>
        /accessibilityLabel="(닫기|상세 닫기)"|accessibilityLabel=\{closeLabel\}/.test(fs.readFileSync(f, 'utf8'))
      );
      // v2.18 — 저장 화면·검색 팝업이 같이 쓰는 OverlayHeader.js 가 헤 더로 들어왔습니다.
      // v2.18 — 저장 화면·검색 팝업의 ✕ 는 OverlayHeader.js 하나로 모였습니다(SearchOverlayModal 에서는 빠짐).
      // v2.19.1 — 네 화면(내 정보·돋보기·알림 모음·목록 보기)의 ✕ 는 LayerSheet.js 하나로 모였습니다.
      const wanted = ['AppHeader.js', 'InAppPlaceModal.js', 'InAppPlaceModal.web.js', 'OverlayHeader.js', 'LayerSheet.js', 'PinDetailSheet.js'];
      return (
        withCloseHeader.length === wanted.length &&
        wanted.every((w) => withCloseHeader.some((f) => f.endsWith(w)))
      );
    })(),
  ],
  // 다크 헤더 아래 흰 본문이 바로 붙지 않게 스크롤 상단 여백을 둡니다 (스크롤 시 가려짐 완화)
  ['저장 화면: 다크 헤더 아래 스크롤 상단 여백', /scrollContent: \{[\s\S]{0,160}?paddingTop: 12/.test(pasteSource211)],
];
for (const [label, ok, extra] of v211HeaderChecks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// ── v2.13 📸 캡처·사진 AI 가게 추출 ──────────────────────────
const pinDetailSource = fs.readFileSync(path.join(process.cwd(), 'src/components/PinDetailSheet.js'), 'utf8');
const extractorSource = fs.readFileSync(path.join(process.cwd(), 'src/services/extractor.js'), 'utf8');
const geminiSource = fs.readFileSync(path.join(process.cwd(), 'api', 'gemini.js'), 'utf8');
const v213PhotoChecks = [
  ['저장 화면: 사진 버튼은 모든 플랫폼(canUsePhoto)', pasteSource.indexOf('const canUsePhoto = true') > 0 && pasteSource.indexOf('const tabs = canUsePhoto') > 0],
  ['저장 화면: 사진 버튼이 pickImageFile 을 부름', pasteSource.indexOf('pickImageFile()') > 0 && pasteSource.indexOf('extractFromImage(file') > 0],
  ['저장 화면: 진행 중 AI 사진 분석 문구', pasteSource.indexOf('AI 사진 분석') > 0 && pasteSource.indexOf('중…') > 0],
  ['저장 화면: 사진 읽는 동안 다른 버튼도 잠금', /disabled=\{extracting \|\| photoBusy\}/.test(pasteSource)],
  ['저장 화면: 올린 사진을 히어로 카드 배경으로', /thumbnail: result\.sourceThumbnail/.test(pasteSource)],
  ['저장 화면: 사진에서 찾은 가게 N곳', pasteSource.indexOf("'사진에서 찾은 가게 '") > 0],
  ['저장 화면: 사진 핀은 platform=photo · 링크 없음', /photoMode/.test(pasteSource) && pasteSource.indexOf("? 'photo'") > 0],
  ['저장 화면: 결과 후보·분류·메모·저장 버튼은 그대로', pasteSource.indexOf('CategoryPicker') > 0 && pasteSource.indexOf('paste-memo-input') > 0 && pasteSource.indexOf('paste-save-button') > 0],
  ['상세 시트: 사진에서 저장 라벨', pinDetailSource.indexOf("photo: '사진에서 저장'") > 0],
  ['추출기: 긴 변 1280 · JPEG 0.82', /IMAGE_MAX_EDGE = 1280/.test(extractorSource) && /IMAGE_JPEG_QUALITY = 0\.82/.test(extractorSource)],
  ['추출기: canvas 로 줄여 JPEG 로 인코딩', extractorSource.indexOf("toDataURL('image/jpeg', quality)") > 0],
  ['추출기: 아이폰 스크린샷도 줄인다(주석 근거)', extractorSource.indexOf('아이폰 스크린샷') > 0 && extractorSource.indexOf('1280px') > 0],
  ['추출기: 이미지 분석은 웹에서만(키는 서버)', /reason: 'web-only'/.test(extractorSource) && extractorSource.indexOf("source: 'gemini'") > 0],
  ['추출기: resizeImageForUpload 는 canvas·Image 없으면 안내', /reason: 'resize-unavailable'/.test(extractorSource)],
  ['추출기: 4MB 넘는 사진은 서버에 보내지 않음', /IMAGE_MAX_BASE64_CHARS/.test(extractorSource) && /reason: 'image-too-large'/.test(extractorSource)],
  ['추출기: 사진도 지도 파이프라인 + 네이버 주소 보강', /export async function extractFromImage/.test(extractorSource) && /searchMultiPlaces\(placeItems/.test(extractorSource) && extractorSource.indexOf('naverBackfill') > 0],
  ['추출기: 업로드 사진이 sourceThumbnail', /sourceThumbnail: thumbnail/.test(extractorSource)],
  ['서버: inlineData 로 사진 전송', geminiSource.indexOf('inlineData: { mimeType, data }') > 0],
  ['서버: 큰 사진 413 image-too-large', /status: 413/.test(geminiSource) && geminiSource.indexOf('image-too-large') > 0],
  ['서버: 사진 지시문(스크린샷·위치 태그)', geminiSource.indexOf('IMAGE_SYSTEM_INSTRUCTION') > 0 && geminiSource.indexOf('위치 태그') > 0],
  ['서버: 사진 모드는 kind=image 로 응답', /kind: isImage \? 'image' : 'video'/.test(geminiSource)],
  ['프로필: 버전 표기 v2.19.3', fs.readFileSync(path.join(process.cwd(), 'src/screens/ProfileScreen.js'), 'utf8').indexOf("릴스핀 v2.40.0") > 0],
  ['핀 시트: 사진으로 저장한 핀은 링크 대신 출처 한 줄', pinDetailSource.indexOf("pin.platform === 'photo'") > 0 && pinDetailSource.indexOf('pin-photo-source') > 0],
];
for (const [label, ok, extra] of v213PhotoChecks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// ── v2.13 · 핀 상세 시트 높이 상한 (아이폰 사파리에서 ✕ 가 화면 밖으로 밀리던 문제) ──
const v213SheetChecks = [
  [
    '핀 시트: 이제 ScrollView 를 씁니다',
    /import \{[^}]*ScrollView[^}]*\} from 'react-native'/.test(pinDetailSource),
  ],
  [
    '핀 시트: 높이 상한 92% + overflow hidden',
    /sheet: \{[\s\S]{0,420}?maxHeight: '92%'/.test(pinDetailSource) && /sheet: \{[\s\S]{0,320}?overflow: 'hidden'/.test(pinDetailSource),
  ],
  [
    '핀 시트: 헤더(가게 이름·✕)는 스크롤 밖 상단 고정',
    pinDetailSource.indexOf('testID="pin-sheet-header"') > 0 &&
      pinDetailSource.indexOf('testID="pin-sheet-header"') < pinDetailSource.indexOf('<ScrollView'),
  ],
  [
    '핀 시트: 본문만 스크롤(style=bodyScroll · contentContainerStyle=body)',
    (/contentContainerStyle=\{(\[)?styles\.body/.test(pinDetailSource)) &&
      /bodyScroll: \{[\s\S]{0,80}?flexShrink: 1/.test(pinDetailSource),
  ],
  [
    // v2.19.2 — 본문 끝 여백을 플로팅 하단바 높이만큼 확보 (맨 아래 지도 버튼이 가리지 않게)
    '핀 시트: 본문 아래 여백은 스크롤 안쪽으로 (v2.37.0 — 24px)',
    /body: \{[\s\S]{0,320}?paddingBottom: 24/.test(pinDetailSource) &&
      !/sheet: \{[\s\S]{0,300}?paddingBottom/.test(pinDetailSource),
  ],
  ['핀 시트: ✕ 닫기 버튼은 그대로', pinDetailSource.indexOf('accessibilityLabel="상세 닫기"') > 0],
];
for (const [label, ok, extra] of v213SheetChecks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// ── v2.14 저장 화면 3탭 — 🔗 릴스 링크 · 📸 사진으로 찾기 · 🔍 가게명 찾기 ──────
const v214Checks = [
  [
    '저장 화면: 웹은 3탭(릴스·사진·가게명)',
    pasteSource.indexOf('const tabs = canUsePhoto') > 0 &&
      pasteSource.indexOf("{ key: 'photo', label: '사진으로 찾기'") > 0 &&
      pasteSource.indexOf("{ key: 'search', label: '가게명 찾기'") > 0,
  ],
  [
    '저장 화면: 네이티브는 예전처럼 2탭(사진 탭 없음)',
    pasteSource.indexOf("    : [") > 0 && pasteSource.indexOf("{ key: 'search', label: '가게명으로 찾기'") > 0,
  ],
  [
    '저장 화면: 3탭을 390px 한 줄에 — 작은 라벨 + 한 줄 고정',
    /modeTextTight: \{[\s\S]{0,90}?fontSize: 11\.5/.test(pasteSource) &&
      pasteSource.indexOf('tabs.length > 2 && styles.modeTextTight') > 0 &&
      /accessibilityLabel=\{m\.label \+ ' 탭'\}[\s\S]{0,700}?numberOfLines=\{1\}/.test(pasteSource),
  ],
  [
    '저장 화면: 탭 키는 link·photo·search 3상태',
    pasteSource.indexOf("// 'link' | 'photo' | 'search'") > 0,
  ],
  [
    '저장 화면: 네이티브에서 initialMode=photo 면 링크 탭으로',
    pasteSource.indexOf("want === 'photo' && !canUsePhoto ? 'link' : want") > 0,
  ],
  [
    '저장 화면: 탭을 옮기면 이전 결과·에러를 지움',
    /const changeMode = \(next\) => \{[\s\S]{0,700}?setError\(''\)[\s\S]{0,200}?setCandidates\(\[\]\)[\s\S]{0,250}?setMeta\(null\)/.test(
      pasteSource
    ) && /const changeMode = \(next\) => \{[\s\S]{0,900}?setMemo\(''\)/.test(pasteSource),
  ],
  [
    '저장 화면: 늦게 도착한 이전 탭 결과는 버림(runSeq)',
    pasteSource.indexOf('runSeq.current += 1') > 0 &&
      (pasteSource.match(/if \(seq !== runSeq\.current\) return;/g) || []).length >= 3,
  ],
  [
    '저장 화면: 사진 탭 업로드 카드는 점선 테두리',
    /photoDrop: \{[\s\S]{0,260}?borderStyle: 'dashed'/.test(pasteSource),
  ],
  [
    '저장 화면: 카드를 눌러도 사진 고르기(카드 + CTA)',
    pasteSource.indexOf('testID="paste-photo-card"') > 0 &&
      pasteSource.indexOf('testID="paste-photo-button"') > 0,
  ],
  [
    '저장 화면: 사진 탭 전용 오렌지 CTA(사진·캡처 고르기)',
    pasteSource.indexOf('accessibilityLabel="사진·캡처 고르기"') > 0 &&
      pasteSource.indexOf('>사진·캡처 고르기<') > 0,
  ],
  [
    '저장 화면: 사진 분석 중 진행 문구',
    pasteSource.indexOf("(PHOTO_STAGES[stage] || 'AI 사진 분석') + ' 중…'") > 0,
  ],
  [
    // v2.18 — 프리셋은 가게명 탭의 `이렇게 찾아보세요` 하나만 (원탭 테스트 영역 제거)
    '저장 화면: 프리셋은 가게명 탭에만',
    /\{isSearch && \(\s*<>\s*<View style=\{styles\.presetHead\}/.test(pasteSource) && pasteCode.indexOf('원탭 테스트') < 0,
  ],
  [
    '저장 화면: 링크 탭에 붙여넣기 버튼 없음(입력창 + 추출만)',
    pasteSource.indexOf('📸 캡처·사진으로 찾기') < 0 && pasteSource.indexOf('linkActionRow') < 0 && pasteSource.indexOf('clipboard-outline') < 0,
  ],
  [
    '저장 화면: 사진 안내 문구는 사진 탭으로 이동',
    pasteSource.indexOf('사진 속 가게 이름과 동네를 AI가 읽어 카카오·네이버 지도에서 찾아드려요.') > 0,
  ],
  [
    '저장 화면: 사진 분석 파이프라인(runPhoto·결과 카드)은 그대로',
    /const runPhoto = async \(\) => \{[\s\S]{0,1200}?extractFromImage\(file/.test(pasteSource) &&
      pasteSource.indexOf("'사진에서 찾은 가게 '") > 0 &&
      pasteSource.indexOf('paste-memo-input') > 0,
  ],
  [
    '저장 화면: 탭을 오가도 photoBusy·extracting 이 남지 않음',
    /const changeMode = \(next\) => \{[\s\S]{0,1000}?setExtracting\(false\)[\s\S]{0,120}?setPhotoBusy\(false\)/.test(
      pasteSource
    ),
  ],
];
for (const [label, ok, extra] of v214Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// v2.14 — 3탭 렌더: 링크 탭과 사진 탭에 서로의 항목이 섞이지 않는지
const linkTabHtml = renderToString(
  <PasteScreen pinCount={4} onSaved={noop} onSavedMany={noop} onClose={noop} onToast={noop} />
);
const photoTabHtml = renderToString(
  <PasteScreen pinCount={4} initialMode="photo" onSaved={noop} onSavedMany={noop} onClose={noop} onToast={noop} />
);
const v214RenderChecks = [
  ['저장 화면(링크 탭): 사진 안내 문구·사진 버튼 없음', linkTabHtml.indexOf('사진 속 가게 이름과 동네를 AI가 읽어') < 0 && linkTabHtml.indexOf('캡처·사진으로 찾기') < 0],
  // v2.18 — 붙여넣기 버튼·원탭 테스트 영역 제거, 탭 이름은 `릴스·쇼츠로 찾기`
  ['저장 화면(링크 탭): 탭 이름 `릴스·쇼츠로 찾기` + 링크 입력 + 장소 추출하기', linkTabHtml.indexOf('릴스·쇼츠로 찾기') > 0 && linkTabHtml.indexOf('릴스 · 쇼츠 링크') > 0 && linkTabHtml.indexOf('장소 추출하기') > 0],
  ['저장 화면(링크 탭): 붙여넣기 버튼·원탭 테스트 없음', linkTabHtml.indexOf('클립보드에서 붙여넣기') < 0 && linkTabHtml.indexOf('원탭 테스트') < 0],
  ['저장 화면(사진 탭): 링크 입력·원탭 테스트 없음', photoTabHtml.indexOf('릴스 · 쇼츠 링크') < 0 && photoTabHtml.indexOf('원탭 테스트') < 0 && photoTabHtml.indexOf('장소 추출하기') < 0],
  ['저장 화면(사진 탭): 업로드 카드 + 큰 사진 버튼', photoTabHtml.indexOf('인스타 캡처·스크린샷 올리기') > 0 && photoTabHtml.indexOf('사진·캡처 고르기') > 0],
  ['저장 화면(사진 탭): 안내 3단계', photoTabHtml.indexOf('사진 한 장이면 충분해요') > 0],
  ['저장 화면: 어느 탭에서든 3탭이 모두 보임', ['릴스·쇼츠로 찾기', '사진으로 찾기', '가게명 찾기'].every((t) => photoTabHtml.indexOf(t) >= 0 && linkTabHtml.indexOf(t) >= 0)],
];
for (const [label, ok, extra] of v214RenderChecks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// ── v2.14.1 핀 상세 시트 분류 색 헤더 ────────────────────────
// (v2.28.0 — 위로 스와이프하던 큰 알림 배너는 걷어내고 한줄 토스트가 되어, 스와이프 검사는 사라졌습니다)
const mapSource2141 = fs.readFileSync(path.join(process.cwd(), 'src/screens/MapScreen.js'), 'utf8');
const geofenceToastHtml = renderToString(
  <GeofenceToast message={nearbyToastMessage(2)} onPress={noop} />
);
const v2141Checks = [
  // ① v2.28.0 — 반경 500m 알림은 세션에 한 번, 3초만
  ['알림 토스트: 반경 안 개수로 한 줄 문구(geofence-toast 렌더)', geofenceToastHtml.indexOf('geofence-toast') > 0 && geofenceToastHtml.indexOf('반경 500m 안에 2곳 있어요') > 0],
  ['지도: 같은 가게 묶음은 세션에 한 번만(shownNearKeyRef)', mapSource2141.indexOf('shownNearKeyRef') > 0 && mapSource2141.indexOf('if (shownNearKeyRef.current === nearKey) return undefined;') > 0],
  ['지도: 6초 뒤 스스로 사라짐(GEOFENCE_TOAST_MS)', mapSource2141.indexOf('}, GEOFENCE_TOAST_MS);') > 0 && mapSource2141.indexOf('setNearbyToast(null)') > 0],
  ['지도: [보기]는 🔔 알림 모음을 엽니다', /openNearbyFromToast = useCallback\(\(\) => \{[\s\S]{0,220}?header\.onPressAlerts\(\)/.test(mapSource2141)],
  ['지도: [내 위치]를 새로 누르면 다시 한 번 보여 줌', /const locateFromUser = useCallback\([\s\S]{0,220}?shownNearKeyRef\.current = ''/.test(mapSource2141)],
  ['지도: 예전 큰 배너(GeofenceBanner)는 지도에서 완전히 빠짐', mapSource2141.indexOf('<GeofenceBanner') < 0 && mapSource2141.indexOf('{bannerVisible && (') < 0 && mapSource2141.indexOf('onDismiss={dismissBanner}') < 0],
  // v2.17 — 반경 밖 안내 배너가 없어져 [내 위치] 자리가 FAB · 주변 500m 패널 · 오류 칩 세 곳으로 줄었습니다.
  [
    '지도: 내 위치 자리(오류 칩·주변 패널·FAB)가 모두 locateFromUser 사용',
    (mapSource2141.match(/locateFromUser\(\)/g) || []).length >= 3,
  ],
  // ④ 핀 상세 시트 — v2.19.2: 헤더 배경은 그 핀의 **분류 색**(getCategoryColor)
  [
    '핀 시트: 헤더 배경 = 분류 색 (인라인 backgroundColor: headerColor)',
    pinDetailSource.indexOf('const headerColor = categoryDot;') > 0 &&
      pinDetailSource.indexOf('style={[styles.headerBar, { backgroundColor: headerColor }]}') > 0 &&
      DEFAULT_CATEGORY_COLORS['가볼곳'] === '#3B82F6',
  ],
  [
    '핀 시트: 주황 위 드래그 핸들 rgba(255,255,255,0.45)',
    /handle: \{[\s\S]{0,240}?'rgba\(255,255,255,0\.45\)'/.test(pinDetailSource),
  ],
  ['핀 시트: 가게 이름은 흰색', /name: \{[\s\S]{0,140}?color: colors\.white/.test(pinDetailSource)],
  [
    '핀 시트: 닫기 = 반투명 흰 원(0.22) + 흰 ✕',
    /closeBtn: \{[\s\S]{0,240}?rgba\(255,255,255,0\.22\)/.test(pinDetailSource) &&
      /name="close" size=\{18\} color=\{colors\.white\}/.test(pinDetailSource),
  ],
  [
    '핀 시트: 92% 높이 상한 · 헤더 고정 · 본문 스크롤 유지',
    /sheet: \{[\s\S]{0,420}?maxHeight: '92%'/.test(pinDetailSource) &&
      pinDetailSource.indexOf('testID="pin-sheet-scroll"') > 0 &&
      pinDetailSource.indexOf('testID="pin-sheet-header"') < pinDetailSource.indexOf('<ScrollView'),
  ],
  [
    // v2.28.0 — 토스트는 시트·레이어 아래에 깔리므로 z-index 경쟁이 없습니다(딤 레이어가 덮음)
    '알림 토스트: 지도 상단 칩 줄 아래 한 줄 자리(좌우 버튼과 멀리)',
    mapSource2141.indexOf('geofenceToastWrap') > 0 &&
      /geofenceToastWrap: \{[\s\S]{0,160}?alignItems: 'center'/.test(mapSource2141),
  ],
];
for (const [label, ok, extra] of v2141Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// ── v2.15: 전 탭 공통 상단 다크 헤더 (Reelspin) · 헤더 우측 🔔 알림 모음 / 👤 계정 ──
// (headerSource215 는 위 v2.11 헤더 검사에서 이미 읽었습니다)
const inboxSource215 = fs.readFileSync(path.join(process.cwd(), 'src/components/AlertInbox.js'), 'utf8');
const mapSource215 = fs.readFileSync(path.join(process.cwd(), 'src/screens/MapScreen.js'), 'utf8');
const pasteSource215 = fs.readFileSync(path.join(process.cwd(), 'src/screens/PasteScreen.js'), 'utf8');
const profileSource215 = fs.readFileSync(path.join(process.cwd(), 'src/screens/ProfileScreen.js'), 'utf8');
const appSource215 = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');

// 내 위치 = 영등포 (위도 0.001 ≈ 111m)
const ALERT_ORIGIN = { lat: 37.5194, lng: 126.904 };
const ALERT_PINS = [
  { id: 'a-0', name: '영등포아바이순대국', category: '맛집', area: '영등포동', lat: 37.5194, lng: 126.904 },
  { id: 'a-1', name: '문래동 소금빵', category: '카페', area: '문래동', lat: 37.5212, lng: 126.904 },
  { id: 'a-2', name: '당산 곱창', category: '맛집', area: '당산동', lat: 37.523, lng: 126.904 },
  { id: 'a-3', name: '여의도 국수', category: '맛집', area: '여의도', lat: 37.5284, lng: 126.904 },
  { id: 'a-4', name: '신길 카페', category: '카페', area: '신길동', lat: 37.5374, lng: 126.904 },
  { id: 'a-5', name: '홍대 파스타', category: '맛집', area: '홍대', lat: 37.5464, lng: 126.904 },
  { id: 'a-6', name: '좌표 없는 핀', category: '가볼곳', area: '' },
];
const feedNear = buildAlertFeed(ALERT_PINS, ALERT_ORIGIN);
const feedFar = buildAlertFeed(ALERT_PINS, { lat: 37.9, lng: 127.9 });
const feedNoLocation = buildAlertFeed(ALERT_PINS, null);

const headerAlertsHtml = stripSpaces(
  renderToString(
    <AppHeader badge="지도" alertCount={3} onPressSearch={noop} onPressAlerts={noop} onPressMenu={noop} />
  )
);
const headerSignedHtml = stripSpaces(
  renderToString(
    <AppHeader badge="내 정보" alertCount={0} signedIn onPressSearch={noop} onPressAlerts={noop} onPressMenu={noop} />
  )
);
const inboxOpenHtml = renderToString(
  <AlertInbox visible pins={ALERT_PINS} myCoords={ALERT_ORIGIN} onClose={noop} onOpenPin={noop} onGoMap={noop} onLocate={noop} />
);
const inboxNoLocationHtml = stripSpaces(
  renderToString(<AlertInbox visible pins={ALERT_PINS} myCoords={null} onClose={noop} onLocate={noop} />)
);
const inboxEmptyHtml = renderToString(
  <AlertInbox visible pins={[]} myCoords={ALERT_ORIGIN} onClose={noop} onOpenPin={noop} />
);

const v215Checks = [
  // ① 알림 모음 규칙 (화면 없이)
  ['알림 모음: 반경 500m 안 3곳', feedNear.inRadiusCount === 3, feedNear.inRadiusCount],
  ['알림 모음: 🔔 뱃지 숫자 = 반경 안 개수', feedNear.badgeCount === 3, feedNear.badgeCount],
  ['알림 모음: 목록 5곳 = 안 3곳 + 밖에서 가까운 2곳', feedNear.items.length === ALERT_FEED_LIMIT && feedNear.items[0].pin.id === 'a-0' && feedNear.items[2].pin.id === 'a-2' && feedNear.items[3].pin.id === 'a-3' && feedNear.items[4].pin.id === 'a-4', feedNear.items.map((i) => i.pin.id).join(',')],
  ['알림 모음: 좌표 없는 핀은 건너뜀', feedNear.items.every((i) => i.pin.id !== 'a-6') && feedNear.closest.pin.id === 'a-0'],
  ['알림 모음: 위치 없으면 hasLocation=false · 목록 비움', feedNoLocation.hasLocation === false && feedNoLocation.items.length === 0 && feedNoLocation.badgeCount === 0],
  ['알림 모음: 반경 밖이면 뱃지 0 · 가까운 곳부터 5곳', feedFar.badgeCount === 0 && feedFar.items.length === ALERT_FEED_LIMIT && feedFar.items[0].distanceMeters < feedFar.items[4].distanceMeters && feedFar.items.every((i) => i.distanceMeters > feedFar.radiusMeters)],
  ['알림 모음: limit 옵션(2곳)', buildAlertFeed(ALERT_PINS, ALERT_ORIGIN, { limit: 2 }).items.length === 2],
  ['뱃지 라벨: 0은 빈 문자열 · 9까지 숫자 · 10부터 9+', alertBadgeLabel(0) === '' && alertBadgeLabel(3) === '3' && alertBadgeLabel(10) === '9+'],
  ['헤더 뱃지 이름: 지도 · 저장 · 컬렉션', HEADER_TABS.join('|') === '지도|저장|컬렉션', HEADER_TABS.join('|')],
  // ② 공통 헤더 (컴포넌트)
  ['공통 헤더: Reelspin + 지금 탭 뱃지', headerAlertsHtml.indexOf('reelspin') > 0 && headerAlertsHtml.indexOf('지도') > 0],
  ['공통 헤더: 🔔 알림 모음 버튼 + 숫자 뱃지', headerAlertsHtml.indexOf('알림모음') > 0 && headerSource215.indexOf('testID="header-alert-badge"') > 0 && headerSource215.indexOf('colors.brand') > 0],
  ['공통 헤더: 비로그인에도 🔔 · ☰ 두 아이콘', headerAlertsHtml.indexOf('알림모음') > 0 && headerAlertsHtml.indexOf('메뉴') > 0 && headerSource215.indexOf('loginBtn') < 0],
  ['공통 헤더: 👤 알약/아바타는 헤더에서 사라짐(☰ 메뉴로 통합)', headerAlertsHtml.indexOf('로그인') < 0 && headerSource215.indexOf('header-account') < 0 && headerSource215.indexOf('accountDot') < 0],
  // v2.35.0 — 🔍 는 지도 화면 통합 검색창으로 옮겨 헤더에서 빠졌습니다(중복 방지).
  ['공통 헤더: 오른쪽 순서 = 🔔 → ☰ (🔍 없음)', HEADER_ACTIONS.join('|') === 'alerts|menu' && HEADER_ACTIONS.length === 2, HEADER_ACTIONS.join('|')],
  ['공통 헤더: 로그인 상태 = ☰ 초록 점', headerSignedHtml.indexOf('header-menu-dot') > 0 && headerSource215.indexOf('colors.visit') > 0],
  ['공통 헤더: 뱃지 없으면 숫자 안 그림', stripSpaces(renderToString(<AppHeader badge="저장" alertCount={0} />)).indexOf('header-alert-badge') < 0],
  ['공통 헤더: ✕ 는 넘긴 화면에만', headerSource215.indexOf('{onPressClose ?') > 0 && headerAlertsHtml.indexOf('✕') < 0],
  // ③ 세 탭에 같은 헤더
  ['지도 탭: 공통 다크 헤더', mapSource215.indexOf('<AppHeader badge="지도"') > 0],
  ['지도 탭: 헤더가 지도·오버레이보다 위(겹침 없음)', mapSource215.indexOf('<AppHeader badge="지도"') < mapSource215.indexOf('<View style={styles.mapArea}>') && mapSource215.indexOf('<View style={styles.mapArea}>') < mapSource215.indexOf('styles.topOverlay')],
  ['지도 탭: 오버레이는 헤더 아래 mapArea 안', /mapArea: \{[\s\S]{0,80}?flex: 1/.test(mapSource215)],
  // v2.18 — 저장 탭 헤더는 🔍 장소 검색과 같은 OverlayHeader(✕ 포함)로 통일
  ['저장 탭: OverlayHeader(저장) + 기존 ✕ 유지', /<OverlayHeader[\s\S]{0,260}?onClose=\{onClose\}/.test(pasteSource215) && pasteSource215.indexOf('testID="paste-header"') > 0],
  ['저장 탭: 옛 인라인 헤더 스타일 제거', pasteSource215.indexOf('styles.header}') < 0 && pasteSource215.indexOf('brandBadgeText') < 0],
  ['v2.19 내 정보: 자체 헤더 없이 ☰ 시트 본문(panel)으로만', profileSource215.indexOf('<AppHeader') < 0 && profileSource215.indexOf('panel') > 0 && fs.readFileSync(path.join(process.cwd(), 'src/components/MenuDrawerModal.js'), 'utf8').indexOf('panel') > 0],
  ['세 탭 모두 같은 headerProps 를 받음', (appSource215.match(/header=\{headerProps\}/g) || []).length === 3, (appSource215.match(/header=\{headerProps\}/g) || []).length],
  // ④ 헤더 우측 아이콘의 동작
  ['🔔: App 이 알림 모음을 열고 목록은 최대 5곳(내 반경 사용)', appSource215.indexOf('<AlertInbox') > 0 && appSource215.indexOf('buildAlertFeed(pins, alertCoords, { radiusMeters: radius })') > 0 && ALERT_FEED_LIMIT === 5],
  ['🔔: 장소를 누르면 지도 탭 + 그 핀 상세로', appSource215.indexOf('setPinFocus(') > 0 && mapSource215.indexOf('focusPin') > 0 && mapSource215.indexOf('onSelectPin(target.id)') > 0],
  ['🔔: 지도 탭이 잡은 위치를 헤더와 공유', mapSource215.indexOf('onMyCoordsRef.current(position)') > 0 && appSource215.indexOf('onMyCoords={handleMyCoords}') > 0],
  ['v2.19: 내 정보 탭 제거 + 계정 카드는 ☰ 시트 안', appSource215.indexOf("setTab('profile')") < 0 && appSource215.indexOf("tab !== 'collections'") > 0 && profileSource215.indexOf('profile-account-card') > 0],
  // ⑤ 알림 모음 모달
  ['알림 모음: 반경 500m 안 장소를 가까운 순으로', inboxOpenHtml.indexOf('영등포아바이순대국') > 0 && inboxOpenHtml.indexOf('문래동 소금빵') > 0 && inboxOpenHtml.indexOf('내 위치 반경 500m 안') < 0],
  ['알림 모음: 위치를 모르면 [내 위치 켜기]', inboxNoLocationHtml.indexOf('내위치켜기') > 0 && inboxNoLocationHtml.indexOf('알림모음') > 0],
  ['알림 모음: 저장한 곳이 없으면 안내', inboxEmptyHtml.indexOf('아직 저장한 장소가 없어요') > 0],
  ['알림 모음: 닫힌 상태에서는 아무 것도 안 그림', renderToString(<AlertInbox visible={false} pins={ALERT_PINS} myCoords={ALERT_ORIGIN} onClose={noop} />) === ''],
  ['알림 모음: 잠깐 떴다 사라진 알림도 여기서 다시 (안내 문구 · v2.28.0 배너 없음)', stripSpaces(inboxOpenHtml).indexOf('반경500m알림은잠깐떴다사라져도여기서는언제든다시볼수있어요') > 0],
  ['알림 모음: [지도에서 보기]', inboxOpenHtml.indexOf('지도에서 보기') > 0],
];

for (const [label, ok, extra] of v215Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

// ── v2.16: 호갱노노처럼 헤더(🔍 · 🔔 · ☰) · 🔍 검색 레이어 팝업 · ☰ 메뉴 시트 ──
const menuSource216 = fs.readFileSync(
  path.join(process.cwd(), 'src/components/MenuDrawerModal.js'),
  'utf8'
);
const popularSource216 = fs.readFileSync(
  path.join(process.cwd(), 'src/data/popularPlaces.js'),
  'utf8'
);
const overlayUtilSource216 = fs.readFileSync(
  path.join(process.cwd(), 'src/utils/searchOverlay.js'),
  'utf8'
);
const mapSource216 = mapSource215;

const PIN_216 = [
  { id: 's-0', name: '베통 성수', area: '성수동', category: '카페', menuTags: ['소금빵'], lat: 37.5429, lng: 127.0552, visited: false, createdAt: '2026-11-16T17:00:00+09:00' },
  { id: 's-1', name: '영등포아바이순대국', area: '영등포동', category: '맛집', menuTags: ['순대국'], memo: '아기의자 있음', lat: 37.5194, lng: 126.904, visited: true, createdAt: '2026-11-16T16:00:00+09:00' },
  { id: 's-2', name: '문래동 소금빵', area: '문래동', category: '카페', menuTags: ['소금빵'], lat: 37.5212, lng: 126.9041, visited: false, createdAt: '2026-11-16T15:00:00+09:00' },
  { id: 's-3', name: '화목순대국 여의도', area: '여의도', category: '맛집', lat: 37.5284, lng: 126.924, visited: false, createdAt: '2026-11-16T14:00:00+09:00' },
];
const ORIGIN_216 = { lat: 37.5194, lng: 126.904 };

const overlayHtml216 = renderToString(
  <SearchOverlayModal
    visible
    pins={PIN_216}
    myCoords={ORIGIN_216}
    onClose={noop}
    onOpenPin={noop}
    onGoPasteSearch={noop}
    onLocate={noop}
  />
);
const overlayNoLocationHtml216 = stripSpaces(
  renderToString(<SearchOverlayModal visible pins={PIN_216} onClose={noop} onOpenPin={noop} onLocate={noop} />)
);
const overlayEmptyHtml216 = renderToString(
  <SearchOverlayModal visible pins={[]} onClose={noop} onOpenPin={noop} />
);
const menuHtml216 = renderToString(
  <MenuDrawerModal
    visible
    pins={PIN_216}
    categories={['맛집', '카페', '가볼곳']}
    signedIn={false}
    cloudConfigured
    radiusMeters={300}
    onClose={noop}
    onOpenAccount={noop}
    onOpenCategories={noop}
    onShareMap={noop}
    onGoPaste={noop}
    onToast={noop}
  />
);
const menuSignedHtml216 = renderToString(
  <MenuDrawerModal
    visible
    pins={PIN_216}
    categories={['맛집', '카페', '가볼곳']}
    signedIn
    accountEmail="andy@example.com"
    cloudUser={{ id: 'u-1', email: 'andy@example.com' }}
    cloudConfigured
    cloudPinCount={4}
    radiusMeters={300}
    onClose={noop}
    onOpenAccount={noop}
    onOpenCategories={noop}
    onShareMap={noop}
    onGoPaste={noop}
    onToast={noop}
  />
);
const mapHtml216 = renderToString(
  <MapScreen pins={SEED_PINS} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} />
);

const recNear216 = recommendPlaces(PIN_216, ORIGIN_216);
const recNoLoc216 = recommendPlaces(PIN_216, null);
const recAllVisited216 = recommendPlaces(
  PIN_216.map((pin) => ({ ...pin, visited: true })),
  null
);
const resSalt216 = overlaySearchResults(PIN_216, ' 소금빵 ');
const resMemo216 = overlaySearchResults(PIN_216, '아기의자');
const resNone216 = overlaySearchResults(PIN_216, '');
const resLimit216 = overlaySearchResults(PIN_216, '맛집', { limit: 1 });
const pops216 = popularPlaceRows(PIN_216, POPULAR_PLACES);
const popBetong216 = pops216.find((row) => row.place.id === 'betong');

const v216Checks = [
  // ① 헤더 — 🔔 · ☰ (v2.35.0: 🔍 는 지도 통합 검색창으로)
  ['헤더: 오른쪽은 🔔 · ☰ 두 아이콘 (🔍 제거)', headerSource215.indexOf('testID="header-search"') < 0 && headerSource215.indexOf('testID="header-alerts"') > 0 && headerSource215.indexOf('testID="header-menu"') > 0],
  ['헤더: ☰ 에 로그인 초록 점(작은 점)', headerSource215.indexOf('testID="header-menu-dot"') > 0 && /menuDot: \{[\s\S]{0,200}?colors\.visit/.test(headerSource215)],
  ['헤더: 흰색 라인 아이콘(notifications-outline·menu)', headerSource215.indexOf('name="notifications-outline"') > 0 && headerSource215.indexOf('name="menu"') > 0 && headerSource215.indexOf('name="search"') < 0],
  ['헤더: 저장 탭은 ✕ 포함 3개까지 그린다', headerSource215.indexOf('{onPressClose ? (') > 0 && headerSource215.indexOf('iconBtn') > 0],
  // ② 지도 탭 — v2.35.0 통합 검색창(분류 칩 바로 위) + 칩 바
  ['지도 탭: 지도 위 통합 검색창(MapSearchBar)이 칩 바로 위', mapSource216.indexOf('<MapSearchBar') > 0 && mapSource216.indexOf('<MapSearchBar') < mapSource216.indexOf('<FilterChips') && mapSource216.indexOf('styles.searchWrap') < 0],
  ['지도 탭: 필터 칩 바가 알림 토스트보다 위', mapSource216.indexOf('styles.chipWrap') > 0 && mapSource216.indexOf('styles.chipWrap') < mapSource216.indexOf('<GeofenceToast')],
  ['지도 탭: 그려진 화면에 검색 인풋 있음(내 핀·새 장소 검색)', mapHtml216.indexOf('map-search-input') > 0 && stripSpaces(mapHtml216).indexOf('내핀·새장소검색') > 0],
  ['지도 탭: 분류 칩 한 줄만 (방문 칩 2번째 줄 없음)', mapHtml216.indexOf('맛집') > 0 && mapHtml216.indexOf('미방문') < 0],
  // ③ 🔍 검색 레이어 팝업
  // v2.19.1 — 검색 팝업도 내 정보와 **같은 레이어 팝업 틀**(LayerSheet)을 씁니다
  ['검색 팝업: 내 정보와 같은 레이어 팝업(LayerSheet · absoluteFill)', searchOverlaySource216.indexOf('<LayerSheet') > 0 && /overlay: \{\s*\.\.\.StyleSheet\.absoluteFillObject/.test(layerSheetSource2191)],
  ['검색 팝업: 헤더 `🔍 내 장소 검색` + ✕', overlayHtml216.indexOf('내 장소 검색') > 0 && overlayHtml216.indexOf('검색어 지우기') < 0 && searchOverlaySource216.indexOf('closeTestID="search-overlay-close"') > 0],
  ['검색 팝업: 검색 인풋 + ✕ 지우기', searchOverlaySource216.indexOf('testID="search-overlay-input"') > 0 && searchOverlaySource216.indexOf('testID="search-overlay-clear"') > 0],
  ['검색 팝업: 추천 장소 · 인기 검색 장소 섹션', overlayHtml216.indexOf('추천 장소') > 0 && overlayHtml216.indexOf(POPULAR_PLACES_TITLE) > 0],
  ['검색 팝업: 추천 = 내 위치에서 가까운 저장 장소(가까운 순)', recNear216.kind === 'near' && recNear216.items[0].pin.id === 's-1' && recNear216.items.length === Math.min(RECOMMEND_MAX, PIN_216.length), recNear216.items.map((i) => i.pin.id).join(',')],
  ['검색 팝업: 위치 없으면 아직 안 가본(!visited) 곳', recNoLoc216.kind === 'todo' && recNoLoc216.items.every((i) => i.pin.visited !== true) && recNoLoc216.items[0].pin.id === 's-0', recNoLoc216.items.map((i) => i.pin.id).join(',')],
  ['검색 팝업: 둘 다 없으면 empty 안내', recAllVisited216.kind === 'empty' && recAllVisited216.items.length === 0],
  ['검색 팝업: 검색 결과 — 메뉴·메모까지 매칭', resSalt216.total === 2 && resSalt216.items[0].pin.id === 's-0' && resMemo216.total === 1 && resMemo216.items[0].pin.id === 's-1', resSalt216.total + '/' + resMemo216.total],
  ['검색 팝업: 빈 검색어면 결과 0(추천·인기 먼저)', resNone216.total === 0 && resNone216.items.length === 0],
  ['검색 팝업: 결과는 6행까지 + truncate 표기', resLimit216.items.length === 1 && resLimit216.total === 2 && resLimit216.truncated === true && OVERLAY_RESULT_MAX === 6],
  ['검색 팝업: 추천 행을 누르면 그 핀으로(onOpenPin)', searchOverlaySource216.indexOf('onPress={() => openPin(item.pin)}') > 0 && mapSource216.indexOf('onOpenPin={openPinFromList}') > 0],
  ['검색 팝업: 핀을 고르면 닫고 지도 탭 + 상세 시트', /const openPinFromList = useCallback\([\s\S]{0,500}?setView\('map'\)[\s\S]{0,200}?onSelectPin\(pin.id\)/.test(mapSource216) && mapSource216.indexOf('onOpenPin={openPinFromList}') > 0],
  ['검색 팝업: 내 핀에 없으면 저장 탭 가게명 찾기로 이어짐(auto)', searchOverlaySource216.indexOf('search-overlay-go-paste') > 0 && appSource215.indexOf('pasteSearchRequest(query)') > 0 && pasteSource215.indexOf('request.mode') > 0 && pasteSource215.indexOf('request.auto') > 0 && pasteSource215.indexOf('runSearch(wantedQuery)') > 0],
  ['검색 팝업: 저장한 핀이 없으면 안내', overlayEmptyHtml216.indexOf('아직 저장한 장소가 없어요') > 0],
  ['검색 팝업: 위치를 모르면 [내 위치] 칩', stripSpaces(overlayNoLocationHtml216).indexOf('내위치') > 0],
  // ④ 인기 검색 장소
  ['인기 장소: 요청한 4곳(베통·어니언·영화장·화목순대국) 수록', ['betong', 'onion', 'yeonghwajang', 'hwamok'].every((id) => POPULAR_PLACES.some((p) => p.id === id)), POPULAR_PLACES.map((p) => p.id).join(',')],
  ['인기 장소: 라벨은 `이름 동네 · 메뉴`', popularPlaceLabel(POPULAR_PLACES[0]) === '베통 성수 · 소금빵', popularPlaceLabel(POPULAR_PLACES[0])],
  ['인기 장소: 검색어는 동네까지 붙임', popularPlaceQuery(POPULAR_PLACES[0]) === '베통 성수', popularPlaceQuery(POPULAR_PLACES[0])],
  ['인기 장소: 내 핀에 있으면 그 핀 표시', popBetong216.pin && popBetong216.pin.id === 's-0' && pops216.filter((r) => r.pin).length === 2, pops216.filter((r) => r.pin).map((r) => r.place.id).join(',')],
  ['인기 장소: 화면에 칩으로 그려지고 개수는 지어내지 않음', overlayHtml216.indexOf('베통 성수 · 소금빵') > 0 && overlayHtml216.indexOf('내 지도') > 0 && searchOverlaySource216.indexOf('조회수') < 0 && popularSource216.indexOf('POPULAR_PLACES_SUB') > 0],
  ['인기 장소: 섹션 설명 문구(고른 목록임을 밝힘)', POPULAR_PLACES_SUB.indexOf('골라') > 0 && overlayHtml216.indexOf(POPULAR_PLACES_SUB) >= 0, POPULAR_PLACES_SUB],
  // ⑤ ☰ 메뉴
  ['메뉴: 시트 · 다크 차콜 헤더 · ☰', menuSource216.indexOf('testID="menu-drawer"') > 0 && menuSource216.indexOf('icon="menu"') > 0 && menuSource216.indexOf('<LayerSheet') > 0 && layerSheetSource2191.indexOf('colors.charcoal') > 0],
  ['메뉴(v2.19): 비로그인 = 계정 · 클라우드 동기화 카드 + 로그인/회원가입', menuHtml216.indexOf('계정 · 클라우드 동기화') > 0 && menuHtml216.indexOf('로그인') > 0 && menuHtml216.indexOf('회원가입') > 0],
  ['메뉴(v2.19): 로그인 = 이메일 + 동기화 상태', menuSignedHtml216.indexOf('andy@example.com') > 0 && menuSignedHtml216.indexOf('클라우드 동기화 켜짐') > 0 && menuSignedHtml216.indexOf('개 저장됨') > 0],
  ['메뉴(v2.19): 분류 관리 3행 + 내 지도 공유 카드', menuHtml216.indexOf('분류 관리') > 0 && menuHtml216.indexOf('내 지도 공유하기') > 0 && appSource215.indexOf('onShareMap={shareMyMapFromMenu}') > 0],
  // v2.18 — ☰ 메뉴의 [분류 관리] 는 내 정보 탭의 **분류 관리 서브 페이지**를 엽니다.
  ['메뉴(v2.19): 분류 관리 → 시트 안 서브 페이지', appSource215.indexOf('setCategoriesFocus(') < 0 && profileSource215.indexOf("openSub('categories')") > 0 && menuSource216.indexOf('onOpenSub={setSub}') > 0 && menuSource216.indexOf("sub === 'categories'") > 0],
  ['메뉴(v2.19): 저장된 핀 N곳 / 가본 곳 M곳 요약', menuHtml216.indexOf('저장된 핀') > 0 && menuHtml216.indexOf('가본 곳') > 0 && menuHtml216.indexOf('안 가본 곳') > 0 && profileSource215.indexOf('visited === true') > 0],
  ['메뉴: 릴스핀 v2.25.0 표기', menuHtml216.indexOf('릴스핀 v2.40.0') > 0 && APP_VERSION_LABEL === '릴스핀 v2.40.0', APP_VERSION_LABEL],
  ['메뉴: 닫힌 상태에서는 안 그림', renderToString(<MenuDrawerModal visible={false} pins={PIN_216} />) === ''],
  // ⑥ 앱 배선 · 순수 계산
  ['앱: 세 탭 헤더에 🔔 · ☰ 핸들러를 넘깁니다', appSource215.indexOf('onPressAlerts: openAlerts') > 0 && appSource215.indexOf('onPressMenu: openMenu') > 0 && appSource215.indexOf('onPressSearch') < 0 && (appSource215.match(/header=\{headerProps\}/g) || []).length === 3],
  ['앱: ☰ 메뉴를 최상위에 한 번만 (검색 레이어는 v2.35.0 지도 검색창으로 이동)', appSource215.indexOf('<MenuDrawerModal') > 0 && appSource215.indexOf('<SearchOverlayModal') < 0 && appSource215.indexOf('onSearchNewPlace={goPasteSearch}') > 0],
  ['순수 계산: 검색 팝업 유틸은 화면을 import 하지 않음', overlayUtilSource216.indexOf('react') < 0 && overlayUtilSource216.indexOf('react-native') < 0],
];
for (const [label, ok, extra] of v216Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

// ── v2.17: 500m 밖 알림 배너 숨김 + 지도 왼쪽 하단 펼침 메뉴(가본 곳만 보기 · 지도 공유하기) ──
// 상훈 님 요청: "진짜 반경 500m 안에 들어왔을 때만 뜨고 밖일 땐 지도를 안 가리게 숨겨" ·
//              "미방문/가봤어요/지도 공유는 지도 왼쪽 하단 버튼 → 펼침 (가본곳만 보기 Y/N · 지도 공유하기)"
const mapSource217 = fs.readFileSync(path.join(process.cwd(), 'src/screens/MapScreen.js'), 'utf8');
const toolsSource217 = fs.readFileSync(
  path.join(process.cwd(), 'src/components/MapToolsMenu.js'),
  'utf8'
);
const mapHtml217 = stripSpaces(mapHtml216);
const mapEmptyHtml217 = stripSpaces(
  renderToString(
    <MapScreen pins={[]} selectedPinId={null} onSelectPin={noop} radiusMeters={500} onGoPaste={noop} onDeletePin={noop} onToast={noop} />
  )
);
const toolsOpenHtml217 = stripSpaces(
  renderToString(
    <MapToolsMenu
      open
      visitedOnly
      visitedCount={2}
      totalCount={5}
      summary="가본 곳만 2 / 5"
      onToggleOpen={noop}
      onToggleVisited={noop}
      onShare={noop}
    />
  )
);
const toolsOffOpenHtml217 = stripSpaces(
  renderToString(
    <MapToolsMenu
      open
      visitedOnly={false}
      visitedCount={2}
      totalCount={5}
      summary="5 / 5 핀 표시 중"
      onToggleOpen={noop}
      onToggleVisited={noop}
      onShare={noop}
    />
  )
);
const toolsOffHtml217 = stripSpaces(
  renderToString(
    <MapToolsMenu open={false} visitedOnly={false} visitedCount={2} totalCount={5} summary="5 / 5 핀 표시 중" />
  )
);
const VISIT_SAMPLE = [
  { id: 'b-1', name: '가본 곳', visited: true },
  { id: 'b-2', name: '안 가본 곳', visited: false },
  { id: 'b-3', name: '옛 핀' },
];

const v217Checks = [
  // ① 반경 500m 알림은 반경 안('near')에만 — v2.28.0 부터는 3초 한줄 토스트
  ['알림: 반경 500m 안(near)이면 띄웁니다', shouldToastNearby(2) === true && shouldToastNearby(1) === true],
  ['알림: 반경 안 0곳(반경 밖·위치 전·핀 없음)은 숨김', shouldToastNearby(0) === false && shouldToastNearby(undefined) === false && nearbyToastMessage(0) === ''],
  ['지도: 지도 위 큰 알림 카드를 그리지 않음(v2.28.0)', mapSource217.indexOf('<GeofenceBanner') < 0 && mapSource217.indexOf('{bannerVisible && (') < 0],
  ['지도: 위치 전·반경 밖 배너를 그리지 않음', mapSource217.indexOf('needsLocation={banner.needsLocation}') < 0 && mapSource217.indexOf('empty={banner.empty}') < 0],
  ['지도 화면(위치 전): 알림 없음', mapHtml217.indexOf('geofence-toast') < 0 && mapHtml217.indexOf('geofence-banner') < 0 && mapHtml217.indexOf('반경500m앞') < 0],
  ['지도 화면(위치 전): 반경 밖 가장 가까운 곳 배너도 없음', mapHtml217.indexOf('가장가까운저장장소') < 0],
  ['지도 화면(핀 없음): 알림 없음', mapEmptyHtml217.indexOf('geofence-toast') < 0 && mapEmptyHtml217.indexOf('geofence-banner') < 0 && mapEmptyHtml217.indexOf('아직저장한핀이없어요') < 0],
  ['지도 화면(핀 없음): 가운데 안내 카드는 그대로', mapEmptyHtml217.indexOf('지도가비어있어요') > 0],
  // ② 상단 2번째 줄(방문 칩) 제거 — 1줄 분류 칩만
  ['지도: 방문 필터 칩을 더 이상 그리지 않음', mapSource217.indexOf('VisitFilterChips') < 0 && mapSource217.indexOf('styles.visitWrap') < 0],
  ['지도 화면: 분류 칩은 그대로, 방문 칩은 없음', mapHtml217.indexOf('filter-chip-전체') > 0 && mapHtml217.indexOf('visit-chip-미방문') < 0],
  // ③ 오른쪽 스택에서 지도 공유 제거
  ['지도: 오른쪽 스택에 지도 공유 버튼 없음', mapSource217.indexOf('지도 공유</Text>') < 0],
  ['지도 화면(접힘): 지도 공유 글자 없음(메뉴 안으로 이동)', mapHtml217.indexOf('지도공유') < 0],
  // v2.18 — 목록 보기는 상단 분류 칩 줄 **맨 앞 아이콘 버튼**(FilterChips)으로, 오른쪽 스택은 내 위치 FAB 하나
  ['지도: 오른쪽 스택은 내 위치 FAB 하나', mapSource217.indexOf('목록 보기</Text>') < 0 && mapSource217.indexOf("'주변 ' + NEARBY_RADIUS_M + 'm'") < 0 && mapSource217.indexOf('accessibilityLabel="내 위치 찾기"') > 0 && mapSource217.indexOf('onToggleView={toggleView}') > 0],
  // ④ 왼쪽 하단 펼침 메뉴
  // v2.18 — 플로팅 탭바 위로 올라갔습니다.
  // v2.19.3 — 상훈 님 요청(IMG_9092): 왼쪽 `🎛️` 도 오른쪽 `내 위치` FAB 과 **같은 바닥선**
  //            (theme.mapControls.toolsToggleBottom = actionBottom = 92) 을 씁니다.
  ['지도 도구: 왼쪽 끝 12 · 아래 끝 mapControls.toolsToggleBottom(오른쪽 FAB 과 같은 바닥선)', /col: \{[\s\S]{0,260}?left: 12,[\s\S]{0,120}?bottom: mapControls\.toolsToggleBottom/.test(toolsSource217) && mapControls.toolsToggleBottom === mapControls.actionBottom],
  ['지도 도구: 세로 column(요약 · 카드 · 버튼이 겹치지 않음)', /col: \{[\s\S]{0,180}?alignItems: 'flex-start',[\s\S]{0,40}?gap: 8/.test(toolsSource217)],
  ['지도 화면(접힘): 토글 버튼 + 개수 요약만', mapHtml217.indexOf('map-tools-toggle') > 0 && mapHtml217.indexOf('핀표시중') > 0],
  ['지도 화면(접힘): 펼친 카드는 그리지 않음(빈 곳 탭 방지)', mapHtml217.indexOf('map-tools-menu') < 0 && toolsOffHtml217.indexOf('map-tools-menu') < 0],
  ['도구 메뉴: 가본 곳만 보기 스위치 + 꺼졌을 때 가본 곳 N곳/전체 M곳', toolsOpenHtml217.indexOf('가본곳만보기') > 0 && toolsOffOpenHtml217.indexOf('가본곳2곳/전체5곳') > 0],
  ['도구 메뉴: 스위치는 role=switch · 켜지면 aria-checked=true', toolsSource217.indexOf('accessibilityRole="switch"') > 0 && toolsOpenHtml217.indexOf('aria-checked="true"') > 0],
  ['도구 메뉴: [지도 공유하기] 버튼', toolsOpenHtml217.indexOf('map-tools-share') > 0 && toolsOpenHtml217.indexOf('지도공유하기') > 0],
  ['도구 메뉴: 켜진 상태는 토글에 가본 곳만 + 점', toolsOpenHtml217.indexOf('가본곳만') > 0 && toolsOpenHtml217.indexOf('map-tools-dot') > 0],
  ['도구 메뉴: 요약 알약도 함께', toolsOpenHtml217.indexOf('가본곳만2/5') > 0],
  ['지도: 토글을 다시 누르거나 지도를 누르면 접힘', /onToggleOpen=\{\(\) => \{[\s\S]{0,320}?const next = !toolsOpen;/.test(mapSource217) && mapSource217.indexOf('testID="map-tools-backdrop"') > 0],
  ['지도: 열려 있을 때만 지도 먹는 막을 그림', /toolsOpen && \([\s\S]{0,320}?map-tools-backdrop/.test(mapSource217)],
  ['지도: 왼쪽 하단 도구는 상세 시트가 열리면 숨김', /view === 'map' && !selectedPin && \(\s*\n\s*<MapToolsMenu/.test(mapSource217)],
  // ⑤ Y/N 동작 — 지도·목록이 같은 상태를 씁니다
  ['가본 곳만 보기: 켜면 가봤어요(visited===true) 핀만', filterByVisit(VISIT_SAMPLE, VISIT_DONE).map((p) => p.id).join(',') === 'b-1'],
  ['가본 곳만 보기: 끄면 전체', filterByVisit(VISIT_SAMPLE, VISIT_ALL).length === 3],
  ['가본 곳만 보기: 같은 값을 다시 누르면 전체로 토글', /const changeVisitFilter = useCallback\(\(next\) => \{[\s\S]{0,400}?current === value && value !== VISIT_ALL \? VISIT_ALL : value/.test(mapSource217)],
  ['가본 곳만 보기: 스위치가 toggleVisitedOnly 를 부름', mapSource217.indexOf('onToggleVisited={toggleVisitedOnly}') > 0],
  ['가본 곳만 보기: 켜져 있으면 토글에 가본 곳만 표시', mapSource217.indexOf('visitedOnly={visitedOnly}') > 0 && /const visitedOnly = visitFilter === VISIT_DONE/.test(mapSource217)],
  ['요약 문구: 전체 / 가본 곳만 / 미방문', toolsSummary({ filteredCount: 5, totalCount: 5 }) === '5 / 5 핀 표시 중' && toolsSummary({ filteredCount: 2, totalCount: 5, visitFilter: VISIT_DONE }) === '가본 곳만 2 / 5' && toolsSummary({ filteredCount: 3, totalCount: 5, visitFilter: '미방문' }) === '미방문 3 / 5'],
  // ⑥ 지도 공유 기능은 그대로
  ['지도 공유: 도구 메뉴가 기존 shareMyMap 을 그대로 부름', mapSource217.indexOf('buildShareUrl(pins)') > 0 && /onShare=\{\(\) => \{[\s\S]{0,120}?shareMyMap\(\);/.test(mapSource217)],
  ['지도 공유: 메뉴를 닫고 공유 시트/클립보드로', /onShare=\{\(\) => \{\s*\n\s*setToolsOpen\(false\);\s*\n\s*shareMyMap\(\);/.test(mapSource217)],
  // ⑦ 상태·버전
  ['지도: 도구 펼친 상태는 기본적으로 접힘', /const \[toolsOpen, setToolsOpen\] = useState\(false\)/.test(mapSource217)],
  ['버전: 메뉴·프로필 모두 v2.19.3', APP_VERSION_LABEL === '릴스핀 v2.40.0' && fs.readFileSync(path.join(process.cwd(), 'src/screens/ProfileScreen.js'), 'utf8').indexOf("릴스핀 v2.40.0") > 0],
  // ⑧ 펌찄 카드와 지도 안내 알약(폴백 지도 안내)이 겹치지 않게
  [
    '지도: 펌찄 메뉴가 열리면 지도 안내 알약을 감춤',
    mapSource217.indexOf('hideNotice={toolsOpen}') > 0 &&
      fs.readFileSync(path.join(process.cwd(), 'src/components/RealMapView.web.js'), 'utf8').indexOf('hideNotice = false') > 0,
  ],
];
for (const [label, ok, extra] of v217Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// ── v2.17.1: 핀 상세 딤 레이어 · 주변 500m 를 왼쪽 하단 메뉴로 · 가본 곳만 보기 ON 즉시 반영 ──
// 상훈 님 요청(2026-11-16): "가본곳만 보기가 반대로 되어있는거 같아" ·
//   "빨간 동그라미 친 부분을 흐릿하게 표현할 수 있을까? 레이어 팝업이 떴다는 걸 표현하고 싶어" ·
//   "주변 500m 보기 버튼도 지도 왼쪽 하단의 버튼 안으로 넣을 수 있을까?"
const mapSource2171 = mapSource217;
const toolsSource2171 = toolsSource217;
const sheetSource2171 = fs.readFileSync(path.join(process.cwd(), 'src/components/PinDetailSheet.js'), 'utf8');
const themeSource2171 = fs.readFileSync(path.join(process.cwd(), 'src/theme.js'), 'utf8');
const mapSelectedHtml2171 = stripSpaces(
  renderToString(
    <MapScreen
      pins={SEED_PINS}
      selectedPinId={SEED_PINS[0].id}
      onSelectPin={noop}
      radiusMeters={500}
      onGoPaste={noop}
      onDeletePin={noop}
      onToast={noop}
    />
  )
);
const toolsNearbyHtml2171 = stripSpaces(
  renderToString(
    <MapToolsMenu
      open
      visitedOnly={false}
      visitedCount={2}
      totalCount={5}
      nearbyOpen={false}
      nearbyCount={3}
      nearbyRadius={500}
      hasMyCoords
      summary="5 / 5 핀 표시 중"
      onToggleOpen={noop}
      onToggleVisited={noop}
      onPressNearby={noop}
      onShare={noop}
    />
  )
);

const v2171Checks = [
  // ① 상세 시트 = 화면 최상위 레이어 + 딤
  ['상세 시트: 레이어 팝업으로 띄움(딤 레이어 + 바깥 탭 닫기)', mapSelectedHtml2171.indexOf('pin-detail-layer') > 0 && mapSelectedHtml2171.indexOf('pin-detail-backdrop') > 0],
  ['상세 시트: 딤은 rgba(0,0,0,0.45) + 웹 은은한 블러(2px)', mapSource2171.indexOf("backgroundColor: 'rgba(0, 0, 0, 0.45)'") > 0 && /detailBackdrop:\s*\{[\s\S]{0,260}?backdropFilter: 'blur\(2px\)'/.test(mapSource2171)],
  ['상세 시트: 레이어는 헤더·지도 위(맨 마지막 자식)에 그려짐', mapSource2171.indexOf('<AppHeader') > -1 && mapSource2171.indexOf('pin-detail-layer') > mapSource2171.indexOf('<MapToolsMenu') && mapSource2171.indexOf('pin-detail-layer') > mapSource2171.indexOf('visited-only-empty')],
  ['상세 시트: 어두운 바깥을 탭하면 닫힘', /style=\{styles\.detailBackdrop\}[\s\S]{0,200}?onSelectPin\(null\)/.test(mapSource2171)],
  ['상세 시트: 기존 시트(주황 헤더·maxHeight 92%·본문 스크롤·✕) 그대로', sheetSource2171.indexOf("maxHeight: '92%'") > 0 && sheetSource2171.indexOf('pin-sheet-header') > 0 && sheetSource2171.indexOf('pin-sheet-scroll') > 0 && sheetSource2171.indexOf('accessibilityLabel="상세 닫기"') > 0],
  ['상세 시트: 지도 화면 안이 아니라 MapScreen 맨 위 레이어(헤더까지 덮음)', /detailLayer:\s*\{[\s\S]{0,120}?StyleSheet\.absoluteFillObject[\s\S]{0,80}?zIndex: 40/.test(mapSource2171)],
  // ② 주변 500m 를 왼쪽 하단 메뉴로
  ['도구 메뉴: [주변 500m 보기] 행이 카드 안에', toolsNearbyHtml2171.indexOf('map-tools-nearby') > 0 && toolsNearbyHtml2171.indexOf('주변500m보기') > 0],
  ['도구 메뉴: 카드에 가본 곳만 보기 → 주변 500m → 지도 공유하기 순서', toolsNearbyHtml2171.indexOf('가본곳만보기') < toolsNearbyHtml2171.indexOf('주변500m보기') && toolsNearbyHtml2171.indexOf('주변500m보기') < toolsNearbyHtml2171.indexOf('지도공유하기')],
  ['도구 메뉴: 주변 500m 행은 기존 toggleNearby 를 그대로(메뉴 먼저 접기)', /onPressNearby=\{\(\) => \{[\s\S]{0,180}?setToolsOpen\(false\);[\s\S]{0,80}?toggleNearby\(\);/.test(mapSource2171)],
  ['도구 메뉴: 반경 500m 안 개수를 행에 표시', toolsNearbyHtml2171.indexOf('반경500m안3곳') > 0],
  ['지도: 오른쪽 스택에서 주변 500m 를 뺐음', mapSource2171.indexOf("'주변 ' + NEARBY_RADIUS_M + 'm'") < 0 && toolsSource2171.indexOf('map-tools-nearby') > 0],
  ['지도(접힘): 화면에 주변 500m 글자가 없음(메뉴 안)', mapHtml217.indexOf('주변500m') < 0],
  // v2.18 — 오른쪽 스택은 내 위치 FAB 한 칸 (목록 보기는 상단 칩 줄로 이동)
  ['지도: 오른쪽 스택 높이는 FAB 한 칸', /const actionStackHeight = fabSize;/.test(themeSource2171)],
  // ③ 가본 곳만 보기 — 필터 의미는 그대로, 켜면 지도가 가본 곳으로 따라감
  ['가본 곳만 보기: 켜면 방문 핀만 거르고 지도를 가본 곳에 맞춤', /const toggleVisitedOnly = useCallback\(\(\) => \{[\s\S]{0,2600}?filterByVisit\(baseFiltered, VISIT_DONE\)/.test(mapSource2171) && /toggleVisitedOnly[\s\S]{0,3000}?setFit\(coords\)/.test(mapSource2171)],
  ['가본 곳만 보기: 켤 때/끌 때 문구로 상태를 알림', mapSource2171.indexOf("showToast('가본 곳만 보는 중 · '") > 0 && mapSource2171.indexOf('전체 핀 ') > 0],
  ['가본 곳만 보기: 가본 곳 0곳이면 새 지도 대신 이유 안내', mapSource2171.indexOf('visited-only-empty') > 0 && mapSource2171.indexOf('전체 핀 보기') > 0],
  ['가본 곳만 보기: 스위치 켜짐 문구는 가본 곳 N곳만 보는 중', toolsOpenHtml217.indexOf('가본곳2곳만보는중') > 0],
  ['도구 메뉴: 펼치면 반경 500m 패널을 먼저 닫음(겹침 방지)', /onToggleOpen=\{\(\) => \{[\s\S]{0,320}?if \(next\) setNearbyOpen\(false\);/.test(mapSource2171)],
  // ④ 버전
  ['버전: v2.19.3', APP_VERSION_LABEL === '릴스핀 v2.40.0'],
];
for (const [label, ok, extra] of v2171Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

// ── v2.18: 플로팅 하단바 · 내정보 서브페이지 · 저장 헤더 · 지도 흰 칩 ───────────
const tabBarSource218 = fs.readFileSync(path.join(process.cwd(), 'src/components/TabBar.js'), 'utf8');
const filterChipsSource218 = fs.readFileSync(path.join(process.cwd(), 'src/components/FilterChips.js'), 'utf8');
const overlayHeaderSource218b = fs.readFileSync(path.join(process.cwd(), 'src/components/OverlayHeader.js'), 'utf8');
const profileSource218 = fs.readFileSync(path.join(process.cwd(), 'src/screens/ProfileScreen.js'), 'utf8');
const mapSource218 = fs.readFileSync(path.join(process.cwd(), 'src/screens/MapScreen.js'), 'utf8');
const webMapSource218 = fs.readFileSync(path.join(process.cwd(), 'src/components/RealMapView.web.js'), 'utf8');
const pasteSource218 = fs.readFileSync(path.join(process.cwd(), 'src/screens/PasteScreen.js'), 'utf8');
const appSource218 = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
const tabBarHtml218 = renderToString(<TabBar active="paste" onChange={noop} />);
const radiusHtml218 = renderToString(
  <ProfileScreen initialSub="radius" name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} />
);
const aboutHtml218 = renderToString(
  <ProfileScreen initialSub="about" name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} />
);
const profileHtml218 = renderToString(
  <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} />
);

const v218Checks = [
  // ① 플로팅 탭바 — 바닥에서 뜬 둥근 알약
  ['v2.19 탭바: 알약(999) + 반투명 흰색 + 웹 blur(12px)', /bar: \{[\s\S]{0,700}?borderRadius: 999/.test(tabBarSource218) && tabBarSource218.indexOf("backgroundColor: 'rgba(255,255,255,0.92)'") > 0 && tabBarSource218.indexOf("backdropFilter: 'blur(12px)'") > 0],
  ['v2.18 탭바: 화면 바닥에서 떠 있음(position absolute + bottom)', /wrap: \{[\s\S]{0,200}?position: 'absolute'[\s\S]{0,120}?bottom: tabBar\.bottom/.test(tabBarSource218)],
  ['v2.19 탭바: 선택 탭은 연한 딥 틸 알약', tabBarSource218.indexOf("backgroundColor: 'rgba(13, 148, 136, 0.12)'") > 0 && tabBarSource218.indexOf('styles.iconPillOn') > 0],
  ['v2.19 탭바: 지도 · 저장(+) · 컬렉션 세 탭', ['지도', '저장', '컬렉션'].every((t) => tabBarSource218.indexOf("label: '" + t + "'") > 0) && tabBarHtml218.indexOf('tab-paste') > 0 && tabBarHtml218.indexOf('tab-collections') > 0],
  ['v2.19 탭바: 값은 theme.tabBar 한 곳 (폭 190 · 높이 54 · 뜬 간격 12)', tabBar.width === 190 && tabBar.height === 54 && tabBar.bottom === 12 && tabBar.floatTop === 66 && tabBar.controlsBottom === 76],
  ['v2.18 탭바: 앱이 화면 최상위 레이어에 그림', appSource218.indexOf('<TabBar active={tab} onChange={setTab}') > 0 && appSource218.indexOf('tabBar.controlsBottom + 16') > 0],
  // ② 지도 — 흰 반투명 분류 칩 + 맨 앞 목록 아이콘 버튼 + 탭바와 안 겹침
  ['v2.18 지도: 분류 칩이 흰색 반투명(rgba(255,255,255,0.90)) + 어두운 글씨', filterChipsSource218.indexOf("backgroundColor: 'rgba(255,255,255,0.90)'") > 0 && /text: \{[\s\S]{0,120}?color: '#1C1C1E'/.test(filterChipsSource218)],
  ['v2.18 지도: 목록 아이콘 버튼이 분류 맨 앞', /<View style=\{styles\.row\}>[\s\S]{0,400}?testID="map-list-toggle"[\s\S]{0,900}?<ScrollView/.test(filterChipsSource218) && filterChipsSource218.indexOf('map-list-toggle') > 0],
  ['v2.18 지도: MapScreen 이 목록 전환을 칩 줄에 넘김', mapSource218.indexOf('onToggleView={toggleView}') > 0 && mapSource218.indexOf('목록 보기</Text>') < 0],
  // v2.19.3 — 왼쪽 도구는 이제 tabBar.controlsBottom 이 아니라 오른쪽 FAB 과 같은 바닥선을 씁니다
  //            (그 값이 여전히 탭바·NAVER 로고보다 위인지로 "탭바 위" 를 확인합니다)
  ['v2.18 지도: 왼쪽 하단 도구·오른쪽 버튼이 탭바 위로(tabBar/floatLift)', mapSource218.indexOf('bottom: tabBar.controlsBottom') < 0 && mapControls.toolsToggleBottom > tabBar.floatTop && mapControls.actionBottom > tabBar.floatTop],
  ['v2.18 지도: +/− 박스·내 위치도 탭바 위로 (mapControls.stackBottom = 26 + floatTop)', mapControls.floatLift === tabBar.floatTop && mapControls.stackBottom === 26 + tabBar.floatTop && mapControls.actionStackHeight === mapControls.fabSize],
  ['v2.18 지도: NAVER 로고를 탭바 위로 올리는 처리', webMapSource218.indexOf('export function liftNaverLogo') > 0 && webMapSource218.indexOf('liftNaverLogo(node, tabBar.floatTop + 6)') > 0 && webMapSource218.indexOf('export function liftLeafletBottom') > 0],
  // ③ 저장 — 검색과 같은 헤더 · 탭 이름 · 원탭/붙여넣기 제거
  // v2.19.1 — 저장 화면은 OverlayHeader, 검색 팝업은 같은 다크 차콜 헤더를 가진 LayerSheet 시트
  ['v2.18 저장: 저장 헤더(OverlayHeader) · 검색 팝업은 같은 다크 차콜 시트', pasteSource218.indexOf('<OverlayHeader') > 0 && searchOverlaySource216.indexOf('<LayerSheet') > 0 && overlayHeaderSource218b.indexOf('colors.charcoal') > 0],
  ['v2.18 저장: 헤더는 저장 + ✕ (풀페이지 유지)', pasteSource218.indexOf('testID="paste-header"') > 0 && /<OverlayHeader[\s\S]{0,300}?closeTestID="paste-header-close"/.test(pasteSource218)],
  ['v2.18 저장: 첫 탭 이름 `릴스·쇼츠로 찾기`', pasteSource218.indexOf("label: '릴스·쇼츠로 찾기'") > 0 && pasteCode.indexOf("label: '릴스 링크'") < 0],
  ['v2.18 저장: 원탭 테스트·클립보드 버튼 제거', pasteCode.indexOf('원탭 테스트') < 0 && pasteCode.indexOf('클립보드에서 붙여넣기') < 0 && pasteCode.indexOf('clipboard-outline') < 0],
  // ④ 내 정보 — 상단 통합 계정 카드 + 설정 3행 + 서브 페이지
  ['v2.18 내 정보: 통합 계정 카드(프로필 + 계정·클라우드 동기화)', profileHtml218.indexOf('profile-account-card') > 0 && profileHtml218.indexOf('계정 · 클라우드 동기화') > 0 && profileHtml218.indexOf('account-card-body') > 0],
  ['v2.18 내 정보: 설정 3행(분류 관리 · 지오펜스 반경 · 앱 정보)', ['profile-row-categories', 'profile-row-radius', 'profile-row-about'].every((id) => profileHtml218.indexOf(id) > 0)],
  ['v2.18 내 정보: 본문에는 분류·반경·앱 정보 상세가 없음(서브 페이지로 이동)', profileHtml218.indexOf('새 분류 이름') < 0 && profileHtml218.indexOf('번들 ID') < 0 && profileHtml218.indexOf('radius-option-300') < 0],
  ['v2.18 내 정보: 지오펜스 반경 서브 페이지(‹ 뒤로 + 3개 반경)', radiusHtml218.indexOf('profile-sub-radius') > 0 && radiusHtml218.indexOf('profile-sub-back') > 0 && radiusHtml218.indexOf('radius-option-300') > 0 && radiusHtml218.indexOf('radius-option-1000') > 0],
  ['v2.18 내 정보: 앱 정보 서브 페이지(버전·번들 ID)', aboutHtml218.indexOf('profile-sub-about') > 0 && aboutHtml218.indexOf(APP_INFO_BUNDLE) > 0 && aboutHtml218.indexOf('릴스핀 v2.40.0') > 0],
  ['v2.19: ☰ 시트가 분류 관리 서브 페이지를 직접 연다', profileSource218.indexOf("openSub('categories')") > 0 && menuSource216.indexOf("sub === 'categories'") > 0],
];
for (const [label, ok, extra] of v218Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}


// ── v2.19: 컴팩트 아이콘 하단바 · ☰ = 내 정보 머지 · 📂 컬렉션 탭 ───────────────
const tabBarSource219 = fs.readFileSync(path.join(process.cwd(), 'src/components/TabBar.js'), 'utf8');
const menuSource219 = fs.readFileSync(path.join(process.cwd(), 'src/components/MenuDrawerModal.js'), 'utf8');
const collectionsSource219 = fs.readFileSync(path.join(process.cwd(), 'src/screens/CollectionsScreen.js'), 'utf8');
const profileSource219 = fs.readFileSync(path.join(process.cwd(), 'src/screens/ProfileScreen.js'), 'utf8');
const appSource219 = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
const storageSource219 = fs.readFileSync(path.join(process.cwd(), 'src/storage.js'), 'utf8');
const themeSource219 = fs.readFileSync(path.join(process.cwd(), 'src/theme.js'), 'utf8');

const COL_PINS_219 = [
  { id: 'c-1', name: '검단 이니야', area: '당하동', category: '맛집', lat: 37.5831, lng: 126.7146, visited: true, createdAt: '2026-11-16T10:00:00+09:00' },
  { id: 'c-2', name: '당하 순대국', area: '당하동', category: '맛집', lat: 37.5842, lng: 126.7129, visited: false, createdAt: '2026-11-16T09:00:00+09:00' },
  { id: 'c-3', name: '검단 카페', area: '당하동', category: '카페', lat: 37.5808, lng: 126.7168, visited: false, createdAt: '2026-11-16T08:00:00+09:00' },
];
const COL_219 = [
  {
    id: 'col-a',
    name: '검단 점심 코스',
    desc: '회사 근처 12시~1시',
    emoji: '🍜',
    color: '#0D9488',
    pinIds: ['c-1', 'c-2'],
    createdAt: '2026-11-16T12:00:00+09:00',
    updatedAt: '2026-11-16T12:00:00+09:00',
  },
  {
    id: 'col-b',
    name: '카페 모음',
    desc: '',
    emoji: '☕',
    color: '#0FA968',
    pinIds: [],
    createdAt: '2026-11-16T11:00:00+09:00',
    updatedAt: '2026-11-16T11:00:00+09:00',
  },
];

const collectionsListHtml219 = renderToString(
  <CollectionsScreen pins={COL_PINS_219} collections={COL_219} onToast={noop} onGoPaste={noop} onOpenPin={noop} />
);
const collectionsEmptyHtml219 = renderToString(
  <CollectionsScreen pins={COL_PINS_219} collections={[]} onToast={noop} onGoPaste={noop} />
);
const collectionsDetailHtml219 = renderToString(
  <CollectionsScreen
    pins={COL_PINS_219}
    collections={COL_219}
    initialCollectionId="col-a"
    onToast={noop}
    onGoPaste={noop}
    onOpenPin={noop}
    onToggleCollectionPin={noop}
  />
);
const tabBarHtml219 = renderToString(<TabBar active="collections" onChange={noop} />);
const menuHtml219 = renderToString(
  <MenuDrawerModal
    visible
    pins={COL_PINS_219}
    categories={['맛집', '카페', '가볼곳']}
    radiusMeters={300}
    cloudConfigured
    onClose={noop}
    onShareMap={noop}
    onGoPaste={noop}
    onToast={noop}
  />
);
const menuCatHtml219 = renderToString(
  <MenuDrawerModal
    visible
    initialSub="categories"
    pins={COL_PINS_219}
    categories={['맛집', '카페', '가볼곳', '아이랑']}
    radiusMeters={300}
    onClose={noop}
    onToast={noop}
  />
);
const menuRadiusHtml219 = renderToString(
  <MenuDrawerModal visible initialSub="radius" pins={COL_PINS_219} radiusMeters={500} onChangeRadius={noop} onClose={noop} />
);
const menuAboutHtml219 = renderToString(
  <MenuDrawerModal visible initialSub="about" pins={COL_PINS_219} onClose={noop} />
);
const mapCollectionHtml219 = renderToString(
  <MapScreen
    pins={COL_PINS_219}
    collectionFilter={{ id: 'col-a', name: '검단 점심 코스', emoji: '🍜', pinIds: ['c-1', 'c-2'] }}
    onClearCollectionFilter={noop}
    onSelectPin={noop}
    onToast={noop}
    onGoPaste={noop}
  />
);

const v219Checks = [
  // ① 컴팩트 아이콘 하단바 — 지도 · ＋ · 컬렉션 (한글 라벨 없음)
  ['v2.19 탭바: 글자 없이 아이콘만(라벨 상수는 접근성용)', tabBarSource219.indexOf('<Text') < 0 && tabBarSource219.indexOf('accessibilityLabel={tab.label}') > 0],
  ['v2.19 탭바: 탭 3개 = map · paste · collections', tabBarSource219.indexOf("key: 'map'") > 0 && tabBarSource219.indexOf("key: 'paste'") > 0 && tabBarSource219.indexOf("key: 'collections'") > 0 && tabBarHtml219.indexOf('tab-collections') > 0],
  ['v2.19 탭바: 폭 190(예전 358의 절반 남짓) · 가운데 정렬', tabBar.width === 190 && /wrap: \{[\s\S]{0,200}?alignItems: 'center'/.test(tabBarSource219) && tabBarSource219.indexOf('width: tabBar.width') > 0],
  ['v2.19 탭바: 접근성 이름 지도 · 저장 · 컬렉션', ['지도', '저장', '컬렉션'].every((t) => tabBarSource219.indexOf("label: '" + t + "'") > 0)],
  ['v2.19 지도: 왼쪽/오른쪽 컨트롤은 새 탭바 높이(66/76)만큼 위로', mapControls.floatLift === 66 && tabBar.controlsBottom === 76 && themeSource219.indexOf('const width = 190') > 0],
  // ② ☰ = 내 정보 머지
  ['v2.19 ☰: 제목 `내 정보` (v2.32.2 — 헤더 부제 없음)', menuHtml219.indexOf('menu-title') > 0 && menuHtml219.indexOf('내 정보') > 0 && menuHtml219.indexOf('계정 · 동기화 · 설정') < 0],
  ['v2.19 ☰: 통합 계정 카드 + 설정 3행이 시트 안에', menuHtml219.indexOf('profile-account-card') > 0 && ['profile-row-categories', 'profile-row-radius', 'profile-row-about'].every((id) => menuHtml219.indexOf(id) > 0)],
  ['v2.19 ☰: 저장 요약 + 내 지도 공유는 유지 · 프로 카드는 2026-11-21 부터 숨김', menuHtml219.indexOf('저장된 핀') > 0 && menuHtml219.indexOf('menu-share') > 0 && menuHtml219.indexOf('릴스핀 프로') < 0],
  ['v2.19 ☰: 분류 관리 서브 페이지(‹ 뒤로 + 새 분류 + 기본 잠금)', menuCatHtml219.indexOf('menu-sub-categories') > 0 && menuCatHtml219.indexOf('menu-sub-back') > 0 && menuCatHtml219.indexOf('새 분류 이름') > 0 && menuCatHtml219.indexOf('기본') > 0],
  ['v2.19 ☰: 지오펜스 반경 서브 페이지(300/500/1km + 지금 반경)', menuRadiusHtml219.indexOf('menu-sub-radius') > 0 && menuRadiusHtml219.indexOf('radius-option-300') > 0 && menuRadiusHtml219.indexOf('radius-option-1000') > 0],
  ['v2.19 ☰: 앱 정보 서브 페이지(버전·번들 ID)', menuAboutHtml219.indexOf('menu-sub-about') > 0 && menuAboutHtml219.indexOf(APP_INFO_BUNDLE) > 0 && menuAboutHtml219.indexOf('릴스핀 v2.40.0') > 0],
  ['v2.19 앱: 내 정보 탭 제거 · ☰ 시트가 ProfileScreen(panel) 사용', appSource219.indexOf("tab !== 'profile'") < 0 && appSource219.indexOf('<MenuDrawerModal') > 0 && appSource219.indexOf('panel') < 0 && menuSource219.indexOf('panel') > 0],
  // ③ 📂 컬렉션 탭
  // v2.32.0 — 상훈 님 요청: `2곳 담김` 은 빼고 `2개 컬렉션` 만
  ['v2.19 컬렉션: 목록 머리(내 컬렉션 · N개 · 새 컬렉션)', collectionsListHtml219.indexOf('내 컬렉션') > 0 && collectionsListHtml219.indexOf('2개 컬렉션') > 0 && collectionsListHtml219.indexOf('곳 담김') < 0 && collectionsListHtml219.indexOf('collection-new') > 0],
  ['v2.19 컬렉션: 카드에 이름·설명·담은 수·미리보기', collectionsListHtml219.indexOf('검단 점심 코스') > 0 && collectionsListHtml219.indexOf('회사 근처 12시~1시') > 0 && collectionsListHtml219.indexOf('2곳') > 0 && collectionsListHtml219.indexOf('검단 이니야') > 0],
  ['v2.19 컬렉션: 카드마다 지도에서 보기 · 공유 · 관리', ['collection-map-col-a', 'collection-share-col-a', 'collection-edit-col-a'].every((id) => collectionsListHtml219.indexOf(id) > 0)],
  ['v2.19 컬렉션: 빈 상태 안내 + 첫 컬렉션 만들기', collectionsEmptyHtml219.indexOf('아직 컬렉션이 없어요') > 0 && collectionsEmptyHtml219.indexOf('첫 컬렉션 만들기') > 0],
  ['v2.19 컬렉션 상세: 핀 담기·빼기 체크박스(담긴 핀 checked)', /aria-checked="true"[^>]*data-testid="collection-pin-check-c-1"/.test(collectionsDetailHtml219) && /aria-checked="false"[^>]*data-testid="collection-pin-check-c-3"/.test(collectionsDetailHtml219)],
  ['v2.19 컬렉션 상세: 담은 순서 + 수정/삭제 + 지도/공유', collectionsDetailHtml219.indexOf('담은 순서') > 0 && collectionsDetailHtml219.indexOf('collection-edit-form') < 0 && collectionsDetailHtml219.indexOf('collection-detail-edit') > 0 && collectionsDetailHtml219.indexOf('collection-delete') > 0 && collectionsDetailHtml219.indexOf('collection-detail-map') > 0 && collectionsDetailHtml219.indexOf('collection-detail-share') > 0],
  ['v2.19 컬렉션: 공유는 제목+장소 목록+지도 링크', collectionsSource219.indexOf('collectionShareText(collection, pins)') > 0 && collectionsSource219.indexOf('buildShareUrl(items)') > 0 && collectionsSource219.indexOf('Clipboard.setStringAsync') > 0],
  ['v2.19 지도: 컬렉션 필터 시 `📂 이름 N곳 ×` 칩', mapCollectionHtml219.indexOf('map-collection-chip') > 0 && mapCollectionHtml219.indexOf('컬렉션 필터 해제') > 0 && mapCollectionHtml219.indexOf('검단 점심 코스') > 0],
  ['v2.19 지도: 필터 켜면 컬렉션 핀만 남김(collectionIdSet)', /baseFiltered[\s\S]{0,400}?collectionIdSet\.has/.test(mapSource218)],
  ['v2.19 저장: 컬렉션은 기기에 저장(reelpin.collections.v1)', storageSource219.indexOf("'reelpin.collections.v1'") > 0 && appSource219.indexOf('saveCollections(collections)') > 0],
  ['v2.19 저장: 핀을 지우면 컬렉션에서도 정리(prune)', appSource219.indexOf('pruneCollections(prev, pins)') > 0],
  ['v2.19: 하단바 탭은 App 이 collections 를 그림', appSource219.indexOf('<CollectionsScreen') > 0 && appSource219.indexOf("tab !== 'collections'") > 0],
  ['v2.19 버전: 메뉴·앱 정보·패키지 모두 2.20.1', APP_VERSION_LABEL === '릴스핀 v2.40.0' && profileSource219.indexOf("'릴스핀 v2.40.0'") > 0 && pkg.version === '2.40.0'],
];
for (const [label, ok, extra] of v219Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

// ── v2.19.1: 팝업 3종 통일 · 가봤어요 체크 · 알림 설정 · 시군구동 ────────────────
// 상훈 님이 2026-11-17 `https://reelpin.vercel.app`(v2.19.0)을 직접 써보고 주신 6가지 디테일.
const layerSheetSource191 = fs.readFileSync(path.join(process.cwd(), 'src/components/LayerSheet.js'), 'utf8');
const menuDrawerSource191 = fs.readFileSync(path.join(process.cwd(), 'src/components/MenuDrawerModal.js'), 'utf8');
const searchOverlaySource191 = fs.readFileSync(path.join(process.cwd(), 'src/components/SearchOverlayModal.js'), 'utf8');
const alertInboxSource191 = fs.readFileSync(path.join(process.cwd(), 'src/components/AlertInbox.js'), 'utf8');
const listViewSource191 = fs.readFileSync(path.join(process.cwd(), 'src/components/PinListView.js'), 'utf8');
const mapSource191 = fs.readFileSync(path.join(process.cwd(), 'src/screens/MapScreen.js'), 'utf8');
const profileSource191 = fs.readFileSync(path.join(process.cwd(), 'src/screens/ProfileScreen.js'), 'utf8');
const sheetSource191 = fs.readFileSync(path.join(process.cwd(), 'src/components/PinDetailSheet.js'), 'utf8');
const appSource191 = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
const storageSource191 = fs.readFileSync(path.join(process.cwd(), 'src/storage.js'), 'utf8');

const AREA_PINS_191 = [
  {
    id: 'ap-1',
    name: '당하 이탈리안',
    area: '당하동',
    address: '인천 서구 이음2로 70',
    category: '맛집',
    lat: 37.5828,
    lng: 126.7141,
    visited: false,
    createdAt: '2026-11-16T10:00:00+09:00',
  },
  {
    id: 'ap-2',
    name: '역삼 소금빵',
    area: '역삼동',
    address: '서울 강남구 테헤란로 123',
    category: '카페',
    lat: 37.5006,
    lng: 127.0364,
    visited: false,
    createdAt: '2026-11-16T09:00:00+09:00',
  },
  {
    id: 'ap-3',
    name: '일산 국밥',
    area: '일산동',
    address: '경기 고양시 일산서구 중앙로 1234',
    category: '맛집',
    lat: 37.6584,
    lng: 126.7705,
    visited: true,
    createdAt: '2026-11-16T08:00:00+09:00',
  },
];

const areaOverlayHtml191 = renderToString(
  <SearchOverlayModal visible pins={AREA_PINS_191} onClose={noop} onOpenPin={noop} />
);
const alertInboxHtml191 = renderToString(
  <AlertInbox visible pins={AREA_PINS_191} myCoords={null} onClose={noop} onLocate={noop} onOpenPin={noop} onGoMap={noop} radiusMeters={500} />
);
const menuAlertsHtml191 = renderToString(
  <MenuDrawerModal
    visible
    initialSub="alerts"
    pins={AREA_PINS_191}
    categories={['맛집', '카페', '가볼곳']}
    radiusMeters={500}
    alertsOn
    notifyPermission="granted"
    onToggleAlerts={noop}
    onClose={noop}
    onToast={noop}
  />
);
const menuAlertsOffHtml191 = renderToString(
  <MenuDrawerModal
    visible
    initialSub="alerts"
    pins={AREA_PINS_191}
    radiusMeters={300}
    alertsOn={false}
    notifyPermission="default"
    onToggleAlerts={noop}
    onClose={noop}
    onToast={noop}
  />
);
const listEmbeddedHtml191 = renderToString(
  <PinListView
    embedded
    pins={AREA_PINS_191}
    filter="전체"
    myCoords={{ lat: 37.5828, lng: 126.7141 }}
    onSelectPin={noop}
    onOpenPin={noop}
   
  />
);
const unvisitedDetailHtml191 = renderToString(
  <PinDetailSheet pin={{ ...SEARCH_PIN, visited: false }} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} onToggleVisited={noop} />
);
const visitedDetailHtml191 = renderToString(
  <PinDetailSheet
    pin={{ ...SEARCH_PIN, visited: true, visitedAt: '2026-11-14T10:00:00+09:00' }}
    radiusMeters={300}
    onClose={noop}
    onDelete={noop}
    onToast={noop}
    onToggleVisited={noop}
  />
);

const v2191Checks = [
  // ① 돋보기 · 알림 모음 · 목록 보기 = 내 정보와 **같은 레이어 팝업**
  ['팝업 통일: 네 화면 모두 `<LayerSheet>` 하나를 씀', [menuDrawerSource191, searchOverlaySource191, alertInboxSource191, mapSource191].every((src) => src.indexOf('<LayerSheet') > 0)],
  ['팝업 통일: 높이 86% · 딤 한 곳(LayerSheet)에서만', SHEET_HEIGHT === '86%' && SHEET_BACKDROP_COLOR === 'rgba(15,23,42,0.55)' && [menuDrawerSource191, searchOverlaySource191, alertInboxSource191].every((src) => src.indexOf("height: '86%'") < 0 && src.indexOf('rgba(15,23,42') < 0)],
  ['팝업 통일: 위쪽 둥근 모서리 radius.xxl', SHEET_CORNER_RADIUS === 28 && layerSheetSource191.indexOf('borderTopLeftRadius: SHEET_CORNER_RADIUS') > 0],
  ['팝업 통일: 바깥(딤) 탭 + ✕ 둘 다 닫힘', layerSheetSource191.indexOf('style={styles.backdrop}') > 0 && layerSheetSource191.indexOf("testID={testID + '-backdrop'}") > 0 && layerSheetSource191.indexOf('onPress={onClose}') > 0],
  ['팝업 통일: 같은 다크 차콜 헤더(딥 틸 원 아이콘 · ✕)', layerSheetSource191.indexOf('backgroundColor: colors.charcoal') > 0 && layerSheetSource191.indexOf('backgroundColor: colors.brand') > 0 && layerSheetSource191.indexOf('colors.charcoalPill') > 0],
  ['돋보기: 내 정보와 같은 시트(제목·부제·✕ 그대로)', searchOverlaySource191.indexOf('title="내 장소 검색"') > 0 && searchOverlaySource191.indexOf('overlayTestID="search-overlay"') > 0 && searchOverlaySource191.indexOf('closeTestID="search-overlay-close"') > 0],
  ['알림 모음: 내 정보와 같은 시트(부텍스트 없음 · 지도에서 보기 발끝)', alertInboxSource191.indexOf('sub=') < 0 && alertInboxSource191.indexOf('footer={') > 0 && alertInboxHtml191.indexOf('alert-inbox') > 0],
  ['목록 보기: 전체 화면 대신 레이어 팝업으로 열림', /view === 'list' && \(\s*\n\s*<LayerSheet/.test(mapSource191) && mapSource191.indexOf('headerTestID="pin-list-sheet-header"') > 0],
  ['목록 보기: ✕·바깥 탭 = 지도로 복귀(toggleView)', /<LayerSheet\s+visible\s+onClose={toggleView}/.test(mapSource191) && mapSource191.indexOf('closeLabel="목록 닫기"') > 0],
  ['목록 보기: 시트 안에서는 embedded(전체 화면 absoluteFill 아님)', listViewSource191.indexOf('embedded = false') > 0 && listViewSource191.indexOf('rootEmbedded') > 0 && listEmbeddedHtml191.indexOf('pin-row-ap-1') > 0],
  // ② 장소 상세 `가봤어요` = 체크박스 (미방문도 라벨은 `가봤어요`)
  ['가봤어요: 미방문 = 빈 체크박스 + `가봤어요`', unvisitedDetailHtml191.indexOf('pin-visited-box') > 0 && unvisitedDetailHtml191.indexOf('가봤어요') > 0 && unvisitedDetailHtml191.indexOf('아직 안 가봤어요') < 0],
  ['가봤어요: 미방문 체크박스는 aria-checked=false', /aria-checked="false"[^>]*data-testid="pin-visited-toggle"/.test(unvisitedDetailHtml191) || /data-testid="pin-visited-toggle"[^>]*aria-checked="false"/.test(unvisitedDetailHtml191)],
  ['가봤어요: 체크하면 `가봤어요 (방문 완료)` + aria-checked=true', visitedDetailHtml191.indexOf('가봤어요 (방문 완료)') > 0 && visitedDetailHtml191.indexOf('aria-checked="true"') > 0],
  ['가봤어요: 저장값은 visited true/false 그대로(지도·목록 ✓ 와 같은 값)', sheetSource191.indexOf('const visited = pin.visited === true') > 0 && sheetSource191.indexOf('const next = !visited') > 0 && sheetSource191.indexOf('onToggleVisited(pin.id, next)') > 0],
  ['가봤어요: 체크박스 모양(둥근 점 아님·초록 채움)', /visitCheck: \{[\s\S]{0,200}?borderRadius: 6/.test(sheetSource191) && /visitCheckOn: \{[\s\S]{0,120}?backgroundColor: colors\.visit/.test(sheetSource191)],
  // ③ 내 정보 › 알림 설정
  ['알림 설정: 내 정보 설정 목록에 행이 있음', menuHtml219.indexOf('profile-row-alerts') > 0 && profileSource191.indexOf('title="알림 설정"') > 0],
  ['알림 설정: 서브 페이지(‹ 뒤로 + 스위치 + 지오펜스 반경 연결)', menuAlertsHtml191.indexOf('menu-sub-alerts') > 0 && menuAlertsHtml191.indexOf('menu-sub-back') > 0 && menuAlertsHtml191.indexOf('alerts-setting-toggle') > 0 && menuAlertsHtml191.indexOf('alerts-setting-radius') > 0],
  ['알림 설정: 켜짐/꺼짐 문구와 스위치 상태가 같음', menuAlertsHtml191.indexOf('aria-checked="true"') > 0 && menuAlertsHtml191.indexOf('켜짐') > 0 && menuAlertsOffHtml191.indexOf('aria-checked="false"') > 0 && menuAlertsOffHtml191.indexOf('꺼짐') > 0],
  ['알림 설정: 권한 상태를 사실대로 안내', profileSource191.indexOf('브라우저 알림이 꺼져 있어 앱 안 배너로만 알려드려요') > 0 && profileSource191.indexOf('이 브라우저에는 알림창이 없어 앱 안 배너로 알려드려요') > 0],
  ['알림 설정: 값은 지도 알림과 하나(App → MapScreen)', appSource191.indexOf('alertsEnabled={alertsEnabled}') > 0 && appSource191.indexOf('onToggleAlerts={handleToggleAlerts}') > 0 && mapSource191.indexOf('const alertsOn = Boolean(alertsEnabled)') > 0],
  ['알림 설정: 기기에 저장(reelpin.alerts.v1)', storageSource191.indexOf("'reelpin.alerts.v1'") > 0 && appSource191.indexOf('saveAlerts(alertsEnabled)') > 0 && appSource191.indexOf('loadAlerts()') > 0],
  // ④ 내 정보 순서 — 저장한 장소 · 내 지도 공유하기가 설정 목록 위
  ['내 정보 순서: 저장한 장소·지도 공유가 설정 목록 위', menuHtml219.indexOf('profile-summary') < menuHtml219.indexOf('profile-settings-rows') && menuHtml219.indexOf('menu-share') < menuHtml219.indexOf('profile-settings-rows')],
  ['내 정보 순서: 계정 카드 → 저장 요약 → 공유 → 설정', menuHtml219.indexOf('profile-account-card') < menuHtml219.indexOf('profile-summary') && menuHtml219.indexOf('profile-summary') < menuHtml219.indexOf('menu-share')],
  ['내 정보 설정 4행: 분류 관리 → 지오펜스 반경 → 알림 설정 → 앱 정보', menuHtml219.indexOf('profile-row-categories') < menuHtml219.indexOf('profile-row-radius') && menuHtml219.indexOf('profile-row-radius') < menuHtml219.indexOf('profile-row-alerts') && menuHtml219.indexOf('profile-row-alerts') < menuHtml219.indexOf('profile-row-about')],
  // ④-1 v2.40.0 — 상훈 님 요청(IMG_9293): 제보 → 개인정보처리방침 → 이용약관 → 앱 정보
  ['내 정보 설정 순서: 분류 → 반경 → 알림 → 제보 → 개인정보처리방침 → 이용약관 → 앱 정보', ['profile-row-categories', 'profile-row-radius', 'profile-row-alerts', 'profile-row-feedback', 'profile-row-privacy', 'profile-row-terms', 'profile-row-about'].map((id) => menuHtml219.indexOf(id)).every((at, i, arr) => at > 0 && (i === 0 || arr[i - 1] < at))],
  ['내 정보: 법적 고지 두 행이 실제로 그려짐', menuHtml219.indexOf('개인정보처리방침') > 0 && menuHtml219.indexOf('이용약관') > 0 && menuHtml219.indexOf('수집 항목 · 이용 목적 · 보관과 파기') > 0],
  ['내 정보: 하단 고정 버전·법적 고지 푸터 없음', menuHtml219.indexOf('menu-version') < 0 && menuHtml219.indexOf('menu-legal') < 0],
  // ⑤ 장소 검색 추천 = 시·군·구·동
  ['시군구동: 시·도 이름은 짧게(인천광역시 → 인천)', placeAreaLabel({ area: '당하동', address: '인천광역시 서구 당하동 12-3' }) === '인천 서구 당하동'],
  ['시군구동: `인천 서구 당하동`', placeAreaLabel(AREA_PINS_191[0]) === '인천 서구 당하동'],
  ['시군구동: `서울 강남구 역삼동`', placeAreaLabel(AREA_PINS_191[1]) === '서울 강남구 역삼동'],
  ['시군구동: `경기 고양시 일산서구 일산동`', placeAreaLabel(AREA_PINS_191[2]) === '경기 고양시 일산서구 일산동'],
  ['시군구동: 주소가 없으면 지어내지 않고 동만', placeAreaLabel({ area: '당하동' }) === '당하동' && placeAreaLabel({ area: '검단', address: '인천 서구 아라뱃길 00' }) === '인천 서구 검단'],
  ['시군구동: 주소에서 시·구·동 토큰만 뽑음', addressRegions('경기 고양시 일산서구 중앙로 1234').gu === '일산서구' && addressRegions('경기 고양시 일산서구 중앙로 1234').si === '고양시'],
  // 추천은 '아직 안 가본 곳' — ap-3 은 visited 라 추천에 없고, 대신 라벨 자체는 위에서 확인합니다
  ['시군구동: 검색 팝업 추천 카드에 그대로 보임', areaOverlayHtml191.indexOf('인천 서구 당하동') > 0 && areaOverlayHtml191.indexOf('서울 강남구 역삼동') > 0 && areaOverlayHtml191.indexOf('경기 고양시 일산서구 일산동') < 0],
  ['시군구동: `분류 · 지역` 한 줄 표기', placeMetaLabel(AREA_PINS_191[0]) === '맛집 · 인천 서구 당하동' && placeMetaLabel({ name: 'x' }) === '내 지도'],
  // ⑥ 버전
  ['v2.20.1 버전: 메뉴 · 앱 정보 · package · app.json', APP_VERSION_LABEL === '릴스핀 v2.40.0' && APP_INFO_VERSION === '릴스핀 v2.40.0' && pkg.version === '2.40.0' && expoConfig.version === '2.40.0'],
];
for (const [label, ok, extra] of v2191Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

// ── v2.19.2: 상세 헤더 = 분류 색 · 서브 뒤로 `‹` 만 · 지도 +/− ↔ 내 위치 자리 ─────
// 상훈 님이 2026-11-17 아이폰 실사용 캡처(IMG_9091)와 함께 주신 3가지 수정.
const pinSheetSource2192 = sheetSource;
const layerSheetSource2192 = layerSheetSource191;
const profileSource2192 = profileSource191;
const mapSource2192 = mapSource191;
const webMapSource2192 = webMapSource218;
const CATS_2192 = ['맛집', '카페', '가볼곳', '아이랑'];
/** '#RRGGBB' → react-native-web SSR 인라인 스타일 표기 'rgba(r,g,b,1.00)' */
const rgbaOf2192 = (hex) => {
  const raw = String(hex).replace('#', '');
  return 'rgba(' + parseInt(raw.slice(0, 2), 16) + ',' + parseInt(raw.slice(2, 4), 16) + ',' + parseInt(raw.slice(4, 6), 16) + ',1.00)';
};
/** 핀 상세 시트 헤더 div 의 style 문자열만 뽑습니다 (분류 색이 인라인으로 들어갑니다) */
const pinHeaderStyle2192 = (category) => {
  const html = renderToString(
    <PinDetailSheet
      pin={{ ...SEARCH_PIN, id: 'hdr-' + category, category }}
      radiusMeters={300}
      onClose={noop}
      onDelete={noop}
      onToast={noop}
      categories={CATS_2192}
    />
  );
  const at = html.indexOf('data-testid="pin-sheet-header"');
  if (at < 0) return '';
  const start = html.lastIndexOf('<div', at);
  return html.slice(start, at);
};
const headerStyleCoral = pinHeaderStyle2192('맛집');
const headerStyleMint = pinHeaderStyle2192('카페');
const headerStyleBlue = pinHeaderStyle2192('가볼곳');
const headerStyleCustom = pinHeaderStyle2192('아이랑');

// v2.19.3 — 왼쪽 `🎛️` 토글 ↔ 오른쪽 `내 위치` FAB 하단 정렬 (상훈 님 아이폰 캡처 IMG_9092)
const toolsSource2193 = toolsSource217;
const toolsOpenHtml2193 = toolsOpenHtml217;

const v2192Checks = [
  // ① 상세 시트 헤더 = 분류 색
  ['v2.19.2 핀 시트: `맛집` 헤더 = 딥 틸 ' + DEFAULT_CATEGORY_COLORS['맛집'], headerStyleCoral.indexOf(rgbaOf2192('#0D9488')) > 0, headerStyleCoral.slice(0, 160)],
  ['v2.19.2 핀 시트: `카페` 헤더 = 앰버 ' + DEFAULT_CATEGORY_COLORS['카페'], headerStyleMint.indexOf(rgbaOf2192('#D97706')) > 0, headerStyleMint.slice(0, 160)],
  ['v2.19.2 핀 시트: `가볼곳` 헤더 = 블루 ' + DEFAULT_CATEGORY_COLORS['가볼곳'], headerStyleBlue.indexOf(rgbaOf2192('#3B82F6')) > 0, headerStyleBlue.slice(0, 160)],
  ['v2.19.2 핀 시트: 커스텀 분류도 그 분류 색', headerStyleCustom.indexOf(rgbaOf2192(CUSTOM_CATEGORY_COLORS[0])) > 0, headerStyleCustom.slice(0, 160)],
  [
    'v2.19.2 핀 시트: 헤더 색 = getCategoryColor(pin.category) — 분류를 바꾸면 즉시 바뀜',
    pinSheetSource2192.indexOf('const headerColor = categoryDot;') > 0 &&
      pinSheetSource2192.indexOf('const categoryDot = getCategoryColor(categoryName, categories);') > 0 &&
      pinSheetSource2192.indexOf('style={[styles.headerBar, { backgroundColor: headerColor }]}') > 0 &&
      pinSheetSource2192.indexOf('onChangeCategory(pin.id, name)') > 0,
  ],
  [
    'v2.19.2 핀 시트: 흰 이름(그림자) · 반투명 흰 원 ✕ 유지',
    /name: \{[\s\S]{0,320}?color: colors\.white[\s\S]{0,200}?textShadowColor/.test(pinSheetSource2192) &&
      /closeBtn: \{[\s\S]{0,240}?rgba\(255,255,255,0\.22\)/.test(pinSheetSource2192) &&
      /name="close" size=\{18\} color=\{colors\.white\}/.test(pinSheetSource2192),
  ],
  [
    'v2.19.2 핀 시트: 본문 끝 여백이 스크롤 안쪽에 있음 (v2.28.0 — 탭바가 숨으므로 28px, tabBar.floatTop 66 유지)',
    /body: \{[\s\S]{0,320}?paddingBottom: 24/.test(pinSheetSource2192) && tabBar.floatTop === 66,
  ],
  // ② 레이어 팝업 서브 페이지 뒤로 버튼 = `‹` 만
  [
    'v2.19.2 레이어 팝업: 서브 뒤로 버튼에 한글 `뒤로` 가 화면에 없음',
    menuCatHtml219.indexOf('menu-sub-back') > 0 &&
      menuCatHtml219.indexOf('>뒤로<') < 0 &&
      menuCatHtml219.indexOf('aria-label="뒤로"') > 0,
  ],
  [
    'v2.19.2 레이어 팝업: 뒤로 버튼은 chevron 아이콘 하나 (Text 없음)',
    /<Ionicons name="chevron-back" size=\{20\} color=\{colors\.white\} \/>\s*<\/Pressable>/.test(layerSheetSource2192) &&
      layerSheetSource2192.indexOf('styles.backText') < 0,
  ],
  [
    'v2.19.2 내 정보 단독 서브(지오펜스 반경): 뒤로도 `‹` 만 + aria-label 유지',
    radiusHtml218.indexOf('profile-sub-back') > 0 &&
      radiusHtml218.indexOf('>뒤로<') < 0 &&
      radiusHtml218.indexOf('aria-label="뒤로"') > 0,
  ],
  [
    'v2.19.2 내 정보: 서브 뒤로 버튼 소스에 Text 한글 없음',
    profileSource2192.indexOf('subBackText') < 0 &&
      /<Ionicons name="chevron-back" size=\{20\} color=\{colors\.text\} \/>/.test(profileSource2192) &&
      profileSource2192.indexOf('accessibilityLabel="뒤로"') > 0,
  ],
  // ③ 지도 오른쪽: 위 = +/−, 아래 = 내 위치
  [
    'v2.19.3 지도: 왼쪽 `🎛️` 토글과 오른쪽 `내 위치` FAB 이 같은 바닥선·같은 46px',
    mapControls.toolsToggleBottom === mapControls.actionBottom &&
      mapControls.toolsToggleSize === mapControls.fabSize &&
      mapControls.fabSize === 46,
    'toolsBottom=' + String(mapControls.toolsToggleBottom) + ' actionBottom=' + String(mapControls.actionBottom) + ' size=' + String(mapControls.toolsToggleSize),
  ],
  [
    'v2.19.3 지도 도구: MapToolsMenu 가 그 값을 그대로 씀 (left 12 · bottom toolsToggleBottom · 46px)',
    /col: \{[\s\S]{0,260}?left: 12,[\s\S]{0,120}?bottom: mapControls\.toolsToggleBottom/.test(toolsSource2193) &&
      toolsSource2193.indexOf('TOOLS_TOGGLE_SIZE = mapControls.fabSize') > 0 &&
      TOOLS_TOGGLE_SIZE === mapControls.fabSize &&
      /toggle: \{[\s\S]{0,400}?height: TOOLS_TOGGLE_SIZE/.test(toolsSource2193) &&
      toolsOpenHtml2193.indexOf('map-tools-toggle') > 0,
    'TOOLS_TOGGLE_SIZE=' + String(TOOLS_TOGGLE_SIZE),
  ],
  [
    'v2.19.3 지도 도구: 알약·펼친 카드도 토글 위로(세로 column · gap 8 · 겹침 0)',
    /col: \{[\s\S]{0,200}?alignItems: 'flex-start',[\s\S]{0,60}?gap: 8/.test(toolsSource2193) &&
      toolsOpenHtml2193.indexOf('map-tools-summary') > 0 &&
      toolsOpenHtml2193.indexOf('map-tools-menu') > 0 &&
      toolsOpenHtml2193.indexOf('map-tools-summary') < toolsOpenHtml2193.indexOf('map-tools-menu'),
  ],
  [
    'v2.19.2 지도: 내 위치 FAB 가 맨 아래 (actionBottom = stackBottom = 26 + floatTop)',
    mapControls.actionBottom === mapControls.stackBottom &&
      mapControls.stackBottom === 26 + tabBar.floatTop &&
      mapControls.actionStackHeight === mapControls.fabSize,
    String(mapControls.actionBottom),
  ],
  [
    'v2.19.2 지도: +/− 박스는 FAB 위 (zoomBottom = actionBottom + fabSize + stackGap)',
    mapControls.zoomBottom === mapControls.actionBottom + mapControls.fabSize + mapControls.stackGap,
    String(mapControls.zoomBottom) + ' vs ' + String(mapControls.actionBottom + mapControls.fabSize + mapControls.stackGap),
  ],
  [
    'v2.19.2 지도: 주변 목록 패널은 +/− 박스 위로',
    mapControls.panelBottom === mapControls.zoomBottom + mapControls.zoomBoxHeight + mapControls.colGap,
    String(mapControls.panelBottom),
  ],
  [
    'v2.19.2 지도: zoomCol 은 zoomBottom · actionCol 은 actionBottom 사용',
    webMapSource2192.indexOf('bottom: mapControls.zoomBottom') > 0 &&
      mapSource2192.indexOf('bottom: mapControls.actionBottom') > 0 &&
      mapSource2192.indexOf('bottom: mapControls.panelBottom') > 0,
  ],
  [
    'v2.19.2 지도: 두 컨트롤 모두 오른쪽 끝선 rightInset 유지 (겹침 0)',
    mapControls.rightInset === 12 && mapSource2192.indexOf('right: mapControls.rightInset') > 0 && webMapSource2192.indexOf('right: mapControls.rightInset') > 0,
  ],
  // ④ 버전
  ['v2.20.1 버전: 메뉴 · 앱 정보 · package · app.json', APP_VERSION_LABEL === '릴스핀 v2.40.0' && APP_INFO_VERSION === '릴스핀 v2.40.0' && pkg.version === '2.40.0' && expoConfig.version === '2.40.0'],
];
for (const [label, ok, extra] of v2192Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

// ── v2.20 — 🕒 영업 상태 배지 · 📝 AI 한줄 메모 자동 채우기 ──────────────
//  · 시각에 상관없이 '영업 중' 이 되도록 00:00~24:00 매일 영업 픽스처를 씁니다.
const HOURS_ALWAYS = {
  source: 'kakao',
  days: [{ day: '매일', start: '00:00', end: '24:00', closed: false, breaks: [], lastOrder: [], endsNextDay: false }],
  closedDays: [],
  closedDates: [],
  hasHours: true,
};
const HOURS_BREAK = {
  source: 'naver',
  days: [
    {
      day: '매일',
      start: '00:00',
      end: '24:00',
      closed: false,
      breaks: [{ start: '00:00', end: '24:00' }],
      lastOrder: [],
      endsNextDay: false,
    },
  ],
  closedDays: [],
  closedDates: [],
  hasHours: true,
};
const openingHtml220 = renderToString(
  <PinDetailSheet pin={{ ...SEARCH_PIN, hours: HOURS_ALWAYS }} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />
);
const breakHtml220 = renderToString(
  <PinDetailSheet pin={{ ...SEARCH_PIN, hours: HOURS_BREAK }} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />
);
const unknownHtml220 = renderToString(
  <PinDetailSheet pin={{ ...SEARCH_PIN, hours: null }} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} />
);
const bannerOpenHtml220 = '';
const bannerNoHoursHtml220 = '';
const pasteSource220 = fs.readFileSync(path.join(process.cwd(), 'src/screens/PasteScreen.js'), 'utf8');
const extractorSource220 = fs.readFileSync(path.join(process.cwd(), 'src/services/extractor.js'), 'utf8');
const mapSource220 = fs.readFileSync(path.join(process.cwd(), 'src/screens/MapScreen.js'), 'utf8');
const pinSheetSource220 = fs.readFileSync(path.join(process.cwd(), 'src/components/PinDetailSheet.js'), 'utf8');
const bannerSource220 = fs.readFileSync(path.join(process.cwd(), 'src/components/GeofenceToast.js'), 'utf8');
const geminiSource220 = fs.readFileSync(path.join(process.cwd(), 'api/gemini.js'), 'utf8');

const v220Checks = [
  // ① 상세 시트 — 영업 상태 배지 + 오늘 영업시간 요약
  ['v2.20 핀 시트: 영업 중이면 🟢 배지 + 오늘 영업시간', openingHtml220.indexOf('🟢 영업 중') > 0 && openingHtml220.indexOf('오늘 00:00~24:00') > 0, openingHtml220.slice(0, 120)],
  ['v2.20 핀 시트: 브레이크타임이면 🟠 배지 (…까지)', breakHtml220.indexOf('🟠 브레이크타임') > 0, breakHtml220.slice(0, 120)],
  ['v2.20 핀 시트: 영업시간이 없으면 "영업시간 미확인" 만 (지어내지 않음)', unknownHtml220.indexOf('영업시간 미확인') > 0 && unknownHtml220.indexOf('🟢') < 0, unknownHtml220.slice(0, 120)],
  ['v2.20 핀 시트: 배지·요약 testID', pinSheetSource220.indexOf('testID="pin-opening-badge"') > 0 && pinSheetSource220.indexOf('testID="pin-opening-summary"') > 0 && pinSheetSource220.indexOf('testID="pin-opening-unknown"') > 0],
  ['v2.20 핀 시트: 한국 시간 기준 계산(evaluateOpening/todaySummary)', pinSheetSource220.indexOf('evaluateOpening(pin.hours') > 0 && pinSheetSource220.indexOf('todaySummary(pin.hours)') > 0],
  // ② 반경 500m 알림 토스트 — v2.28.0 부터 큰 카드(영업 상태 뱃지 포함) 대신 한 줄 토스트
  ['v2.20 알림 토스트: 3초 한줄 토스트에는 영업 상태 뱃지를 넣지 않음(영업 상태는 상세 시트가 담당)', bannerSource220.indexOf('opening') < 0, bannerSource220.slice(0, 160)],
  ['v2.20 알림 토스트: 영업 상태 표기는 상세 시트에 그대로', pinSheetSource220.indexOf('pin-opening-badge') > 0 && pinSheetSource220.indexOf('오늘 ') > 0],
  // ③ 매장 상세 조회 — 네이버/카카오 두 경로 + 6시간 캐시 + 반경 핀 미리 확인
  ['v2.20 지도: 매장 상세(영업시간) 조회 → 핀에 저장', mapSource220.indexOf('fetchPlaceInfo(pin)') > 0 && mapSource220.indexOf('onSavePinHours(pin.id, pinHoursPatch(result.place))') > 0],
  ['v2.20 지도: 보고 있는 핀 + 반경 500m 핀(최대 3곳) 미리 확인', mapSource220.indexOf('push(selectedPin)') > 0 && mapSource220.indexOf('nearby.slice(0, 3)') > 0],
  ['v2.20 지도: 반경 안 알림은 영업 상태 없이 개수만 알림(v2.28.0)', mapSource220.indexOf('bannerOpeningBadge(') < 0 && mapSource220.indexOf('opening={bannerOpening}') < 0 && mapSource220.indexOf('nearbyToastMessage(nearbyToast.count, alertRadius)') > 0],
  // ④ 저장 화면 — AI 한줄 메모 자동 채우기
  ['v2.20 저장 화면: 추출 결과의 memoDraft 로 메모를 자동 채움', pasteSource220.indexOf('String(result.memoDraft ||') > 0 && pasteSource220.indexOf('setMemo(draft)') > 0 && pasteSource220.indexOf('setMemo(photoDraft)') > 0],
  ['v2.20 저장 화면: AI 초안 안내 줄 + testID', pasteSource220.indexOf('paste-memo-auto-line') > 0 && pasteSource220.indexOf('AI가 한줄 메모 초안을 채웠어요') > 0],
  ['v2.20 저장 화면: 한 글자 고치면 AI 초안 표시가 꺼짐', pasteSource220.indexOf('if (memoAutoFilled) setMemoAutoFilled(false)') > 0],
  ['v2.20 저장 화면: 가게명 검색에는 초안을 비움', /setMemo\(''\);\s*\n\s*setMemoAutoFilled\(false\);\s*\n\s*setMeta\(\{\s*\n\s*mode: 'search'/.test(pasteSource220)],
  ['v2.20 추출기: 설명글 표식 · AI 재료로 초안 생성', extractorSource220.indexOf('memoDraftFromText(primaryText)') > 0 && extractorSource220.indexOf('memoPartsOf(json)') > 0 && extractorSource220.indexOf('mergeMemoDrafts(') > 0],
  ['v2.20 Gemini: 추천 메뉴·주차·아기/웨이팅 필드 요청 + 지어내지 말라는 규칙', geminiSource220.indexOf('kidsOrWaitingTip') > 0 && geminiSource220.indexOf('확인된 내용만') > 0],
  // ⑤ 서버 API 파일
  ['v2.20 API: /api/naver-place · /api/kakao-place 존재', fs.existsSync(path.join(process.cwd(), 'api/naver-place.js')) && fs.existsSync(path.join(process.cwd(), 'api/kakao-place.js'))],
  ['v2.20 API: 영업시간 없으면 hasHours=false (추측 금지)', fs.readFileSync(path.join(process.cwd(), 'api/naver-place.js'), 'utf8').indexOf('hasHours') > 0],
];
for (const [label, ok, extra] of v220Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

// ── v2.20.1 — ✅ 핀 위 초록 체크 배지 제거 · 로그아웃 = 게스트 프로필 ──────────
// 상훈 님: "가본 곳 Y일 경우, 초록색 체크 핀은 없애고 텍스트만 지금처럼 초록색으로"
//          "그리고 로그아웃 했는데 어떻게 상단에 이상훈이라고 뜨는지 모르겠어"
const VISITED_PIN_2201 = { ...SAMPLE_PIN, visited: true };
const visitedIcon2201 = pinIconHtml(VISITED_PIN_2201, false);
const plainIcon2201 = pinIconHtml(SAMPLE_PIN, false);
const visitedLabel2201 = pinLabelHtml(VISITED_PIN_2201, false);
const plainLabel2201 = pinLabelHtml(SAMPLE_PIN, false);
const countOf2201 = (hay, needle) => String(hay || '').split(needle).length - 1;
const mapWebSource2201 = fs.readFileSync(path.join(process.cwd(), 'src/components/RealMapView.web.js'), 'utf8');
const canvasSource2201 = fs.readFileSync(path.join(process.cwd(), 'src/components/MapCanvas.js'), 'utf8');
const menuSource2201 = fs.readFileSync(path.join(process.cwd(), 'src/components/MenuDrawerModal.js'), 'utf8');
const appSource2201 = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
const profileSource2201 = fs.readFileSync(path.join(process.cwd(), 'src/screens/ProfileScreen.js'), 'utf8');
const cloudSyncSource2201 = fs.readFileSync(path.join(process.cwd(), 'src/services/cloudSync.js'), 'utf8');
/** 렌더된 HTML 에서 data-testid 요소의 글자만 */
const textOfTestId2201 = (html, id) => {
  const at = String(html || '').indexOf('data-testid="' + id + '"');
  if (at < 0) return '';
  const start = html.indexOf('>', at) + 1;
  const end = html.indexOf('</', start);
  return html.slice(start, end).replace(/<[^>]*>/g, '').trim();
};
const identityGuest2201 = profileIdentity(null);
const identitySigned2201 = profileIdentity({
  id: 'u-1',
  email: 'andy.lee@example.com',
  user_metadata: { full_name: '이상훈' },
});
const identityEmail2201 = profileIdentity({ id: 'u-2', email: 'andy.lee@example.com' });
const guestProfileHtml2201 = renderToString(
  <ProfileScreen
    pins={SEED_PINS}
    categories={['맛집', '카페', '가볼곳']}
    radiusMeters={300}
    onChangeRadius={noop}
    isPro={false}
    onStartPro={noop}
    onGoPaste={noop}
    onToast={noop}
    cloudConfigured
    cloudUser={null}
    cloudPinCount={0}
    onSignIn={noop}
    onSignUp={noop}
    onMagicLink={noop}
    onOAuth={noop}
    onSignOut={noop}
    onSyncNow={noop}
  />
);
const guestMenuHtml2201 = renderToString(
  <MenuDrawerModal visible pins={COL_PINS_219} onClose={noop} cloudConfigured cloudUser={null} />
);
const signedMenuHtml2201 = renderToString(
  <MenuDrawerModal
    visible
    pins={COL_PINS_219}
    onClose={noop}
    cloudConfigured
    cloudUser={{ id: 'u-1', email: 'andy.lee@example.com', user_metadata: { full_name: '이상훈' } }}
  />
);
const v2201Checks = [
  // ① ✅ 핀 위 초록 원형 체크 배지 제거 — 초록 글씨 라벨만
  ['v2.20.1 핀: 가봤어요 동그라미에 초록 체크 배지 없음',
    visitedIcon2201.indexOf('position:absolute;right:-4px') < 0 && visitedIcon2201.indexOf('>✓</div>') < 0,
    visitedIcon2201.length + ' bytes'],
  ['v2.20.1 핀: 가봤어요/안 가봤어요 동그라미 구조가 같음 (배지 몫 0)',
    countOf2201(visitedIcon2201, 'border-radius:50%') === countOf2201(plainIcon2201, 'border-radius:50%') &&
      countOf2201(visitedIcon2201, 'border-radius:50%') === 1,
    countOf2201(visitedIcon2201, 'border-radius:50%') + ' vs ' + countOf2201(plainIcon2201, 'border-radius:50%')],
  ['v2.20.1 핀: 라벨은 ✓ + 초록 글씨 그대로',
    visitedIcon2201.indexOf('✓ ') > 0 && visitedLabel2201.indexOf('color:' + colors.visitDark) > 0 &&
      plainLabel2201.indexOf(colors.visitDark) < 0,
    colors.visitDark],
  ['v2.20.1 핀: 라벨은 흰 알약 + 초록 테두리 유지',
    visitedLabel2201.indexOf('background:rgba(255,255,255,0.96)') > 0 &&
      visitedLabel2201.indexOf('border:1px solid rgba(22,163,74,0.7)') > 0,
    'rgba(22,163,74,0.7)'],
  ['v2.20.1 핀: 웹 지도 소스에 pinVisitedBadgeHtml 없음 (죽은 코드 0)',
    mapWebSource2201.indexOf('pinVisitedBadgeHtml') < 0],
  ['v2.20.1 핀: 네이티브 지도(MapCanvas) 초록 배지 제거 · 라벨 ✓ 유지',
    canvasSource2201.indexOf('visitBadge') < 0 && canvasSource2201.indexOf("(pin.visited === true ? '✓ ' : '')") > 0],
  // ② 로그아웃 = 게스트
  ['v2.20.1 프로필: 로그아웃이면 이름·핸들 없음',
    identityGuest2201.signedIn === false && identityGuest2201.name === '' && identityGuest2201.handle === '',
    identityGuest2201.displayName],
  ['v2.20.1 프로필: 게스트 표시 = `게스트` + 동기화 안내',
    GUEST_NAME === '게스트' && identityGuest2201.displayName === GUEST_NAME &&
      GUEST_HINT === '로그인하면 핀이 클라우드에 동기화돼요' && identityGuest2201.subline === GUEST_HINT],
  ['v2.20.1 프로필: 로그인하면 계정 이름·핸들',
    identitySigned2201.signedIn === true && identitySigned2201.name === '이상훈' &&
      identitySigned2201.handle === 'andy.lee' && identitySigned2201.initial === '이',
    identitySigned2201.name + ' / @' + identitySigned2201.handle],
  ['v2.20.1 프로필: 이름이 없으면 이메일 앞자리 (지어내지 않음)',
    identityEmail2201.name === 'andy.lee' && identityEmail2201.handle === 'andy.lee',
    identityEmail2201.name],
  ['v2.20.1 프로필: 로그아웃 상단 카드 = 게스트',
    textOfTestId2201(guestProfileHtml2201, 'profile-display-name') === '게스트' &&
      textOfTestId2201(guestProfileHtml2201, 'profile-display-sub') === GUEST_HINT,
    textOfTestId2201(guestProfileHtml2201, 'profile-display-name') + ' / ' + textOfTestId2201(guestProfileHtml2201, 'profile-display-sub')],
  ['v2.20.1 프로필: 로그아웃 카드에 이상훈·@odol 없음',
    guestProfileHtml2201.indexOf('@odol') < 0 && textOfTestId2201(guestProfileHtml2201, 'profile-display-name').indexOf('이상훈') < 0],
  ['v2.20.1 ☰ 메뉴: 로그아웃 시트도 게스트',
    textOfTestId2201(guestMenuHtml2201, 'profile-display-name') === '게스트' &&
      guestMenuHtml2201.indexOf('@odol') < 0,
    textOfTestId2201(guestMenuHtml2201, 'profile-display-name')],
  ['v2.20.1 ☰ 메뉴: 로그인 시트에는 실제 계정',
    textOfTestId2201(signedMenuHtml2201, 'profile-display-name') === '이상훈' &&
      textOfTestId2201(signedMenuHtml2201, 'profile-display-sub').indexOf('@andy.lee') >= 0,
    textOfTestId2201(signedMenuHtml2201, 'profile-display-name') + ' / ' + textOfTestId2201(signedMenuHtml2201, 'profile-display-sub')],
  // ③ Apple 로그인 켜짐 (v2.41.0 — Apple Developer·Supabase Provider 등록 후) — 카카오·구글은 그대로
  ['v2.20.1 소셜: 카카오·구글·Apple 모두 준비됨 (naver 는 없음)',
    oauthProviderReady('kakao') === true && oauthProviderReady('google') === true &&
      oauthProviderReady('apple') === true && oauthProviderReady('naver') === false,
    OAUTH_PROVIDERS_2201.map((p) => p.id + ':' + (p.pending === true ? '준비중' : 'ok')).join(' ')],
  ['v2.20.1 소셜: 안내 문구 그대로',
    OAUTH_PENDING_MESSAGE === 'Apple 로그인은 준비 중이에요. 구글이나 카카오 로그인을 이용해 주세요.',
    OAUTH_PENDING_MESSAGE],
  ['v2.20.1 소셜: 로그인 카드에 Apple 활성 버튼 · 카카오/구글 버튼 유지',
    guestProfileHtml2201.indexOf('social-apple') > 0 &&
      guestProfileHtml2201.indexOf('social-apple-pending') < 0 &&
      guestProfileHtml2201.indexOf('social-kakao') > 0 && guestProfileHtml2201.indexOf('social-google') > 0 &&
      guestProfileHtml2201.indexOf('준비 중') < 0],
  ['v2.20.1 소셜: cloudSync 가 Apple 을 Supabase 로 보낸다 (스위치 켜짐)',
    cloudSyncSource2201.indexOf('if (!oauthProviderReady(id)) return fail(\'provider-pending\', OAUTH_PENDING_MESSAGE);') > 0 &&
      // v2.41.0 — 스위치 켜짐: SHOW_APPLE_SIGNIN = true 면 apple.pending 이 붙지 않음
      cloudSyncSource2201.indexOf('const SHOW_APPLE_SIGNIN = true;') > 0 &&
      cloudSyncSource2201.indexOf('apple.pending = true') > 0,
  ],
  ['v2.20.1 소셜: App·ProfileScreen 모두 준비 중 가드 + 토스트',
    appSource2201.indexOf('!oauthProviderReady(provider)') > 0 &&
      // v2.40.0 — ProfileScreen 은 그릴 목록(providers)까지 넘겨 확인합니다
      (() => { const m = profileSource2201.match(/!oauthProviderReady\(provider[^)]*\)/); return !!m; })() &&
      profileSource2201.indexOf('toast(OAUTH_PENDING_MESSAGE)') > 0],
];
for (const [label, ok, extra] of v2201Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

const appSource2202 = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
const searchOverlaySource2202 = fs.readFileSync(
  path.join(process.cwd(), 'src/components/SearchOverlayModal.js'),
  'utf8'
);
const webMapSource2202 = fs.readFileSync(
  path.join(process.cwd(), 'src/components/RealMapView.web.js'),
  'utf8'
);
const clusterSource2202 = fs.readFileSync(path.join(process.cwd(), 'src/utils/cluster.js'), 'utf8');
const overlayHtml2202 = renderToString(
  <SearchOverlayModal
    visible
    pins={SEED_PINS}
    onClose={noop}
    onOpenPin={noop}
    onGoPasteSearch={noop}
    onLocate={noop}
  />
);

const v2202Checks = [
  // ① 가게명 찾기 — 사진이 없으면 큰 배너 자체를 그리지 않음
  [
    'v2.20.2 저장: 히어로 배너는 실제 사진이 있을 때만 (빈 이모지 타일 미노출)',
    pasteSource.indexOf('{!!heroThumbnail && (') > 0 &&
      pasteSource.indexOf('styles.heroTile') < 0 &&
      pasteSource.indexOf('heroEmoji') < 0,
  ],
  // ② 토스트 — 시트 헤더(분류 색) 아래로
  [
    'v2.20.2 토스트: 시트가 열려 있으면 헤더 아래(top 146px @ 844) 로 내려옴',
    toastTopBelowSheetHeader(844) === 146 && toastTopBelowSheetHeader(844) > Math.round(844 * (1 - SHEET_MAX_HEIGHT_RATIO)) + SHEET_HEADER_HEIGHT,
    String(toastTopBelowSheetHeader(844)),
  ],
  [
    'v2.20.2 토스트: 시트 헤더 아래 위치는 화면 높이에 따라 함께 내려감',
    toastTopBelowSheetHeader(932) - toastTopBelowSheetHeader(844) === Math.round(932 * 0.08) - Math.round(844 * 0.08) &&
      toastTopBelowSheetHeader(667) < toastTopBelowSheetHeader(844),
    [toastTopBelowSheetHeader(667), toastTopBelowSheetHeader(844), toastTopBelowSheetHeader(932)].join(' / '),
  ],
  [
    'v2.20.2 토스트: App 이 화면 높이(onLayout)로 topOffset 을 넘김 (예전 고정 440·top 152 아님)',
    appSource2202.indexOf('toastTopBelowSheetHeader') > 0 &&
      appSource2202.indexOf('setScreenHeight(e.nativeEvent.layout.height)') > 0 &&
      appSource2202.indexOf('bottomOffset={tab === \'map\' && selectedPinId ? 440') < 0,
  ],
  [
    'v2.20.2 토스트: 기본 상단값·시트 헤더 높이 상수가 문서화됨',
    TOAST_TOP === 152 && SHEET_HEADER_HEIGHT === 66 && SHEET_MAX_HEIGHT_RATIO === 0.92,
  ],
  [
    'v2.20.2 토스트: 렌더 결과 testID·문구 그대로',
    renderToString(<Toast message="지도에 핀을 꽂았어요" placement="top" topOffset={196} />).indexOf('지도에 핀을 꽂았어요') > 0,
  ],
  // ③ 돋보기 팝업 타이틀 = 내 장소 검색
  [
    'v2.20.2 돋보기: 팝업 헤더 타이틀 `내 장소 검색` (예전 `장소 검색` 아님)',
    searchOverlaySource2202.indexOf('title="내 장소 검색"') > 0 && searchOverlaySource2202.indexOf('title="장소 검색"') < 0,
  ],
  [
    'v2.20.2 돋보기: 그려진 팝업 헤더에 `내 장소 검색`',
    overlayHtml2202.indexOf('내 장소 검색') > 0 && overlayHtml2202.indexOf('돋보기') < 0,
  ],
  // ④ 클러스터링 임계값 46 → 22px
  [
    'v2.20.2 클러스터: 임계값 22px (20~24 사이)',
    CLUSTER_THRESHOLD_PX >= 20 && CLUSTER_THRESHOLD_PX <= 24,
    String(CLUSTER_THRESHOLD_PX),
  ],
  [
    'v2.20.2 클러스터: 웹 지도 두 엔진 모두 이 값을 그대로 씀',
    webMapSource2202.indexOf('threshold: threshold || CLUSTER_THRESHOLD_PX') > 0 &&
      clusterSource2202.indexOf('export const CLUSTER_THRESHOLD_PX = 22;') > 0,
  ],
  // ⑤ 버전
  [
    'v2.21.0 버전: 메뉴 · 앱 정보 · package · app.json',
    APP_VERSION_LABEL === '릴스핀 v2.40.0' && APP_INFO_VERSION === '릴스핀 v2.40.0' && pkg.version === '2.40.0' && expoConfig.version === '2.40.0',
  ],
];
for (const [label, ok, extra] of v2202Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

// ── v2.21 — 🛡️ 어드민 · 알림 모음 헤더 이모지 제거 · 링크 입력 ✕ ──────────
const alertInboxSource221 = fs.readFileSync(path.join(process.cwd(), 'src/components/AlertInbox.js'), 'utf8');
const pasteSource221 = fs.readFileSync(path.join(process.cwd(), 'src/screens/PasteScreen.js'), 'utf8');
const adminScreenSource221 = fs.readFileSync(path.join(process.cwd(), 'src/screens/AdminScreen.js'), 'utf8');
const appSource221 = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
const profileSource221 = fs.readFileSync(path.join(process.cwd(), 'src/screens/ProfileScreen.js'), 'utf8');

const inboxOpen221 = renderToString(<AlertInbox visible pins={ALERT_PINS} myCoords={ALERT_ORIGIN} radiusMeters={500} onClose={noop} />);
const adminPreviewHtml = renderToString(<AdminScreen preview />);
const profileAdminHtml = renderToString(
  <ProfileScreen panel pins={[]} categories={[]} cloudUser={{ id: 'u1', email: 'andy.leesh33@gmail.com' }} name="이상훈" handle="odol" isAdminAccount onGoAdmin={noop} />
);
const profileGuestHtml221 = renderToString(
  <ProfileScreen panel pins={[]} categories={[]} cloudUser={{ id: 'u2', email: 'someone@else.com' }} name="다른사람" handle="other" isAdminAccount={false} onGoAdmin={noop} />
);

const v221Checks = [
  // ① 알림 모음 헤더 — 종 이모지 제거, 텍스트만
  ['v2.21 알림 모음: 헤더에 🔔 없음', alertInboxSource221.indexOf('title="🔔 알림 모음"') < 0 && alertInboxSource221.indexOf('title="알림 모음"') > 0],
  ['v2.21 알림 모음: 그려진 헤더도 🔔 없이 `알림 모음`', inboxOpen221.indexOf('알림 모음') > 0 && inboxOpen221.indexOf('🔔') < 0, inboxOpen221.slice(0, 80)],
  // ② 릴스·쇼츠 링크 입력 — ✕ 한 번에 지우기
  ['v2.21 저장 화면: 링크 입력 ✕ 지우기 버튼', pasteSource221.indexOf('testID="url-clear"') > 0 && /setUrl\(''\)/.test(pasteSource221)],
  ['v2.21 저장 화면: 입력이 있을 때만 ✕', /\{url \? \(/.test(pasteSource221)],
  ['v2.21 저장 화면: 가게명 입력에도 ✕ 유지', pasteSource221.indexOf('검색어 지우기') > 0],
  // ③ 어드민 — /admin 경로 · 진입점 · 화면
  ['v2.21 어드민: `/admin` 경로면 어드민 화면', appSource221.indexOf('<AdminScreen preview={adminPreview} />') > 0 && appSource221.indexOf('ADMIN_PATH_PATTERN') > 0],
  ['v2.21 어드민: ☰ 메뉴 진입점은 관리자 계정에만', profileSource221.indexOf('profile-row-admin') > 0 && profileSource221.indexOf('isAdminAccount && typeof onGoAdmin') > 0],
  ['v2.21 어드민: 관리자 계정이면 어드민 행 렌더', profileAdminHtml.indexOf('어드민') > 0 && profileAdminHtml.indexOf('회원 · 장소(핀) 관리') > 0],
  ['v2.21 어드민: 일반 계정에는 어드민 행 없음', profileGuestHtml221.indexOf('profile-row-admin') < 0],
  ['v2.21 어드민: 미리보기 화면에 3탭 + 요약', adminPreviewHtml.indexOf('릴스핀 어드민') > 0 && adminPreviewHtml.indexOf('회원 관리') > 0 && adminPreviewHtml.indexOf('장소 관리') > 0, adminPreviewHtml.slice(0, 120)],
  ['v2.21 어드민: 인기 장소 TOP 10 목록', adminPreviewHtml.indexOf('인기 장소 TOP 10') > 0 && adminPreviewHtml.indexOf('베통 성수') > 0],
  ['v2.21 어드민: 서버 API 경로만 사용(키 없음)', adminScreenSource221.indexOf("'/api/admin'") > 0 && adminScreenSource221.indexOf('SUPABASE_SERVICE') < 0],
  ['v2.21 어드민: 삭제 확인 모달 · 플랜 변경 버튼', adminScreenSource221.indexOf('되돌릴 수 없어요') > 0 && adminScreenSource221.indexOf('프로로') > 0],
  // v2.41 — 📊 접속자 통계 (오늘 · 전체 · 일별 막대 그래프 · 14/30일)
  ['v2.41 어드민: 미리보기에 접속자 절', adminPreviewHtml.indexOf('>접속자<') > 0 || adminPreviewHtml.indexOf('접속자') > 0],
  ['v2.41 어드민: 오늘·전체 접속자 카드', adminPreviewHtml.indexOf('오늘 접속자') > 0 && adminPreviewHtml.indexOf('전체 접속자') > 0],
  ['v2.41 어드민: 일별 추이 막대 그래프 렌더', adminPreviewHtml.indexOf('data-testid="visit-chart"') > 0 && adminPreviewHtml.indexOf('순 방문자') > 0],
  ['v2.41 어드민: 14일·30일 전환 버튼', adminPreviewHtml.indexOf('14일') > 0 && adminPreviewHtml.indexOf('30일') > 0],
  ['v2.41 어드민: 방문 통계는 서버 API 로만', adminScreenSource221.indexOf("view: 'visits'") > 0],
];
for (const [label, ok, extra] of v221Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

// ── v2.23 — 💬 제안 · 버그 제보 게시판 · 어드민 제보 탭 ──────────────────
const feedbackModalSource223 = fs.readFileSync(path.join(process.cwd(), 'src/components/FeedbackBoardModal.js'), 'utf8');
const feedbackServiceSource223 = fs.readFileSync(path.join(process.cwd(), 'src/services/feedback.js'), 'utf8');
const feedbackSql223 = fs.readFileSync(path.join(process.cwd(), 'supabase/feedback.sql'), 'utf8');
const feedbackModalHtml223 = renderToString(
  <FeedbackBoardModal visible name="이상훈" userEmail="andy.leesh33@gmail.com" onClose={noop} onToast={noop} />
);

const v223Checks = [
  // ① 내 정보 → 제안 · 버그 제보
  ['v2.23 내 정보: 설정 목록에 제보 행(앱 정보 다음 → v2.40.0 부터는 제보가 법적 고지·앱 정보 위)', profileSource221.indexOf('profile-row-feedback') > 0 && profileSource221.indexOf('profile-row-feedback') < profileSource221.indexOf('profile-row-about')],
  ['v2.23 내 정보: 그려진 설정 목록에 제보 행', profileAdminHtml.indexOf('profile-row-feedback') > 0 && profileAdminHtml.indexOf('기능 아이디어 · 버그 신고') > 0, profileAdminHtml.slice(0, 80)],
  ['v2.23 ☰ 시트: 게시판 열기를 넘김', fs.readFileSync(path.join(process.cwd(), 'src/components/MenuDrawerModal.js'), 'utf8').indexOf('onOpenFeedback={onOpenFeedback}') > 0],
  ['v2.23 App: 게시판 모달을 그리고 로그인 정보를 넘김', appSource221.indexOf('<FeedbackBoardModal') > 0 && appSource221.indexOf('userEmail={cloudUser && cloudUser.email ? cloudUser.email : \'\'}') > 0],
  // ② 게시판 모달 — 2탭 · 정렬 · 글쓰기 · 상태 배지 · 공감
  ['v2.23 게시판: 제목은 `제안 · 버그 제보` (헤더 부텍스트 없음)', feedbackModalHtml223.indexOf('제안 · 버그 제보') > 0 && feedbackModalHtml223.indexOf('기능 아이디어 · 버그 신고') < 0, feedbackModalHtml223.slice(0, 120)],
  ['v2.23 게시판: 💡 기능 제안 · 🐛 버그 제보 2탭', feedbackModalHtml223.indexOf('기능 제안') > 0 && feedbackModalHtml223.indexOf('버그 제보') > 0 && feedbackModalHtml223.indexOf('💡') > 0 && feedbackModalHtml223.indexOf('🐛') > 0],
  ['v2.23 게시판: 최신순 · 공감순 · ✍ 글쓰기', feedbackModalHtml223.indexOf('최신순') > 0 && feedbackModalHtml223.indexOf('공감순') > 0 && feedbackModalHtml223.indexOf('글쓰기') > 0],
  ['v2.23 게시판: 빈 게시판 안내(첫 글 남기기)', feedbackModalHtml223.indexOf('feedback-empty') > 0 && feedbackModalHtml223.indexOf('첫 글 남기기') > 0],
  ['v2.23 게시판: LayerSheet 틀(다른 레이어 팝업과 동일)', feedbackModalSource223.indexOf("from './LayerSheet'") > 0 && feedbackModalSource223.indexOf('icon="chatbubble-ellipses"') > 0],
  ['v2.23 게시판: 상태 배지 접수됨·반영됨·수정됨', ['접수됨', '반영됨', '수정됨'].every((t) => feedbackServiceSource223.indexOf(t) >= 0)],
  ['v2.23 게시판: 글쓰기 폼(제목·내용·닉네임)과 30초 쿨다운', feedbackModalSource223.indexOf('feedback-title-input') > 0 && feedbackModalSource223.indexOf('feedback-content-input') > 0 && feedbackModalSource223.indexOf('feedback-author-input') > 0 && feedbackServiceSource223.indexOf('FEEDBACK_COOLDOWN_MS = 30 * 1000') > 0],
  ['v2.23 게시판: 앱 버전 자동 첨부 · 공감 RPC', feedbackServiceSource223.indexOf("app_version: appVersion") > 0 && feedbackServiceSource223.indexOf("'increment_reelpin_feedback_like'") >= 0],
  // ③ 어드민 4번째 탭
  ['v2.23 어드민: 미리보기에 제보 탭 + 모의 제보', adminPreviewHtml.indexOf('제보') > 0 && adminScreenSource221.indexOf('feedback: [') > 0 && adminScreenSource221.indexOf("id: 'f-1'") > 0, adminPreviewHtml.slice(0, 120)],
  ['v2.23 어드민: 제보 상태 변경·삭제', adminScreenSource221.indexOf('admin-feedback-status-') > 0 && adminScreenSource221.indexOf('제보를 삭제할까요?') > 0],
  // ④ DB
  ['v2.23 DB: feedback.sql — 테이블·RLS·공감·어드민 RPC', feedbackSql223.indexOf('create table if not exists public.reelpin_feedback') > 0 && feedbackSql223.indexOf('increment_reelpin_feedback_like') > 0 && feedbackSql223.indexOf('reelpin_admin_feedback') > 0],
  // ⑤ 버전
  ['v2.23 버전: 메뉴 · 앱 정보 · package · app.json · 제보 첨부값', APP_VERSION_LABEL === '릴스핀 v2.40.0' && APP_INFO_VERSION === '릴스핀 v2.40.0' && pkg.version === '2.40.0' && expoConfig.version === '2.40.0' && FEEDBACK_APP_VERSION === '2.40.0'],
];
for (const [label, ok, extra] of v223Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

// ── v2.24 — 📋 목록 보기: 닫아도 보던 지도 그대로 · 시트 안 `지도 보기` 버튼 제거 ─────────
const mapSource224 = fs.readFileSync(path.join(process.cwd(), 'src/screens/MapScreen.js'), 'utf8');
const listSource224 = fs.readFileSync(path.join(process.cwd(), 'src/components/PinListView.js'), 'utf8');
const listHtml224 = renderToString(
  <PinListView
    pins={SEED_PINS}
    categories={['맛집', '카페', '가볼곳', '아이랑']}
    filter="전체"
    myCoords={{ lat: 37.5828, lng: 126.7141 }}
    onSelectPin={noop}
    onOpenPin={noop}
  />
);
const toggleViewBody224 = (mapSource224.match(/const toggleView = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/) || [''])[0];
const openPinFromListBody224 = (mapSource224.match(/const openPinFromList = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/) || [''])[0];
const v224Checks = [
  // ① 목록 시트 안 `지도 보기` 버튼은 없어졌습니다(헤더 ✕ · 바깥 탭으로 바로 지도).
  ['v2.24 목록: `지도 보기` 버튼이 그려지지 않음', listHtml224.indexOf('지도 보기') < 0 && listHtml224.indexOf('view-toggle-list') < 0, listHtml224.slice(0, 120)],
  ['v2.24 목록: 소스에서도 버튼·onToggleView 제거', listSource224.indexOf('지도 보기로 전환') < 0 && listSource224.indexOf('view-toggle-list') < 0 && listSource224.indexOf('onToggleView') < 0 && listSource224.indexOf('mapBtn') < 0],
  ['v2.24 목록: 요약 줄(몇 곳 · 가까운 순)은 그대로', listHtml224.indexOf('곳 · 가까운 순') > 0 && listHtml224.indexOf('pin-list-meta') > 0],
  // ② 목록을 닫아도 지도 중심·줌을 다시 맞추지 않습니다(전국 리셋 방지).
  ['v2.24 지도: toggleView 는 화면만 되돌림(setFit·setFocus 없음)', toggleViewBody224.indexOf("setView('map')") > 0 && toggleViewBody224.indexOf('setFit(') < 0 && toggleViewBody224.indexOf('setFocus(') < 0 && toggleViewBody224.indexOf('mapCoordsOf') < 0, toggleViewBody224.slice(0, 160)],
  ['v2.24 지도: 목록 닫기 콜백은 그대로 toggleView', /<LayerSheet\s+visible\s+onClose={toggleView}/.test(mapSource224) && mapSource224.indexOf('closeLabel="목록 닫기"') > 0],
  ['v2.24 지도: 목록 뒤에서도 지도는 계속 살아 있음(mapArea 안 RealMapView · view 조건 밖)', /<View style={styles\.mapArea}>[\s\S]{0,80}?<RealMapView/.test(mapSource224) && mapSource224.indexOf('{view === \'map\' && (') > 0],
  // ③ 목록에서 장소를 눌러 이동하는 경우만 그 핀으로.
  ['v2.24 목록→지도: 행을 누르면 그 핀으로 이동(openPinFromList)', openPinFromListBody224.indexOf('setFocus(') > 0 && openPinFromListBody224.indexOf("setView('map')") > 0, openPinFromListBody224.slice(0, 160)],
  ['v2.24 목록→지도: 행 탭이 openPinFromList 에 연결됨', mapSource224.indexOf('onOpenPin={openPinFromList}') > 0 && listSource224.indexOf('onOpenPin') > 0],
];
for (const [label, ok, extra] of v224Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

// ── v2.25 — 📍 장소 상세 `지도에서 보기` 버튼 (인앱 지도로 이동) ─────────────────
const mapSource225 = fs.readFileSync(path.join(process.cwd(), 'src/screens/MapScreen.js'), 'utf8');
const detailSource225 = fs.readFileSync(path.join(process.cwd(), 'src/components/PinDetailSheet.js'), 'utf8');
const appSource225 = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
const detailHtml225 = renderToString(
  <PinDetailSheet
    pin={SEARCH_PIN}
    radiusMeters={300}
    onClose={noop}
    onDelete={noop}
    onToast={noop}
    onChangeMemo={noop}
    onShowOnMap={noop}
  />
);
const detailReadOnlyHtml225 = renderToString(
  <PinDetailSheet pin={SHARED_PINS[0]} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} onShowOnMap={noop} readOnly />
);
const showPinOnMapBody225 = (mapSource225.match(/const showPinOnMap = useCallback\([\s\S]*?\n  \);/) || [''])[0];
const dismissOverlaysBody225 = (appSource225.match(/const dismissOverlaysForMap = useCallback\([\s\S]*?\n  \}, \[\]\);/) || [''])[0];
const v225Checks = [
  // ① 상세 시트 안 `🗺️ 지도에서 보기` 버튼 (내 핀·공유받은 핀 모두)
  ['v2.25 상세: `지도에서 보기` 버튼이 그려짐', detailHtml225.indexOf('pin-show-on-map') > 0 && detailHtml225.indexOf('지도에서 보기') > 0 && detailHtml225.indexOf('🗺️') > 0, detailHtml225.slice(0, 80)],
  ['v2.25 상세: 공유받은 핀(읽기 전용)에도 같은 버튼', detailReadOnlyHtml225.indexOf('pin-show-on-map') > 0 && detailReadOnlyHtml225.indexOf('지도에서 보기') > 0],
  // v2.31.0 — 외부 지도([카카오]·[네이버]) 링크가 시트 맨 위로 올라갔으므로,
  //   '지도에서 보기' 는 `매장 정보 보기` 다음 · `핀 삭제` 앞(= 본문 주 동작 자리)인지만 봅니다.
  ['v2.25 상세: 매장 정보 보기 다음 · 핀 삭제 앞(본문 주 동작 자리)', detailHtml225.indexOf('매장 정보 보기') < detailHtml225.indexOf('pin-show-on-map') && detailHtml225.indexOf('pin-show-on-map') < detailHtml225.indexOf('핀 삭제')],
  ['v2.25 상세: 누르면 onShowOnMap(pin) · 메모는 먼저 저장', detailSource225.indexOf('onShowOnMap') > 0 && detailSource225.indexOf('onShowOnMap(pin)') > 0 && /if \(memoDirty[\s\S]{0,120}onChangeMemo\(pin\.id, memoDraft\)/.test(detailSource225)],
  ['v2.25 상세: 버튼 스타일·접근성 이름', detailSource225.indexOf('showOnMapBtn') > 0 && detailSource225.indexOf('accessibilityLabel="지도에서 보기"') > 0 && detailSource225.indexOf('backgroundColor: colors.charcoal') > 0],
  // ② 지도 화면 — 레이어 닫기 · 지도 탭 전환 · 그 핀으로 중심·줌
  ['v2.25 지도: 시트에 onShowOnMap={showPinOnMap} 연결', mapSource225.indexOf('onShowOnMap={showPinOnMap}') > 0],
  ['v2.25 지도: 앞선 레이어를 닫고 지도·목록 상태를 되돌림', showPinOnMapBody225.indexOf('onDismissOverlays') > 0 && showPinOnMapBody225.indexOf("setView('map')") > 0 && showPinOnMapBody225.indexOf('setNearbyOpen(false)') > 0, showPinOnMapBody225.slice(0, 160)],
  ['v2.25 지도: 그 핀 좌표로 focus·줌(setFocus·setFocusKey)', showPinOnMapBody225.indexOf('pinMapCoords(target)') > 0 && showPinOnMapBody225.indexOf('setFocus(') > 0 && showPinOnMapBody225.indexOf('setFocusKey(') > 0],
  ['v2.25 지도: 상세 시트를 닫고 결과를 알림(onSelectPin(null) · 토스트)', showPinOnMapBody225.indexOf('onSelectPin(null)') > 0 && showPinOnMapBody225.indexOf('showToast(') > 0],
  ['v2.25 지도: 필터에 가려진 핀이면 그 핀만 지도에 함께(revealPinId)', mapSource225.indexOf('revealPinId') > 0 && /const mapPins = useMemo\(\(\) => \{[\s\S]{0,260}revealPin/.test(mapSource225) && showPinOnMapBody225.indexOf('setRevealPinId(target.id)') > 0],
  // ③ App — 검색·알림·메뉴·제보 레이어를 모두 닫고 지도 탭으로
  ['v2.25 App: 레이어 닫기 콜백이 세 레이어를 모두 닫음', ['setAlertOpen(false)', 'setMenuOpen(false)', 'setFeedbackOpen(false)', "setTab('map')"].every((t) => dismissOverlaysBody225.indexOf(t) > 0), dismissOverlaysBody225.slice(0, 160)],
  ['v2.25 App: 지도 화면에 onDismissOverlays 를 넘김', appSource225.indexOf('onDismissOverlays={dismissOverlaysForMap}') > 0],
  // ④ 버전
  ['v2.25 버전: 메뉴 · 앱 정보 · package · app.json · 제보 첨부값', APP_VERSION_LABEL === '릴스핀 v2.40.0' && APP_INFO_VERSION === '릴스핀 v2.40.0' && pkg.version === '2.40.0' && expoConfig.version === '2.40.0' && FEEDBACK_APP_VERSION === '2.40.0'],
];
for (const [label, ok, extra] of v225Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

// ── v2.28.0 상세 시트·레이어가 열리면 하단 탭바를 숨김 + 반경 500m 3초 토스트 ──
// 상훈 님 요청(2026-11-18): "상세 시트가 열리면 하단 탭바가 바닥 버튼을 가려요. 숨겨 줘."
// 결정(2026-11-18): "반경 500m 알림은 큰 배너 대신 3초짜리 한 줄 토스트 + 헤더 🔔 뱃지만."
const appSource228 = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
const mapSource228 = fs.readFileSync(path.join(process.cwd(), 'src/screens/MapScreen.js'), 'utf8');
const collectionsSource228 = fs.readFileSync(path.join(process.cwd(), 'src/screens/CollectionsScreen.js'), 'utf8');
const pinSheetSource228 = fs.readFileSync(path.join(process.cwd(), 'src/components/PinDetailSheet.js'), 'utf8');
const v228Checks = [
  // ① 숨김 규칙 (순수 함수)
  ['v2.28 탭바: 레이어가 없으면 보입니다', tabBarVisibility({}).visible === true && tabBarVisibility({ tab: 'map' }).hiddenBy === ''],
  ['v2.28 탭바: 장소 상세 시트가 열리면 숨김', tabBarVisibility({ tab: 'map', pinDetail: true }).visible === false && tabBarHiddenReason({ tab: 'map', pinDetail: true }) === '장소 상세 시트'],
  ['v2.28 탭바: 지도 탭이 아니면 남은 selectedPinId 로 숨기지 않음', tabBarVisibility({ tab: 'collections', pinDetail: true }).visible === true && tabBarVisibility({ tab: 'paste', listSheet: true }).visible === true],
  ['v2.28 탭바: 목록·새 컬렉션·검색·알림·메뉴·제보 레이어도 숨김',
    ['listSheet', 'collection', 'search', 'alerts', 'menu', 'feedback'].every((k) => tabBarVisibility({ tab: 'map', [k]: true }).visible === false)],
  // ② App 배선 — 한 곳에서 판단하고 조건부로 그립니다
  ['v2.28 App: 판단 규칙 모듈을 씀', appSource228.indexOf("from './src/utils/tabBarVisibility'") > 0 && appSource228.indexOf('tabBarVisibility({') > 0],
  ['v2.28 App: 탭바는 조건부 렌더(숨김이면 DOM 에 없음)', appSource228.indexOf('{tabBarState.visible ? <TabBar active={tab} onChange={setTab}') > 0],
  ['v2.28 App: 모든 레이어 상태를 규칙에 넘김 (v2.35.0: 검색 레이어 제거)',
    /tabBarVisibility\(\{[\s\S]{0,420}?pinDetail: Boolean\(selectedPinId\)[\s\S]{0,420}?alerts: alertOpen[\s\S]{0,240}?feedback: feedbackOpen/.test(appSource228) && appSource228.indexOf('search: searchOpen') < 0],
  ['v2.28 App: 지도·컬렉션이 바닥 레이어를 위로 알림', appSource228.indexOf('onListSheetChange={setMapListSheet}') > 0 && appSource228.indexOf('onCreateSheetChange={setCollectionSheet}') > 0],
  ['v2.28 지도: 목록 보기 상태를 위로 전달', /onListSheetChange\(view === 'list'\)/.test(mapSource228)],
  ['v2.28 컬렉션: 새 컬렉션 시트 상태를 위로 전달', /onCreateSheetChange\(creating\)/.test(collectionsSource228)],
  // ③ 상세 시트 본문 끝 여백 — 탭바가 숨는 만큼만 남깁니다
  ['v2.28 핀 시트: 본문 끝 여백이 탭바 높이에 묶여 있지 않음', !/paddingBottom: tabBar\.floatTop/.test(pinSheetSource228) && /paddingBottom: 24/.test(pinSheetSource228)],
  // ④ 반경 500m 알림 = 상단 한 줄 토스트(지도 버튼과 안 겹침)
  ['v2.28 지도: 토스트는 상단 칩 줄 아래 한 줄 자리', mapSource228.indexOf('geofenceToastWrap') > 0 && mapSource228.indexOf('<GeofenceToast') > 0],
  ['v2.28 지도: [내 위치]를 눌러도 주변 500m 패널을 저절로 열지 않음(지도를 가리지 않게)', !/if \(near\.length\) \{\s*setNearbyOpen\(true\)/.test(mapSource228)],
];
for (const [label, ok, extra] of v228Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

// ── v2.31.0 상세 시트: 상단 [카카오]·[네이버] 배지가 곧 외부 지도 링크 / 하단 보조 칩 삭제 ──
// 상훈 님 요청(2026-11-18): "상단의 카카오·네이버 배지를 누르면 각 지도로 열리게 하고, 하단 칩은 없애 줘."
const pinSheetSource230 = fs.readFileSync(path.join(process.cwd(), 'src/components/PinDetailSheet.js'), 'utf8');
const detailHtml230 = stripSpaces(
  renderToString(<PinDetailSheet pin={SEARCH_PIN} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} onShowOnMap={noop} />)
);
const mapBadgeStyle230 = (pinSheetSource230.match(/mapBadge: \{[\s\S]*?\n  \},/) || [''])[0];
const mapBadgeTextStyle230 = (pinSheetSource230.match(/mapBadgeText: \{[\s\S]*?\n  \},/) || [''])[0];
// 영업시간이 아예 없는 핀 · 출처(provider)가 없는 핀 — 둘 다 상단 배지가 보여야 합니다
const noHoursPin230 = (() => {
  const p = { ...SEARCH_PIN };
  delete p.hours;
  delete p.openingHours;
  return p;
})();
const noHoursHtml230 = stripSpaces(
  renderToString(<PinDetailSheet pin={noHoursPin230} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} onShowOnMap={noop} />)
);
const noProviderPin230 = { id: 'p-photo', name: '사진에서 저장한 집', platform: 'photo', lat: 37.58, lng: 126.71, category: '맛집' };
const noProviderHtml230 = stripSpaces(
  renderToString(<PinDetailSheet pin={noProviderPin230} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} onShowOnMap={noop} />)
);
const v230Checks = [
  ['v2.30 상단 배지: [카카오] · [네이버] 가 상단 메타 영역에 있고 누를 수 있음',
    detailHtml230.indexOf('pin-map-badges') > 0 && detailHtml230.indexOf('pin-open-kakao') > 0 && detailHtml230.indexOf('pin-open-naver') > 0],
  ['v2.30 상단 배지: 배지 글자는 그대로 카카오 · 네이버 (9px 작은 배지)',
    detailHtml230.indexOf('>카카오<') > 0 && detailHtml230.indexOf('>네이버<') > 0 && /fontSize: 9/.test(mapBadgeTextStyle230) && /fontWeight: '800'/.test(mapBadgeTextStyle230), mapBadgeTextStyle230.slice(0, 80)],
  ['v2.30 상단 배지: 브랜드 색 바탕 + 작은 여백(3px · 5 라운드) 으로 콤팩트',
    pinSheetSource230.indexOf('backgroundColor: colors.kakao') > 0 && pinSheetSource230.indexOf('backgroundColor: colors.naver') > 0 && /paddingVertical: 3/.test(mapBadgeStyle230) && /borderRadius: 5/.test(mapBadgeStyle230) && /paddingHorizontal: 6/.test(mapBadgeStyle230), mapBadgeStyle230.slice(0, 120)],
  ['v2.30 상단 배지: 바깥으로 나감을 알리는 open-outline 아이콘',
    (pinSheetSource230.match(/name="open-outline" size=\{9\}/g) || []).length >= 2],
  ['v2.30 상단 배지: 누르면 카카오→카카오맵 · 네이버→네이버지도(openMap)',
    pinSheetSource230.indexOf("handleMap('kakao')") > 0 && pinSheetSource230.indexOf("handleMap('naver')") > 0 && pinSheetSource230.indexOf('openMap(pin, provider)') > 0],
  ['v2.30 상단 배지: 읽어 주는 이름은 그대로(카카오맵 열기 · 네이버지도 열기)',
    detailHtml230.indexOf('aria-label="카카오맵열기"') > 0 && detailHtml230.indexOf('aria-label="네이버지도열기"') > 0],
  ['v2.30 하단 칩: exitRow·exitChip·exitDot 이 소스에서 완전히 사라짐',
    pinSheetSource230.indexOf('exitRow') < 0 && pinSheetSource230.indexOf('exitChip') < 0 && pinSheetSource230.indexOf('exitDot') < 0],
  ['v2.30 하단 칩: 본문에 네이버지도 · 카카오맵 칩 글자가 없음',
    detailHtml230.indexOf('>네이버지도<') < 0 && detailHtml230.indexOf('>카카오맵<') < 0],
  ['v2.30 순서: 상단 배지 → 가봤어요 → 지도에서 보기 → 핀 삭제 (바닥은 둘뿐)',
    detailHtml230.indexOf('pin-open-kakao') < detailHtml230.indexOf('pin-visited-toggle') &&
    detailHtml230.indexOf('pin-visited-toggle') < detailHtml230.indexOf('pin-show-on-map') &&
    detailHtml230.indexOf('pin-show-on-map') < detailHtml230.indexOf('핀삭제')],
  ['v2.30 영업시간 미확인 매장에서도 상단 배지는 그대로 보임',
    noHoursHtml230.indexOf('영업시간미확인') > 0 && noHoursHtml230.indexOf('pin-open-kakao') > 0 && noHoursHtml230.indexOf('pin-open-naver') > 0],
  ['v2.30 출처(providers)가 없는 핀에서도 상단 배지는 그대로 보임',
    noProviderHtml230.indexOf('pin-open-kakao') > 0 && noProviderHtml230.indexOf('pin-open-naver') > 0],
  ['v2.30 카카오·네이버 외 출처(구글·오프라인)는 뒤에 작은 회색 배지로 덧붙임',
    pinSheetSource230.indexOf('otherProviders.length > 0 && <ProviderBadges providers={otherProviders}') > 0 &&
    pinSheetSource230.indexOf(".filter((id) => id !== 'kakao' && id !== 'naver')") > 0],
  ['v2.30 주 동작: 지도에서 보기는 그대로 진한 다크 차콜 버튼', /showOnMapBtn: \{[\s\S]{0,220}?backgroundColor: colors\.charcoal/.test(pinSheetSource230) && pinSheetSource230.indexOf('height: 44') > 0],
];
for (const [label, ok, extra] of v230Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

// ── v2.31 기획전·공유 링크·배너 — 컬렉션 탭 상단 · /admin 📌 기획전·배너 탭 ──
// 상훈 님 요청(2026-11-18): "컬렉션을 자랑(공유)하고, 운영자는 기획전·배너를 올려서 관리"
const appSource231 = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
const collectionsSource231 = fs.readFileSync(path.join(process.cwd(), 'src/screens/CollectionsScreen.js'), 'utf8');
const adminSource231 = fs.readFileSync(path.join(process.cwd(), 'src/screens/AdminScreen.js'), 'utf8');
const adminApiSource231 = fs.readFileSync(path.join(process.cwd(), 'api/admin.js'), 'utf8');
const curationSqlSource231 = fs.readFileSync(path.join(process.cwd(), 'supabase/curation.sql'), 'utf8');
const previewSheetSource231 = fs.readFileSync(path.join(process.cwd(), 'src/components/CollectionPreviewSheet.js'), 'utf8');

const BANNERS_231 = [
  { id: 'bn-1', title: '이번 주 릴스핀 인기 맛집', subtitle: '릴스에서 본 그 가게, 지금 담아 두세요', badge: '기획전', linkUrl: '', sortOrder: 0 },
  { id: 'bn-2', title: '연말 모임 장소', subtitle: '스폰서 · ○○예약', badge: '스폰서', linkUrl: 'https://example.com', sortOrder: 1 },
];
const CURATED_231 = [
  {
    id: 'cu-1',
    title: '영등포 직장인 점심 코스',
    description: '회사 근처에서 12시에 바로 갈 수 있는 곳',
    sponsor: '운영자 추천',
    badge: '기획전',
    emoji: '🍜',
    color: '#0D9488',
    places: [
      { name: '검단 이니야', category: '맛집', area: '당하동', address: '인천 서구', lat: 37.58, lng: 126.71 },
      { name: '좌표 없는 곳', category: '맛집', area: '어딘가', address: '', lat: null, lng: null },
    ],
  },
];
const collectionsWithCurationHtml231 = stripSpaces(
  renderToString(
    <CollectionsScreen
      pins={COL_PINS_219}
      collections={COL_219}
      banners={BANNERS_231}
      curated={CURATED_231}
      /* v2.32.1 — 기본은 숨김(`SHOW_CURATED_FEED = false`). 아래 검사들은 숨김 전 구조가
         그대로 남아 있는지(다시 켜면 돌아오는지)를 보기 위해 통로를 열어 렌더합니다. */
      showCuratedFeed
      onToast={noop}
      onImportCurated={noop}
    />
  )
);
const collectionsNoCurationHtml231 = stripSpaces(
  renderToString(<CollectionsScreen pins={COL_PINS_219} collections={COL_219} onToast={noop} />)
);
const previewSheetHtml231 = stripSpaces(
  renderToString(
    <CollectionPreviewSheet
      visible
      item={{
        id: 'cu-1',
        title: '영등포 직장인 점심 코스',
        description: '회사 근처에서 12시',
        badge: '기획전',
        sponsor: '운영자 추천',
        emoji: '🍜',
        color: '#0D9488',
        places: CURATED_231[0].places,
      }}
      onClose={noop}
      onImport={noop}
      testID="curated-preview"
    />
  )
);
const adminPreviewHtml231 = stripSpaces(renderToString(<AdminScreen preview />));

const v231Checks = [
  // ① 컬렉션 탭 — 배너 슬롯
  ['v2.31 컬렉션: 맨 위에 배너 슬롯(제목·부제·배지)',
    collectionsWithCurationHtml231.indexOf('collections-banners') > 0 &&
      collectionsWithCurationHtml231.indexOf('이번주릴스핀인기맛집') > 0 &&
      collectionsWithCurationHtml231.indexOf('릴스에서본그가게,지금담아두세요') > 0 &&
      collectionsWithCurationHtml231.indexOf('스폰서') > 0],
  ['v2.31 컬렉션: 켜 둔 배너가 없으면 배너 영역을 그리지 않음',
    collectionsNoCurationHtml231.indexOf('collections-banners') < 0],
  ['v2.31 컬렉션: 배너 링크는 http(s)만 열기',
    collectionsSource231.indexOf('openBannerLink') > 0 && collectionsSource231.indexOf('^https?:\\/\\/') > 0],
  // ② 운영자 추천 · 기획전 (장소 수 · 배지 · 담기)
  ['v2.31 컬렉션: 운영자 추천 · 기획전 섹션',
    collectionsWithCurationHtml231.indexOf('collections-curated') > 0 &&
      collectionsWithCurationHtml231.indexOf('운영자추천·기획전') > 0 &&
      collectionsWithCurationHtml231.indexOf('영등포직장인점심코스') > 0 &&
      collectionsWithCurationHtml231.indexOf('운영자추천') > 0],
  ['v2.31 컬렉션: 카드마다 장소 수 한 줄(`2곳 · 검단이니야 외`) · v2.32 부터 카드를 누르면 미리보기(담기 버튼 없음)',
    collectionsWithCurationHtml231.indexOf('curated-card-cu-1') > 0 &&
      collectionsWithCurationHtml231.indexOf('2곳·검단이니야외') > 0 &&
      collectionsWithCurationHtml231.indexOf('>담기<') < 0],
  // ③ 공유 — 서버 스냅샷 링크(?col=) + 실패 시 기존 링크로 폴백
  ['v2.31 공유: 서버에 스냅샷을 저장한 링크를 씀',
    collectionsSource231.indexOf('shareCollectionSnapshot') > 0 && collectionsSource231.indexOf('buildShareUrl(items)') > 0],
  ['v2.31 공유: 링크를 복사·공유 시트로 건넴',
    collectionsSource231.indexOf('공유 링크를 복사했어요') > 0 && collectionsSource231.indexOf('nativeShare(url') > 0],
  // ④ App — 배너·기획전 불러오기 · ?col= 미리보기 · 중복 없는 담기
  ['v2.31 App: 배너·기획전을 불러와 컬렉션에 넘김',
    appSource231.indexOf('fetchPublicBanners') > 0 && appSource231.indexOf('fetchPublicCurated') > 0 &&
      appSource231.indexOf('banners={banners}') > 0 && appSource231.indexOf('curated={curated}') > 0],
  ['v2.31 App: `?col=` 공유 링크를 열면 미리보기',
    appSource231.indexOf('readCollectionShareFromLocation') > 0 && appSource231.indexOf('fetchSharedCollection') > 0 &&
      appSource231.indexOf('testID="shared-collection-preview"') > 0],
  ['v2.31 App: 담기는 중복 없이(planCuratedImport) 컬렉션으로도 묶음',
    appSource231.indexOf('planCuratedImport') > 0 && appSource231.indexOf('addPinsToCollection') > 0 &&
      appSource231.indexOf('createCollection(current, plan.collection)') > 0],
  ['v2.31 App: 공유 미리보기가 열리면 하단 탭바를 숨김',
    appSource231.indexOf('collection: collectionSheet || Boolean(sharedCollection)') > 0],
  // ④-2 하단 탭바가 [내 지도에 한 번에 담기] 버튼을 덮지 않게 — 기획전 미리보기도 같은 규칙
  ['v2.31 탭바: 기획전 미리보기 시트가 열리면 숨김',
    tabBarVisibility({ tab: 'collections', curated: true }).visible === false &&
      tabBarHiddenReason({ tab: 'collections', curated: true }) === '기획전 미리보기'],
  ['v2.31 App: 기획전 미리보기 상태를 규칙에 넘기고 조건부로 그리지 않음',
    appSource231.indexOf('curated: curatedPreviewOpen') > 0 &&
      appSource231.indexOf('onPreviewSheetChange={setCuratedPreviewOpen}') > 0],
  ['v2.31 컬렉션: 기획전 미리보기 상태를 App 에 알림',
    /onPreviewSheetChange\(Boolean\(curatedPreview\)\)/.test(collectionsSource231)],
  // ⑤ 미리보기 시트 — 장소 목록 · 좌표 없음 안내 · 담기 버튼
  ['v2.31 미리보기: LayerSheet 틀 + 장소 목록 + [내 지도에 한 번에 담기]',
    previewSheetSource231.indexOf('<LayerSheet') > 0 &&
      previewSheetHtml231.indexOf('영등포직장인점심코스') > 0 &&
      previewSheetHtml231.indexOf('검단이니야') > 0 &&
      previewSheetHtml231.indexOf('내지도에한번에담기') > 0 &&
      previewSheetHtml231.indexOf('curated-preview-import') > 0],
  ['v2.31 미리보기: 좌표 없는 장소는 지도에 안 찍힌다고 밝힘',
    previewSheetHtml231.indexOf('좌표없음·지도에는찍히지않아요') > 0],
  ['v2.31 미리보기: 공유에 메모·전화번호가 안 간다는 안내',
    previewSheetHtml231.indexOf('한줄메모와전화번호는함께가지않습니다') > 0],
  // ⑥ /admin 📌 기획전·배너 탭
  ['v2.31 어드민: 5번째 탭 `기획전·배너`',
    adminSource231.indexOf("{ id: 'curation', label: '기획전·배너'") > 0 && adminPreviewHtml231.indexOf('기획전·배너') > 0],
  ['v2.31 어드민: 새 배너 · 새 기획전 버튼과 편집 모달',
    adminSource231.indexOf('testID="admin-banner-new"') > 0 && adminSource231.indexOf('testID="admin-curated-new"') > 0 &&
      adminSource231.indexOf('function BannerEditModal') > 0 && adminSource231.indexOf('function CuratedEditModal') > 0],
  ['v2.31 어드민: 켜기/끄기 · 수정 · 삭제(확인 모달)',
    adminSource231.indexOf("action: 'save-banner'") > 0 && adminSource231.indexOf("action: 'save-curated'") > 0 &&
      adminSource231.indexOf("confirm.kind === 'banner'") > 0 && adminSource231.indexOf("confirm.kind === 'curated'") > 0],
  ['v2.31 어드민: 기획전 장소는 저장된 핀에서 고르거나 직접 추가',
    adminSource231.indexOf('placeFromPin') > 0 && adminSource231.indexOf('저장된 장소에서 고르기') > 0 &&
      adminSource231.indexOf('직접 추가') > 0],
  ['v2.31 어드민 API: banners · curated 조회와 저장/삭제 라우트',
    adminApiSource231.indexOf("view === 'banners'") > 0 && adminApiSource231.indexOf("view === 'curated'") > 0 &&
      adminApiSource231.indexOf("action === 'save-banner'") > 0 && adminApiSource231.indexOf("action === 'save-curated'") > 0 &&
      adminApiSource231.indexOf("action === 'delete-banner'") > 0 && adminApiSource231.indexOf("action === 'delete-curated'") > 0],
  // ⑦ DB — 테이블 3개 · 관리자 재확인 · 공개 함수
  ['v2.31 DB: 배너·기획전·공유 테이블 + RLS',
    curationSqlSource231.indexOf('create table if not exists public.reelpin_banners') > 0 &&
      curationSqlSource231.indexOf('create table if not exists public.reelpin_curated_collections') > 0 &&
      curationSqlSource231.indexOf('create table if not exists public.reelpin_shared_collections') > 0 &&
      curationSqlSource231.indexOf('enable row level security') > 0],
  ['v2.31 DB: 공개 함수 4개 + 관리자 함수는 reelpin_is_admin 재확인',
    curationSqlSource231.indexOf('reelpin_public_banners') > 0 && curationSqlSource231.indexOf('reelpin_public_curated') > 0 &&
      curationSqlSource231.indexOf('reelpin_share_collection') > 0 && curationSqlSource231.indexOf('reelpin_shared_collection(') > 0 &&
      (curationSqlSource231.match(/if not public\.reelpin_is_admin\(\) then/g) || []).length >= 6],
];
for (const [label, ok, extra] of v231Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

// ── v2.32.0 컬렉션 탭 다듬기 ──────────────────────────────────────────
// 상훈 님 요청(2026-11-18): "1) 폰트 크기를 '내 컬렉션' 크기와 동일하게 / 2) 1개 라는 개수 텍스트는 빼주고,
//   좌우 스와이프 가능하게 / 3) 내 컬렉션 에서는 2곳 담김 이라는건 빼줘"
const collectionsSource2311 = fs.readFileSync(path.join(process.cwd(), 'src/screens/CollectionsScreen.js'), 'utf8');

/** 렌더된 HTML 에서 `text` 를 담은 div 의 class (react-native-web 은 같은 스타일 = 같은 class) */
const classOfTextDiv = (html, text) => {
  const i = String(html).indexOf(text);
  if (i < 0) return '';
  const start = String(html).lastIndexOf('<div', i);
  const m = /class="([^"]*)"/.exec(String(html).slice(start, i));
  return m ? m[1] : '';
};
const curatedTitleClass2311 = classOfTextDiv(collectionsWithCurationHtml231, '운영자추천·기획전');
const myCollectionsTitleClass2311 = classOfTextDiv(collectionsWithCurationHtml231, '내컬렉션');
/** 기획전 섹션 머리(제목~첫 카드 사이) — 여기에 `N개` 개수가 없어야 합니다 */
const curatedHeaderHtml2311 = (() => {
  const h = collectionsWithCurationHtml231;
  const i = h.indexOf('collections-curated');
  const j = h.indexOf('curated-card-cu-1');
  return i >= 0 && j > i ? h.slice(i, j) : '';
})();
/** 기획전 카드 줄(가로 스크롤 영역) 의 여는 태그 */
const curatedRowTag2311 = (() => {
  const h = collectionsWithCurationHtml231;
  const i = h.indexOf('data-testid="collections-curated-row"');
  if (i < 0) return '';
  const start = h.lastIndexOf('<div', i);
  return h.slice(start, h.indexOf('>', i) + 1);
})();
/** 소스에서 기획전 섹션 부분(테스트ID ~ 카드 줄 ScrollView) */
const curatedBlockSource2311 = (() => {
  const s = collectionsSource2311;
  const i = s.indexOf('testID="collections-curated"');
  const j = s.indexOf('testID="collections-curated-row"');
  return i >= 0 && j > i ? s.slice(i, j) : '';
})();

const v2311Checks = [
  ['v2.32.0 컬렉션: 기획전 제목이 `내 컬렉션`과 같은 스타일(같은 class = 같은 크기·굵기)',
    curatedTitleClass2311 !== '' && curatedTitleClass2311 === myCollectionsTitleClass2311,
    curatedTitleClass2311 + ' / ' + myCollectionsTitleClass2311],
  ['v2.32.0 컬렉션: 기획전 제목 오른쪽 `N개` 개수 텍스트 없음(개수 스타일도 삭제)',
    curatedHeaderHtml2311.length > 0 && !/[0-9]+개/.test(curatedHeaderHtml2311) &&
      collectionsSource2311.indexOf('sectionCount') < 0 && collectionsSource2311.indexOf('{curated.length}개') < 0,
    curatedHeaderHtml2311.slice(0, 160)],
  ['v2.32.0 컬렉션: 내 컬렉션 요약은 `N개 컬렉션` 만 (`· N곳 담김` 없음)',
    collectionsHeadline(COL_219, COL_PINS_219) === '2개 컬렉션' &&
      collectionsListHtml219.indexOf('곳담김') < 0 &&
      collectionsSource2311.indexOf("'개 컬렉션 · '") < 0],
  ['v2.32.0 컬렉션: 기획전 카드 줄 = 가로 ScrollView(스크롤바 숨김 · contentContainerStyle · 높이 고정)',
    curatedBlockSource2311.length > 0 &&
      /<ScrollView[\s\S]*?\bhorizontal\b/.test(curatedBlockSource2311) &&
      curatedBlockSource2311.indexOf('showsHorizontalScrollIndicator={false}') > 0 &&
      curatedBlockSource2311.indexOf('contentContainerStyle={styles.curatedRow}') > 0 &&
      curatedBlockSource2311.indexOf('style={styles.curatedScroll}') > 0],
  ['v2.32.0 컬렉션: 렌더된 카드 줄이 가로 스크롤 영역(넘친 카드는 옆으로 밀림)',
    curatedRowTag2311.indexOf('data-testid="collections-curated-row"') > 0 &&
      /overflowx|overflow-x/i.test(curatedRowTag2311) &&
      /flexdirection|flex-direction/i.test(curatedRowTag2311) &&
      /curatedScroll:\s*\{\s*flexGrow:\s*0/.test(collectionsSource2311), curatedRowTag2311],
];
for (const [label, ok, extra] of v2311Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}


// ── v2.32 컬렉션 탭 — 🖼️ 사진형 큐레이션 피드 · ⚡ 테마 칩 · 📌 슬림 배너 ──────
// 상훈 님 요청(2026-11-18): "컬렉션 탭을 매거진처럼 사진 카드로, 아래 테마 칩·한 줄 배너" (`IMG_9129`)
import { POSTER_WIDTH as POSTER_WIDTH_232 } from '../src/screens/CollectionsScreen';
import { buildThemeChips as buildThemeChips232, curatedCoverLine as curatedCoverLine232 } from '../src/utils/curation';

const collectionsSource232 = fs.readFileSync(path.join(process.cwd(), 'src/screens/CollectionsScreen.js'), 'utf8');
const adminSource232 = fs.readFileSync(path.join(process.cwd(), 'src/screens/AdminScreen.js'), 'utf8');
const adminDbSource232 = fs.readFileSync(path.join(process.cwd(), 'server/admin-db.js'), 'utf8');
const curationSqlSource232 = fs.readFileSync(path.join(process.cwd(), 'supabase/curation.sql'), 'utf8');

const BANNERS_232 = [
  { id: 'bn-1', title: '이번 주 릴스핀 인기 맛집', subtitle: '릴스에서 본 그 가게', badge: '기획전', linkUrl: 'https://example.com/a', imageUrl: 'https://images.example.com/banner.jpg', sortOrder: 0 },
];
const CURATED_232 = [
  {
    id: 'cu-1', title: '서울 도심 산책 코스', description: '주말에 걷기 좋은 세 곳', sponsor: '운영자 추천',
    badge: '기획전', emoji: '🏞️', color: '#0D9488', imageUrl: 'https://images.example.com/poster.jpg', chip: '',
    places: [{ name: '경복궁' }, { name: '광화문광장' }, { name: '청계광장' }],
  },
  {
    id: 'cu-2', title: '영등포 직장인 점심 코스', description: '12시에 바로 갈 수 있는 곳', sponsor: '', badge: '추천',
    emoji: '🍜', color: '#F2A03D', imageUrl: '', chip: '점심',
    places: [{ name: '베통 성수' }, { name: '디오디아' }],
  },
];
const collections232Html = stripSpaces(
  renderToString(
    <CollectionsScreen
      pins={COL_PINS_219}
      collections={COL_219}
      banners={BANNERS_232}
      curated={CURATED_232}
      /* v2.32.1 — 숨김 전 구조 검사용 통로(기본값은 SHOW_CURATED_FEED = false) */
      showCuratedFeed
      onToast={noop}
      onImportCurated={noop}
    />
  )
);
const collections232NoCuration = stripSpaces(
  renderToString(<CollectionsScreen pins={COL_PINS_219} collections={COL_219} onToast={noop} />)
);
/** 두 testID 사이의 마크업 (poster 하나만 보기) */
const sliceBetween232 = (html, a, b) => {
  const i = html.indexOf(a);
  if (i < 0) return '';
  const j = b ? html.indexOf(b, i) : -1;
  return j > i ? html.slice(i, j) : html.slice(i, i + 2600);
};

const v232Checks = [
  // ① 사진형 포스터 카드
  ['v2.32 컬렉션: 포스터 카드 폭 136~148px (390px 에서 2.3~2.5장이 보여 옆으로 넘길 수 있음)',
    POSTER_WIDTH_232 >= 136 && POSTER_WIDTH_232 <= 148 && (350 / (POSTER_WIDTH_232 + 10)) >= 2.2,
    String(POSTER_WIDTH_232) + ' / ' + (350 / (POSTER_WIDTH_232 + 10)).toFixed(2)],
  // (react-native-web 의 Image 는 SSR 에서 주소 대신 이미지 상자만 그립니다 — 사진/기본커버를 구조로 확인)
  ['v2.32 컬렉션: 썸네일 이미지가 있으면 사진, 없으면 색+이모지 기본 커버',
    collections232Html.indexOf('curated-thumb-cu-1') > 0 &&
      sliceBetween232(collections232Html, 'curated-thumb-cu-1', 'curated-thumb-cu-2').indexOf('서울도심산책코스썸네일') > 0 &&
      sliceBetween232(collections232Html, 'curated-thumb-cu-1', 'curated-thumb-cu-2').indexOf('🏞️') < 0 &&
      sliceBetween232(collections232Html, 'curated-thumb-cu-2', '내컬렉션').indexOf('🍜') > 0 &&
      collectionsSource232.indexOf('source={{ uri: item.imageUrl }}') > 0 &&
      /posterFallback: \{[\s\S]{0,80}alignItems: 'center'/.test(collectionsSource232)],
  ['v2.32 컬렉션: 카드 위 배지 · 제목 2줄 · 한 줄 부제(`3곳 · 경복궁 외`)',
    collections232Html.indexOf('서울도심산책코스') > 0 &&
      collections232Html.indexOf('3곳·경복궁외') > 0 &&
      /posterTitle:[\s\S]{0,120}lineHeight/.test(collectionsSource232) &&
      collectionsSource232.indexOf('numberOfLines={2}') > 0],
  ['v2.32 컬렉션: 카드를 누르면 장소 미리보기(담기 버튼 없음)',
    /onPress=\{\(\) => setCuratedPreview\(item\)\}/.test(collectionsSource232) &&
      collectionsSource232.indexOf('curated-import-') < 0 &&
      collections232Html.indexOf('>담기<') < 0],
  // ② 빠른 테마 칩
  ['v2.32 컬렉션: 빠른 테마 칩 1~2줄 (운영자 chip · 없으면 제목 앞 두 낱말, 최대 6개)',
    collections232Html.indexOf('collections-theme-chips') > 0 &&
      collections232Html.indexOf('theme-chip-0') > 0 &&
      collections232Html.indexOf('theme-chip-1') > 0 &&
      buildThemeChips232(CURATED_232).map((c) => c.label).join(',') === '서울 도심,점심' &&
      buildThemeChips232(new Array(9).fill(0).map((_, i) => ({ id: 'c' + i, title: '테마 ' + i + ' 코스' }))).length === 6,
    buildThemeChips232(CURATED_232).map((c) => c.label).join(',')],
  ['v2.32 컬렉션: 테마 칩은 흰 알약(테두리 #E5E7EB · radius 999)이고 누르면 미리보기',
    /themeChip: \{[\s\S]{0,300}borderRadius: 999/.test(collectionsSource232) &&
      collectionsSource232.indexOf("borderColor: '#E5E7EB'") > 0 &&
      collectionsSource232.indexOf('backgroundColor: colors.card') > 0 &&
      /onPress=\{\(\) => setCuratedPreview\(chip.item\)\}/.test(collectionsSource232)],
  // ③ 슬림 배너
  ['v2.32 컬렉션: 배너는 아래쪽 한 줄 슬림 슬롯(제목 + 부제 인라인 · 넘치면 1줄 말줄임)',
    collections232Html.indexOf('collections-banners') > 0 &&
      collections232Html.indexOf('이번주릴스핀인기맛집') > 0 &&
      /slimTitle:[\s\S]{0,120}flex: 1/.test(collectionsSource232) &&
      /slimBadge:[\s\S]{0,200}borderRadius: 999/.test(collectionsSource232)],
  ['v2.32 컬렉션: 순서는 포스터 → 테마 칩 → 슬림 배너 → 내 컬렉션',
    collections232Html.indexOf('collections-curated') < collections232Html.indexOf('collections-theme-chips') &&
      collections232Html.indexOf('collections-theme-chips') < collections232Html.indexOf('collections-banners') &&
      collections232Html.indexOf('collections-banners') < collections232Html.indexOf('내컬렉션')],
  ['v2.32 컬렉션: 기획전·배너가 없으면 그 영역을 아예 그리지 않음',
    collections232NoCuration.indexOf('collections-curated') < 0 &&
      collections232NoCuration.indexOf('collections-theme-chips') < 0 &&
      collections232NoCuration.indexOf('collections-banners') < 0],
  // ④ /admin — 썸네일 이미지 URL · 테마 칩 · 미리보기
  ['v2.32 어드민: 기획전 모달에 썸네일 이미지 URL · 테마 칩 입력과 포스터 미리보기',
    adminSource232.indexOf('testID="curated-image-url"') > 0 &&
      adminSource232.indexOf('testID="curated-chip-input"') > 0 &&
      adminSource232.indexOf('testID="curated-poster-preview"') > 0 &&
      adminSource232.indexOf('curatedCoverLine') > 0 && adminSource232.indexOf('curatedChipLabel') > 0],
  ['v2.32 어드민: 배너 모달에도 썸네일 이미지 URL 과 한 줄 미리보기',
    adminSource232.indexOf('testID="banner-image-url"') > 0 && adminSource232.indexOf('testID="banner-preview"') > 0],
  ['v2.32 어드민: 켜기/끄기 저장에도 imageUrl·chip 을 함께 보냄(사진이 지워지지 않게)',
    adminSource232.indexOf('imageUrl: item.imageUrl ||') > 0 && adminSource232.indexOf("chip: item.chip ||") > 0],
  // ⑤ DB · 서버
  ['v2.32 DB: image_url · chip 열을 안전하게 더함(다시 실행해도 안전)',
    curationSqlSource232.indexOf("add column if not exists image_url text not null default ''") > 0 &&
      curationSqlSource232.indexOf("add column if not exists chip      text not null default ''") > 0 &&
      (curationSqlSource232.match(/add column if not exists image_url/g) || []).length === 2],
  ['v2.32 DB: 공개·어드민 함수가 imageUrl · chip 을 돌려주고 저장함',
    (curationSqlSource232.match(/'imageUrl'/g) || []).length >= 4 &&
      curationSqlSource232.indexOf("'chip',        c.chip") > 0 &&
      curationSqlSource232.indexOf('p_image_url text default') > 0 &&
      curationSqlSource232.indexOf('p_chip text default') > 0 &&
      curationSqlSource232.indexOf('drop function if exists public.reelpin_admin_save_curated') > 0],
  ['v2.32 서버: 열이 아직 없으면 예전 인자로 다시 저장(어드민 저장이 막히지 않음)',
    adminDbSource232.indexOf('saveWithFallback') > 0 &&
      /if \(first\.ok \|\| first\.error !== 'admin-schema-missing'\) return first/.test(adminDbSource232) &&
      adminDbSource232.indexOf("p_image_url: String(t.imageUrl || '')") > 0],
  ['v2.32 컬렉션: 한 줄 부제는 장소 목록에서 만든다(`3곳 · 경복궁 외`)',
    curatedCoverLine232({ places: [{ name: '경복궁' }, { name: '광화문광장' }, { name: '청계광장' }] }) === '3곳 · 경복궁 외' &&
      curatedCoverLine232({ places: [{ name: '경복궁' }] }) === '1곳 · 경복궁' &&
      curatedCoverLine232({ places: [] }) === '장소 없음'],
];
for (const [label, ok, extra] of v232Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}


// ── v2.32.1 🙈 컬렉션 탭 추천 기획전 숨김 — `내 컬렉션`만 노출 ──────────────────────
// 상훈 님 요청(2026-11-18): "컬렉션 탭에는 내 컬렉션만 보이게, 운영자 추천·기획전은 숨겨 줘"
//   · 숨기는 것 : 사진형 포스터 카드 · 빠른 테마 칩 · 슬림 배너 (그리고 그 불러오기까지)
//   · 그대로인 것 : `/admin` 의 `📌 기획전·배너` 탭 · API · DB · `?col=` 공유 컬렉션 미리보기
import {
  SHOW_CURATED_FEED as SHOW_CURATED_FEED_2321,
  SHOW_AD_BANNER as SHOW_AD_BANNER_2322,
} from '../src/screens/CollectionsScreen';

/** v2.32.2 — 배너가 있는 컬렉션 탭 / 배너가 0개인 컬렉션 탭 */
const adBannerHtml2322 = stripSpaces(
  renderToString(
    <CollectionsScreen pins={COL_PINS_219} collections={COL_219} banners={BANNERS_232} onToast={noop} />
  )
);
const emptyBannerHtml2322 = stripSpaces(
  renderToString(<CollectionsScreen pins={COL_PINS_219} collections={COL_219} banners={[]} onToast={noop} />)
);

const collectionsSource2321 = fs.readFileSync(path.join(process.cwd(), 'src/screens/CollectionsScreen.js'), 'utf8');
const appSource2321 = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
const adminSource2321 = fs.readFileSync(path.join(process.cwd(), 'src/screens/AdminScreen.js'), 'utf8');
const adminApiSource2321 = fs.readFileSync(path.join(process.cwd(), 'api/admin.js'), 'utf8');
const previewSheetSource2321 = fs.readFileSync(path.join(process.cwd(), 'src/components/CollectionPreviewSheet.js'), 'utf8');

/** 숨김 상태 — 배너·기획전 props 를 **넘겨도** 그리지 않아야 합니다(기본값 = SHOW_CURATED_FEED). */
const hiddenFeedHtml2321 = stripSpaces(
  renderToString(
    <CollectionsScreen
      pins={COL_PINS_219}
      collections={COL_219}
      banners={BANNERS_232}
      curated={CURATED_232}
      onToast={noop}
      onImportCurated={noop}
    />
  )
);

const v2321Checks = [
  // ① 스위치 — 한 곳에서 끄고 켜는 상수
  ['v2.32.1 컬렉션: `SHOW_CURATED_FEED` 스위치를 내보내고 기본값은 false(숨김)',
    SHOW_CURATED_FEED_2321 === false &&
      /export const SHOW_CURATED_FEED = false;/.test(collectionsSource2321)],
  // ② 숨김 상태에서 세 영역(포스터 · 테마 칩 · 슬림 배너)을 아예 그리지 않음
  ['v2.32.1 컬렉션: props 로 기획전·배너를 받아도 포스터 카드를 그리지 않음',
    hiddenFeedHtml2321.indexOf('collections-curated') < 0 &&
      hiddenFeedHtml2321.indexOf('curated-card-cu-1') < 0 &&
      hiddenFeedHtml2321.indexOf('운영자추천·기획전') < 0 &&
      hiddenFeedHtml2321.indexOf('서울도심산책코스') < 0],
  ['v2.32.1 컬렉션: 빠른 테마 칩도 그리지 않음',
    hiddenFeedHtml2321.indexOf('collections-theme-chips') < 0 &&
      hiddenFeedHtml2321.indexOf('theme-chip-0') < 0 &&
      hiddenFeedHtml2321.indexOf('서울도심') < 0],
  // v2.32.2 — 배너는 `내 컬렉션` 위 광고 슬롯으로 되살아났습니다(기획전 피드만 숨김).
  ['v2.32.2 광고: 켜 둔 배너는 내 컬렉션 위 광고 슬롯에 그대로 노출',
    hiddenFeedHtml2321.indexOf('collections-banners') > 0 &&
      hiddenFeedHtml2321.indexOf('이번주릴스핀인기맛집') > 0 &&
      hiddenFeedHtml2321.indexOf('collections-curated') < 0],
  ['v2.32.1 컬렉션: `내 컬렉션`과 내 컬렉션 카드만 남음',
    hiddenFeedHtml2321.indexOf('내컬렉션') > 0 &&
      hiddenFeedHtml2321.indexOf('collection-card-') > 0 &&
      hiddenFeedHtml2321.indexOf('2개컬렉션') > 0 &&
      hiddenFeedHtml2321.indexOf('collection-new') > 0],
  // ③ 숨김은 "지우기"가 아니라 "끄기" — 다시 켜면 그대로 돌아옵니다
  ['v2.32.1 컬렉션: 기획전·테마 칩은 스위치로만 감싸 두고 코드는 그대로 남김(다시 켜면 복구)',
    collectionsSource2321.indexOf('{curatedFeedOn && curated.length ? (') > 0 &&
      collectionsSource2321.indexOf('{curatedFeedOn && themeChips.length ? (') > 0 &&
      collectionsSource2321.indexOf('buildThemeChips(curated)') > 0],
  ['v2.32.2 광고: 배너 슬롯은 광고 스위치(`SHOW_AD_BANNER`)로 따로 감쌈',
    collectionsSource2321.indexOf('{SHOW_AD_BANNER && showAdBanner ? (') > 0 &&
      collectionsSource2321.indexOf('banners.length ? (') > 0],
  ['v2.32.1 컬렉션: 숨김 동안 테마 칩 계산도 하지 않음',
    /curatedFeedOn \? buildThemeChips\(curated\) : \[\]/.test(collectionsSource2321) &&
      collectionsSource2321.indexOf('showCuratedFeed = SHOW_CURATED_FEED') > 0],
  // ④ App — 숨김 동안에는 배너·기획전을 불러오지 않음(헛된 요청 없음)
  ['v2.32.2 App: 배너는 항상 조회 · 기획전은 숨김 동안 부르지 않음',
    appSource2321.indexOf("import CollectionsScreen, { SHOW_CURATED_FEED }") > 0 &&
      appSource2321.indexOf('fetchPublicBanners()') > 0 &&
      appSource2321.indexOf('SHOW_CURATED_FEED ? fetchPublicCurated()') > 0 &&
      /if \(!SHOW_CURATED_FEED\) return;/.test(appSource2321) === false],
  // ⑤ 공유(`?col=`) 미리보기는 그대로 — 숨김과 무관하게 열립니다
  ['v2.32.1 공유: `?col=` 공유 컬렉션 미리보기는 그대로 동작',
    appSource2321.indexOf('readCollectionShareFromLocation') > 0 &&
      appSource2321.indexOf('fetchSharedCollection') > 0 &&
      appSource2321.indexOf('testID="shared-collection-preview"') > 0 &&
      collectionsSource2321.indexOf('CollectionPreviewSheet') > 0 &&
      previewSheetSource2321.indexOf("importLabel = '내 지도에 한 번에 담기'") > 0],
  ['v2.32.1 공유: 내 컬렉션 [공유]는 숨김과 무관하게 서버 스냅샷 링크를 씀',
    collectionsSource2321.indexOf('shareCollectionSnapshot') > 0 &&
      collectionsSource2321.indexOf('buildShareUrl(items)') > 0 &&
      hiddenFeedHtml2321.indexOf('collection-share-') > 0],
  // ⑥ /admin 은 손대지 않음
  ['v2.32.1 어드민: `📌 기획전·배너` 탭·저장·삭제는 그대로(스위치 영향 없음)',
    adminSource2321.indexOf("{ id: 'curation', label: '기획전·배너'") > 0 &&
      adminSource2321.indexOf("action: 'save-banner'") > 0 && adminSource2321.indexOf("action: 'save-curated'") > 0 &&
      adminSource2321.indexOf("action: 'delete-banner'") > 0 && adminSource2321.indexOf("action: 'delete-curated'") > 0 &&
      adminSource2321.indexOf('SHOW_CURATED_FEED') < 0],
  ['v2.32.1 어드민 API: banners · curated 조회/저장 라우트 그대로',
    adminApiSource2321.indexOf("view === 'banners'") > 0 && adminApiSource2321.indexOf("view === 'curated'") > 0 &&
      adminApiSource2321.indexOf("action === 'save-banner'") > 0 && adminApiSource2321.indexOf("action === 'save-curated'") > 0 &&
      adminApiSource2321.indexOf('SHOW_CURATED_FEED') < 0],
];
for (const [label, ok, extra] of v2321Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}


// ── v2.32.2 🧹 레이어 팝업 헤더 부텍스트 제거 (제목 + ✕ 만) ────────────────────────
// 상훈 님 요청(2026-11-18): "레이어 팝업에 있는 그런 텍스트들은 다 빼자"
//   · 헤더 아래 보조줄(sub)을 컴포넌트에서 **아예 없앱니다** — 다시 생길 수 없게.
//   · 장소 상세 시트(PinDetailSheet)의 본문 정보(분류·주소·영업시간 등)는 그대로 둡니다.
const layerSheetSource2322 = fs.readFileSync(path.join(process.cwd(), 'src/components/LayerSheet.js'), 'utf8');
const overlayHeaderSource2322 = fs.readFileSync(path.join(process.cwd(), 'src/components/OverlayHeader.js'), 'utf8');
const searchSource2322 = fs.readFileSync(path.join(process.cwd(), 'src/components/SearchOverlayModal.js'), 'utf8');
const alertSource2322 = fs.readFileSync(path.join(process.cwd(), 'src/components/AlertInbox.js'), 'utf8');
const menuSource2322 = fs.readFileSync(path.join(process.cwd(), 'src/components/MenuDrawerModal.js'), 'utf8');
const feedbackSource2322 = fs.readFileSync(path.join(process.cwd(), 'src/components/FeedbackBoardModal.js'), 'utf8');
const previewSource2322 = fs.readFileSync(path.join(process.cwd(), 'src/components/CollectionPreviewSheet.js'), 'utf8');
const pasteSource2322 = fs.readFileSync(path.join(process.cwd(), 'src/screens/PasteScreen.js'), 'utf8');
const mapSource2322 = fs.readFileSync(path.join(process.cwd(), 'src/screens/MapScreen.js'), 'utf8');
const webModalSource2322 = fs.readFileSync(path.join(process.cwd(), 'src/components/InAppPlaceModal.web.js'), 'utf8');
const nativeModalSource2322 = fs.readFileSync(path.join(process.cwd(), 'src/components/InAppPlaceModal.js'), 'utf8');

const mapSource233 = fs.readFileSync(path.join(process.cwd(), 'src/components/RealMapView.web.js'), 'utf8');
const mapScreenSource233 = fs.readFileSync(path.join(process.cwd(), 'src/screens/MapScreen.js'), 'utf8');
const appSource233 = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
const gestureSource233 = fs.readFileSync(path.join(process.cwd(), 'src/components/longPressGesture.js'), 'utf8');

/** src 전체에서 레이어 팝업에 `sub=` 를 넘기는 곳이 하나도 없어야 합니다. */
const layerSubCallers2322 = (() => {
  const hits = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.jsx?$/.test(name)) {
        const src = fs.readFileSync(full, 'utf8');
        if (/<LayerSheet[\s\S]{0,600}?\bsub=/.test(src) || /<OverlayHeader[\s\S]{0,600}?\bsub=/.test(src)) hits.push(name);
      }
    }
  };
  walk(path.join(process.cwd(), 'src'));
  return hits;
})();

const v2322Checks = [
  ['v2.32.2 팝업: LayerSheet 에 sub 슬롯 자체가 없음(헤더 = 제목 + ✕)', layerSheetSource2322.indexOf('sub =') < 0 && layerSheetSource2322.indexOf('{!!sub &&') < 0 && layerSheetSource2322.indexOf('styles.sub') < 0],
  ['v2.32.2 팝업: OverlayHeader 에도 sub 슬롯이 없음', overlayHeaderSource2322.indexOf('sub =') < 0 && overlayHeaderSource2322.indexOf('{!!sub &&') < 0 && overlayHeaderSource2322.indexOf('styles.sub') < 0],
  ['v2.32.2 팝업: sub 를 넘기는 화면이 src 전체에 하나도 없음(전수 검사)', layerSubCallers2322.length === 0, layerSubCallers2322.join(',')],
  ['v2.32.2 검색: `내 핀 N곳에서 찾기` 헤더 부제 없음(제목 `내 장소 검색` 만)', overlayHtml216.indexOf('곳에서 찾기') < 0 && overlayHtml216.indexOf('내 장소 검색') > 0 && searchSource2322.indexOf('savedCount') < 0],
  ['v2.32.2 알림: 반경 안내 부제 없음(목록은 그대로)', alertSource2322.indexOf('sub={summary}') < 0 && inboxOpenHtml.indexOf('내 위치 반경') < 0 && inboxOpenHtml.indexOf('영등포아바이순대국') > 0],
  ['v2.32.2 목록: `저장한 곳 N곳 · 눌러서…` 부제 없음', mapSource2322.indexOf('눌러서 지도에서 바로 보기') < 0 && /title="목록 보기"/.test(mapSource2322)],
  ['v2.32.2 내 정보: `계정 · 동기화 · 설정` · 서브 페이지 안내 부제 없음', menuSource2322.indexOf('SUB_SUB') < 0 && menuSource2322.indexOf('sub={') < 0 && menuHtml216.indexOf('계정 · 동기화 · 설정') < 0],
  ['v2.32.2 제보: `기능 아이디어 · 버그 신고 · 공감` 부제 없음(2탭은 그대로)', feedbackSource2322.indexOf('sub={') < 0 && feedbackModalHtml223.indexOf('기능 아이디어 · 버그 신고') < 0 && feedbackModalHtml223.indexOf('기능 제안') > 0],
  ['v2.32.2 컬렉션 미리보기: 배지·N곳 부제 없음(장소 목록은 그대로)', previewSource2322.indexOf('sub={sub}') < 0 && previewSource2322.indexOf('testID={testID + \'-places\'}') > 0],
  ['v2.32.2 저장: `릴스·쇼츠 링크 · 가게명으로…` 헤더 부제 없음', pasteSource2322.indexOf('릴스·쇼츠 링크 · 가게명으로 찾아') < 0 && pasteSource2322.indexOf('<OverlayHeader') > 0],
  ['v2.32.2 인앱 매장 정보: 헤더 `동네 · 네이버 플레이스` 부제 없음', webModalSource2322.indexOf('styles.subtitle') < 0 && nativeModalSource2322.indexOf('styles.subtitle') < 0],
  ['v2.32.2 상세 시트: 분류·주소 등 본문 정보는 그대로(지우지 않음)', pinDetailSource.indexOf('pin-category-badge') > 0 && pinDetailSource.indexOf('testID="pin-sheet-header"') > 0 && pinDetailSource.indexOf('hasAddress ? address') > 0 && pinDetailSource.indexOf('styles.infoValue') > 0],
  ['v2.32.2 광고: `SHOW_AD_BANNER` 기본 true · 기획전 피드 스위치는 false 그대로', SHOW_AD_BANNER_2322 === true && SHOW_CURATED_FEED_2321 === false],
  ['v2.32.2 광고: 켜 둔 배너가 있으면 그 배너가 슬롯에(링크·이미지·배지 그대로)', adBannerHtml2322.indexOf('collections-banners') > 0 && adBannerHtml2322.indexOf('collections-banner-bn-1') > 0 && adBannerHtml2322.indexOf('collections-ad-slot') < 0],
  ['v2.32.2 광고: 배너가 0개면 `AD · 스폰서 배너 영역` 슬롯이 보임', emptyBannerHtml2322.indexOf('collections-ad-slot') > 0 && emptyBannerHtml2322.indexOf('스폰서배너영역') > 0],
  ['v2.32.2 광고: 슬롯은 `내 컬렉션` 제목보다 위', emptyBannerHtml2322.indexOf('collections-ad-slot') < emptyBannerHtml2322.indexOf('내컬렉션') && emptyBannerHtml2322.indexOf('collections-ad-slot') > 0],
  ['v2.32.2 광고: 슬롯은 기획전 스위치와 무관(숨김 상태에서도 보임)', emptyBannerHtml2322.indexOf('collections-ad-slot') > 0 && emptyBannerHtml2322.indexOf('collections-curated') < 0 && emptyBannerHtml2322.indexOf('collections-theme-chips') < 0],
  ['v2.32.2 광고: 배너 링크는 http(s)만 열기(그대로)', collectionsSource2321.indexOf('const hasLink = /^https?:\\/\\//i.test(String(banner.linkUrl') > 0],
  ['v2.32.2 토스트: 반경 500m 알림이 화면에 6초 머묾', GEOFENCE_TOAST_MS === 6000 && geofenceToastHtml.indexOf('반경 500m 안에 2곳 있어요') > 0],
  ['v2.32.2 버전: 2.32.2 (메뉴 · 앱 정보 · package · app.json · 제보 첨부값)', APP_VERSION_LABEL === '릴스핀 v2.40.0' && APP_INFO_VERSION === '릴스핀 v2.40.0' && pkg.version === '2.40.0' && expoConfig.version === '2.40.0' && FEEDBACK_APP_VERSION === '2.40.0'],
];
for (const [label, ok, extra] of v2322Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}

// ── v2.33.0 📍 지도 꾹 눌러 장소 등록 ──────────────────────────────────────
// 상훈 님 요청(2026-11-18): "지도상에서 꾹 누르면 해당 위치의 장소를 등록 하는 기능"
//   · 꾹 누르기(터치 0.55초) → 떨어진 핀 + `이 위치에 장소 등록` 시트
//   · 주소(카카오 coord2address) + 반경 60m 장소 3곳 → 고르거나 직접 이름 입력 → 내 지도에 저장
const LONG_PRESS_RESULT_233 = {
  address: {
    road: '서울특별시 마포구 양화로 156',
    jibun: '서울 마포구 동교동 165-8',
    building: 'LG팰리스빌딩',
    area: '동교동',
    label: '서울특별시 마포구 양화로 156',
  },
  places: [
    { id: 'p1', name: '면사랑', categoryGroupCode: 'FD6', categoryGroupName: '음식점', distance: 24, phone: '02-000-0000', placeUrl: 'http://place.map.kakao.com/p1' },
    { id: 'p2', name: '공미학', categoryGroupCode: 'CE7', categoryGroupName: '카페', distance: 27 },
    { id: 'p3', name: '평안도상원냉면', categoryGroupCode: 'FD6', categoryGroupName: '음식점', distance: 31 },
    { id: 'p4', name: '홍대걷고싶은거리', categoryGroupCode: 'AT4', categoryGroupName: '관광명소', distance: 71 },
  ],
};
const LONG_PRESS_POINT_233 = { lat: 37.5563, lng: 126.9236 };
const COL_233 = [{ id: 'col-1', name: '홍대 데이트', emoji: '💛' }];

const placeSheetHtml233 = stripSpaces(
  renderToString(
    <LongPressPlaceSheet
      point={LONG_PRESS_POINT_233}
      loading={false}
      result={LONG_PRESS_RESULT_233}
      categories={['맛집', '카페', '가볼곳']}
      collections={COL_233}
      onClose={noop}
      onSave={noop}
    />
  )
);
const placeSheetLoadingHtml233 = stripSpaces(
  renderToString(<LongPressPlaceSheet point={LONG_PRESS_POINT_233} loading result={null} onClose={noop} onSave={noop} />)
);
const placeSheetErrorHtml233 = stripSpaces(
  renderToString(
    <LongPressPlaceSheet
      point={LONG_PRESS_POINT_233}
      loading={false}
      result={null}
      error={PLACE_LOOKUP_FAILED}
      onClose={noop}
      onSave={noop}
      onRetry={noop}
    />
  )
);

const v233Checks = [
  ['v2.33 시트: 제목 `이 위치에 장소 등록` + 다른 레이어와 같은 틀(헤더 = 제목 + ✕)',
    placeSheetHtml233.indexOf('이위치에장소등록') > 0 &&
      placeSheetHtml233.indexOf('longpress-place-header') > 0 &&
      placeSheetHtml233.indexOf('longpress-place-close') > 0],
  ['v2.33 시트: 꾹 누른 자리의 도로명 주소 + 건물명·지번',
    placeSheetHtml233.indexOf('서울특별시마포구양화로156') > 0 &&
      placeSheetHtml233.indexOf('lg팰리스빌딩') > 0 &&
      placeSheetHtml233.indexOf('꾹누른자리') > 0],
  ['v2.33 시트: 주변 장소 3곳(거리 24m·27m·31m) + 업종',
    placeSheetHtml233.indexOf('주변3곳안장소') > 0 &&
      placeSheetHtml233.indexOf('면사랑') > 0 &&
      placeSheetHtml233.indexOf('공미학') > 0 &&
      placeSheetHtml233.indexOf('24m') > 0 &&
      placeSheetHtml233.indexOf('27m') > 0 &&
      placeSheetHtml233.indexOf('홍대걷고싶은거리') < 0,
    String(NEARBY_PLACE_LIMIT)],
  ['v2.33 시트: 이름 칸이 가장 가까운 장소로 채워져 있고 직접 고칠 수 있다',
    placeSheetHtml233.indexOf('longpress-name-input') > 0 &&
      /value="면사랑"/.test(placeSheetHtml233) &&
      placeSheetHtml233.indexOf('목록에서고른장소·면사랑') > 0],
  ['v2.33 시트: 분류 칩(맛집·카페·가볼곳) · 한줄 메모 · 컬렉션',
    placeSheetHtml233.indexOf('분류') > 0 &&
      placeSheetHtml233.indexOf('카테고리') < 0 &&
      placeSheetHtml233.indexOf('longpress-memo-input') > 0 &&
      placeSheetHtml233.indexOf('담지않음') > 0 &&
      placeSheetHtml233.indexOf('홍대데이트') > 0],
  ['v2.33 시트: [내 지도에 저장] 버튼이 발끝에 하나',
    placeSheetHtml233.indexOf('longpress-place-save') > 0 && placeSheetHtml233.indexOf('내지도에저장') > 0],
  ['v2.33 시트: 조회 중에는 `주변 장소 이름을 찾고 있어요`',
    placeSheetLoadingHtml233.indexOf('주변장소이름을찾고있어요') > 0 && placeSheetLoadingHtml233.indexOf('longpress-loading') > 0],
  ['v2.33 시트: 조회 실패해도 직접 입력으로 저장할 수 있다(다시 시도 버튼)',
    placeSheetErrorHtml233.indexOf('이름을직접적어저장할수있어요') > 0 &&
      placeSheetErrorHtml233.indexOf('다시') > 0 &&
      placeSheetErrorHtml233.indexOf('longpress-name-input') > 0 &&
      placeSheetErrorHtml233.indexOf('longpress-coords') > 0 &&
      placeSheetErrorHtml233.indexOf('위도37.55630') > 0,
    String(placeSheetErrorHtml233.indexOf('longpress-coords'))],
  ['v2.33 시트: 위쪽 지도가 보이도록 높이 70%(다른 레이어는 86% 그대로)',
    PLACE_SHEET_HEIGHT === '70%' && SHEET_HEIGHT === '86%', PLACE_SHEET_HEIGHT],
  ['v2.33 시트: 하단 탭바를 숨기는 규칙에 장소 등록 시트 포함',
    tabBarVisibility({ tab: 'map', placeSheet: true }).visible === false &&
      tabBarVisibility({ tab: 'map', placeSheet: true }).hiddenBy === 'placeSheet' &&
      tabBarHiddenReason({ tab: 'map', placeSheet: true }) === '장소 등록 시트' &&
      tabBarVisibility({ tab: 'map' }).visible === true],
  ['v2.33 지도: 네이버·Leaflet 모두 꾹 누르기를 잡는다(포인터 0.55초 · 12px 이동이면 취소)',
    mapSource233.indexOf("bindLongPress(node") > 0 &&
      (mapSource233.match(/bindLongPress\(node/g) || []).length === 2 &&
      mapSource233.indexOf('fromOffsetToCoord') > 0 &&
      mapSource233.indexOf('containerPointToLatLng') > 0 &&
      gestureSource233.indexOf('LONG_PRESS_MS') > 0 &&
      gestureSource233.indexOf('preventDefault') > 0 &&
      gestureSource233.indexOf('passive: true') > 0],
  ['v2.33 지도: 꾹 누른 자리에 떨어진 핀(여기) — 닫으면 지운다',
    mapSource233.indexOf('droppedPinHtml') > 0 &&
      mapSource233.indexOf('reelpin-drop-pulse') > 0 &&
      mapSource233.indexOf('droppedRef.current.setMap(null)') > 0 &&
      mapSource233.indexOf('map.removeLayer(droppedRef.current)') > 0],
  ['v2.33 지도: 시트가 열린 만큼 그 자리를 화면 위쪽(15%)으로 옮긴다',
    mapScreenSource233.indexOf('onLongPress={handleMapLongPress') > 0 &&
      mapScreenSource233.indexOf('droppedPoint={placePoint}') > 0 &&
      mapScreenSource233.indexOf('focusAnchorY={placePoint ? 0.15 : 0.5}') > 0 &&
      mapSource233.indexOf('naverAnchorCenter') > 0 &&
      mapSource233.indexOf('leafletAnchorCenter') > 0],
  ['v2.33 화면: 저장은 App 의 기존 흐름(중복 판정·클라우드·컬렉션)을 그대로 탄다',
    mapScreenSource233.indexOf("import { fetchReversePlace }") > 0 &&
      mapScreenSource233.indexOf('onSavePlace') > 0 &&
      appSource233.indexOf('handleSavedPlace') > 0 &&
      appSource233.indexOf('findExistingPin') > 0 &&
      appSource233.indexOf('pushPinsToCloud([pin])') > 0 &&
      appSource233.indexOf('addPinsToCollection(current, collectionId, [target.id])') > 0,
    ''],
  ['v2.33 화면: App 이 장소 등록 시트를 알고 하단 탭바를 숨긴다',
    appSource233.indexOf('mapPlaceSheet') > 0 &&
      appSource233.indexOf('placeSheet: mapPlaceSheet') > 0 &&
      appSource233.indexOf('onPlaceSheetChange={setMapPlaceSheet}') > 0],
  ['v2.33 핀: 지도에서 저장한 핀은 출처가 `지도에서 저장`(platform map)',
    (() => {
      const built = buildLongPressPin233({
        name: '면사랑',
        point: LONG_PRESS_POINT_233,
        place: LONG_PRESS_RESULT_233.places[0],
        address: LONG_PRESS_RESULT_233.address,
        memo: '웨이팅 20분',
        now: new Date('2026-11-18T12:00:00.000Z'),
      });
      return built && built.platform === 'map' && built.category === '맛집' && built.area === '동교동' && built.phone === '02-000-0000' && built.memo === '웨이팅 20분';
    })(),
    ''],
  ['v2.33 핀: 이름·분류 제안(가까운 곳 → 없으면 개인 장소)', suggestedNameOf233(LONG_PRESS_RESULT_233) === '면사랑' && suggestedCategoryOf233(LONG_PRESS_RESULT_233) === '맛집' && suggestedNameOf233({ address: LONG_PRESS_RESULT_233.address, places: [] }) === 'LG팰리스빌딩'],
  ['v2.33 꾹 누르기: DOM 없는 환경(SSR)에서도 안전하게 해제 함수만 돌려준다', typeof bindLongPress(null, {}) === 'function'],
  ['v2.33.1 지도: 꾹 누른 픽셀을 **offset 좌표계로 옮겨** 계산한다(옮긴 지도에서도 그 자리)',
    mapSource233.indexOf('naverCoordAtPress') > 0 &&
      mapSource233.indexOf('pressOffsetPoint') > 0 &&
      mapSource233.indexOf('fromCoordToOffset(map.getCenter())') > 0 &&
      mapSource233.indexOf('getProjection().fromOffsetToCoord(new api.Point') < 0 &&
      mapSource233.indexOf('map.getSize()') > 0],
  ['v2.33.2 버전: 2.33.2 (메뉴 · 앱 정보 · package · app.json · 제보 첨부값)',
    APP_VERSION_LABEL === '릴스핀 v2.40.0' && APP_INFO_VERSION === '릴스핀 v2.40.0' && pkg.version === '2.40.0' && expoConfig.version === '2.40.0' && FEEDBACK_APP_VERSION === '2.40.0'],
  // ── v2.33.2 ✅ 가봤어요 토글 ─────────────────────────────
  ['v2.33.2 시트: `가봤어요` 토글 카드가 있고 기본은 미체크(빈 체크박스 · aria-checked=false)',
    placeSheetHtml233.indexOf('longpress-visited-toggle') > 0 &&
      placeSheetHtml233.indexOf('longpress-visited-box') > 0 &&
      placeSheetHtml233.indexOf('longpress-visited-label') > 0 &&
      /aria-checked="false"/.test(placeSheetHtml233) &&
      placeSheetHtml233.indexOf('가봤어요') > 0 &&
      placeSheetHtml233.indexOf('가봤어요(방문완료)') < 0 &&
      placeSheetHtml233.indexOf('다녀왔으면눌러서체크해두세요') > 0],
  ['v2.33.2 시트: 토글은 이름 칸 아래 · 한줄 메모 위(주소·주변 목록은 그대로)',
    placeSheetHtml233.indexOf('longpress-visited-toggle') > placeSheetHtml233.indexOf('longpress-name-input') &&
      placeSheetHtml233.indexOf('longpress-visited-toggle') < placeSheetHtml233.indexOf('한줄메모') &&
      placeSheetHtml233.indexOf('서울특별시마포구양화로156') > 0 &&
      placeSheetHtml233.indexOf('면사랑') > 0],
  ['v2.33.2 시트: 체크하고 저장하면 핀에 visited=true(+visitedAt)',
    (() => {
      const built = buildLongPressPin233({
        name: '면사랑',
        point: LONG_PRESS_POINT_233,
        place: LONG_PRESS_RESULT_233.places[0],
        address: LONG_PRESS_RESULT_233.address,
        visited: true,
        now: new Date('2026-11-18T12:00:00.000Z'),
      });
      return built && built.visited === true && built.visitedAt === '2026-11-18T12:00:00.000Z';
    })(),
    ''],
  ['v2.33.2 시트: 체크 안 하면 미방문(visited=false) 그대로',
    (() => {
      const built = buildLongPressPin233({
        name: '면사랑',
        point: LONG_PRESS_POINT_233,
        address: LONG_PRESS_RESULT_233.address,
      });
      return built && built.visited === false && built.visitedAt === '';
    })(),
    ''],
  ['v2.33.2 시트: 토글 글은 상세 시트와 같은 결(미체크 `가봤어요` / 체크 `가봤어요 (방문 완료)` · 해제)',
    visitedToggleText233(false).label === '가봤어요' &&
      visitedToggleText233(false).action === '체크' &&
      visitedToggleText233(true).label === '가봤어요 (방문 완료)' &&
      visitedToggleText233(true).action === '해제' &&
      pinDetailSource.indexOf('가봤어요 (방문 완료)') > 0],
  ['v2.33.2 화면: 새 자리를 꾹 누를 때마다 토글이 풀린다(visited 초기화)',
    (() => {
      const src = fs.readFileSync(path.join(process.cwd(), 'src/components/LongPressPlaceSheet.js'), 'utf8');
      return /const \[visited, setVisited\] = useState\(false\)/.test(src) &&
        /setVisited\(false\)/.test(src) &&
        /visited,/.test(src);
    })(),
    ''],
  ['v2.33.2 저장: 핀이 visited 를 그대로 실어 보내고 Supabase 행에도 visited 가 실린다',
    appSource233.indexOf('const markVisited = pin.visited === true') > 0 &&
      appSource233.indexOf('handleTogglePinVisited(existing.id, true)') > 0 &&
      fs.readFileSync(path.join(process.cwd(), 'src/services/cloudSync.js'), 'utf8').indexOf('visited: pin.visited === true') > 0],
  // ── v2.33.3 ✅ 가봤어요 카드와 `분류` 사이 여백 ─────────────
  ['v2.33.3 버전: 2.33.3 (메뉴 · 앱 정보 · package · app.json · 제보 첨부값)',
    APP_VERSION_LABEL === '릴스핀 v2.40.0' && APP_INFO_VERSION === '릴스핀 v2.40.0' && pkg.version === '2.40.0' && expoConfig.version === '2.40.0' && FEEDBACK_APP_VERSION === '2.40.0'],
  ['v2.33.3 시트: 가봤어요 카드 아래 여백이 다른 구역과 같은 14px(`분류` 라벨이 바짝 붙지 않음)',
    (() => {
      const src = fs.readFileSync(path.join(process.cwd(), 'src/components/LongPressPlaceSheet.js'), 'utf8');
      const visitBlock = src.slice(src.indexOf('visitBtn: {'), src.indexOf('visitBtnOn: {'));
      const sectionBlock = src.slice(src.indexOf('\n  section: {'), src.indexOf('sectionTitle: {'));
      const below = Number((visitBlock.match(/marginBottom:\s*(\d+)/) || [])[1]);
      const between = Number((sectionBlock.match(/marginTop:\s*(\d+)/) || [])[1]);
      return below === 14 && between === 14;
    })(),
    ''],
  ['v2.33.3 시트: 순서는 그대로(이름 → 가봤어요 → 분류 → 한줄 메모)',
    placeSheetHtml233.indexOf('longpress-name-input') < placeSheetHtml233.indexOf('longpress-visited-toggle') &&
      placeSheetHtml233.indexOf('longpress-visited-toggle') < placeSheetHtml233.indexOf('분류') &&
      placeSheetHtml233.indexOf('분류') < placeSheetHtml233.indexOf('한줄메모')],
];
for (const [label, ok, extra] of v233Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined && extra !== '' ? '  -> ' + extra : ''));
  }
}

// ── v2.33.4 ✅ 저장 화면(링크·사진·가게명 찾기)에도 `가봤어요` ────────────────
// 상훈 님 요청(2026-11-18): 저장 화면(링크·사진·가게명)에도 ✅ 가봤어요 를.
//   · 결과 카드의 `저장할 분류` 바로 **위**에 같은 결의 카드(기본 미체크)
//   · 체크하면 이번에 저장하는 **모든 핀**이 visited=true (+visitedAt)
//   · 새 검색·추출·사진·탭 이동·저장 뒤에는 미체크로 풀림
const pasteVisitedOff334 = stripSpaces(renderToString(<VisitedToggleCard visited={false} />));
const pasteVisitedOn334 = stripSpaces(
  renderToString(
    <VisitedToggleCard
      visited
      testID="paste-visited-toggle"
      boxTestID="paste-visited-box"
      labelTestID="paste-visited-label"
    />
  )
);
const pasteSource334 = fs.readFileSync(path.join(process.cwd(), 'src/screens/PasteScreen.js'), 'utf8');
const saveResultSource334 = fs.readFileSync(path.join(process.cwd(), 'src/utils/saveResult.js'), 'utf8');
const PASTE_CANDIDATES_334 = [
  { id: 'c1', name: '블루스모크', area: '성수동', address: '서울 성동구 성수동2가 1', lat: 37.5445, lng: 127.0557, category: '맛집', providers: ['kakao'] },
  { id: 'c2', name: '베통', area: '성수동', address: '서울 성동구 연무장길 21', lat: 37.5427, lng: 127.0558, category: '베이커리', providers: ['kakao', 'naver'] },
];
const PASTE_AT_334 = new Date('2026-11-18T13:00:00.000Z');
const pastePinsVisited334 = buildResultPins334(PASTE_CANDIDATES_334, {
  category: '맛집',
  platform: 'search',
  visited: true,
  now: PASTE_AT_334,
});
const pastePinsPlain334 = buildResultPins334(PASTE_CANDIDATES_334, {
  category: '맛집',
  platform: 'search',
  now: PASTE_AT_334,
});

const v2334Checks = [
  ['v2.33.4 카드: 기본은 미체크(`가봤어요` · `다녀왔으면 눌러서 체크해 두세요` · `체크` · aria-checked=false)',
    pasteVisitedOff334.indexOf('aria-checked="false"') > 0 &&
      pasteVisitedOff334.indexOf('가봤어요') > 0 &&
      pasteVisitedOff334.indexOf('가봤어요(방문완료)') < 0 &&
      pasteVisitedOff334.indexOf('다녀왔으면눌러서체크해두세요') > 0 &&
      pasteVisitedOff334.indexOf('체크') > 0],
  ['v2.33.4 카드: 체크하면 `가봤어요 (방문 완료)` · `저장하면 방문 완료로 표시돼요` · `해제` (aria-checked=true)',
    pasteVisitedOn334.indexOf('aria-checked="true"') > 0 &&
      pasteVisitedOn334.indexOf('가봤어요(방문완료)') > 0 &&
      pasteVisitedOn334.indexOf('저장하면방문완료로표시돼요') > 0 &&
      pasteVisitedOn334.indexOf('해제') > 0],
  ['v2.33.4 저장 화면: 결과 카드의 `저장할 분류` 바로 위에 가봤어요 카드가 있다',
    pasteSource334.indexOf('<VisitedToggleCard') > 0 &&
      pasteSource334.indexOf('<VisitedToggleCard') < pasteSource334.indexOf('<CategoryPicker') &&
      pasteSource334.indexOf('testID="paste-visited-toggle"') > 0 &&
      pasteSource334.indexOf('boxTestID="paste-visited-box"') > 0 &&
      pasteSource334.indexOf('labelTestID="paste-visited-label"') > 0],
  ['v2.33.4 저장 화면: 카드가 `저장할 분류`/한줄 메모/저장 버튼을 밀어내지 않는다(순서 그대로)',
    pasteSource334.indexOf('<CategoryPicker') < pasteSource334.indexOf('paste-memo-input') &&
      pasteSource334.indexOf('paste-memo-input') < pasteSource334.indexOf('paste-save-button')],
  ['v2.33.4 저장 화면: 기본 미체크 + 새 결과·탭 이동·저장 뒤에 풀린다',
    /const \[visited, setVisited\] = useState\(false\)/.test(pasteSource334) &&
      (pasteSource334.match(/setVisited\(false\)/g) || []).length >= 5,
    String((pasteSource334.match(/setVisited\(false\)/g) || []).length)],
  ['v2.33.4 저장: 체크하면 저장하는 모든 핀에 visited=true + visitedAt(같은 시각)',
    pastePinsVisited334.length === 2 &&
      pastePinsVisited334.every((p) => p.visited === true && p.visitedAt === PASTE_AT_334.toISOString()) &&
      pastePinsVisited334[0].id !== pastePinsVisited334[1].id,
    JSON.stringify(pastePinsVisited334.map((p) => [p.visited, p.visitedAt, p.id]))],
  ['v2.33.4 저장: 체크 안 하면 미방문(visited=false) 그대로',
    pastePinsPlain334.every((p) => p.visited === false && p.visitedAt === ''),
    JSON.stringify(pastePinsPlain334.map((p) => [p.visited, p.visitedAt]))],
  ['v2.33.4 저장 화면: 세 탭이 같은 저장 페이로드(buildResultPins)를 쓴다',
    pasteSource334.indexOf('buildResultPins(selectedCandidates') > 0 &&
      saveResultSource334.indexOf('export function buildResultPins') > 0 &&
      saveResultSource334.indexOf('visited,') > 0],
  ['v2.33.4 저장: 이미 지도에 있는 곳에 체크해 저장하면 그 핀만 방문 완료로',
    appSource233.indexOf('let markedVisited = 0') > 0 &&
      appSource233.indexOf('item.pin.visited === true && existing.visited !== true') > 0 &&
      appSource233.indexOf('handleTogglePinVisited(existing.id, true)') > 0],
  ['v2.33.4 버전: 2.33.4 (메뉴 · 앱 정보 · package · app.json · 제보 첨부값)',
    APP_VERSION_LABEL === '릴스핀 v2.40.0' && APP_INFO_VERSION === '릴스핀 v2.40.0' && pkg.version === '2.40.0' && expoConfig.version === '2.40.0' && FEEDBACK_APP_VERSION === '2.40.0'],
];
for (const [label, ok, extra] of v2334Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined && extra !== '' ? '  -> ' + extra : ''));
  }
}

// ── v2.34.0 — 가게명 찾기 정렬(정확도 → 거리순) · 상세 시트 아래로 쓸어내려 닫기 ──
const sheetSource234 = fs.readFileSync(path.join(process.cwd(), 'src/components/PinDetailSheet.js'), 'utf8');
const pasteSource234 = fs.readFileSync(path.join(process.cwd(), 'src/screens/PasteScreen.js'), 'utf8');
const appSource234 = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
const extractorSource234 = fs.readFileSync(path.join(process.cwd(), 'src/services/extractor.js'), 'utf8');
const v234Checks = [
  ['v2.34.0 시트: 헤더(pin-sheet-header)에 아래로 끄는 제스처',
    sheetSource234.indexOf('PanResponder.create') > 0 &&
      /testID="pin-sheet-header"[\s\S]{0,200}\{...sheetPan\.panHandlers\}/.test(sheetSource234)],
  ['v2.34.0 시트: 손가락을 따라 내려오고(translateY) 모자라면 스프링으로 복귀',
    sheetSource234.indexOf('new Animated.Value(0)') > 0 &&
      sheetSource234.indexOf('transform: [{ translateY }]') > 0 &&
      sheetSource234.indexOf('Animated.spring') > 0 &&
      sheetSource234.indexOf('shouldDismissSheet(') > 0],
  ['v2.34.0 시트: 본문은 스크롤 맨 위에서만 당김 · ✕ 탭은 움직임 전까지 그대로',
    sheetSource234.indexOf('scrollYRef.current <= 0') > 0 &&
      sheetSource234.indexOf('gesture.dy > 6') > 0 &&
      sheetSource234.indexOf('gesture.dy > 12') > 0],
  ['v2.34.0 시트: 웹 아이폰 사파리 touch-action none',
    sheetSource234.indexOf("touchAction: 'none'") > 0],
  ['v2.34.0 검색: 저장 화면이 내 위치를 넘기고 결과를 정확도·거리순으로',
    /searchPlacesDirect\(value, \{ limit: MAX_DIRECT_CANDIDATES, near \}\)/.test(pasteSource234) &&
      pasteSource234.indexOf('usableOrigin(myCoords)') > 0 &&
      extractorSource234.indexOf('rankPlaceCandidates(candidates, query, origin)') > 0],
  ['v2.34.0 검색: 카드에 거리(`450m`)를 그리고, 위치를 모르면 그리지 않는다',
    pasteSource234.indexOf('formatDistance(c.distanceM)') > 0 &&
      pasteSource234.indexOf('Number.isFinite(Number(c.distanceM))') > 0 &&
      pasteSource234.indexOf('paste-cand-distance-') > 0],
  ['v2.34.0 검색: 정확도 15곳 밖 내 주변 지점까지 20km 가까운 순으로 한 번 더',
    extractorSource234.indexOf('DIRECT_SEARCH_NEARBY_RADIUS_M = 20000') > 0 &&
      extractorSource234.indexOf('mergeNearbyCandidates') > 0],
  ['v2.34.0 검색: App 이 지도 탭 현재 위치를 저장 화면에 넘긴다',
    /myCoords=\{alertCoords\}/.test(appSource234)],
  ['v2.34.0 버전: 2.34.0 (메뉴 · 앱 정보 · package · app.json · 제보 첨부값)',
    APP_VERSION_LABEL === '릴스핀 v2.40.0' && APP_INFO_VERSION === '릴스핀 v2.40.0' && pkg.version === '2.40.0' && expoConfig.version === '2.40.0' && FEEDBACK_APP_VERSION === '2.40.0'],
];
for (const [label, ok, extra] of v234Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined && extra !== '' ? '  -> ' + extra : ''));
  }
}

// ── v2.35.0: 지도 상단 통합 검색창(내 핀 + 새 장소 찾기) ─────────────
//   상훈 님: "써보다보니 바로 검색하고 싶으면 몇 단계 찾아 들어가는 게 좀 불편하긴 하네"
const mapSource235 = fs.readFileSync(path.join(process.cwd(), 'src/screens/MapScreen.js'), 'utf8');
const headerSource235 = fs.readFileSync(path.join(process.cwd(), 'src/components/AppHeader.js'), 'utf8');
const appSource235 = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
const pasteSource235 = fs.readFileSync(path.join(process.cwd(), 'src/screens/PasteScreen.js'), 'utf8');
const barSource235 = fs.readFileSync(path.join(process.cwd(), 'src/components/MapSearchBar.js'), 'utf8');
const panelSource235 = fs.readFileSync(path.join(process.cwd(), 'src/components/MapSearchPanel.js'), 'utf8');
const resultsSource235 = fs.readFileSync(path.join(process.cwd(), 'src/components/PinSearchResults.js'), 'utf8');
const mapHtml235 = stripSpaces(
  renderToString(
    <MapScreen pins={SEED_PINS} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} onSearchNewPlace={noop} />
  )
);

// v2.37.0 — 레이어 팝업 상단 그립 막대: 실제 렌더에서 맨 위에 그려지는지
const layerSource2361 = fs.readFileSync(path.join(process.cwd(), 'src/components/LayerSheet.js'), 'utf8');
const layerHtml2361 = renderToString(<MenuDrawerModal visible pins={SEED_PINS} onClose={noop} />);
const alertHtml2361 = renderToString(
  <AlertInbox visible pins={ALERT_PINS} myCoords={ALERT_ORIGIN} onClose={noop} onOpenPin={noop} />
);

// v2.37.0 — 분류 추가할 때 색상 지정: 실제 렌더에서 10색 팔레트가 그려지는지
const profileColorHtml = renderToString(
  <ProfileScreen
    initialSub="categories"
    name="이상훈"
    handle="odol"
    pins={SEED_PINS.concat([{ ...SEARCH_PIN, id: 'custom-1', category: '아이랑' }])}
    categories={['맛집', '카페', '가볼곳', '아이랑']}
    radiusMeters={300}
    onChangeRadius={noop}
    isPro={false}
    onStartPro={noop}
    onGoPaste={noop}
    onToast={noop}
    onAddCategory={noop}
    onRenameCategory={noop}
    onRemoveCategory={noop}
  />
);
const swatchHtml = renderToString(
  <CategoryColorPicker value="#EF4444" onChange={noop} testIDPrefix="category-manager-color" />
);
const pickerSourceColor = fs.readFileSync(path.join(process.cwd(), 'src/components/CategoryPicker.js'), 'utf8');

const v235Checks = [
  // ① 검색창 모양·문구
  ['v2.35.0 검색창: 알약 높이 40~44px 안(42px) · 안내문구 `내 핀 · 새 장소 검색`',
    MAP_SEARCH_BAR_HEIGHT >= 40 && MAP_SEARCH_BAR_HEIGHT <= 44 && MAP_SEARCH_PLACEHOLDER === '내 핀 · 새 장소 검색' && barSource235.indexOf('height: MAP_SEARCH_BAR_HEIGHT') > 0],
  ['v2.35.0 검색창: 반투명 흰색 · 그림자 · 좌우 16px',
    barSource235.indexOf('rgba(255,255,255,0.96)') > 0 && barSource235.indexOf('shadowOpacity') > 0 && barSource235.indexOf('marginHorizontal: 16') > 0],
  ['v2.35.0 검색창: 입력이 있을 때만 ✕ 지우기',
    barSource235.indexOf('hasValue &&') > 0 && barSource235.indexOf('testID="map-search-clear"') > 0 && barSource235.indexOf('accessibilityLabel="검색어 지우기"') > 0],
  // ② 배치 — 헤더 🔍 제거 + 분류 칩 바로 위
  ['v2.35.0 헤더: 🔍 돋보기 제거 · 🔔 ☰ 유지',
    headerSource235.indexOf('header-search') < 0 && headerSource235.indexOf('testID="header-alerts"') > 0 && headerSource235.indexOf('testID="header-menu"') > 0],
  ['v2.35.0 지도: 검색창이 분류 칩 바로 위(같은 오버레이)',
    mapSource235.indexOf('<MapSearchBar') > 0 && mapSource235.indexOf('<MapSearchBar') < mapSource235.indexOf('<FilterChips') && mapSource235.indexOf('styles.topOverlay') < mapSource235.indexOf('<MapSearchBar')],
  ['v2.35.0 지도: 그린 화면에 검색 인풋 + 안내문구',
    mapHtml235.indexOf('map-search-input') > 0 && mapHtml235.indexOf(stripSpaces(MAP_SEARCH_PLACEHOLDER)) > 0],
  // ③ 통합 검색 동작
  ['v2.35.0 검색: 입력하면 내 핀 결과 드롭다운(지도·상세 시트 상태 규칙)',
    shouldShowMapSearchPanel({ view: 'map', query: '한성', selected: false }) === true &&
      shouldShowMapSearchPanel({ view: 'map', query: '   ', selected: false }) === false &&
      shouldShowMapSearchPanel({ view: 'list', query: '한성', selected: false }) === false &&
      shouldShowMapSearchPanel({ view: 'map', query: '한성', selected: true }) === false],
  ['v2.35.0 검색: 결과 목록은 기존 PinSearchResults 재사용',
    panelSource235.indexOf("from './PinSearchResults'") > 0 && resultsSource235.indexOf('testID="pin-search-results"') > 0 && resultsSource235.indexOf('pin-result-row-') > 0],
  ['v2.35.0 검색: 행을 누르면 그 핀으로 지도 이동 + 상세 시트',
    mapSource235.indexOf('onOpenPin={openPinFromList}') > 0 && /const openPinFromList = useCallback\([\s\S]{0,500}?onSelectPin\(pin.id\)/.test(mapSource235)],
  ['v2.35.0 검색: 결과 아래(0곳일 때도) `‘검색어’ 가게명으로 찾아 등록하기`',
    newPlaceSearchLabel('한성') === '‘한성’ 가게명으로 찾아 등록하기' &&
      panelSource235.indexOf('newPlaceSearchLabel(keyword)') > 0 &&
      panelSource235.indexOf('emptyHint') > 0 &&
      resultsSource235.indexOf('{footer ? <View style={styles.footer}>{footer}</View> : null}') > 0],
  ['v2.35.0 검색: 새 장소 찾기 → 저장 탭 가게명 찾기 즉시 실행(auto)',
    JSON.stringify(pasteSearchRequest('  한성 ')) === JSON.stringify({ mode: 'search', query: '한성', auto: true }) &&
      pasteSearchRequest('   ') === null &&
      appSource235.indexOf('pasteSearchRequest(query)') > 0 &&
      mapSource235.indexOf('onSearchNewPlace={searchNewPlace}') > 0 &&
      pasteSource235.indexOf('request.auto') > 0 &&
      pasteSource235.indexOf('runSearch(wantedQuery)') > 0],
  ['v2.35.0 검색: 바깥 탭·✕ → 검색어 비우고 지도로 복귀',
    mapSource235.indexOf('map-search-backdrop') > 0 && mapSource235.indexOf('onPress={clearSearch}') > 0 && mapSource235.indexOf('onClear={clearSearch}') > 0],
  ['v2.35.0 지도: 검색 결과가 지도 여백(SEARCH_RESULT_PADDING.top)을 넘지 않게',
    fs.readFileSync(path.join(process.cwd(), 'src/utils/searchNav.js'), 'utf8').indexOf('top: 260') > 0],
  // v2.36.1 — 레이어 팝업 상단 그립 막대(쓸어내려 닫힘을 보여 주는 막대)
  ['v2.36.1 막대: 내 정보 시트 맨 위(헤더 줄 바로 앞)에 그립 막대가 실제로 그려진다(menu-drawer-handle)',
    layerHtml2361.indexOf('data-testid="menu-drawer-handle"') > 0 &&
      layerHtml2361.indexOf('data-testid="menu-drawer-handle"') > layerHtml2361.indexOf('data-testid="menu-drawer-header"') &&
      layerHtml2361.indexOf('data-testid="menu-drawer-handle"') < layerHtml2361.indexOf('data-testid="menu-drawer-close"') &&
      layerHtml2361.indexOf('data-testid="menu-drawer-handle"') < layerHtml2361.indexOf('data-testid="menu-profile-body"')],
  ['v2.36.1 막대: 알림 모음도 같은 틀이라 같은 자리에 막대가 그려진다(alert-inbox-handle)',
    layerSource2361.indexOf('style={styles.handle}') > 0 &&
      layerSource2361.indexOf('style={styles.handle}') < layerSource2361.indexOf('styles.headRow') &&
      alertHtml2361.indexOf('data-testid="alert-inbox-handle"') > 0],
  // v2.37.0 — 분류 추가할 때 색상 지정 (내 정보 → 분류 관리 · 저장·상세의 [분류 추가])
  ['v2.36.2 분류 색: 내 정보 분류 관리에 10색 팔레트가 실제로 그려진다',
    (profileColorHtml.match(/data-testid="category-manager-color-[0-9a-f]{6}"/g) || []).length === 10,
    String((profileColorHtml.match(/data-testid="category-manager-color-[0-9a-f]{6}"/g) || []).length)],
  ['v2.36.2 분류 색: 고른 색 하나만 체크(aria-checked=true)로 표시된다',
    (swatchHtml.match(/aria-checked="true"/g) || []).length === 1 &&
      /aria-checked="true"[^>]*data-testid="category-manager-color-ef4444"/.test(swatchHtml)],
  ['v2.36.2 분류 색: 읽어 주는 이름이 붙는다(분류 색 빨강 · 분류 색 보라)',
    swatchHtml.indexOf('분류 색 빨강') > 0 && swatchHtml.indexOf('분류 색 보라') > 0],
  ['v2.36.2 분류 색: 저장·상세 CategoryPicker [분류 추가] 도 같은 팔레트를 연다(소스)',
    pickerSourceColor.indexOf('<CategoryColorPicker') > 0 && pickerSourceColor.indexOf('category-add-color') > 0],
  // ④ 버전
  ['버전: 2.40.0 (메뉴 · 앱 정보 · package · app.json · 제보 첨부값)',
    APP_VERSION_LABEL === '릴스핀 v2.40.0' && APP_INFO_VERSION === '릴스핀 v2.40.0' && pkg.version === '2.40.0' && expoConfig.version === '2.40.0' && FEEDBACK_APP_VERSION === '2.40.0'],
];
for (const [label, ok, extra] of v235Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined && extra !== '' ? '  -> ' + extra : ''));
  }
}

// ── v2.37.0 — 🐛 장소 상세 시트 잘림 · 목록 칩 중복 · 상세 분류 칩 선택 표시 ─────
const sheetSource237 = fs.readFileSync(path.join(process.cwd(), 'src/components/PinDetailSheet.js'), 'utf8');
const visitChipsSource237 = fs.readFileSync(path.join(process.cwd(), 'src/components/VisitFilterChips.js'), 'utf8');
const listSource237 = fs.readFileSync(path.join(process.cwd(), 'src/components/PinListView.js'), 'utf8');
// 옛 업종 이름(베이커리) 핀 · 내 목록에 없는 분류(아이랑) 핀
const legacyDetailHtml = stripSpaces(
  renderToString(
    <PinDetailSheet
      pin={{ ...SEARCH_PIN, category: '베이커리', visited: false, memo: '' }}
      radiusMeters={300}
      onClose={noop}
      onDelete={noop}
      onToast={noop}
    />
  )
);
const unknownDetailHtml = stripSpaces(
  renderToString(
    <PinDetailSheet
      pin={{ ...SEARCH_PIN, category: '아이랑', visited: false, memo: '' }}
      radiusMeters={300}
      onClose={noop}
      onDelete={noop}
      onToast={noop}
    />
  )
);

const v37Checks = [
  // ① 장소 상세 시트 — 첫 줄부터 끝까지 시트 안에 (390×844)
  ['v2.37.0 상세 시트: 최대 높이 92% 로 키우고 본문은 헤더 아래 남은 높이에서만 스크롤',
    sheetSource237.indexOf("maxHeight: '92%'") > 0 &&
      sheetSource237.indexOf('flexShrink: 1') > 0 &&
      sheetSource237.indexOf('minHeight: 0') > 0],
  ['v2.37.0 상세 시트: 다른 핀으로 바뀌면 본문 스크롤을 실제로 맨 위로 되돌린다',
    /scrollTo\(\{\s*y:\s*0,\s*animated:\s*false\s*\}\)/.test(sheetSource237) &&
      sheetSource237.indexOf('scrollRef.current') > 0],
  ['v2.37.0 상세 시트: 토스트 자리도 새 시트 높이·헤더(66px)에 맞춰 내려온다',
    SHEET_MAX_HEIGHT_RATIO === 0.92 && SHEET_HEADER_HEIGHT === 66 && toastTopBelowSheetHeader(844) === 146],
  // ② 옛 업종 이름(베이커리·디저트)도 분류 칩이 선택된 상태로
  ['v2.37.0 상세: 베이커리 핀은 `맛집` 배지 + 맛집 칩이 켜져 있다(체크 표시 1개)',
    legacyDetailHtml.indexOf('category-chip-맛집') > 0 &&
      legacyDetailHtml.indexOf('category-chip-베이커리') < 0 &&
      legacyDetailHtml.indexOf('>베이커리<') < 0 &&
      (legacyDetailHtml.match(/\[checkmark\]/g) || []).length === 1 &&
      legacyDetailHtml.indexOf('[checkmark]') < legacyDetailHtml.indexOf('category-chip-카페')],
  ['v2.37.0 상세: 내 목록에 없는 분류(공유 핀)도 칩이 생기고 켜져 있다',
    unknownDetailHtml.indexOf('category-chip-아이랑') > 0 &&
      (unknownDetailHtml.match(/\[checkmark\]/g) || []).length === 1 &&
      unknownDetailHtml.indexOf('category-chip-아이랑') > unknownDetailHtml.indexOf('category-chip-가볼곳')],
  ['v2.37.0 방문 필터: 목록이 `전체` 칩을 빼고 첫 줄의 `전체 N` 과 겹치지 않게 그린다',
    listSource237.indexOf('showAll={false}') > 0 && listSource237.indexOf('rowLabel="방문"') > 0 &&
      visitChipsSource237.indexOf('VISIT_CHIP_LABELS') > 0],
];
for (const [label, ok, extra] of v37Checks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined && extra !== '' ? '  -> ' + extra : ''));
  }
}

const total =
  cases.length +
  contentCases.length +
  1 +
  mapChecks.length +
  placeChecks.length +
  v2Checks.length +
  v21Checks.length +
  v211Checks.length +
  v212Checks.length +
  v23Checks.length +
  fakeBannerChecks.length +
  2 +
  v213Checks.length +
  v22Checks.length +
  v24Checks.length +
  pwaChecks.length +
  assetChecks.length +
  brandChecks.length +
  v210Checks.length +
  v211HeaderChecks.length +
  v213PhotoChecks.length +
  v213SheetChecks.length +
  v214Checks.length +
  v214RenderChecks.length +
  v2141Checks.length +
  v215Checks.length +
  v216Checks.length +
  v217Checks.length +
  v2171Checks.length +
  v218Checks.length +
  v219Checks.length +
  v2191Checks.length +
  v2192Checks.length +
  v220Checks.length +
  v2201Checks.length +
  v2202Checks.length +
  v221Checks.length +
  v223Checks.length +
  v224Checks.length +
  v225Checks.length +
  // v2.28.0 — 상세 시트 열린 동안 하단 탭바 숨김 + 반경 500m 3초 토스트
  v228Checks.length +
  v228RuleChecks.length +
  // v2.31.0 — 상단 [카카오]·[네이버] 배지 = 외부 지도 링크 (하단 칩 삭제)
  v230Checks.length +
  // v2.31 — 🗂️ 컬렉션 기획전·공유 링크 · 📌 어드민 기획전·배너
  v231Checks.length +
  // v2.32.0 — 컬렉션 탭 다듬기(제목 크기 통일 · 개수·`곳 담김` 제거 · 가로 스와이프)
  v2311Checks.length +
  // v2.32 — 컬렉션 탭 사진형 큐레이션 피드 · 테마 칩 · 슬림 배너 · 어드민 썸네일
  v232Checks.length +
  // v2.32.1 — 🙈 컬렉션 탭 추천 기획전 숨김(내 컬렉션만) · /admin·공유는 그대로
  v2321Checks.length +
  // v2.32.2 — 🧹 레이어 팝업 헤더 부텍스트 제거 · 🔔 토스트 6초
  v2322Checks.length +
  // v2.33.0 — 📍 지도 꾹 눌러 장소 등록
  v233Checks.length +
  // v2.33.4 — ✅ 저장 화면(링크·사진·가게명)에도 `가봤어요`
  v2334Checks.length +
  // v2.34.0 — 가게명 찾기 정확도·거리순 · 상세 시트 아래로 쓸어내려 닫기
  v234Checks.length +
  // v2.35.0 — 지도 상단 통합 검색창(내 핀 + 새 장소 찾기)
  v235Checks.length +
  v37Checks.length +
  2;
if (failed) { console.log('SMOKE_FAILED=' + failed); process.exit(1); }
console.log('SMOKE_OK ' + total + '/' + total);
