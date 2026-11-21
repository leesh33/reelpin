/**
 * test/category-color-test.mjs — v2.36.2
 * ─────────────────────────────────────────────────────────────
 * **분류 추가할 때 색상 지정** — 상훈 님 요청(2026-11-21)
 *   "혹시 분류 추가할 때 색상도 지정하게 할 수 있을까?"
 *
 *   ① 팔레트 — 10색 · 앞 6색은 예전 자동 배정 그대로 · 기본 3색과 안 겹침
 *   ② 색 표 — 저장·이름 변경·삭제·깨진 값 정리 (기본 3색은 표에 못 들어감)
 *   ③ 자동 배정 유지 — 색을 고르지 않으면 예전과 완전히 같은 색
 *   ④ getCategoryColor — 고른 색 우선 · 기본 3색은 고정 · 목록 밖 이름은 이름 해시
 *   ⑤ 화면 배선 — 저장·핀 상세(CategoryPicker) · 내 정보(분류 관리) 가 색을 함께 넘긴다
 *   ⑥ 저장 경로 — storage 의 색 키 · App 의 로드/저장/세팅
 *   ⑦ 버전 2.36.2 일관성
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  CATEGORY_COLOR_PALETTE,
  CATEGORY_COLOR_NAMES,
  CUSTOM_CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLORS,
  getCategoryColor,
  normalizeCategoryColors,
  normalizeHexColor,
  removeCategoryColor,
  renameCategoryColor,
  setActiveCategoryColors,
  setCategoryColor,
  suggestCategoryColor,
} from '../src/utils/categories.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};
const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

// ═════════════════════════════════════════════════════════════
// 1. 팔레트
// ═════════════════════════════════════════════════════════════
check('팔레트: 10색', CATEGORY_COLOR_PALETTE.length === 10, String(CATEGORY_COLOR_PALETTE.length));
check('팔레트: 앞 6색은 예전 자동 배정 팔레트 그대로(색을 안 고르면 예전과 같음)', CUSTOM_CATEGORY_COLORS.every((c, i) => CATEGORY_COLOR_PALETTE[i] === c));
check('팔레트: 기본 3색(딥 틸·앰버·블루)과 겹치지 않음', Object.values(DEFAULT_CATEGORY_COLORS).every((c) => CATEGORY_COLOR_PALETTE.indexOf(c) < 0));
check('팔레트: 서로 다른 색만 (중복 없음)', new Set(CATEGORY_COLOR_PALETTE).size === 10);
check('팔레트: 모두 #RRGGBB 형식', CATEGORY_COLOR_PALETTE.every((c) => /^#[0-9A-F]{6}$/.test(c)));
check('팔레트: 10색 모두 읽어 주는 이름이 있다', CATEGORY_COLOR_PALETTE.every((c) => !!CATEGORY_COLOR_NAMES[c]));

// ═════════════════════════════════════════════════════════════
// 2. 색 표
// ═════════════════════════════════════════════════════════════
check('색 표: 소문자·# 없는 값도 대문자 #RRGGBB 로', normalizeHexColor('8b5cf6') === '#8B5CF6' && normalizeHexColor('#8b5cf6') === '#8B5CF6');
check('색 표: 색이 아닌 값은 null', normalizeHexColor('보라') === null && normalizeHexColor('') === null && normalizeHexColor(null) === null);
check('색 표: setCategoryColor 는 새 표를 돌려준다(원본 유지)', (() => {
  const before = { 아이랑: '#22C55E' };
  const after = setCategoryColor(before, '데이트', '#ec4899');
  return after['데이트'] === '#EC4899' && before['데이트'] === undefined && after['아이랑'] === '#22C55E';
})());
check('색 표: 기본 분류(맛집·카페·가볼곳)는 표에 못 넣음', (() => {
  const map = setCategoryColor({}, '맛집', '#EF4444');
  return Object.keys(map).length === 0 && getCategoryColor('맛집', [], map) === DEFAULT_CATEGORY_COLORS['맛집'];
})());
check('색 표: 이름을 바꾸면 색도 따라감', renameCategoryColor({ 아이랑: '#22C55E' }, '아이랑', '애들')[ '애들'] === '#22C55E');
check('색 표: 이름을 바꾼 뒤 옛 이름 색은 사라짐', renameCategoryColor({ 아이랑: '#22C55E' }, '아이랑', '애들')['아이랑'] === undefined);
check('색 표: 분류를 지우면 색도 지워짐', Object.keys(removeCategoryColor({ 아이랑: '#22C55E', 데이트: '#EC4899' }, '아이랑')).join() === '데이트');
check('색 표: 깨진 저장값은 조용히 걸러 진다', (() => {
  const map = normalizeCategoryColors({ 아이랑: '#22c55e', 데이트: '보라', '': '#EF4444', 맛집: '#EF4444', 카페: '#D97706' });
  return Object.keys(map).length === 1 && map['아이랑'] === '#22C55E';
})());
check('색 표: 배열·null 같은 엉뚱한 값은 빈 표로', Object.keys(normalizeCategoryColors(null)).length === 0 && Object.keys(normalizeCategoryColors(['아이랑'])).length === 0);

// ═════════════════════════════════════════════════════════════
// 3. 자동 배정 유지 (색을 고르지 않고 추가해도 예전과 같다)
// ═════════════════════════════════════════════════════════════
check('[핵심] 자동 배정: 첫 커스텀 분류는 지금까지처럼 #8B5CF6', suggestCategoryColor([]) === '#8B5CF6');
check('자동 배정: 두 번째는 #F97316 (목록 순서대로)', suggestCategoryColor(['아이랑']) === '#F97316');
check('자동 배정: 색을 안 고르면 예전 자동 색과 완전히 같다', (() => {
  const customs = ['아이랑', '데이트'];
  const suggestion = suggestCategoryColor(customs);
  return suggestion === getCategoryColor('새분류', customs) && suggestion === getCategoryColor('새분류', customs, {} );
})());

// ═════════════════════════════════════════════════════════════
// 4. getCategoryColor — 고른 색 우선
// ═════════════════════════════════════════════════════════════
const customs = ['아이랑', '데이트'];
const map = { 아이랑: '#EF4444' };
check('[핵심] 고른 색: 내가 고른 색이 순서 배정색보다 먼저다', getCategoryColor('아이랑', customs, map) === '#EF4444' && getCategoryColor('아이랑', customs) === '#8B5CF6');
check('고른 색: 색을 안 고른 분류는 예전처럼 순서 배정', getCategoryColor('데이트', customs, map) === '#F97316');
check('고른 색: 같은 분류는 어디서 불러도 같은 색(categoryTint·배지도 같은 함수를 씀)', getCategoryColor('아이랑', customs, map) === getCategoryColor(' 아이랑 ', customs, map));
check('기본 3색은 고른 색 표가 있어도 그대로', getCategoryColor('카페', customs, { 카페: '#EF4444' }) === DEFAULT_CATEGORY_COLORS['카페']);
check('목록에 없는 이름은 이름 해시 고정색(공유 지도·다른 기기 핀)', getCategoryColor('낯선분류', customs, map) === getCategoryColor('낯선분류', customs, map) && getCategoryColor('낯선분류', customs, map) !== undefined);
check('앱이 세팅한 표(setActiveCategoryColors)를 기본으로 쓴다', (() => {
  setActiveCategoryColors({ 아이랑: '#22C55E' });
  const got = getCategoryColor('아이랑', customs);
  setActiveCategoryColors({});
  return got === '#22C55E' && getCategoryColor('아이랑', customs) === '#8B5CF6';
})());

// ═════════════════════════════════════════════════════════════
// 5. 화면 배선
// ═════════════════════════════════════════════════════════════
const picker = read('src/components/CategoryPicker.js');
const swatches = read('src/components/CategoryColorPicker.js');
const profile = read('src/screens/ProfileScreen.js');
const app = read('App.js');
const storage = read('src/storage.js');
const palette = read('src/utils/categories.js');

check('공용 스와치 컴포넌트: 10색 팔레트를 그린다', swatches.indexOf('CATEGORY_COLOR_PALETTE') > 0 && swatches.indexOf('list.map(') > 0);
check('공용 스와치 컴포넌트: 고른 색은 링 + 체크로 표시', swatches.indexOf('swatchOn') > 0 && swatches.indexOf('checkmark') > 0);
check('공용 스와치 컴포넌트: 읽어 주는 이름(분류 색 보라)', swatches.indexOf("'분류 색 ' + categoryColorName(color)") > 0);
check('공용 스와치 컴포넌트: accessibilityRole radio + 선택 상태', swatches.indexOf('accessibilityRole="radio"') > 0 && swatches.indexOf('selected: on') > 0);
check('[저장·상세] CategoryPicker: [분류 추가] 를 열면 색 팔레트가 함께 나온다', picker.indexOf('<CategoryColorPicker') > 0 && picker.indexOf('category-add-color') > 0);
check('[저장·상세] CategoryPicker: 처음엔 예전 자동 배정색이 골라져 있다', picker.indexOf('setDraftColor(suggestCategoryColor(categories))') > 0);
check('[저장·상세] CategoryPicker: 고른 색을 onAddCategory(이름, 색) 로 넘긴다', picker.indexOf('onAddCategory(draft, picked)') > 0);
check('[내 정보] 분류 관리: 새 분류 이름 칸 아래에 색 팔레트', profile.indexOf('<CategoryColorPicker') > 0 && profile.indexOf('category-manager-color') > 0);
check('[내 정보] 분류 관리: 고른 색을 onAddCategory(이름, 색) 로 넘긴다', profile.indexOf('onAddCategory(newName, picked)') > 0);
check('[내 정보] 분류 관리: 처음엔 예전 자동 배정색이 골라져 있다', profile.indexOf('suggestCategoryColor(list)') > 0);
check('색은 분류 관리 목록 점에도 반영(getCategoryColor 하나를 그대로 씀)', profile.indexOf("getCategoryColor(category, list)") > 0);

// ═════════════════════════════════════════════════════════════
// 6. 저장 경로 · App 배선
// ═════════════════════════════════════════════════════════════
check('저장: 분류 색 전용 키(reelpin.categoryColors.v1)', storage.indexOf("CATEGORY_COLORS_KEY = 'reelpin.categoryColors.v1'") > 0);
check('저장: loadCategoryColors · saveCategoryColors 가 같은 정규화를 쓴다', storage.indexOf('export async function loadCategoryColors') > 0 && storage.indexOf('export async function saveCategoryColors') > 0 && (storage.match(/normalizeCategoryColors/g) || []).length >= 2);
check('App: 색 표를 불러와 상태로 두고', app.indexOf('loadCategoryColors()') > 0 && app.indexOf('setCategoryColors(normalizeCategoryColors(storedCategoryColors))') > 0);
check('App: 바뀌면 기기에 저장', app.indexOf('saveCategoryColors(categoryColors)') > 0);
check('App: 첫 프레임부터 반영되도록 렌더 중 표를 세팅', app.indexOf('setActiveCategoryColors(categoryColors)') > 0);
check('[핵심] App: 분류를 추가할 때 고른 색을 표에 넣는다', app.indexOf('setCategoryColor(prev, result.name, picked)') > 0);
check('App: 이름을 바꾸면 색도 따라가고, 지우면 색도 지운다', app.indexOf('renameCategoryColor(prev, result.previous, result.name)') > 0 && app.indexOf('removeCategoryColor(prev, result.name)') > 0);
check('지도 핀·칩·배지가 모두 getCategoryColor 하나를 쓴다(색 표가 한 곳에서 흘러감)', ['src/components/FilterChips.js', 'src/components/MapCanvas.js', 'src/components/RealMapView.web.js', 'src/components/PinDetailSheet.js', 'src/components/PinListView.js']
  .every((f) => read(f).indexOf('getCategoryColor(') > 0));

// ═════════════════════════════════════════════════════════════
// 7. 버전 2.36.2
// ═════════════════════════════════════════════════════════════
const pkg = JSON.parse(read('package.json'));
const expo = JSON.parse(read('app.json')).expo;
const menuDrawer = read('src/components/MenuDrawerModal.js');
const feedback = read('src/services/feedback.js');
check('버전: package.json · app.json = 2.36.2', pkg.version === '2.36.2' && expo.version === '2.36.2', pkg.version + '/' + expo.version);
check('버전: 메뉴 · 앱 정보 · 제보 첨부값도 2.36.2', menuDrawer.indexOf("APP_VERSION_LABEL = '릴스핀 v2.36.2'") > 0 && profile.indexOf("APP_INFO_VERSION = '릴스핀 v2.36.2'") > 0 && feedback.indexOf("APP_VERSION_NAME = '2.36.2'") > 0);

check('utils: 팔레트·색 표가 categories.js 한 곳에 있다(색 규칙 단일 출처)', palette.indexOf('CATEGORY_COLOR_PALETTE') > 0 && palette.indexOf('export function getCategoryColor') > 0);

if (fails) {
  console.log('\nCATEGORY_COLOR_TEST_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nCATEGORY_COLOR_TESTS_OK');
