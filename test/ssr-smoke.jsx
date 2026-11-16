import React from 'react';
import { renderToString } from 'react-dom/server';
import App from '../App';
import MapScreen from '../src/screens/MapScreen';
import PasteScreen from '../src/screens/PasteScreen';
import ProfileScreen from '../src/screens/ProfileScreen';
import PinDetailSheet from '../src/components/PinDetailSheet';
import ProviderBadges from '../src/components/ProviderBadge';
import ExtractedTitleNote from '../src/components/ExtractedTitleNote';
import GeofenceBanner, {
  DISMISS_SWIPE_DISTANCE,
  shouldShowBanner,
  swipeDismissDecision,
} from '../src/components/GeofenceBanner';
import FilterChips from '../src/components/FilterChips';
// v2.17 — 지도 왼쪽 하단 펌찄 메뉴(가본 곳만 보기 · 지도 공유하기)
import MapToolsMenu, { TOOLS_ANIM_MS, TOOLS_TOGGLE_SIZE, toolsSummary } from '../src/components/MapToolsMenu';
import CategoryPicker from '../src/components/CategoryPicker';
// v2.5 — 🔍 내 핀 검색 · 📋 목록 보기
import PinSearchBar from '../src/components/PinSearchBar';
import PinListView from '../src/components/PinListView';
import PinSearchResults from '../src/components/PinSearchResults';
import TabBar from '../src/components/TabBar';
// v2.15 — 전 탭 공통 상단 다크 헤더 · 🔔 알림 모음
// v2.16 — 호갱노노처럼 헤더(🔍 · 🔔 · ☰) + 🔍 검색 레이어 팝업 · ☰ 메뉴 시트
import AppHeader, { HEADER_ACTIONS, alertBadgeLabel, HEADER_TABS } from '../src/components/AppHeader';
import AlertInbox from '../src/components/AlertInbox';
import SearchOverlayModal from '../src/components/SearchOverlayModal';
import MenuDrawerModal, { APP_VERSION_LABEL } from '../src/components/MenuDrawerModal';
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
import { injectPwaHead, PWA_REQUIRED_MARKERS, PWA_APP_TITLE } from '../scripts/patch-web-html.mjs';
import { colors, mapControls } from '../src/theme';
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
  ['GeofenceBanner', <GeofenceBanner pin={SEED_PINS[0]} radiusMeters={1000} onPress={noop} title="반경 1km 앞, 저장한 맛집이 있어요" sub={SEED_PINS[0].name} badge="지금" />],
  ['GeofenceBanner(내 위치 전 안내)', <GeofenceBanner needsLocation onPress={noop} onLocate={noop} radiusMeters={500} />],
  ['FilterChips', <FilterChips value="전체" onChange={noop} counts={{ 전체: 4 }} />],
  ['TabBar', <TabBar active="map" onChange={noop} />],
  ['MapCanvas', <MapCanvas pins={SEED_PINS} selectedId={SEED_PINS[0].id} onSelect={noop} radius={300} />],
  // v1.5 — Leaflet 지도(웹)가 node 렌더에서 window/document 를 건드리지 않는지
  ['RealMapView.web(SSR 안전)', <RealMapViewWeb pins={SEED_PINS} selectedId={SEED_PINS[0].id} onSelect={noop} myCoords={{ lat: 37.5824, lng: 126.7144 }} radiusMeters={500} />],
  ['RealMapView.web(핀 없음)', <RealMapViewWeb pins={[]} selectedId={null} onSelect={noop} />],
  ['PinDetailSheet(내 위치 거리)', <PinDetailSheet pin={SEED_PINS[0]} radiusMeters={300} distanceMeters={320} onClose={noop} onDelete={noop} onToast={noop} />],
  ['GeofenceBanner(반경 500m 실시간)', <GeofenceBanner pin={SEED_PINS[0]} radiusMeters={500} onPress={noop} title="반경 500m 앞, 저장한 맛집이 있어요" sub={SEED_PINS[0].name + ' · 320m'} badge="지금" />],
  ['GeofenceBanner(가장 가까운 곳)', <GeofenceBanner pin={SEED_PINS[3]} radiusMeters={500} onPress={noop} title={'가장 가까운 저장 장소: ' + SEED_PINS[3].name} sub="2.4km · 반경 500m 밖" badge="내 위치" tone="muted" />],
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
  ['PinListView', <PinListView pins={SEED_PINS} categories={['맛집', '카페', '가볼곳', '아이랑']} filter="전체" counts={{ '전체': 4 }} myCoords={{ lat: 37.5828, lng: 126.7141 }} onSelectPin={noop} onToggleView={noop} onChangeFilter={noop} onQueryChange={noop} />],
  ['PinListView(검색 결과 없음)', <PinListView pins={[]} query="없는가게" filter="전체" myCoords={null} onSelectPin={noop} onToggleView={noop} onClearQuery={noop} />],
  ['PinListView(핀 없음 · 위치 없음)', <PinListView pins={[]} filter="전체" myCoords={null} onSelectPin={noop} onToggleView={noop} onGoPaste={noop} />],
  // v2.6 — 검색 결과 2곳 이상이면 지도 위 콤팩트 결과 목록
  ['PinSearchResults(검색 결과 2곳)', <PinSearchResults pins={SEARCH_PINS} query="한성" categories={['맛집', '카페']} myCoords={{ lat: 37.5828, lng: 126.7141 }} onOpenPin={noop} onShowAll={noop} />],
  ['PinSearchResults(최대 4행만)', <PinSearchResults pins={SEARCH_PINS} query="" max={1} onOpenPin={noop} onShowAll={noop} />],
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
  ['MapScreen: 목록 보기 · 주변 500m 버튼', <MapScreen pins={SEED_PINS} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} />, ['주변 500m', '목록 보기']],
  ['PinDetailSheet: 내 위치에서의 실제 거리', <PinDetailSheet pin={SEED_PINS[0]} radiusMeters={300} distanceMeters={321.4} onClose={noop} onDelete={noop} onToast={noop} />, ['내 위치에서 321m']],
  ['GeofenceBanner: 500m 실시간 배너 문구', <GeofenceBanner pin={SEED_PINS[0]} radiusMeters={500} onPress={noop} title="반경 500m 앞, 저장한 맛집이 있어요" sub={SEED_PINS[0].name + ' · 320m'} />, ['반경 500m 앞, 저장한 맛집이 있어요', '320m']],
  ['GeofenceBanner: 반경 밖 가장 가까운 곳', <GeofenceBanner pin={SEED_PINS[3]} radiusMeters={500} onPress={noop} title={'가장 가까운 저장 장소: ' + SEED_PINS[3].name} sub="2.4km · 반경 500m 밖" badge="내 위치" tone="muted" />, ['가장 가까운 저장 장소', '2.4km']],
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
  ['InAppPlaceModal.web: placeId 있으면 상세 페이지 직행', <InAppPlaceModalWeb pin={{ ...SEARCH_PIN, naverPlaceId: '1736095566' }} onClose={noop} onToast={noop} />, ['m.place.naver.com/place/1736095566/home']],
  // v2.1 — 계정 · 클라우드 동기화 카드
  ['ProfileScreen: 계정 카드 + 로그인/회원가입 전환', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured cloudUser={null} onSignIn={noop} onSignUp={noop} onMagicLink={noop} onOAuth={noop} onSignOut={noop} onSyncNow={noop} />, ['계정 · 클라우드 동기화', '로그인', '회원가입']],
  ['ProfileScreen: 매직링크 안내', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured cloudUser={null} onMagicLink={noop} />, ['매직링크']],
  ['ProfileScreen: 소셜 로그인 3개(카카오·구글·Apple)', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured cloudUser={null} onOAuth={noop} />, ['카카오', '구글', 'Apple']],
  ['ProfileScreen(미설정): 기기 안에만 저장 안내', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured={false} cloudUser={null} />, ['지금은 기기 안에만 저장돼요', 'SUPABASE_URL']],
  ['ProfileScreen(로그인 후): 이메일·동기화 켜짐·N개', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured cloudUser={{ id: 'u-1', email: 'andy@example.com' }} cloudPinCount={7} onSyncNow={noop} onSignOut={noop} />, ['andy@example.com', '클라우드 동기화 켜짐', '개 저장됨', '지금 동기화', '로그아웃', '기기 + 클라우드(Supabase)']],
  ['ProfileScreen(로그인 후): 동기화 실패 안내', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured cloudUser={{ id: 'u-1', email: 'a@b.com' }} cloudPinCount={3} cloudMessage="클라우드 저장 실패 · 기기에는 저장돼 있어요" />, ['기기에는 저장돼 있어요']],
  // v2.1.1 — 클립보드는 사용자가 버튼을 눌렀을 때만 (아이폰 사파리 붙여넣기 팝업 방지)
  ['PasteScreen: [클립보드에서 붙여넣기] 버튼', <PasteScreen pinCount={4} isPro={false} onSaved={noop} onSavedMany={noop} onClose={noop} onGoProfile={noop} onToast={noop} />, ['클립보드에서 붙여넣기']],
  ['PasteScreen: 링크 입력 + 붙여넣기 버튼 렌더', <PasteScreen pinCount={4} isPro={false} onSaved={noop} onSavedMany={noop} onClose={noop} onGoProfile={noop} onToast={noop} />, ['릴스 · 쇼츠 링크', '클립보드에서 붙여넣기']],
  // v2.14 — 📸 사진으로 찾기 탭 (웹 = react-native-web 렌더에서 탭·카드·버튼이 보입니다)
  ['PasteScreen(사진으로 찾기): 업로드 카드 + 큰 버튼', <PasteScreen pinCount={4} isPro={false} initialMode="photo" onSaved={noop} onSavedMany={noop} onClose={noop} onGoProfile={noop} onToast={noop} />, ['인스타 캡처·스크린샷 올리기', '사진 속 가게 이름과 동네를 AI가 읽어', '사진·캡처 고르기']],
  // v2.2 — 분류 직접 고르기 · 만들기 · 관리
  ['CategoryPicker: 기본 3개 + 내 분류 + [분류 추가]', <CategoryPicker value="아이랑" onChange={noop} categories={['맛집', '카페', '가볼곳', '아이랑']} onAddCategory={noop} label="저장할 분류" hint="고른 분류로 저장해요" />, ['맛집', '카페', '가볼곳', '아이랑', '분류 추가', '저장할 분류', '고른 분류로 저장해요']],
  ['FilterChips: 커스텀 분류가 이어서 + 개수', <FilterChips value="아이랑" onChange={noop} categories={['맛집', '카페', '가볼곳', '아이랑']} counts={{ '전체': 6, '맛집': 3, '아이랑': 1 }} />, ['아이랑 1', '아이랑 필터']],
  ['MapScreen: 커스텀 분류 칩', <MapScreen pins={SEED_PINS.concat([{ ...SEARCH_PIN, id: 'custom-1', category: '아이랑' }])} categories={['맛집', '카페', '가볼곳', '아이랑']} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} onChangePinCategory={noop} onAddCategory={noop} />, ['아이랑 1']],
  ['PinDetailSheet: 분류 칩으로 바로 변경', <PinDetailSheet pin={{ ...SEARCH_PIN, category: '아이랑' }} categories={['맛집', '카페', '가볼곳', '아이랑']} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} onChangeCategory={noop} onAddCategory={noop} />, ['누르면 바로 바뀌어요', '분류 추가', '분류 아이랑']],
  ['PinDetailSheet: 공유받은 핀은 분류 변경 없음', <PinDetailSheet pin={SHARED_PINS[0]} categories={['맛집', '카페', '가볼곳', '아이랑']} radiusMeters={300} onClose={noop} onDelete={noop} onToast={noop} readOnly onChangeCategory={noop} />, ['공유받은 맛집이에요']],
  ['ProfileScreen: 분류 관리 카드(수정·삭제·추가)', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS.concat([{ ...SEARCH_PIN, id: 'custom-1', category: '아이랑' }])} categories={['맛집', '카페', '가볼곳', '아이랑']} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} onAddCategory={noop} onRenameCategory={noop} onRemoveCategory={noop} />, ['분류 관리', '아이랑', '기본', '수정', '삭제', '새 분류 이름', '핀 1개']],
  // v2.5 — 🔍 검색 · 📋 목록 보기
  ['MapScreen: 헤더 🔍 돋보기(지도 위 검색창은 없음)', <MapScreen pins={SEED_PINS} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} header={{ onPressSearch: noop, onPressAlerts: noop, onPressMenu: noop }} />, ['장소 검색', '알림 모음', '메뉴', '맛집']],
  ['MapScreen: [목록 보기] 버튼', <MapScreen pins={SEED_PINS} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} />, ['목록 보기']],
  ['PinListView: 가까운 순 + 거리 + 분류 색 점', <PinListView pins={SEED_PINS} categories={['맛집', '카페', '가볼곳', '아이랑']} filter="전체" myCoords={{ lat: 37.5828, lng: 126.7141 }} onSelectPin={noop} onToggleView={noop} />, ['가까운 순', '지도 보기', '성수동 소금빵집', '맛집']],
  ['PinListView: 내 위치 없으면 최신순', <PinListView pins={SEED_PINS} filter="전체" myCoords={null} onSelectPin={noop} onToggleView={noop} />, ['최신순']],
  ['PinListView: 검색 결과 없음 안내', <PinListView pins={[]} query="없는가게" filter="전체" myCoords={null} onSelectPin={noop} onToggleView={noop} onClearQuery={noop} />, ['검색 결과가 없어요', '검색어 지우기']],
  ['PinListView: 핀 없음 안내', <PinListView pins={[]} filter="전체" myCoords={null} onSelectPin={noop} onToggleView={noop} onGoPaste={noop} />, ['아직 저장한 핀이 없어요', '링크 붙여넣으러 가기']],
  // v2.6 — 검색 결과 2곳 이상 → 지도 위 결과 목록
  ['PinSearchResults: 검색어 + N곳 + [전체 N곳]', <PinSearchResults pins={SEARCH_PINS.slice(0, 2)} query="한성" categories={['맛집', '카페']} myCoords={{ lat: 37.5828, lng: 126.7141 }} onOpenPin={noop} onShowAll={noop} />, ['‘한성’ 검색 · 2곳', '한성치킨', '한성돈까스', '전체 2곳']],
  ['PinSearchResults: 4행까지만 + 남은 개수 안내', <PinSearchResults pins={SEARCH_PINS} query="한성" myCoords={null} onOpenPin={noop} onShowAll={noop} />, ['전체 5곳', '한성냉면', '외 1곳 더 있어요']],
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

// 컴포넌트도 스스로 가짜 문구를 만들지 않습니다 (title 없이 pin 만 넘기면 아무것도 안 그림)
for (const [label, element] of [
  ['GeofenceBanner: title 없으면 가짜 데모 배너 미노출', <GeofenceBanner pin={SEED_PINS[0]} radiusMeters={300} onPress={noop} />],
  ['GeofenceBanner: 위치 전에는 핀이 있어도 실시간 배너 미노출', <GeofenceBanner pin={SEED_PINS[3]} radiusMeters={500} onPress={noop} needsLocation />],
]) {
  const html = renderToString(element);
  const ok =
    html.indexOf('반경 300m 앞, 저장한 맛집이 있어요') < 0 &&
    html.indexOf(SEED_PINS[0].name) < 0 &&
    html.indexOf(SEED_PINS[3].name) < 0 &&
    html.indexOf('반경 500m 앞') < 0;
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label);
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
  ['웹 모달: 가게명 흰색 · 동네 연회색', /title: \{\s*\.\.\.typography\.h3,[\s\S]{0,60}?color: colors\.white/.test(webModalSource) && webModalSource.indexOf('color: colors.charcoalSub') > 0],
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
    'PasteScreen: 썸네일 없으면 분류 이모지 타일 폴백',
    pasteSource.indexOf('heroTile') > 0 && pasteSource.indexOf('EMOJI_BY_CATEGORY') > 0 && pasteSource.indexOf('heroImage') > 0,
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
  ['ProfileScreen: 미설정이면 안내 토스트만', profileSource.indexOf('Supabase 설정이 아직 없어요') > 0],
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
  ['PasteScreen: readClipboard 호출은 사용자 버튼(applyPaste) 한 곳뿐', (pasteCode.match(/readClipboard\(\)/g) || []).length === 1, String((pasteCode.match(/readClipboard\(\)/g) || []).length)],
  ['PasteScreen: useEffect 로 클립보드를 읽지 않음', !/useEffect\([\s\S]{0,120}readClipboard/.test(pasteCode) && pasteCode.indexOf('if (active && !isSearch)') < 0],
  ['PasteScreen: navigator.clipboard.readText 직접 호출 없음', pasteCode.indexOf('readText(') < 0],
  ['PasteScreen: 클립보드 읽기(getStringAsync)는 한 곳뿐', (pasteCode.match(/getStringAsync\(/g) || []).length === 1, String((pasteCode.match(/getStringAsync\(/g) || []).length)],
  ['PasteScreen: [클립보드에서 붙여넣기] 버튼', pasteSource.indexOf('클립보드에서 붙여넣기') > 0],
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

// ── v2.1.2: 지도 우측 하단 컨트롤 일직선 정렬 + 반경 배너 다크 차콜 대비 ──
const bannerSource = fs.readFileSync(path.join(process.cwd(), 'src/components/GeofenceBanner.js'), 'utf8');
const bannerCode = bannerSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const v212Checks = [
  ['지도 우측 하단: +/− 박스가 목록 보기·주변 500m·내 위치와 같은 rightInset',
    mapSource.indexOf('right: mapControls.rightInset') > 0 && mapSource2.indexOf('right: mapControls.rightInset') > 0 && mapSource.indexOf('right: 68') < 0,
    'zoomCol/actionCol 둘 다 mapControls.rightInset'],
  ['지도 우측 하단: +/− 는 NAVER 로고 위로 충분히 띄움 (≥20px)',
    mapControls.zoomBottom >= 20, String(mapControls.zoomBottom)],
  ['지도 우측 하단: +/− 박스와 내 위치 FAB 가 겹치지 않음',
    mapControls.actionBottom >= mapControls.zoomBottom + mapControls.zoomBoxHeight + 4,
    String(mapControls.actionBottom) + ' vs ' + String(mapControls.zoomBottom + mapControls.zoomBoxHeight)],
  ['반경 알림 배너: 다크 차콜 카드 + 흰 글씨',
    bannerCode.indexOf('backgroundColor: colors.charcoal') > 0 && /title: \{[\s\S]{0,160}color: colors\.white/.test(bannerCode), bannerSource.length + ' bytes'],
  ['반경 알림 배너: 500m 진입(지금) 상태는 코랄 강조',
    bannerCode.indexOf('wrapLive') > 0 && /nowChipLive: \{[\s\S]{0,80}colors\.coral/.test(bannerCode), '코랄 테두리 + 코랄 배지'],
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
  ['manifest: 이름·테마 코랄', manifest.name.indexOf('릴스핀') >= 0 && manifest.theme_color === '#FF5A36' && manifest.short_name === '릴스핀', JSON.stringify(manifest.theme_color)],
  ['manifest: standalone + 세로', manifest.display === 'standalone' && manifest.orientation === 'portrait', manifest.display],
  ['manifest: 192 · 512 · maskable 아이콘', manifestIcons.indexOf('/icon-192.png@192x192') >= 0 && manifestIcons.indexOf('/icon-512.png@512x512') >= 0 && (manifest.icons || []).some((i) => i.purpose === 'maskable'), manifestIcons.join(', ')],
  ['manifest: start_url·scope', manifest.start_url.indexOf('/') === 0 && manifest.scope === '/', manifest.start_url],
  ['버전: package.json 2.17.0', pkg.version === '2.17.0', pkg.version],
  ['버전: app.json 2.17.0', expoConfig.version === '2.17.0', expoConfig.version],
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
  ['가짜 배너: GeofenceBanner 가 기본 "반경 … 앞" 문구를 만들지 않음',
    bannerCode.indexOf('반경 ') < 0 && bannerCode.indexOf('pin.name + ' ) < 0],
  ['가짜 배너: MapScreen 이 myCoords 없을 때 핀 이름을 배너로 넘기지 않음',
    /if \(!myCoords\) \{\s*return \{ mode: 'needs-location', pin: null, target: null \};/.test(mapCode)],
  ['중복 안내: 칩 아래 locationHint 제거',
    mapSource2.indexOf('locationHint') < 0],
  // v2.1.3 — 계정 · 클라우드 동기화 카드는 '내 정보' 스크롤 맨 아래로
  ['내 정보 탭: 계정 카드가 맨 아래(프로필·핀·반경·프로·앱 정보 뒤)',
    (() => {
      const html = renderToString(
        <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} cloudConfigured cloudUser={null} cloudPinCount={0} onSignIn={noop} onSignUp={noop} onMagicLink={noop} onOAuth={noop} onSignOut={noop} onSyncNow={noop} />
      );
      const at = html.indexOf('계정 · 클라우드 동기화');
      return (
        at > 0 &&
        at > html.indexOf('저장한 핀') &&
        at > html.indexOf('지오펜스 알림 반경') &&
        at > html.indexOf('프로 시작하기') &&
        at > html.indexOf('번들 ID')
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
  ['색: 맛집=코랄 #FF5A36 · 카페=민트 #14B8A6 · 가볼곳=블루 #3B82F6',
    DEFAULT_CATEGORY_COLORS['맛집'] === '#FF5A36' && DEFAULT_CATEGORY_COLORS['카페'] === '#14B8A6' &&
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
  ['브랜드: 저장 화면 상단 로고 Reelspin', pasteBrandHtml.indexOf('Reelspin') > 0 && pasteBrandHtml.indexOf('ReelPin') < 0],
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
      onToggleView={noop}
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
  ['한도: 내 정보가 12곳을 그대로 셈', profile12Html.indexOf('>12<') > 0 && profile12Html.indexOf('개수 제한 없이') > 0 && profile12Html.indexOf('무료 한도') < 0],
  ['가봤어요: 상세 시트에 토글 버튼', sheetSource210.indexOf('pin-visited-toggle') > 0 && plainPinHtml.indexOf('아직 안 가봤어요') > 0],
  ['가봤어요: 체크된 핀은 가봤어요 + 체크 날짜', visitedPinHtml.indexOf('가봤어요') > 0 && visitedPinHtml.indexOf('2026.11.14') > 0],
  ['가봤어요: 읽기 전용(공유) 핀도 표시만', readOnlyPinHtml.indexOf('가봤어요') > 0 && readOnlyPinHtml.indexOf('pin-visited-toggle') < 0],
  ['메모: 상세 시트 입력칸 + 안내 문구', sheetSource210.indexOf('pin-memo-input') > 0 && plainPinHtml.indexOf('추천 메뉴, 아기의자') > 0],
  ['메모: 저장된 메모가 상세 시트에 보임', visitedPinHtml.indexOf('아기의자 있음') > 0],
  ['메모: 목록 행에 ✓ 방문완료 배지와 1줄 미리보기', listVisitHtml.indexOf('✓방문완료') > 0 && listVisitHtml.indexOf('📝아기의자있음') > 0],
  ['방문 필터: 목록 보기의 방문 칩은 그대로 렌더', listVisitHtml.indexOf('미방문') > 0 && listVisitHtml.indexOf('가봤어요') > 0],
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
// v2.16 — 🔍 검색 레이어 팝업도 저장 화면과 같은 다크 차콜 헤더 + ✕ 를 씁니다.
const searchOverlaySource216 = fs.readFileSync(
  path.join(process.cwd(), 'src/components/SearchOverlayModal.js'),
  'utf8'
);
const CLOSE_HEADER_FILES = [
  // v2.15 — 저장 화면의 ✕ 헤더는 공통 AppHeader 로 옮겼습니다(지도·내 정보 탭도 같은 헤더).
  ['공통 헤더(AppHeader)', headerSource215, 'styles.header'],
  ['핀 상세 시트', sheetSource211, 'styles.headerBar'],
  ['인앱 매장 정보 모달(웹)', webModalSource211, 'styles.header'],
  ['인앱 매장 정보 모달(iOS·안드로이드)', nativeModalSource211, 'styles.header'],
  // v2.16 — 저장 화면 형태의 검색 레이어 팝업
  ['검색 레이어 팝업(🔍)', searchOverlaySource216, 'styles.header'],
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
    '헤더 통일: ✕ 닫기 헤더는 넣은 5곳뿐 (전수 검사)',
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
      const wanted = ['AppHeader.js', 'InAppPlaceModal.js', 'InAppPlaceModal.web.js', 'PinDetailSheet.js', 'SearchOverlayModal.js'];
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
  ['저장 화면: 사진 버튼은 웹에서만(canUsePhoto)', pasteSource.indexOf('const canUsePhoto = isWebPlatform()') > 0 && pasteSource.indexOf('const tabs = canUsePhoto') > 0],
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
  ['프로필: 버전 표기 v2.17.0', fs.readFileSync(path.join(process.cwd(), 'src/screens/ProfileScreen.js'), 'utf8').indexOf('릴스핀 v2.17.0') > 0],
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
    '핀 시트: 높이 상한 86% + overflow hidden',
    /sheet: \{[\s\S]{0,260}?maxHeight: '86%'/.test(pinDetailSource) && /sheet: \{[\s\S]{0,320}?overflow: 'hidden'/.test(pinDetailSource),
  ],
  [
    '핀 시트: 헤더(가게 이름·✕)는 스크롤 밖 상단 고정',
    pinDetailSource.indexOf('<View style={styles.headerBar}') > 0 &&
      pinDetailSource.indexOf('<View style={styles.headerBar}') < pinDetailSource.indexOf('<ScrollView'),
  ],
  [
    '핀 시트: 본문만 스크롤(style=bodyScroll · contentContainerStyle=body)',
    pinDetailSource.indexOf('contentContainerStyle={styles.body}') > 0 &&
      /bodyScroll: \{[\s\S]{0,80}?flexShrink: 1/.test(pinDetailSource),
  ],
  [
    '핀 시트: 본문 아래 여백은 스크롤 안쪽으로',
    /body: \{[\s\S]{0,120}?paddingBottom: 16/.test(pinDetailSource) && !/sheet: \{[\s\S]{0,300}?paddingBottom: 16/.test(pinDetailSource),
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
    '저장 화면: 사진 탭에는 원탭 프리셋 없음',
    /\{!isPhoto && \(\s*<>\s*<View style=\{styles\.presetHead\}/.test(pasteSource),
  ],
  [
    '저장 화면: 링크 탭은 붙여넣기 버튼 하나(옆의 좁은 사진 버튼 제거)',
    pasteSource.indexOf('📸 캡처·사진으로 찾기') < 0 && pasteSource.indexOf('linkActionRow') > 0,
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
  ['저장 화면(링크 탭): 링크 입력 + 붙여넣기 + 장소 추출하기', linkTabHtml.indexOf('릴스 · 쇼츠 링크') > 0 && linkTabHtml.indexOf('클립보드에서 붙여넣기') > 0 && linkTabHtml.indexOf('장소 추출하기') > 0],
  ['저장 화면(사진 탭): 링크 입력·원탭 테스트 없음', photoTabHtml.indexOf('릴스 · 쇼츠 링크') < 0 && photoTabHtml.indexOf('원탭 테스트') < 0 && photoTabHtml.indexOf('장소 추출하기') < 0],
  ['저장 화면(사진 탭): 업로드 카드 + 큰 사진 버튼', photoTabHtml.indexOf('인스타 캡처·스크린샷 올리기') > 0 && photoTabHtml.indexOf('사진·캡처 고르기') > 0],
  ['저장 화면(사진 탭): 안내 3단계', photoTabHtml.indexOf('사진 한 장이면 충분해요') > 0],
  ['저장 화면: 어느 탭에서든 3탭이 모두 보임', ['릴스 링크', '사진으로 찾기', '가게명 찾기'].every((t) => photoTabHtml.indexOf(t) >= 0 && linkTabHtml.indexOf(t) >= 0)],
];
for (const [label, ok, extra] of v214RenderChecks) {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
}

// ── v2.14.1 위로 스와이프 닫기 배너 + 핀 상세 시트 주황 헤더 ─────────────────
const bannerSource2141 = fs.readFileSync(path.join(process.cwd(), 'src/components/GeofenceBanner.js'), 'utf8');
const mapSource2141 = fs.readFileSync(path.join(process.cwd(), 'src/screens/MapScreen.js'), 'utf8');
const bannerSwipeHtml = renderToString(
  <GeofenceBanner
    pin={SEED_PINS[0]}
    radiusMeters={500}
    onPress={noop}
    onDismiss={noop}
    title="반경 500m 앞, 저장한 맛집이 있어요"
    sub={SEED_PINS[0].name + ' · 320m'}
    badge="지금"
  />
);
const v2141Checks = [
  // ① 판정 규칙 — 위로 32px 이상 또는 빠른 플릭이면 닫힘, 아니면 스냅백
  ['스와이프: 위로 32px 이면 닫힘', swipeDismissDecision({ dy: -DISMISS_SWIPE_DISTANCE, vy: 0 }) === true],
  ['스와이프: 위로 31px · 느리면 원위치', swipeDismissDecision({ dy: -31, vy: -0.1 }) === false],
  ['스와이프: 위로 14px · 0.8px/ms 빠른 플릭이면 닫힘', swipeDismissDecision({ dy: -14, vy: -0.8 }) === true],
  ['스와이프: 12px 미만 플릭은 원위치', swipeDismissDecision({ dy: -11, vy: -1.4 }) === false],
  ['스와이프: 아래로 끌면 닫히지 않음', swipeDismissDecision({ dy: 60, vy: 1.2 }) === false],
  ['스와이프: 움직임 없으면 그대로', swipeDismissDecision({}) === false && swipeDismissDecision() === false],
  // ② 웹(아이폰 사파리) 터치 + 포인터, 네이티브 PanResponder
  [
    '배너: 웹 DOM 터치 3종(onTouchStart/Move/End) 처리',
    bannerSource2141.indexOf('onTouchStart:') > 0 &&
      bannerSource2141.indexOf('onTouchMove:') > 0 &&
      bannerSource2141.indexOf('onTouchEnd:') > 0 &&
      bannerSource2141.indexOf('onTouchCancel:') > 0,
  ],
  [
    '배너: 마우스 포인터 드래그도 처리',
    bannerSource2141.indexOf('onPointerDown:') > 0 &&
      bannerSource2141.indexOf('onPointerMove:') > 0 &&
      bannerSource2141.indexOf('onPointerUp:') > 0,
  ],
  [
    '배너: 터치와 포인터가 겹치지 않게 터치 포인터는 건너뜀',
    /ne\.pointerType === 'touch'\) return/.test(bannerSource2141),
  ],
  [
    '배너: 네이티브는 PanResponder(세로 6px 이상일 때만)',
    bannerSource2141.indexOf('PanResponder.create') > 0 &&
      /onMoveShouldSetPanResponder: \(e, g\) => g\.dy <= -6/.test(bannerSource2141),
  ],
  [
    '배너: 손가락을 따라 위로 밀림(setValue translateY)',
    /translateY\.setValue\(/.test(bannerSource2141) && bannerSource2141.indexOf('DISMISS_OFFSCREEN_DISTANCE') > 0,
  ],
  [
    '배너: 닫힘은 위로 밀며 투명해지는 애니메이션(160ms)',
    /Animated\.parallel\(\[/.test(bannerSource2141) &&
      /DISMISS_ANIM_MS = 160/.test(bannerSource2141) &&
      /Animated\.timing\(opacity,[\s\S]{0,120}?toValue: 0/.test(bannerSource2141),
  ],
  [
    '배너: 살짝 끌면 원위치 스냅백(spring)',
    /Animated\.spring\(translateY,[\s\S]{0,80}?toValue: 0/.test(bannerSource2141),
  ],
  [
    '배너: onDismiss 는 닫힘 애니메이션이 끝난 뒤 호출',
    /\.start\(\(\{ finished \}\) => \{[\s\S]{0,160}?onDismissRef\.current/.test(bannerSource2141),
  ],
  [
    '배너: 스와이프 뒤 딸려오는 탭은 한 번 무시(핀 상세 오픈 방지)',
    bannerSource2141.indexOf('skipPressRef') > 0 && bannerSource2141.indexOf('handlePress(') > 0,
  ],
  ['배너: 임계값 32px · 플릭 0.5px/ms 공개 상수', bannerSource2141.indexOf('export const DISMISS_SWIPE_DISTANCE = 32') > 0 && bannerSource2141.indexOf('export const DISMISS_FLICK_VELOCITY = 0.5') > 0],
  // ③ MapScreen — 닫힌 배너를 같은 상태에서는 다시 띄우지 않음
  ['지도: dismissedBannerKey 상태', mapSource2141.indexOf('const [dismissedBannerKey, setDismissedBannerKey] = useState(') > 0],
  [
    '지도: 배너 키 = 가게 id + 모드(near/closest)',
    /banner\.pin\.id \+ ':' \+ \(banner\.mode === 'closest' \? 'closest' : 'near'\)/.test(mapSource2141),
  ],
  ['지도: 닫힌 배너는 그리지 않음 (v2.17: 반경 500m 안일 때만)', mapSource2141.indexOf('const bannerHidden = Boolean(bannerKey) && dismissedBannerKey === bannerKey') > 0 && mapSource2141.indexOf('{bannerVisible && (') > 0],
  ['지도: 배너에 onDismiss 전달', mapSource2141.indexOf('onDismiss={dismissBanner}') > 0],
  [
    '지도: [내 위치]를 새로 누르면 닫힘 기록을 지움',
    /const locateFromUser = useCallback\([\s\S]{0,200}?setDismissedBannerKey\(''\)/.test(mapSource2141),
  ],
  // v2.17 — 반경 밖 안내 배너가 없어져 [내 위치] 자리가 FAB · 주변 500m 패널 · 오류 칩 세 곳으로 줄었습니다.
  [
    '지도: 내 위치 자리(오류 칩·주변 패널·FAB)가 모두 locateFromUser 사용',
    (mapSource2141.match(/locateFromUser\(\)/g) || []).length >= 3,
  ],
  // ④ 핀 상세 시트 — 브랜드 주황 헤더
  [
    '핀 시트: 헤더 배경이 브랜드 주황(#FF5A36)',
    /headerBar: \{[\s\S]{0,200}?backgroundColor: colors\.coral,/.test(pinDetailSource) && colors.coral === '#FF5A36',
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
    '핀 시트: 86% 높이 상한 · 헤더 고정 · 본문 스크롤 유지',
    /sheet: \{[\s\S]{0,260}?maxHeight: '86%'/.test(pinDetailSource) &&
      pinDetailSource.indexOf('testID="pin-sheet-scroll"') > 0 &&
      pinDetailSource.indexOf('<View style={styles.headerBar}') < pinDetailSource.indexOf('<ScrollView'),
  ],
  [
    '배너: 스와이프 래퍼로 감싸 렌더됨(geofence-banner)',
    bannerSwipeHtml.indexOf('geofence-banner') > 0 &&
      bannerSwipeHtml.indexOf('반경 500m 앞, 저장한 맛집이 있어요') > 0,
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
  ['헤더 뱃지 이름: 지도 · 저장 · 내 정보', HEADER_TABS.join('|') === '지도|저장|내 정보', HEADER_TABS.join('|')],
  // ② 공통 헤더 (컴포넌트)
  ['공통 헤더: Reelspin + 지금 탭 뱃지', headerAlertsHtml.indexOf('reelspin') > 0 && headerAlertsHtml.indexOf('지도') > 0],
  ['공통 헤더: 🔔 알림 모음 버튼 + 숫자 뱃지', headerAlertsHtml.indexOf('알림모음') > 0 && headerSource215.indexOf('testID="header-alert-badge"') > 0 && headerSource215.indexOf('colors.coral') > 0],
  ['공통 헤더: 비로그인에도 🔍 · 🔔 · ☰ 세 아이콘', headerAlertsHtml.indexOf('장소검색') > 0 && headerAlertsHtml.indexOf('알림모음') > 0 && headerAlertsHtml.indexOf('메뉴') > 0 && headerSource215.indexOf('loginBtn') < 0],
  ['공통 헤더: 👤 알약/아바타는 헤더에서 사라짐(☰ 메뉴로 통합)', headerAlertsHtml.indexOf('로그인') < 0 && headerSource215.indexOf('header-account') < 0 && headerSource215.indexOf('accountDot') < 0],
  ['공통 헤더: 오른쪽 순서 = 🔍 → 🔔 → ☰', HEADER_ACTIONS.join('|') === 'search|alerts|menu' && HEADER_ACTIONS.length === 3, HEADER_ACTIONS.join('|')],
  ['공통 헤더: 로그인 상태 = ☰ 초록 점', headerSignedHtml.indexOf('header-menu-dot') > 0 && headerSource215.indexOf('colors.visit') > 0],
  ['공통 헤더: 뱃지 없으면 숫자 안 그림', stripSpaces(renderToString(<AppHeader badge="저장" alertCount={0} />)).indexOf('header-alert-badge') < 0],
  ['공통 헤더: ✕ 는 넘긴 화면에만', headerSource215.indexOf('{onPressClose ?') > 0 && headerAlertsHtml.indexOf('✕') < 0],
  // ③ 세 탭에 같은 헤더
  ['지도 탭: 공통 다크 헤더', mapSource215.indexOf('<AppHeader badge="지도"') > 0],
  ['지도 탭: 헤더가 지도·오버레이보다 위(겹침 없음)', mapSource215.indexOf('<AppHeader badge="지도"') < mapSource215.indexOf('<View style={styles.mapArea}>') && mapSource215.indexOf('<View style={styles.mapArea}>') < mapSource215.indexOf('styles.topOverlay')],
  ['지도 탭: 오버레이는 헤더 아래 mapArea 안', /mapArea: \{[\s\S]{0,80}?flex: 1/.test(mapSource215)],
  ['저장 탭: 공통 헤더 + 기존 ✕ 유지', pasteSource215.indexOf('<AppHeader badge="저장"') > 0 && pasteSource215.indexOf('onPressClose={onClose}') > 0],
  ['저장 탭: 옛 인라인 헤더 스타일 제거', pasteSource215.indexOf('styles.header}') < 0 && pasteSource215.indexOf('brandBadgeText') < 0],
  ['내 정보 탭: 공통 헤더 + 옛 큰 타이틀 제거', profileSource215.indexOf('<AppHeader badge="내 정보"') > 0 && profileSource215.indexOf('styles.title}>내 정보') < 0],
  ['세 탭 모두 같은 headerProps 를 받음', (appSource215.match(/header=\{headerProps\}/g) || []).length === 3, (appSource215.match(/header=\{headerProps\}/g) || []).length],
  // ④ 헤더 우측 아이콘의 동작
  ['🔔: App 이 알림 모음을 열고 목록은 최대 5곳', appSource215.indexOf('<AlertInbox') > 0 && appSource215.indexOf('buildAlertFeed(pins, alertCoords)') > 0 && ALERT_FEED_LIMIT === 5],
  ['🔔: 장소를 누르면 지도 탭 + 그 핀 상세로', appSource215.indexOf('setPinFocus(') > 0 && mapSource215.indexOf('focusPin') > 0 && mapSource215.indexOf('onSelectPin(target.id)') > 0],
  ['🔔: 지도 탭이 잡은 위치를 헤더와 공유', mapSource215.indexOf('onMyCoordsRef.current(position)') > 0 && appSource215.indexOf('onMyCoords={handleMyCoords}') > 0],
  ['👤: 누르면 내 정보 탭 + 계정 카드로 스크롤', appSource215.indexOf("setTab('profile')") > 0 && appSource215.indexOf('setAccountFocus(') > 0 && profileSource215.indexOf('accountYRef') > 0 && profileSource215.indexOf('scrollTo(') > 0],
  // ⑤ 알림 모음 모달
  ['알림 모음: 반경 500m 안 장소를 가까운 순으로', inboxOpenHtml.indexOf('영등포아바이순대국') > 0 && inboxOpenHtml.indexOf('문래동 소금빵') > 0 && inboxOpenHtml.indexOf('내 위치 반경 500m 안 3곳') > 0],
  ['알림 모음: 위치를 모르면 [내 위치 켜기]', inboxNoLocationHtml.indexOf('내위치켜기') > 0 && inboxNoLocationHtml.indexOf('알림모음') > 0],
  ['알림 모음: 저장한 곳이 없으면 안내', inboxEmptyHtml.indexOf('아직 저장한 장소가 없어요') > 0],
  ['알림 모음: 닫힌 상태에서는 아무 것도 안 그림', renderToString(<AlertInbox visible={false} pins={ALERT_PINS} myCoords={ALERT_ORIGIN} onClose={noop} />) === ''],
  ['알림 모음: 닫힌 배너도 여기서 다시 (안내 문구)', stripSpaces(inboxOpenHtml).indexOf('배너를위로스와이프해닫아도여기서는언제든다시볼수있어요') > 0],
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
    signedIn={false}
    cloudConfigured
    onClose={noop}
    onOpenAccount={noop}
    onOpenCategories={noop}
    onShareMap={noop}
  />
);
const menuSignedHtml216 = renderToString(
  <MenuDrawerModal
    visible
    pins={PIN_216}
    signedIn
    accountEmail="andy@example.com"
    cloudConfigured
    cloudPinCount={4}
    onClose={noop}
    onOpenAccount={noop}
    onOpenCategories={noop}
    onShareMap={noop}
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
  // ① 헤더 — 🔍 · 🔔 · ☰ (호갱노노처럼)
  ['헤더: 오른쪽은 🔍 · 🔔 · ☰ 세 아이콘만', headerSource215.indexOf('testID="header-search"') > 0 && headerSource215.indexOf('testID="header-alerts"') > 0 && headerSource215.indexOf('testID="header-menu"') > 0],
  ['헤더: ☰ 에 로그인 초록 점(작은 점)', headerSource215.indexOf('testID="header-menu-dot"') > 0 && /menuDot: \{[\s\S]{0,200}?colors\.visit/.test(headerSource215)],
  ['헤더: 흰색 라인 아이콘(search·notifications-outline·menu)', headerSource215.indexOf('name="search"') > 0 && headerSource215.indexOf('name="notifications-outline"') > 0 && headerSource215.indexOf('name="menu"') > 0],
  ['헤더: 저장 탭은 ✕ 포함 4개까지 그린다', headerSource215.indexOf('{onPressClose ? (') > 0 && headerSource215.indexOf('iconBtn') > 0],
  // ② 지도 탭 — 검색창 제거 + 칩 바만
  ['지도 탭: 지도 위 검색창 제거(헤더 🔍 로)', mapSource216.indexOf('<PinSearchBar') < 0 && mapSource216.indexOf('styles.searchWrap') < 0],
  ['지도 탭: 필터 칩 바가 헤더 바로 아래(배너보다 위)', mapSource216.indexOf('styles.chipWrap') > 0 && mapSource216.indexOf('styles.chipWrap') < mapSource216.indexOf('<GeofenceBanner')],
  ['지도 탭: 그려진 화면에 검색 인풋 없음', mapHtml216.indexOf('pin-search-input') < 0],
  ['지도 탭: 분류 칩 한 줄만 (방문 칩 2번째 줄 없음)', mapHtml216.indexOf('맛집') > 0 && mapHtml216.indexOf('미방문') < 0],
  // ③ 🔍 검색 레이어 팝업
  ['검색 팝업: 저장 화면과 같은 전체 레이어(absoluteFill)', /overlay: \{[\s\S]{0,80}?StyleSheet\.absoluteFillObject/.test(searchOverlaySource216) && searchOverlaySource216.indexOf('colors.charcoal') > 0],
  ['검색 팝업: 헤더 `🔍 장소 검색` + ✕', overlayHtml216.indexOf('장소 검색') > 0 && overlayHtml216.indexOf('검색어 지우기') < 0 && searchOverlaySource216.indexOf('testID="search-overlay-close"') > 0],
  ['검색 팝업: 검색 인풋 + ✕ 지우기', searchOverlaySource216.indexOf('testID="search-overlay-input"') > 0 && searchOverlaySource216.indexOf('testID="search-overlay-clear"') > 0],
  ['검색 팝업: 추천 장소 · 인기 검색 장소 섹션', overlayHtml216.indexOf('추천 장소') > 0 && overlayHtml216.indexOf(POPULAR_PLACES_TITLE) > 0],
  ['검색 팝업: 추천 = 내 위치에서 가까운 저장 장소(가까운 순)', recNear216.kind === 'near' && recNear216.items[0].pin.id === 's-1' && recNear216.items.length === Math.min(RECOMMEND_MAX, PIN_216.length), recNear216.items.map((i) => i.pin.id).join(',')],
  ['검색 팝업: 위치 없으면 아직 안 가본(!visited) 곳', recNoLoc216.kind === 'todo' && recNoLoc216.items.every((i) => i.pin.visited !== true) && recNoLoc216.items[0].pin.id === 's-0', recNoLoc216.items.map((i) => i.pin.id).join(',')],
  ['검색 팝업: 둘 다 없으면 empty 안내', recAllVisited216.kind === 'empty' && recAllVisited216.items.length === 0],
  ['검색 팝업: 검색 결과 — 메뉴·메모까지 매칭', resSalt216.total === 2 && resSalt216.items[0].pin.id === 's-0' && resMemo216.total === 1 && resMemo216.items[0].pin.id === 's-1', resSalt216.total + '/' + resMemo216.total],
  ['검색 팝업: 빈 검색어면 결과 0(추천·인기 먼저)', resNone216.total === 0 && resNone216.items.length === 0],
  ['검색 팝업: 결과는 6행까지 + truncate 표기', resLimit216.items.length === 1 && resLimit216.total === 2 && resLimit216.truncated === true && OVERLAY_RESULT_MAX === 6],
  ['검색 팝업: 추천 행을 누르면 그 핀으로(onOpenPin)', searchOverlaySource216.indexOf('onPress={() => openPin(item.pin)}') > 0 && appSource215.indexOf('onOpenPin={openPinFromSearch}') > 0],
  ['검색 팝업: 핀을 고르면 닫고 지도 탭 + 상세 시트', appSource215.indexOf('setSearchOpen(false)') > 0 && appSource215.indexOf('setTab(\'map\')') > 0 && appSource215.indexOf('setPinFocus({ id: pin.id, key: pinFocusId.current })') > 0],
  ['검색 팝업: 내 핀에 없으면 저장 탭 가게명 찾기로 이어짐', searchOverlaySource216.indexOf('search-overlay-go-paste') > 0 && appSource215.indexOf('mode: \'search\'') > 0 && pasteSource215.indexOf('request.mode') > 0 && pasteSource215.indexOf('setQuery(String(request.query') > 0],
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
  ['메뉴: 시트 · 다크 차콜 헤더 · ☰', menuSource216.indexOf('testID="menu-drawer"') > 0 && menuSource216.indexOf('colors.charcoal') > 0 && menuSource216.indexOf('Ionicons name="menu"') > 0],
  ['메뉴: 비로그인 = [로그인 / 계정 연결]', menuHtml216.indexOf('로그인 / 계정 연결') > 0 && menuSource216.indexOf('testID="menu-account-card"') > 0],
  ['메뉴: 로그인 = 이메일 + 동기화 상태', menuSignedHtml216.indexOf('andy@example.com') > 0 && menuSignedHtml216.indexOf('클라우드 동기화 켜짐') > 0 && menuSignedHtml216.indexOf('개 저장됨') > 0],
  ['메뉴: 분류 관리 · 지도 공유 바로가기', menuHtml216.indexOf('분류 관리') > 0 && menuHtml216.indexOf('지도 공유') > 0 && appSource215.indexOf('onOpenCategories={openCategories}') > 0 && appSource215.indexOf('onShareMap={shareMyMapFromMenu}') > 0],
  ['메뉴: 분류 관리 → 내 정보 탭 분류 카드로', appSource215.indexOf('setCategoriesFocus(') > 0 && profileSource215.indexOf('categoriesYRef') > 0 && profileSource215.indexOf('categoriesFocus') > 0],
  ['메뉴: 저장된 핀 N곳 / 가본 곳 M곳 요약', menuHtml216.indexOf('저장된 핀') > 0 && menuHtml216.indexOf('가본 곳') > 0 && menuHtml216.indexOf('안 가본 곳') > 0 && menuSource216.indexOf('visited === true') > 0],
  ['메뉴: 릴스핀 v2.17.0 표기', menuHtml216.indexOf('릴스핀 v2.17.0') > 0 && APP_VERSION_LABEL === '릴스핀 v2.17.0', APP_VERSION_LABEL],
  ['메뉴: 닫힌 상태에서는 안 그림', renderToString(<MenuDrawerModal visible={false} pins={PIN_216} />) === ''],
  // ⑥ 앱 배선 · 순수 계산
  ['앱: 세 탭 헤더에 🔍 · ☰ 핸들러를 넘깁니다', appSource215.indexOf('onPressSearch: openSearch') > 0 && appSource215.indexOf('onPressMenu: openMenu') > 0 && (appSource215.match(/header=\{headerProps\}/g) || []).length === 3],
  ['앱: 검색 팝업·메뉴를 최상위에 한 번만', appSource215.indexOf('<SearchOverlayModal') > 0 && appSource215.indexOf('<MenuDrawerModal') > 0],
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
  // ① 배너는 반경 500m 안('near')에만
  ['배너: 반경 500m 안(near)이면 보입니다', shouldShowBanner('near') === true],
  ['배너: 반경 밖 가장 가까운 곳(closest)은 숨김', shouldShowBanner('closest') === false],
  ['배너: 내 위치 전(needs-location)은 숨김', shouldShowBanner('needs-location') === false],
  ['배너: 저장한 핀 없음(empty)·none 도 숨김', shouldShowBanner('empty') === false && shouldShowBanner('none') === false && shouldShowBanner() === false],
  ['지도: banner.mode 로 배너를 가립니다', mapSource217.indexOf('shouldShowBanner(banner.mode)') > 0 && mapSource217.indexOf('{bannerVisible && (') > 0],
  ['지도: 위치 전·반경 밖 배너를 그리지 않음', mapSource217.indexOf('needsLocation={banner.needsLocation}') < 0 && mapSource217.indexOf('empty={banner.empty}') < 0],
  ['지도 화면(위치 전): 알림 배너 없음', mapHtml217.indexOf('geofence-banner') < 0 && mapHtml217.indexOf('반경500m앞') < 0],
  ['지도 화면(위치 전): 반경 밖 가장 가까운 곳 배너도 없음', mapHtml217.indexOf('가장가까운저장장소') < 0],
  ['지도 화면(핀 없음): 알림 배너 없음', mapEmptyHtml217.indexOf('geofence-banner') < 0 && mapEmptyHtml217.indexOf('아직저장한핀이없어요') < 0],
  ['지도 화면(핀 없음): 가운데 안내 카드는 그대로', mapEmptyHtml217.indexOf('지도가비어있어요') > 0],
  // ② 상단 2번째 줄(방문 칩) 제거 — 1줄 분류 칩만
  ['지도: 방문 필터 칩을 더 이상 그리지 않음', mapSource217.indexOf('VisitFilterChips') < 0 && mapSource217.indexOf('styles.visitWrap') < 0],
  ['지도 화면: 분류 칩은 그대로, 방문 칩은 없음', mapHtml217.indexOf('filter-chip-전체') > 0 && mapHtml217.indexOf('visit-chip-미방문') < 0],
  // ③ 오른쪽 스택에서 지도 공유 제거
  ['지도: 오른쪽 스택에 지도 공유 버튼 없음', mapSource217.indexOf('지도 공유</Text>') < 0],
  ['지도 화면(접힘): 지도 공유 글자 없음(메뉴 안으로 이동)', mapHtml217.indexOf('지도공유') < 0],
  ['지도: 오른쪽 스택은 목록 보기 · 주변 500m · FAB 세 칸', mapSource217.indexOf('목록 보기</Text>') > 0 && mapSource217.indexOf("'주변 ' + NEARBY_RADIUS_M + 'm'") > 0 && mapSource217.indexOf('accessibilityLabel="내 위치 찾기"') > 0],
  // ④ 왼쪽 하단 펼침 메뉴
  ['지도 도구: 왼쪽 끝 12 · 아래 끝 16', /col: \{[\s\S]{0,140}?left: 12,[\s\S]{0,40}?bottom: 16/.test(toolsSource217)],
  ['지도 도구: 세로 column(요약 · 카드 · 버튼이 겹치지 않음)', /col: \{[\s\S]{0,180}?alignItems: 'flex-start',[\s\S]{0,40}?gap: 8/.test(toolsSource217)],
  ['지도 화면(접힘): 토글 버튼 + 개수 요약만', mapHtml217.indexOf('map-tools-toggle') > 0 && mapHtml217.indexOf('핀표시중') > 0],
  ['지도 화면(접힘): 펼친 카드는 그리지 않음(빈 곳 탭 방지)', mapHtml217.indexOf('map-tools-menu') < 0 && toolsOffHtml217.indexOf('map-tools-menu') < 0],
  ['도구 메뉴: 가본 곳만 보기 스위치 + 가본 곳 N곳/전체 M곳', toolsOpenHtml217.indexOf('가본곳만보기') > 0 && toolsOpenHtml217.indexOf('가본곳2곳/전체5곳') > 0],
  ['도구 메뉴: 스위치는 role=switch · 켜지면 aria-checked=true', toolsSource217.indexOf('accessibilityRole="switch"') > 0 && toolsOpenHtml217.indexOf('aria-checked="true"') > 0],
  ['도구 메뉴: [지도 공유하기] 버튼', toolsOpenHtml217.indexOf('map-tools-share') > 0 && toolsOpenHtml217.indexOf('지도공유하기') > 0],
  ['도구 메뉴: 켜진 상태는 토글에 가본 곳만 + 점', toolsOpenHtml217.indexOf('가본곳만') > 0 && toolsOpenHtml217.indexOf('map-tools-dot') > 0],
  ['도구 메뉴: 요약 알약도 함께', toolsOpenHtml217.indexOf('가본곳만2/5') > 0],
  ['지도: 토글을 다시 누르거나 지도를 누르면 접힘', mapSource217.indexOf('onToggleOpen={() => setToolsOpen((open) => !open)}') > 0 && mapSource217.indexOf('testID="map-tools-backdrop"') > 0],
  ['지도: 열려 있을 때만 지도 먹는 막을 그림', /toolsOpen && \([\s\S]{0,320}?map-tools-backdrop/.test(mapSource217)],
  ['지도: 왼쪽 하단 도구는 상세 시트가 열리면 숨김', /view === 'map' && !selectedPin && \(\s*\n\s*<MapToolsMenu/.test(mapSource217)],
  // ⑤ Y/N 동작 — 지도·목록이 같은 상태를 씁니다
  ['가본 곳만 보기: 켜면 가봤어요(visited===true) 핀만', filterByVisit(VISIT_SAMPLE, VISIT_DONE).map((p) => p.id).join(',') === 'b-1'],
  ['가본 곳만 보기: 끄면 전체', filterByVisit(VISIT_SAMPLE, VISIT_ALL).length === 3],
  ['가본 곳만 보기: 같은 값을 다시 누르면 전체로 토글', /const changeVisitFilter = useCallback\(\(next\) => \{[\s\S]{0,400}?current === value && value !== VISIT_ALL \? VISIT_ALL : value/.test(mapSource217)],
  ['가본 곳만 보기: 스위치가 changeVisitFilter(VISIT_DONE) 를 부름', mapSource217.indexOf('onToggleVisited={() => changeVisitFilter(VISIT_DONE)}') > 0],
  ['가본 곳만 보기: 켜져 있으면 토글에 가본 곳만 표시', mapSource217.indexOf('visitedOnly={visitedOnly}') > 0 && /const visitedOnly = visitFilter === VISIT_DONE/.test(mapSource217)],
  ['요약 문구: 전체 / 가본 곳만 / 미방문', toolsSummary({ filteredCount: 5, totalCount: 5 }) === '5 / 5 핀 표시 중' && toolsSummary({ filteredCount: 2, totalCount: 5, visitFilter: VISIT_DONE }) === '가본 곳만 2 / 5' && toolsSummary({ filteredCount: 3, totalCount: 5, visitFilter: '미방문' }) === '미방문 3 / 5'],
  // ⑥ 지도 공유 기능은 그대로
  ['지도 공유: 도구 메뉴가 기존 shareMyMap 을 그대로 부름', mapSource217.indexOf('buildShareUrl(pins)') > 0 && /onShare=\{\(\) => \{[\s\S]{0,120}?shareMyMap\(\);/.test(mapSource217)],
  ['지도 공유: 메뉴를 닫고 공유 시트/클립보드로', /onShare=\{\(\) => \{\s*\n\s*setToolsOpen\(false\);\s*\n\s*shareMyMap\(\);/.test(mapSource217)],
  // ⑦ 상태·버전
  ['지도: 도구 펼친 상태는 기본적으로 접힘', /const \[toolsOpen, setToolsOpen\] = useState\(false\)/.test(mapSource217)],
  ['버전: 메뉴·프로필 모두 v2.17.0', APP_VERSION_LABEL === '릴스핀 v2.17.0' && fs.readFileSync(path.join(process.cwd(), 'src/screens/ProfileScreen.js'), 'utf8').indexOf('릴스핀 v2.17.0') > 0],
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
  2;
if (failed) { console.log('SMOKE_FAILED=' + failed); process.exit(1); }
console.log('SMOKE_OK ' + total + '/' + total);
