import React from 'react';
import { renderToString } from 'react-dom/server';
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
import fs from 'node:fs';
import path from 'node:path';
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

const cases = [
  ['MapScreen', <MapScreen pins={SEED_PINS} selectedPinId={SEED_PINS[0].id} onSelectPin={noop} radiusMeters={300} onGoPaste={noop} onDeletePin={noop} onToast={noop} />],
  ['MapScreen(empty)', <MapScreen pins={[]} selectedPinId={null} onSelectPin={noop} radiusMeters={500} onGoPaste={noop} onDeletePin={noop} onToast={noop} />],
  ['PasteScreen', <PasteScreen active pinCount={4} isPro={false} onSaved={noop} onClose={noop} onGoProfile={noop} onToast={noop} />],
  ['PasteScreen(가게명 찾기)', <PasteScreen active pinCount={4} isPro={false} initialMode="search" onSaved={noop} onClose={noop} onGoProfile={noop} onToast={noop} />],
  ['PasteScreen(limit)', <PasteScreen active pinCount={10} isPro={false} onSaved={noop} onClose={noop} onGoProfile={noop} onToast={noop} />],
  ['ProfileScreen', <ProfileScreen name="이상훈" handle="odol" pins={SEED_PINS} radiusMeters={300} onChangeRadius={noop} isPro={false} onStartPro={noop} onGoPaste={noop} onToast={noop} />],
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

const total = cases.length + contentCases.length + 1 + mapChecks.length + 2;
if (failed) { console.log('SMOKE_FAILED=' + failed); process.exit(1); }
console.log('SMOKE_OK ' + total + '/' + total);
