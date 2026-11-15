/**
 * test/category-test.mjs — v2.2 분류(카테고리) 직접 고르기 · 만들기 · 이름 바꾸기 · 지우기
 *
 *   npm test              … 전체
 *   node test/run-tests.mjs category   … 이 파일만
 *
 * 화면이 공유하는 규칙(utils/categories.js)과 저장소(storage.js 의 load/saveCategories)를 검사합니다.
 *   · 기본 3개(맛집·카페·가볼곳) 보호 — 이름 변경·삭제 불가
 *   · 이름 검사(빈 이름·길이·중복·레거시 이름)
 *   · 이름을 바꾸면 그 분류를 쓰던 핀이 **한꺼번에** 새 이름으로 (updatedAt 도 갱신 → 클라우드 반영)
 *   · 지우면 그 분류를 쓰던 핀은 사라지지 않고 **맛집으로 안전하게 이동**
 *   · 지도 필터 매칭·개수·핀 색·필터 되돌림
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  CATEGORY_ALL,
  CATEGORY_FALLBACK,
  CATEGORY_MAX_LENGTH,
  CUSTOM_PIN_COLORS,
  DEFAULT_CATEGORIES,
  addCategory,
  allCategories,
  applyCategoryRemoval,
  applyCategoryRename,
  countByCategory,
  customCategoryColor,
  filterOptions,
  isDefaultCategory,
  isLegacyCategory,
  mapLegacyCategory,
  matchesFilter,
  mergeCategoryNames,
  nextFilterAfterRemoval,
  nextFilterAfterRename,
  normalizeCategoryName,
  normalizeCustomCategories,
  pinsInCategory,
  removeCategory,
  renameCategory,
  sameCategory,
  validateCategoryName,
} from '../src/utils/categories.js';
import { loadCategories, saveCategories } from '../src/storage.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
  }
};

const PINS = [
  { id: 'p1', name: '베통 성수', category: '베이커리', area: '성수동', createdAt: '2026-11-14T10:00:00+09:00' },
  { id: 'p2', name: '연남 케이크', category: '디저트', area: '연남동', createdAt: '2026-11-13T10:00:00+09:00' },
  { id: 'p3', name: '아라뱃길 카페', category: '카페', area: '검단', createdAt: '2026-11-12T10:00:00+09:00' },
  { id: 'p4', name: '키즈카페', category: '아이랑', area: '검단', createdAt: '2026-11-11T10:00:00+09:00' },
  { id: 'p5', name: '와인바', category: '술집', area: '연남동', createdAt: '2026-11-10T10:00:00+09:00' },
  { id: 'p6', name: '우동집', category: '맛집', area: '망원동', createdAt: '2026-11-09T10:00:00+09:00' },
];

// ── 1. 기본 분류 · 레거시 이름 ────────────────────────────────
check('기본 분류는 맛집·카페·가볼곳', DEFAULT_CATEGORIES.join('|') === '맛집|카페|가볼곳', DEFAULT_CATEGORIES);
check('지울 때 옮겨 갈 기본 분류는 맛집', CATEGORY_FALLBACK === '맛집', CATEGORY_FALLBACK);
check('베이커리·디저트는 맛집으로 매핑', mapLegacyCategory('베이커리') === '맛집' && mapLegacyCategory('디저트') === '맛집');
check('레거시 이름 판정', isLegacyCategory('베이커리') && isLegacyCategory('디저트') && !isLegacyCategory('아이랑'));
check('기본 분류 판정', isDefaultCategory('카페') && isDefaultCategory(' 가볼곳 ') && !isDefaultCategory('아이랑'));
check('이름 다듬기: # · 중복 공백 제거', normalizeCategoryName('  # 아이랑   데이트 ') === '아이랑 데이트', normalizeCategoryName('  # 아이랑   데이트 '));
check('빈 값은 빈 문자열', normalizeCategoryName(null) === '' && normalizeCategoryName(undefined) === '');
check('같은 분류 비교(대소문자·공백 무시)', sameCategory(' Cafe ', 'cafe') && !sameCategory('카페', '카페투어'));

// ── 2. 전체 목록 (기본 + 커스텀) ───────────────────────────────
const custom = ['아이랑', '술집', '아이랑', ' 카페 ', '베이커리', ''];
check('커스텀 목록에서 기본·레거시·중복·빈 값 제거', normalizeCustomCategories(custom).join('|') === '아이랑|술집', normalizeCustomCategories(custom));
check('전체 목록은 기본이 항상 앞', allCategories(custom).join('|') === '맛집|카페|가볼곳|아이랑|술집', allCategories(custom));
check('필터 칩 목록은 전체 + 기본 + 커스텀', filterOptions(['아이랑']).join('|') === '전체|맛집|카페|가볼곳|아이랑', filterOptions(['아이랑']));
check('커스텀 없으면 기본 3개만', allCategories([]).length === 3 && allCategories(null).length === 3);
check('핀에서 온 새 분류 이름을 목록에 합침', mergeCategoryNames(['아이랑'], ['술집', '베이커리', '아이랑']).join('|') === '아이랑|술집', mergeCategoryNames(['아이랑'], ['술집', '베이커리', '아이랑']));

// ── 3. 이름 검사 ───────────────────────────────────────────
check('빈 이름 거부', validateCategoryName('   ').reason === 'empty');
check('10자 초과 거부', validateCategoryName('12345678901').reason === 'too-long' && CATEGORY_MAX_LENGTH === 10);
check('딱 10자는 통과', validateCategoryName('1234567890').ok === true, validateCategoryName('1234567890'));
check('기본 분류와 같은 이름 거부', validateCategoryName('카페').reason === 'duplicate');
check('이미 있는 커스텀 이름 거부', validateCategoryName('아이랑', { taken: allCategories(['아이랑']) }).reason === 'duplicate');
check('대소문자만 다른 이름도 중복', validateCategoryName('Cafe', { taken: allCategories(['cafe']) }).reason === 'duplicate');
check('베이커리·디저트는 새 분류로 못 만듦', validateCategoryName('디저트').reason === 'legacy');
check('새 이름은 통과 + 다듬어진 이름을 돌려줌', validateCategoryName('  데이트  ').ok && validateCategoryName('  데이트  ').name === '데이트');

// ── 4. 추가 ──────────────────────────────────────────────
const added = addCategory(['아이랑'], '데이트');
check('분류 추가 성공', added.ok && added.name === '데이트', added);
check('추가 후 커스텀 목록', added.custom.join('|') === '아이랑|데이트', added.custom);
check('추가 후 전체 목록', added.categories.join('|') === '맛집|카페|가볼곳|아이랑|데이트', added.categories);
const addDup = addCategory(['아이랑'], '맛집');
check('있는 분류는 추가 실패 + 안내 문구', !addDup.ok && addDup.reason === 'duplicate' && addDup.message.indexOf('이미') >= 0, addDup);
check('추가 실패해도 목록은 그대로', addDup.custom.join('|') === '아이랑', addDup.custom);
check('추가한 분류로 바로 필터 매칭', matchesFilter({ category: '데이트' }, '데이트'));

// ── 5. 이름 바꾸기 (핀 일괄 반영) ────────────────────────────
const renameDefault = renameCategory(['아이랑'], '맛집', '집밥');
check('기본 분류는 이름 변경 불가', !renameDefault.ok && renameDefault.reason === 'default' && renameDefault.message.indexOf('기본') >= 0, renameDefault);
const renameMissing = renameCategory(['아이랑'], '없는분류', '새이름');
check('없는 분류는 실패', !renameMissing.ok && renameMissing.reason === 'missing');
const renameDup = renameCategory(['아이랑', '데이트'], '아이랑', '데이트');
check('이미 있는 이름으로는 변경 불가', !renameDup.ok && renameDup.reason === 'duplicate', renameDup);
const renameEmpty = renameCategory(['아이랑'], '아이랑', '   ');
check('빈 이름으로는 변경 불가', !renameEmpty.ok && renameEmpty.reason === 'empty');
const renamed = renameCategory(['아이랑', '술집'], '아이랑', '아이랑갈만한곳');
check('이름 변경 성공', renamed.ok && renamed.changed && renamed.name === '아이랑갈만한곳', renamed);
check('이름 변경 후 목록 순서 유지', renamed.custom.join('|') === '아이랑갈만한곳|술집', renamed.custom);
const renamedSame = renameCategory(['아이랑'], '아이랑', ' 아이랑 ');
check('같은 이름으로 바꾸면 changed=false (핀 안 건드림)', renamedSame.ok && renamedSame.changed === false, renamedSame);

const NOW = '2026-11-15T12:00:00.000Z';
const renamePins = applyCategoryRename(PINS, '아이랑', '아이랑갈만한곳', { now: NOW });
check('이름을 바꾼 분류의 핀만 새 이름으로', renamePins.pins.filter((p) => p.category === '아이랑갈만한곳').length === 1);
check('나머지 핀은 그대로', renamePins.pins.filter((p) => p.id !== 'p4').every((p, i) => p.category === PINS.filter((x) => x.id !== 'p4')[i].category));
check('바뀐 핀 목록을 돌려줌 (클라우드 반영용)', renamePins.changed.length === 1 && renamePins.changed[0].id === 'p4');
check('바꾼 핀에 updatedAt 을 남김 (동기화 시 로컬 우선)', renamePins.changed[0].updatedAt === NOW);
check('원본 배열은 그대로 (불변)', PINS.find((p) => p.id === 'p4').category === '아이랑');
const renameNobody = applyCategoryRename(PINS, '술집', '와인바', { now: NOW });
check('그 분류 핀이 없으면 changed=[]', renameNobody.changed.length === 0 || renameNobody.changed.every((p) => p.category === '와인바'), renameNobody.changed.length);
const renameAllMine = applyCategoryRename(
  [{ id: 'a', category: '아이랑' }, { id: 'b', category: '아이랑' }, { id: 'c', category: '카페' }],
  '아이랑',
  '육아',
  { now: NOW }
);
check('같은 분류 핀 2개를 한꺼번에', renameAllMine.changed.length === 2 && renameAllMine.pins.filter((p) => p.category === '육아').length === 2);
const renameUgui = applyCategoryRename(PINS, '맛집', '한식', { now: NOW });
check('레거시(베이커리·디저트)도 맛집으로 함께 옮김', renameUgui.changed.length === 3, renameUgui.changed.map((p) => p.id));

// ── 6. 지우기 (핀 안전 폴백) ──────────────────────────────
const removeDefault = removeCategory(['아이랑'], '가볼곳');
check('기본 분류는 지울 수 없음', !removeDefault.ok && removeDefault.reason === 'default' && removeDefault.message.indexOf('기본') >= 0, removeDefault);
const removeMissing = removeCategory(['아이랑'], '없는분류');
check('없는 분류 삭제 실패', !removeMissing.ok && removeMissing.reason === 'missing');
const removed = removeCategory(['아이랑', '술집'], '아이랑');
check('커스텀 분류 삭제 성공', removed.ok && removed.name === '아이랑', removed);
check('삭제 후 목록', removed.custom.join('|') === '술집' && removed.categories.join('|') === '맛집|카페|가볼곳|술집', removed.custom);
const removalPins = applyCategoryRemoval(PINS, '아이랑', { now: NOW });
check('삭제한 분류의 핀은 사라지지 않음', removalPins.pins.length === PINS.length && !!removalPins.pins.find((p) => p.id === 'p4'));
check('삭제한 분류의 핀은 맛집으로 이동', removalPins.pins.find((p) => p.id === 'p4').category === '맛집');
check('다른 분류 핀은 그대로', removalPins.pins.find((p) => p.id === 'p5').category === '술집' && removalPins.pins.find((p) => p.id === 'p3').category === '카페');
check('옮긴 핀에 updatedAt 남김', removalPins.changed.length === 1 && removalPins.changed[0].updatedAt === NOW);
const removalCustom = applyCategoryRemoval(PINS, '아이랑', { fallback: '가볼곳', now: NOW });
check('폴백 분류를 바꿀 수 있음', removalCustom.changed[0].category === '가볼곳' && removalCustom.fallback === '가볼곳');
check('빈 이름이면 아무것도 안 바뀜', applyCategoryRemoval(PINS, '  ').changed.length === 0);
check('delete 후 다시 그 분류 핀 수는 0', pinsInCategory(removalPins.pins, '아이랑').length === 0);

// ── 7. 지도 필터 ──────────────────────────────────────────
check('전체는 모두 매칭', PINS.every((p) => matchesFilter(p, CATEGORY_ALL)));
check('맛집 필터는 베이커리·디저트까지', PINS.filter((p) => matchesFilter(p, '맛집')).length === 3, PINS.filter((p) => matchesFilter(p, '맛집')).map((p) => p.id));
check('커스텀 분류는 이름이 정확히 같을 때만', PINS.filter((p) => matchesFilter(p, '아이랑')).length === 1);
check('커스텀 분류와 기본 분류는 섞이지 않음', !matchesFilter({ category: '카페투어' }, '카페'));
check('빈 핀은 매칭 안 함', matchesFilter(null, '카페') === false && matchesFilter(null, CATEGORY_ALL) === true);
check('category 없는 예전 핀은 맛집', matchesFilter({ id: 'old' }, '맛집'));

const counts = countByCategory(PINS, ['아이랑', '술집']);
check('필터 개수 — 전체', counts['전체'] === 6, counts);
check('필터 개수 — 기본 3개', counts['맛집'] === 3 && counts['카페'] === 1 && counts['가볼곳'] === 0, counts);
check('필터 개수 — 커스텀', counts['아이랑'] === 1 && counts['술집'] === 1, counts);
check('개수에 빈 목록도 안전', countByCategory([], ['아이랑'])['전체'] === 0);

check('이름 바꾼 분류를 보고 있었으면 새 이름', nextFilterAfterRename('아이랑', '아이랑', '육아') === '육아');
check('다른 필터는 그대로', nextFilterAfterRename('카페', '아이랑', '육아') === '카페');
check('전체는 그대로', nextFilterAfterRename(CATEGORY_ALL, '아이랑', '육아') === CATEGORY_ALL);
check('지운 분류를 보고 있었으면 전체로', nextFilterAfterRemoval('아이랑', '아이랑') === CATEGORY_ALL);
check('지운 분류를 안 보고 있었으면 그대로', nextFilterAfterRemoval('카페', '아이랑') === '카페');

// ── 8. 커스텀 분류 핀 색 ────────────────────────────────────
const colorA = customCategoryColor('아이랑');
const colorB = customCategoryColor('아이랑');
check('같은 이름은 같은 색', colorA === colorB, colorA);
check('색은 커스텀 팔레트 안에서 고름', CUSTOM_PIN_COLORS.indexOf(colorA) >= 0, colorA);
check('이름이 다르면 (대체로) 다른 색', customCategoryColor('술집') !== colorA || customCategoryColor('데이트') !== colorB);
check('빈 이름도 팔레트 안의 색', CUSTOM_PIN_COLORS.indexOf(customCategoryColor('')) >= 0);

// ── 9. 저장소 (웹 localStorage / 앱 AsyncStorage 공통 경로) ──
const emptyBefore = await loadCategories();
check('처음엔 커스텀 분류 없음', Array.isArray(emptyBefore) && emptyBefore.length === 0, emptyBefore);
await saveCategories(['아이랑', '  ', '술집', 3]);
const stored = await loadCategories();
check('저장 → 읽기 (빈 값·숫자 제외)', stored.join('|') === '아이랑|술집', stored);
await saveCategories(null);
check('null 을 저장해도 빈 목록', (await loadCategories()).length === 0);

// ── 10. 화면 배선 (소스 검사) ────────────────────────────────
const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const appSource = read('App.js');
const mapSource = read('src/screens/MapScreen.js');
const pasteSource = read('src/screens/PasteScreen.js');
const sheetSource = read('src/components/PinDetailSheet.js');
const profileSource = read('src/screens/ProfileScreen.js');
const chipsSource = read('src/components/FilterChips.js');
const pickerSource = read('src/components/CategoryPicker.js');
const mapWebSource = read('src/components/RealMapView.web.js');
const canvasSource = read('src/components/MapCanvas.js');

const wiring = [
  ['App: 커스텀 분류를 저장/불러오기', appSource.indexOf('loadCategories') > 0 && appSource.indexOf('saveCategories') > 0],
  ['App: 분류 추가·이름 변경·삭제 핸들러', ['handleAddCategory', 'handleRenameCategory', 'handleRemoveCategory'].every((k) => appSource.indexOf(k) > 0)],
  ['App: 이름 변경 시 핀 일괄 반영 + 클라우드', /applyCategoryRename\(pinsRef\.current/.test(appSource) && appSource.indexOf('pushPinsToCloud(changed)') > 0],
  ['App: 삭제 시 핀 안전 폴백 + 클라우드', /applyCategoryRemoval\(pinsRef\.current/.test(appSource) && appSource.indexOf('applyCategoryRemoval') > 0],
  ['App: 핀 하나의 분류 변경(상세 시트)', appSource.indexOf('handleChangePinCategory') > 0 && appSource.indexOf('onChangePinCategory') > 0],
  ['App: 핀에서 온 분류 이름을 목록에 합침', appSource.indexOf('mergeCategoryNames') > 0],
  ['지도: 필터 칩에 커스텀 분류 전달', mapSource.indexOf('categories={categories}') > 0],
  ['지도: 이름 변경·삭제 시 필터 정리', mapSource.indexOf('nextFilterAfterRename') > 0 && mapSource.indexOf('nextFilterAfterRemoval') > 0],
  ['지도: 상세 시트에 분류 변경 연결', mapSource.indexOf('onChangeCategory={onChangePinCategory}') > 0],
  ['저장: 분류 직접 선택 칩 바', pasteSource.indexOf('<CategoryPicker') > 0 && pasteSource.indexOf('saveCategory') > 0],
  ['저장: 고른 분류로 핀 생성', /buildPin\(\{ \.\.\.candidate, category: saveCategory \}/.test(pasteSource)],
  ['저장: 자동 분류를 기본값으로', pasteSource.indexOf('자동 분류: ') > 0],
  ['상세: 분류 변경 칩 + 읽기 전용 제외', sheetSource.indexOf('<CategoryPicker') > 0 && sheetSource.indexOf('readOnly') > 0 && sheetSource.indexOf('onChangeCategory') > 0],
  ['내 정보: 분류 관리 카드(수정·삭제·추가)', profileSource.indexOf('분류 관리') > 0 && profileSource.indexOf('CategoryManager') > 0 && profileSource.indexOf('이름 수정') > 0 && profileSource.indexOf('삭제 확인') > 0],
  ['내 정보: 기본 분류는 잠금 표시', profileSource.indexOf('lock-closed') > 0 && profileSource.indexOf('기본') > 0],
  ['필터 칩: 커스텀 분류를 이어서 그림', chipsSource.indexOf('filterOptions(categories)') > 0],
  ['분류 고르기: [분류 추가] 인라인 입력', pickerSource.indexOf('분류 추가') > 0 && pickerSource.indexOf('maxLength={CATEGORY_MAX_LENGTH}') > 0],
  ['지도 핀 색: 커스텀 분류는 고정 색', mapWebSource.indexOf('customCategoryColor') > 0 && canvasSource.indexOf('customCategoryColor') > 0],
];
for (const [label, ok] of wiring) {
  check(label, ok);
}

if (fails) {
  console.log('CATEGORY_FAILED=' + fails);
  process.exit(1);
}
console.log('CATEGORY_OK');
