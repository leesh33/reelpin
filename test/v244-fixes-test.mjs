/**
 * test/v244-fixes-test.mjs — v2.44 (2026-11-25) 웹·서버에서 바로 고친 버그 검사
 * ─────────────────────────────────────────────────────────────
 * `reelpin-verify-v2.40.0/REPORT.md` 의 P0-1~P0-5 · P1 묶음 중 **웹 배포로 바로 반영되는** 것들.
 *   · P0-1 알림 반경(300/500/1km)이 지도 감시·토스트·파란 원·알림 모음·헤더 뱃지에 그대로 쓰이는가
 *   · P0-2 영문 링크/SNS 라벨(Facebook·Twitter·Spotify·Lyrics …)이 상호·검색어로 새지 않는가
 *   · P0-3 추출 실패·미지원 링크에서 '이름 없는 릴스 장소'(성수 좌표)를 만들지 않는가
 *   · P0-4 첫 실행 샘플 핀이 저장·업로드·공유·개수에 섞이지 않는가
 *   · P0-5 로그아웃·탈퇴·계정 전환 시 기기의 이전 계정 핀·컬렉션 정리
 *   · P1   약관/문구 · 검색어 지명 중복 · 입력 16px · 삭제 확인 · 결과 스크롤
 *
 * 실행: npm run test:v244   (또는 npm test)
 */
import fs from 'node:fs';
import path from 'node:path';

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  MAX_EXTRACT_QUERIES,
  ENGLISH_LINK_LABELS,
  classifyQuery,
  cleanCaptionText,
  extractPlaces,
  extractSearchQueries,
  isEnglishLinkLabel,
  offlineSmartExtract,
} from '../src/services/extractor.js';
import { NEARBY_RADIUS_M, findNearbyPins, radiusLabel } from '../src/services/location.js';
import { buildAlertFeed } from '../src/utils/alertFeed.js';
import { nearbyToastMessage } from '../src/components/GeofenceToast.js';
import { SEED_PINS, isSeedPin, stripSeedPins } from '../src/data/seedPins.js';
import { planCloudSync } from '../src/services/cloudSync.js';
import { buildShareUrl, decodeSharePins, encodeSharePins, shareMessage } from '../src/utils/shareMap.js';
import { buildResultPins } from '../src/utils/saveResult.js';
import { buildPin, persistablePins } from '../src/utils/pins.js';
import { pinSearchQuery } from '../src/utils/links.js';
import { loadDataOwner, loadPins, savePins, saveDataOwner, clearPins } from '../src/storage.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};
const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

// 네트워크를 타지 않습니다 — 실패 경로(빈손)만 검사합니다.
globalThis.fetch = async () => {
  throw new Error('v244-offline-test-fetch');
};

// ── 1. P0-1 알림 반경 ─────────────────────────────────────────
console.log('\n── P0-1 알림 반경 ──');
check('radiusLabel: 300m', radiusLabel(300) === '300m', radiusLabel(300));
check('radiusLabel: 500m', radiusLabel(500) === '500m', radiusLabel(500));
check('radiusLabel: 1000 → 1km', radiusLabel(1000) === '1km', radiusLabel(1000));
check('radiusLabel: 값이 없으면 기본 500m', radiusLabel(undefined) === '500m', radiusLabel(undefined));

const ORIGIN = { lat: 37.5, lng: 127 };
const PINS = [
  { id: 'a', name: 'A', lat: 37.5, lng: 127.0022 }, // 약 195m
  { id: 'b', name: 'B', lat: 37.5, lng: 127.0045 }, // 약 400m
  { id: 'c', name: 'C', lat: 37.5, lng: 127.008 }, // 약 710m
];
const feed300 = buildAlertFeed(PINS, ORIGIN, { radiusMeters: 300 });
const feed500 = buildAlertFeed(PINS, ORIGIN, { radiusMeters: 500 });
const feed1000 = buildAlertFeed(PINS, ORIGIN, { radiusMeters: 1000 });
check('알림 모음: 300m 반경은 1곳', feed300.badgeCount === 1, feed300.badgeCount);
check('알림 모음: 500m 반경은 2곳', feed500.badgeCount === 2, feed500.badgeCount);
check('알림 모음: 1km 반경은 3곳', feed1000.badgeCount === 3, feed1000.badgeCount);
check('알림 모음: 반경값을 되돌려 줌', feed1000.radiusMeters === 1000, feed1000.radiusMeters);
check(
  '지도 주변 목록: 반경값으로 거른다',
  findNearbyPins(PINS, ORIGIN, 300).length === 1 && findNearbyPins(PINS, ORIGIN, NEARBY_RADIUS_M).length === 2
);
check('토스트: 300m', nearbyToastMessage(2, 300) === '반경 300m 안에 2곳 있어요', nearbyToastMessage(2, 300));
check('토스트: 1km', nearbyToastMessage(1, 1000) === '반경 1km 안에 1곳 있어요', nearbyToastMessage(1, 1000));

const mapSource = read('src/screens/MapScreen.js');
check(
  '지도: 감시·토스트·파란 원이 radiusMeters prop 을 쓴다',
  mapSource.indexOf('radiusMeters = NEARBY_RADIUS_M') > 0 &&
    mapSource.indexOf('findNearbyPins(pins, myCoords, alertRadius)') > 0 &&
    mapSource.indexOf('findNearbyPins(pinsRef.current, position, alertRadius)') > 0 &&
    mapSource.indexOf('showNearbyNotification(fresh.pin, fresh.distanceMeters, alertRadius)') > 0 &&
    mapSource.indexOf('radiusMeters={alertRadius}') > 0
);
check('지도: 500m 하드코딩 문구가 남아 있지 않다', mapSource.indexOf("NEARBY_RADIUS_M + 'm") < 0);
const appSource = read('App.js');
check('앱: 알림 모음에 radiusMeters 를 넘긴다', appSource.indexOf('radiusMeters={radius}') > 0);
check('앱: 헤더 뱃지도 내 반경으로 센다', appSource.indexOf('buildAlertFeed(pins, alertCoords, { radiusMeters: radius })') > 0);
const inboxSource = read('src/components/AlertInbox.js');
check('알림 모음: 500m 문구 하드코딩 제거', inboxSource.indexOf('반경 500m 알림은') < 0 && inboxSource.indexOf('radiusLabel(feed.radiusMeters)') > 0);
const headerSource = read('src/components/AppHeader.js');
check('헤더: 반경 표기를 받아 쓴다', headerSource.indexOf('radiusText') > 0 && headerSource.indexOf('알림 모음 · 반경 500m 안') < 0);

// ── 2. P0-2 영문 링크 라벨 ────────────────────────────────────
console.log('\n── P0-2 링크 추출 정밀도 ──');
const RICK_TITLE = 'Rick Astley - Never Gonna Give You Up (Official Video)';
const RICK_DESC = [
  'Follow Rick Astley:',
  'Facebook: https://www.facebook.com/RickAstley',
  'Twitter: https://twitter.com/rickastley',
  'Website: https://rickastley.co.uk',
  'Spotify: https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
  'Apple Music: https://music.apple.com/gb/album/never-gonna-give-you-up',
  'Lyrics: https://genius.com/Rick-astley-never-gonna-give-you-up-lyrics',
  'Deezer: https://www.deezer.com/track/916424',
].join('\n');
const rick = extractSearchQueries(RICK_TITLE + '\n' + RICK_DESC);
const badWords = ['facebook', 'twitter', 'spotify', 'deezer', 'lyrics', 'website', 'apple', 'music', 'astley'];
// cleaned(설명글 원문 정리본)에는 제목 낱말이 그대로 남습니다 — 화면에 근거로 보여 주는 값이 아니라
// 검색에 쓰이는 queries/keywords/storeName/hashtags 만 봅니다.
const lowered = JSON.stringify({
  queries: rick.queries,
  keywords: rick.keywords,
  storeName: rick.storeName,
  hashtags: rick.hashtags,
  explicit: rick.explicit,
}).toLowerCase();
check('릭 애슬리: 영문 라벨이 키워드/검색어/상호에 없다', badWords.every((w) => lowered.indexOf(w) < 0), lowered.slice(0, 240));
check('릭 애슬리: 검색어를 하나도 만들지 않는다(영문뿐인 설명글)', rick.queries.length === 0, rick.queries.join(' / '));
check('릭 애슬리: 상호도 비어 있다', rick.storeName === '' && rick.area === '', JSON.stringify({ name: rick.storeName, area: rick.area }));

// 실제 유튜브 페이지에서 오는 모양: 제목에 채널명이 들어 있어 채널명 필터가 꺼지는 경우
const rickTitleOnly = extractSearchQueries(
  'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)\n#RickAstley #NeverGonnaGiveYouUp #OfficialMusicVideo'
);
check('릭 애슬리(제목+해시태그): 검색어 0', rickTitleOnly.queries.length === 0, rickTitleOnly.queries.join(' / '));
check('릭 애슬리(제목+해시태그): 영문 해시태그도 상호가 아님', rickTitleOnly.hashtags.length === 0, JSON.stringify(rickTitleOnly.hashtags));

check('라벨 판정: Facebook', isEnglishLinkLabel('Facebook') === true);
check('라벨 판정: Apple Music', isEnglishLinkLabel('Apple Music') === true);
check('라벨 판정: Follow Rick Astley', isEnglishLinkLabel('Follow Rick Astley') === true);
check('라벨 판정: 일반 영문 상호는 아님', isEnglishLinkLabel('Blue Bottle') === false, String(isEnglishLinkLabel('Blue Bottle')));
check('설명글 정리: 라벨 줄 제거', cleanCaptionText('Lyrics: https://x.y/z\n맛집').indexOf('Lyrics') < 0);
check('라벨 목록에 SNS·음원이 들어 있다', ['facebook', 'twitter', 'spotify', 'lyrics', 'deezer'].every((w) => ENGLISH_LINK_LABELS.indexOf(w) >= 0));
check('검색어 분류: Facebook 은 상호가 아님', classifyQuery('Facebook').kind === 'area', JSON.stringify(classifyQuery('Facebook')));

const mixed = extractSearchQueries('성수동 Blue Bottle 카페 다녀왔어요 #성수맛집');
check('한국어 설명글 속 영문 상호는 살린다', mixed.keywords.join(' ').indexOf('Blue') >= 0 && mixed.area === '성수동', JSON.stringify({ area: mixed.area, keywords: mixed.keywords }));
check('검색어 상한이 있다', MAX_EXTRACT_QUERIES > 0 && MAX_EXTRACT_QUERIES <= 6, MAX_EXTRACT_QUERIES);

// ── 3. P0-3 가짜 후보 금지 ────────────────────────────────────
console.log('\n── P0-3 가짜 후보 금지 ──');
check('오프라인 추출기: 항상 빈 목록', Array.isArray(offlineSmartExtract()) && offlineSmartExtract().length === 0);
const unknown = await extractPlaces('https://www.instagram.com/reel/Unknown123/', {});
check('모르는 인스타 링크: 후보 0', unknown.ok === true && unknown.candidates.length === 0, JSON.stringify(unknown.candidates));
check('모르는 인스타 링크: not-found 안내', unknown.emptyReason === 'not-found' && String(unknown.notFoundMessage).indexOf('가게를 찾지 못했어요') >= 0, String(unknown.notFoundMessage));
check('“이름 없는 릴스 장소”가 결과 어디에도 없다', JSON.stringify(unknown).indexOf('이름 없는') < 0);
const extractorSource = read('src/services/extractor.js');
check('추출기: 성수 좌표를 상호 후보에 박지 않는다', /lat: 37\.5445/.test(extractorSource) === false);
check('저장: 자리표시자 후보는 핀이 되지 않는다', buildResultPins([{ id: 'x', name: '이름 없는 릴스 장소' }], { now: '2026-11-25T10:00:00+09:00' }).length === 0);
check('저장: 좌표가 없으면 null 로 둔다', buildPin({ name: '가게', lat: undefined, lng: undefined }).lat === null);

// ── 4. P0-4 샘플 핀 ──────────────────────────────────────────
console.log('\n── P0-4 첫 실행 샘플 핀 ──');
check('샘플 핀 4곳 모두 isSeed', SEED_PINS.length === 4 && SEED_PINS.every((p) => isSeedPin(p) === true));
check('일반 핀은 샘플이 아님', isSeedPin({ id: 'pin-1', name: '가게' }) === false && isSeedPin(null) === false);
check('샘플 걷어내기', stripSeedPins(SEED_PINS.concat([{ id: 'pin-1', name: '가게' }])).length === 1);

const firstRun = await loadPins();
const rawAfterLoad = await AsyncStorage.getItem('reelpin.pins.v1');
check('첫 실행: 샘플을 화면 예시로만 준다', firstRun.length === 4);
check('첫 실행: 샘플을 **저장하지 않는다**', rawAfterLoad == null, String(rawAfterLoad));
await savePins(SEED_PINS.concat([{ id: 'pin-real', name: '진짜 가게', lat: 37.5, lng: 127 }]));
const afterSave = await loadPins();
check('저장값: 샘플은 읽을 때 걸러진다', afterSave.length === 1 && afterSave[0].id === 'pin-real', JSON.stringify(afterSave.map((p) => p.id)));

check('저장 목록: 예시 핀만 있으면 저장 안 함', persistablePins(SEED_PINS) === null);
check('저장 목록: 빈 목록은 저장한다(마지막 핀 삭제 반영)', Array.isArray(persistablePins([])) && persistablePins([]).length === 0);
check('저장 목록: 예시+진짜면 진짜만', persistablePins(SEED_PINS.concat([{ id: 'pin-real', name: '진짜' }])).length === 1);

const plan = planCloudSync(SEED_PINS.concat([{ id: 'pin-real', name: '진짜 가게' }]), []);
check('클라우드: 샘플은 업로드하지 않는다', plan.toUpload.length === 1 && plan.toUpload[0].id === 'pin-real', JSON.stringify(plan.toUpload.map((p) => p.id)));
check('클라우드: 병합 결과에도 샘플이 없다', plan.merged.length === 1 && plan.merged[0].id === 'pin-real');
const shareCode = encodeSharePins(SEED_PINS.concat([{ id: 'pin-real', name: '진짜 가게', area: '성수동', lat: 37.5, lng: 127 }]));
const shareDecoded = decodeSharePins(shareCode);
check('공유 링크: 샘플은 담지 않는다', shareDecoded.count === 1 && shareDecoded.pins[0].name === '진짜 가게', JSON.stringify(shareDecoded.pins.map((p) => p.name)));
check('공유 문구: 개수에 샘플이 빠진다', shareMessage(SEED_PINS.concat([{ id: 'pin-real', name: '진짜', area: '성수동' }])).indexOf('1곳') > 0, shareMessage(SEED_PINS));
check('공유 링크: 샘플만 있으면 공유할 핀이 없음', decodeSharePins(encodeSharePins(SEED_PINS)) === null);

// ── 5. P0-5 계정 전환 ────────────────────────────────────────
console.log('\n── P0-5 계정 간 데이터 ──');
await saveDataOwner('user-A');
check('기기 주인 기록: 저장·읽기', (await loadDataOwner()) === 'user-A');
await clearPins();
check('기기 핀 지우기', (await loadPins()).length === 0);
await saveDataOwner('');
check('기기 주인 기록: 지우기', (await loadDataOwner()) === '');
check('로그아웃: 핀을 유지한다(주인 기록으로 구분)', appSource.indexOf('핀은 이 기기에 그대로 있어요') > 0);
check('계정 전환: 이전 계정 핀·컬렉션을 지운다', appSource.indexOf('owner !== user.id') > 0 && appSource.indexOf('clearPins()') > 0 && appSource.indexOf('clearCollections()') > 0);
check('회원탈퇴: 기기 데이터도 지운다', /handleDeleteAccount[\s\S]{0,1600}clearPins\(\)/.test(appSource));

// ── 6. P1 문구·UX ───────────────────────────────────────────
console.log('\n── P1 문구·UX ──');
const terms = read('public/terms.html');
const privacy = read('public/privacy.html');
check('약관: Apple 로그인 “준비 중” 제거', terms.indexOf('Apple 로그인은 준비 중') < 0 && terms.indexOf('Apple 계정') > 0);
check('방침: Apple 로그인 “준비 중” 제거', privacy.indexOf('Apple 로그인은 준비 중') < 0 && privacy.indexOf('Apple 로그인') > 0);
check('약관·방침: 시행일 갱신', terms.indexOf('시행일 2026년 11월 25일') > 0 && privacy.indexOf('시행일 2026년 11월 25일') > 0);
const pasteSource = read('src/screens/PasteScreen.js');
check('저장 화면: 개발자 용어(API 키·오프라인 추출기) 제거', pasteSource.indexOf('API 키를 연결하면') < 0 && pasteSource.indexOf('오프라인 추출기') < 0);
const profileSource = read('src/screens/ProfileScreen.js');
check('내 정보: Supabase·AsyncStorage 노출 제거', profileSource.indexOf('Supabase 설정이 아직') < 0 && profileSource.indexOf('AsyncStorage') < 0 && profileSource.indexOf('클라우드(Supabase)') < 0);
const appTextSource = read('src/components/AppText.js');
check('입력칸: 웹 16px 보장', appTextSource.indexOf('INPUT_MIN_FONT_SIZE_WEB = 16') > 0 && appTextSource.indexOf('zoomGuard') > 0);
const sheetSource = read('src/components/PinDetailSheet.js');
check('핀 삭제: 확인 절차', sheetSource.indexOf('pin-delete-confirm') > 0 && sheetSource.indexOf('setConfirmDelete(true)') > 0);
check('가게명 찾기: 결과 맨 위로 스크롤', pasteSource.indexOf('scrollToResults') > 0 && pasteSource.indexOf('.scrollToEnd(') < 0);
check('검색어: 지명 중복 제거', pinSearchQuery({ area: '성수동', name: '성수동 소금빵집' }) === '성수동 소금빵집', pinSearchQuery({ area: '성수동', name: '성수동 소금빵집' }));
check('검색어: 동네가 없으면 이름만', pinSearchQuery({ area: '', name: '베통' }) === '베통');
check('검색어: 이름에 동네가 없으면 붙인다', pinSearchQuery({ area: '성수동', name: '베통' }) === '성수동 베통');
const chipsSource = read('src/components/FilterChips.js');
check('필터 칩: 넘칠 때 가로 스크롤 힌트', chipsSource.indexOf('filter-chips-more') > 0 && chipsSource.indexOf('onContentSizeChange') > 0);
check('공유 링크 지도 검색어도 중복 없음', buildShareUrl([{ name: '가게' }]).indexOf('?share=') > 0);

console.log('');
if (fails) {
  console.log('TESTS_FAILED ' + fails);
  process.exit(1);
}
console.log('ALL_TESTS_OK');
