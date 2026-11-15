import React from 'react';
import { renderToString } from 'react-dom/server';
import App from '../App';
import MapScreen from '../src/screens/MapScreen';
import PasteScreen from '../src/screens/PasteScreen';
import ProfileScreen from '../src/screens/ProfileScreen';
import PinDetailSheet from '../src/components/PinDetailSheet';
import ProviderBadges from '../src/components/ProviderBadge';
import ExtractedTitleNote from '../src/components/ExtractedTitleNote';
import GeofenceBanner from '../src/components/GeofenceBanner';
import FilterChips from '../src/components/FilterChips';
import TabBar from '../src/components/TabBar';
import MapCanvas from '../src/components/MapCanvas';
import RealMapViewWeb, {
  NAVER_MAP_CLIENT_ID,
  buildNaverScriptUrl,
  resolveNaverClientId,
  FALLBACK_NOTICE,
  FALLBACK_NOTICE_NETWORK,
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
import { injectPwaHead, PWA_REQUIRED_MARKERS } from '../scripts/patch-web-html.mjs';
import { colors, mapControls } from '../src/theme';
import { SEED_PINS } from '../src/data/seedPins';

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
  ['GeofenceBanner', <GeofenceBanner pin={SEED_PINS[0]} radiusMeters={1000} onPress={noop} />],
  ['GeofenceBanner(empty)', <GeofenceBanner pin={null} radiusMeters={300} onPress={noop} empty />],
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
  ['PasteScreen: 모드 전환 버튼', <PasteScreen active pinCount={4} isPro={false} onSaved={noop} onClose={noop} onGoProfile={noop} onToast={noop} />, ['릴스 링크', '가게명으로 찾기']],
  ['PasteScreen(가게명 찾기): 검색 입력·버튼', <PasteScreen active pinCount={4} isPro={false} initialMode="search" onSaved={noop} onClose={noop} onGoProfile={noop} onToast={noop} />, ['가게명 · 동네', '가게 찾기', '성수동 소금빵']],
  ['PasteScreen: 혼합 붙여넣기 안내', <PasteScreen active pinCount={4} isPro={false} onSaved={noop} onClose={noop} onGoProfile={noop} onToast={noop} />, ['문구를 통째로 붙여넣어도 돼요', '유튜브는 제목을']],
  ['ExtractedTitleNote: 읽어온 제목 표기', <ExtractedTitleNote title="성수동 소금빵 맛집 베통" />, ['읽어온 제목:', '성수동 소금빵 맛집 베통']],
  ['ExtractedTitleNote: 인스타 안내 + 원탭 버튼', <ExtractedTitleNote notice="인스타는 보안상 제목을 못 읽어와요" onSearchByName={noop} />, ['인스타는 보안상 제목을 못 읽어와요', '가게명으로 찾기']],
  ['MapScreen: 내 위치·주변 500m 버튼', <MapScreen pins={SEED_PINS} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} />, ['주변 500m', '내 위치를 켜면 실제 거리']],
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
  ['MapScreen: 지도 공유 버튼', <MapScreen pins={SEED_PINS} selectedPinId={null} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} />, ['지도 공유']],
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
  ['App: 일괄 저장 시 이름+좌표 중복 제거', appSource.indexOf('splitNewPins') > 0],
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
  ['지도 우측 하단: +/− 박스가 주변 500m·지도 공유·내 위치와 같은 rightInset',
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
  ['버전: package.json 2.1.0', pkg.version === '2.1.0', pkg.version],
  ['버전: app.json 2.1.0', expoConfig.version === '2.1.0', expoConfig.version],
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
  pwaChecks.length +
  assetChecks.length +
  2;
if (failed) { console.log('SMOKE_FAILED=' + failed); process.exit(1); }
console.log('SMOKE_OK ' + total + '/' + total);
