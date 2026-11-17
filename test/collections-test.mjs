/**
 * test/collections-test.mjs — v2.19.0 (v2.19.1 에서 서브 페이지 4종으로 확장)
 * ─────────────────────────────────────────────────────────────
 * 「컬렉션」 = 저장한 핀을 테마·코스별로 묶어 보고, 그 묶음만 지도에서 보기·공유.
 *
 *   · src/utils/collections.js … 만들기(이름 검사·중복 이름) · 이름/설명/이모지/색 수정 ·
 *                               핀 담기/빼기(중복 없이, 담은 순서 유지) · 삭제 ·
 *                               핀 삭제 시 자동 정리(prune) · 공유 문구 · 지도 필터용 id 집합
 *   · src/storage.js           … 컬렉션 저장 키(reelpin.collections.v1) · 읽기/쓰기
 *   · 화면·앱 소스            … 탭 구성(지도 · 저장 · 컬렉션), 내 정보 제거, 지도 상단 📂 칩,
 *                               ☰ 시트의 설정 행 → 서브 페이지, 버전 2.19.1
 *
 * 네트워크를 타지 않습니다. AsyncStorage 는 가짜 객체입니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  COLLECTION_COLORS,
  COLLECTION_EMOJIS,
  COLLECTION_MAX_DESC,
  COLLECTION_MAX_NAME,
  DEFAULT_COLLECTION_COLOR,
  DEFAULT_COLLECTION_EMOJI,
  addPinsToCollection,
  collectionFilterLabel,
  collectionPinIdSet,
  collectionPreviewNames,
  collectionShareText,
  collectionSummary,
  collectionsOverview,
  createCollection,
  findCollectionByName,
  newCollectionId,
  normalizeCollection,
  normalizeCollections,
  pinsOfCollection,
  pruneCollections,
  removeCollection,
  removePinsFromCollection,
  toggleCollectionPin,
  updateCollection,
} from '../src/utils/collections.js';

let failed = 0;
const check = (label, ok, extra) => {
  if (ok) console.log('OK   ' + label);
  else {
    failed += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

const PINS = [
  { id: 'p-1', name: '검단 이니야', category: '맛집', area: '당하동', lat: 37.5831, lng: 126.7146, visited: true },
  { id: 'p-2', name: '당하 순대국', category: '맛집', area: '당하동', lat: 37.5842, lng: 126.7129, visited: false },
  { id: 'p-3', name: '검단 카페', category: '카페', area: '당하동', lat: 37.5808, lng: 126.7168, visited: false },
  { id: 'p-4', name: '아라뱃길 산책', category: '가볼곳', area: '검단', lat: 37.5748, lng: 126.7029, visited: true },
];

// ── 1. 만들기 ─────────────────────────────────────────────
const created = createCollection([], { name: '  검단 점심 코스 ', desc: '회사 근처 12시', emoji: '🍜', color: '#0FA968' }, '2026-11-16T12:00:00.000Z');
check('만들기: 이름 공백 정리', created.ok && created.item.name === '검단 점심 코스', created.item && created.item.name);
check('만들기: 설명·이모지·색 보존', created.item.desc === '회사 근처 12시' && created.item.emoji === '🍜' && created.item.color === '#0FA968');
check('만들기: 빈 핀 목록 + 생성/수정 시각', Array.isArray(created.item.pinIds) && created.item.pinIds.length === 0 && created.item.createdAt === '2026-11-16T12:00:00.000Z');
check('만들기: id 는 col- 접두', /^col-[a-z0-9]+-[a-z0-9]+$/.test(created.item.id), created.item.id);

const empty = createCollection([], { name: '   ' });
check('만들기: 이름이 비면 거절 + 안내', !empty.ok && empty.message.indexOf('이름') > 0, empty.message);

const dup = createCollection(created.collections, { name: '검단 점심 코스' });
check('만들기: 같은 이름은 거절(공백·대소문자 무시)', !dup.ok && dup.message.indexOf('같은 이름') >= 0, dup.message);

// 이름 상한
const longName = createCollection([], { name: 'ㄱ'.repeat(COLLECTION_MAX_NAME + 10) });
check('만들기: 이름은 ' + COLLECTION_MAX_NAME + '자로 자름', longName.item.name.length === COLLECTION_MAX_NAME);
const longDesc = createCollection([], { name: '설명 테스트', desc: 'ㄴ'.repeat(COLLECTION_MAX_DESC + 5) });
check('만들기: 설명은 ' + COLLECTION_MAX_DESC + '자로 자름', longDesc.item.desc.length === COLLECTION_MAX_DESC);

// 기본값
const plain = createCollection([], { name: '기본값' });
check('만들기: 이모지·색 기본값', plain.item.emoji === DEFAULT_COLLECTION_EMOJI && plain.item.color === DEFAULT_COLLECTION_COLOR);
check('이모지 목록에 기본값 포함 · 색 6종', COLLECTION_EMOJIS.indexOf(DEFAULT_COLLECTION_EMOJI) === 0 && COLLECTION_COLORS.length === 6);

// ── 2. 수정 ───────────────────────────────────────────────
const list1 = created.collections;
const renamed = updateCollection(list1, created.item.id, { name: '검단 점심', desc: '12시~1시', emoji: '🍱' }, '2026-11-16T13:00:00.000Z');
check('수정: 이름·설명·이모지 반영 + updatedAt', renamed.ok && renamed.item.name === '검단 점심' && renamed.item.desc === '12시~1시' && renamed.item.emoji === '🍱' && renamed.item.updatedAt === '2026-11-16T13:00:00.000Z');
const blankRename = updateCollection(list1, created.item.id, { name: '  ' });
check('수정: 빈 이름은 거절', !blankRename.ok && blankRename.message.indexOf('이름') > 0);
const missing = updateCollection(list1, 'col-nope', { name: 'x' });
check('수정: 없는 컬렉션은 거절', !missing.ok);

const second = createCollection(list1, { name: '커피 코스' });
const clash = updateCollection(second.collections, second.item.id, { name: '검단 점심 코스' });
check('수정: 다른 컬렉션과 같은 이름은 거절', !clash.ok && clash.message.indexOf('같은 이름') >= 0);

// ── 3. 핀 담기·빼기 ───────────────────────────────────────
const colId = created.item.id;
let work = createCollection([], { name: '점심' }).collections;
let r1 = toggleCollectionPin(work, work[0].id, 'p-1');
check('담기: 첫 핀', r1.ok && r1.added === true && r1.item.pinIds.join(',') === 'p-1');
let r2 = toggleCollectionPin(r1.collections, work[0].id, 'p-3');
let r3 = toggleCollectionPin(r2.collections, work[0].id, 'p-2');
check('담기: 담은 순서 유지', r3.item.pinIds.join(',') === 'p-1,p-3,p-2', r3.item.pinIds.join(','));
const r4 = toggleCollectionPin(r3.collections, work[0].id, 'p-3');
check('빼기: 같은 핀을 다시 누르면 빠짐', r4.ok && r4.added === false && r4.item.pinIds.join(',') === 'p-1,p-2');
const again = toggleCollectionPin(r4.collections, work[0].id, 'p-99');
check('담기: 없는 핀 id 도 목록에는 담김(나중에 prune)', again.item.pinIds.indexOf('p-99') >= 0);

const many = addPinsToCollection(again.collections, work[0].id, ['p-1', 'p-4', 'p-4']);
check('여러 개 담기: 이미 담긴 핀은 건너뜀', many.ok && many.added === 1 && many.item.pinIds.join(',') === 'p-1,p-2,p-99,p-4');
const removedMany = removePinsFromCollection(many.collections, work[0].id, ['p-2', 'p-4']);
check('여러 개 빼기', removedMany.removed === 2 && removedMany.item.pinIds.join(',') === 'p-1,p-99');

// ── 4. 핀 삭제 시 자동 정리 ───────────────────────────────
const pruned = pruneCollections([{ ...many.item }], PINS);
check('정리: 지도에 없는 핀 id 는 컬렉션에서 사라짐', pruned.changed && pruned.collections[0].pinIds.indexOf('p-99') < 0, JSON.stringify(pruned.collections[0].pinIds));
check('정리: 남은 핀은 그대로', pruned.collections[0].pinIds.join(',') === 'p-1,p-2,p-4');
const noChange = pruneCollections(pruned.collections, PINS);
check('정리: 바뀔 게 없으면 같은 배열(불필요한 저장 없음)', noChange.changed === false && noChange.collections === pruned.collections);

// ── 5. 조회 ───────────────────────────────────────────────
const collec = { ...pruned.collections[0] };
check('조회: 담은 순서대로 핀 객체', pinsOfCollection(collec, PINS).map((p) => p.name).join('|') === '검단 이니야|당하 순대국|아라뱃길 산책');
check('조회: 없는 핀은 건너뜀', pinsOfCollection({ ...collec, pinIds: ['p-1', 'zz'] }, PINS).length === 1);
check('미리보기: 앞 2개 이름', collectionPreviewNames(collec, PINS, 2).join('|') === '검단 이니야|당하 순대국');
check('요약: 3곳 · 가본 곳 2', collectionSummary(collec, PINS) === '3곳 · 가본 곳 2', collectionSummary(collec, PINS));
check('요약: 빈 컬렉션', collectionSummary({ ...collec, pinIds: [] }, PINS) === '아직 담은 핀이 없어요');
check('필터: id 집합', collectionPinIdSet(collec).has('p-1') && !collectionPinIdSet(collec).has('p-3'));
check('필터: 지도 칩 문구', collectionFilterLabel(collec, PINS) === collec.name + ' · 3곳', collectionFilterLabel(collec, PINS));
const overview = collectionsOverview([collec, { ...collec, id: 'col-2', pinIds: ['p-3'] }], PINS);
check('개요: 컬렉션 2개 · 4곳 담김', overview.collections === 2 && overview.pins === 4, JSON.stringify(overview));

// ── 6. 공유 문구 ──────────────────────────────────────────
const shareText = collectionShareText(collec, PINS);
check('공유: 제목 줄', shareText.split('\n')[0] === collec.emoji + ' ' + collec.name + ' · 3곳', shareText.split('\n')[0]);
check('공유: 1) 이름 (분류 · 동네)', shareText.indexOf('1. 검단 이니야 (맛집 · 당하동)') > 0, shareText);
check('공유: 링크를 넘기면 마지막 줄에', collectionShareText(collec, PINS, { url: 'https://reelpin.vercel.app/?share=rtest' }).indexOf('\nhttps://reelpin.vercel.app/?share=rtest') > 0);
check('공유: 빈 컬렉션은 제목만', collectionShareText({ ...collec, pinIds: [] }, PINS) === collec.emoji + ' ' + collec.name + ' · 0곳');

// ── 7. 삭제 · 정규화 ──────────────────────────────────────
const removedCol = removeCollection([collec, { ...collec, id: 'col-2' }], 'col-2');
check('삭제: 남은 컬렉션만', removedCol.ok && removedCol.collections.length === 1 && removedCol.collections[0].id === collec.id);
check('삭제: 없는 id 는 거절', removeCollection([collec], 'col-x').ok === false);

const messy = normalizeCollections([
  null,
  { name: '  ', id: 'a' },
  { name: '정상', pinIds: ['p-1', 'p-1', ' ', 'p-2'], color: 'red', emoji: '' },
  { name: '중복 id', id: 'col-1' },
  { name: '중복 id', id: 'col-1' },
]);
check('정규화: 이름 없는 항목 제거', messy.length === 3, messy.length);
check('정규화: 핀 id 중복·빈 값 제거', messy[0].pinIds.join(',') === 'p-1,p-2', messy[0].pinIds.join(','));
check('정규화: 잘못된 색은 코랄 · 빈 이모지 기본값', messy[0].color === DEFAULT_COLLECTION_COLOR && messy[0].emoji === DEFAULT_COLLECTION_EMOJI);
check('정규화: id 중복은 뒤에 번호', messy[1].id !== messy[2].id, messy[1].id + '/' + messy[2].id);
check('정규화: 배열 아니면 빈 목록', normalizeCollections('nope').length === 0 && normalizeCollections(null).length === 0);

const sameName = findCollectionByName([collec], '  ' + collec.name.toUpperCase() + ' ');
check('이름 찾기: 공백·대소문자 무시', !!sameName);
check('id 생성: 두 번 만들면 다름', newCollectionId() !== newCollectionId());

// ── 8. 저장 키 · 화면 소스 ────────────────────────────────
const storageSource = fs.readFileSync(path.join(process.cwd(), 'src/storage.js'), 'utf8');
check('저장: 컬렉션 키 reelpin.collections.v1', storageSource.indexOf("'reelpin.collections.v1'") > 0);
check('저장: loadCollections · saveCollections 내보냄', /export async function loadCollections/.test(storageSource) && /export async function saveCollections/.test(storageSource));
check('저장: 읽을 때 normalizeCollections 로 다듬음', /loadCollections[\s\S]{0,260}?normalizeCollections/.test(storageSource));

const appSource = fs.readFileSync(path.join(process.cwd(), 'App.js'), 'utf8');
check('앱: 컬렉션 불러오기 · 저장 · 핀 삭제 시 정리', appSource.indexOf('loadCollections()') > 0 && appSource.indexOf('saveCollections(collections)') > 0 && appSource.indexOf('pruneCollections(prev, pins)') > 0);
check('앱: 탭에 collections 포함 · profile 제거', appSource.indexOf("tab !== 'collections'") > 0 && appSource.indexOf("tab !== 'profile'") < 0);

const screenSource = fs.readFileSync(path.join(process.cwd(), 'src/screens/CollectionsScreen.js'), 'utf8');
check('화면: 새 컬렉션 · 지도에서 보기 · 공유 · 관리', ['collection-new', '지도에서 보기', '공유', '관리'].every((t) => screenSource.indexOf(t) >= 0));
check('화면: 체크박스로 담기/빼기 (role=checkbox)', screenSource.indexOf('accessibilityRole="checkbox"') > 0 && screenSource.indexOf('collection-pin-check-') > 0);
check('화면: 이름·설명 수정 + 삭제 확인', screenSource.indexOf('collection-edit-save') > 0 && screenSource.indexOf('collection-delete-confirm') > 0);
check('화면: 공유 문구에 지도 링크(buildShareUrl)', screenSource.indexOf('buildShareUrl(items)') > 0);

const mapSource = fs.readFileSync(path.join(process.cwd(), 'src/screens/MapScreen.js'), 'utf8');
check('지도: 컬렉션 필터(collectionFilter) + 해제 칩', mapSource.indexOf('collectionFilter') > 0 && mapSource.indexOf('map-collection-chip') > 0 && mapSource.indexOf('collectionIdSet') > 0);

const menuSource = fs.readFileSync(path.join(process.cwd(), 'src/components/MenuDrawerModal.js'), 'utf8');
check('☰: 내 정보 머지(ProfileScreen panel) + 서브 4종(알림 설정 포함)', menuSource.indexOf('panel') > 0 && ['categories', 'radius', 'alerts', 'about'].every((k) => menuSource.indexOf("'" + k + "'") >= 0));
check('☰: 버전 v2.30.0', menuSource.indexOf('릴스핀 v2.30.0') > 0);

const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const expoConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'app.json'), 'utf8')).expo;
check('버전: 2.30.0 (package.json · app.json)', pkg.version === '2.30.0' && expoConfig.version === '2.30.0', pkg.version + '/' + expoConfig.version);

if (failed) {
  console.log('\nCOLLECTIONS_FAILED=' + failed);
  process.exit(1);
}
console.log('\nCOLLECTIONS_TESTS_OK');
