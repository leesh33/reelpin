/**
 * test/visit-memo-test.mjs — v2.10
 * ─────────────────────────────────────────────────────────────
 * ✅ '가봤어요' 방문 체크 · 📝 한줄 메모 · 🔓 무료 10개 한도 해제.
 *
 *   · src/utils/pins.js        … visited/visitedAt/memo 기본값 · 토글 · 메모 저장 · 한도 없는 추가
 *   · src/utils/searchPins.js  … 메모까지 검색 · 방문 상태 필터(전체/미방문/가봤어요) · 칩 숫자
 *   · src/services/cloudSync.js… visited·memo 컬럼 매핑 · 예전 스키마(컬럼 없음) 폴백
 *   · supabase/schema.sql      … visited boolean · memo text · alter table ... add column if not exists
 *   · src/utils/shareMap.js    … 공유 코드에 방문·메모 (구 링크와 양방향 호환)
 *   · 무료 한도 문구가 화면 코드에서 사라졌는지 (소스 검사)
 *
 * 네트워크는 타지 않습니다. Supabase 클라이언트는 이 파일 안의 가짜 객체입니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  buildPin,
  isVisited,
  normalizeMemo,
  normalizePin,
  normalizePins,
  planPinAddition,
  splitNewPins,
  toggleVisited,
  withMemo,
} from '../src/utils/pins.js';
import {
  VISIT_ALL,
  VISIT_DONE,
  VISIT_FILTERS,
  VISIT_TODO,
  countByVisit,
  filterAndSearchPins,
  filterByVisit,
  matchesVisit,
  normalizeVisitFilter,
  pinMatchesSearch,
  pinSearchFields,
  searchPins,
} from '../src/utils/searchPins.js';
import {
  PIN_COLUMNS,
  PIN_COLUMNS_LEGACY,
  __resetLegacySchemaFlag,
  fetchCloudPins,
  isMissingColumnError,
  pinToRow,
  rowToPin,
  upsertCloudPins,
} from '../src/services/cloudSync.js';
import { __setSupabaseClient, setSupabaseConfig } from '../src/services/supabase.js';
import {
  SHARE_VERSION,
  decodePinTuple,
  decodeSharePins,
  encodePinTuple,
  encodeSharePins,
} from '../src/utils/shareMap.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails++;
    console.log('FAIL ' + label + (extra ? '  -> ' + extra : ''));
  }
};

const root = process.cwd();
const USER = '11111111-2222-3333-4444-555555555555';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0.c2lnbmF0dXJlLXNpZ25hdHVyZQ';

// ─────────────────────────────────────────────────────────────
// 1. 핀 모델 — visited / visitedAt / memo
// ─────────────────────────────────────────────────────────────
const baseCandidate = {
  id: 'c-1',
  name: '베통 성수',
  area: '성수동',
  category: '맛집',
  lat: 37.5429,
  lng: 127.0552,
  address: '서울 성동구 연무장7가길 8',
};

const plainPin = buildPin(baseCandidate, { now: '2026-11-16T00:00:00.000Z' });
check('모델: 새 핀은 미방문(false) · visitedAt 없음', plainPin.visited === false && plainPin.visitedAt === '' && plainPin.memo === '');
check('모델: 저장 화면에서 적은 메모가 핀에 들어감', buildPin(baseCandidate, { memo: '  아기의자  있음 ' }).memo === '아기의자 있음');
check('모델: 메모 줄바꿈은 공백으로 정리', normalizeMemo('아기의자\n주차 무료') === '아기의자 주차 무료' && normalizeMemo(null) === '');
check('모델: 방문 체크해서 저장하면 visitedAt 기록', buildPin(baseCandidate, { visited: true, now: '2026-11-16T01:00:00.000Z' }).visitedAt === '2026-11-16T01:00:00.000Z');

const legacyPin = normalizePin({ id: 'old-1', name: '예전 핀', createdAt: '2026-11-01T00:00:00.000Z' });
check('모델: 예전 핀(필드 없음)은 미방문 · 메모 없음', legacyPin.visited === false && legacyPin.visitedAt === '' && legacyPin.memo === '');
check('모델: isVisited 는 true 일 때만', isVisited({ visited: true }) === true && isVisited({}) === false && isVisited(null) === false);
check('모델: 문자열 "true" 를 방문으로 오해하지 않음', normalizePin({ id: 'x', name: 'x', visited: 'true' }).visited === false);

const toggledOn = toggleVisited(plainPin, { now: '2026-11-16T02:00:00.000Z' });
check('토글: 체크하면 visited=true + visitedAt', toggledOn.visited === true && toggledOn.visitedAt === '2026-11-16T02:00:00.000Z');
check('토글: 원본 핀은 그대로 (불변)', plainPin.visited === false && plainPin.visitedAt === '');
check('토글: updatedAt 도 갱신 (동기화가 최근 값으로 인식)', toggledOn.updatedAt === '2026-11-16T02:00:00.000Z');
const toggledOff = toggleVisited(toggledOn, { now: '2026-11-16T03:00:00.000Z' });
check('토글: 다시 누르면 해제 + visitedAt 삭제', toggledOff.visited === false && toggledOff.visitedAt === '');
check('토글: 핀이 없으면 null', toggleVisited(null) === null);

const memoPin = withMemo(plainPin, '  주말 웨이팅 30분 · 아기의자 ');
check('메모: 저장하면 다듬어서 한 줄로', memoPin.memo === '주말 웨이팅 30분 · 아기의자');
check('메모: 빈 값으로 저장하면 지워짐', withMemo(memoPin, '').memo === '');
check('메모: 원본은 그대로', plainPin.memo === '');

check(
  '모델: normalizePins 가 예전 핀에도 기본값을 채움',
  normalizePins([{ id: 'a', name: 'A' }, { id: 'b', name: 'B', memo: '메모', visited: true }]).every((p) => typeof p.memo === 'string' && typeof p.visited === 'boolean')
);

// ─────────────────────────────────────────────────────────────
// 2. 🔓 무료 10개 한도 해제 — 11번째·12번째도 그대로 저장
// ─────────────────────────────────────────────────────────────
const makePins = (n) =>
  new Array(n).fill(0).map((_, i) => ({ id: 'pin-' + i, name: '가게 ' + i, lat: 37.5 + i * 0.001, lng: 127 + i * 0.001 }));
const ten = makePins(10);
const eleventh = { id: 'pin-10', name: '열한 번째 가게', lat: 37.6, lng: 127.1 };
const withEleventh = planPinAddition(ten, [eleventh]);
check('한도: 10개 저장된 상태에서 11번째도 저장', withEleventh.fresh.length === 1 && withEleventh.fresh[0].id === 'pin-10');
const withTwelve = planPinAddition(withEleventh.fresh.concat(ten), makePins(13).slice(11));
check('한도: 11개에서 12번째도 저장', withTwelve.fresh.length === 2, String(withTwelve.fresh.length));
check('한도: 한도 때문에 버리는 핀이 없음', withTwelve.fresh.length + withTwelve.duplicates.length === 2 && !('skipped' in withTwelve));
const dupOnly = planPinAddition(ten, [{ id: 'pin-0', name: '가게 0', lat: 37.5, lng: 127 }]);
check('한도: 중복은 여전히 걸러 냄', dupOnly.fresh.length === 0 && dupOnly.duplicates.length === 1);
check('한도: splitNewPins 도 그대로 (호환)', splitNewPins(ten, [eleventh]).fresh.length === 1);

// ─────────────────────────────────────────────────────────────
// 3. 🔍 검색 — 메모까지 검색 · ✅ 방문 상태 필터
// ─────────────────────────────────────────────────────────────
const memoPins = [
  { id: 'p1', name: '연남동 딸기 케이크', area: '연남동', category: '카페', memo: '아기의자 있음 · 주말 웨이팅 30분', visited: true },
  { id: 'p2', name: '망원동 우동', area: '망원동', category: '맛집', memo: '현금만 가능', visited: false },
  { id: 'p3', name: '검단 아라뱃길 카페', area: '검단', category: '카페', memo: '', visited: true },
];
check('검색: 핀 검색 글자에 memo 가 포함', pinSearchFields(memoPins[0]).indexOf('아기의자 있음 · 주말 웨이팅 30분') >= 0);
check('검색: "아기의자" → 메모에 적은 핀 매칭', searchPins(memoPins, '아기의자').map((p) => p.id).join(',') === 'p1');
check('검색: 메모 낱말 AND ("웨이팅 카페")', searchPins(memoPins, '웨이팅 카페').map((p) => p.id).join(',') === 'p1');
check('검색: 메모에 없는 낱말은 안 걸림', searchPins(memoPins, '드라이브').length === 0);
check('검색: 메모가 비어 있어도 기존 필드 검색은 그대로', searchPins(memoPins, '우동').map((p) => p.id).join(',') === 'p2');
check('검색: 방문 필터가 검색·분류와 AND', filterAndSearchPins(memoPins, { filter: '카페', query: '', visit: VISIT_DONE }).map((p) => p.id).join(',') === 'p1,p3');
check('검색: 미방문 + 분류 AND', filterAndSearchPins(memoPins, { filter: '맛집', visit: VISIT_TODO }).map((p) => p.id).join(',') === 'p2');
check('검색: 방문 필터 없으면 전체', filterAndSearchPins(memoPins, { filter: '전체' }).length === 3);

check('방문 필터: 값 목록', VISIT_FILTERS.join('/') === '전체/미방문/가봤어요' && VISIT_ALL === '전체');
check('방문 필터: 모르는 값은 전체', normalizeVisitFilter('가본곳') === VISIT_ALL && normalizeVisitFilter(null) === VISIT_ALL);
check('방문 필터: 값이 없던 핀은 미방문', matchesVisit({ id: 'x' }, VISIT_TODO) === true && matchesVisit({ id: 'x' }, VISIT_DONE) === false);
check('방문 필터: filterByVisit', filterByVisit(memoPins, VISIT_DONE).length === 2 && filterByVisit(memoPins, VISIT_ALL).length === 3);
const counts = countByVisit(memoPins);
check('방문 필터: 칩 숫자 (전체/미방문/가봤어요)', counts['전체'] === 3 && counts['미방문'] === 1 && counts['가봤어요'] === 2, JSON.stringify(counts));
check('방문 필터: 칩 숫자는 다른 조건 위에서 셈', countByVisit(memoPins, { base: (p) => p.category === '카페' })['가봤어요'] === 2);

// ─────────────────────────────────────────────────────────────
// 4. ☁️ Supabase — 컬럼 · 행 변환
// ─────────────────────────────────────────────────────────────
check('클라우드: PIN_COLUMNS 에 visited·memo', PIN_COLUMNS.indexOf('visited') >= 0 && PIN_COLUMNS.indexOf('memo') >= 0);
check('클라우드: 예전 컬럼 목록에는 없음', PIN_COLUMNS_LEGACY.indexOf('visited') < 0 && PIN_COLUMNS_LEGACY.length === PIN_COLUMNS.length - 2);

const cloudPin = {
  ...baseCandidate,
  id: 'pin-cloud-visit',
  createdAt: '2026-11-15T01:00:00.000Z',
  visited: true,
  visitedAt: '2026-11-15T05:00:00.000Z',
  memo: '아기의자 있음',
};
const visitRow = pinToRow(USER, cloudPin, { now: '2026-11-16T00:00:00.000Z' });
check('클라우드: 행에 visited(boolean) · memo', visitRow.visited === true && visitRow.memo === '아기의자 있음');
check('클라우드: visited 없으면 false (NOT NULL 안전)', pinToRow(USER, baseCandidate).visited === false);
check('클라우드: memo 없으면 빈 문자열', pinToRow(USER, baseCandidate).memo === '');
const backVisit = rowToPin(visitRow);
check('클라우드: 행 → 핀에 visited·memo 복원', backVisit.visited === true && backVisit.memo === '아기의자 있음');
const legacyRow = rowToPin({ id: 'r1', name: '구 행', created_at: '2026-11-01T00:00:00.000Z' });
check('클라우드: 예전 행(컬럼 없음)은 미방문 · 메모 없음', legacyRow.visited === false && legacyRow.memo === '');

check(
  '클라우드: 컬럼 없음 오류 판별 (42703 · PGRST204 · 메시지)',
  isMissingColumnError({ code: '42703' }) === true &&
    isMissingColumnError({ code: 'PGRST204' }) === true &&
    isMissingColumnError({ message: "column \"visited\" of relation \"pins\" does not exist" }) === true &&
    isMissingColumnError({ message: 'permission denied' }) === false &&
    isMissingColumnError(null) === false
);

/** 가짜 Supabase — 새 컬럼이 없는 DB 를 흉내 냅니다 (select/upsert 가 42703 으로 실패) */
function makeLegacySchemaClient(rows = []) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      calls.push(['from', table]);
      let result = { data: rows, error: null };
      let pending = null;
      const b = {};
      const rec = (name) => (...args) => {
        calls.push([name, ...args]);
        if (name === 'select') {
          const columns = String(args[0] || '');
          result =
            columns.indexOf('visited') >= 0
              ? { data: null, error: { code: '42703', message: 'column "visited" of relation "pins" does not exist' } }
              : { data: rows, error: null };
        }
        if (name === 'upsert') {
          const list = Array.isArray(args[0]) ? args[0] : [];
          pending = list;
          const hasNewColumn = list.some((row) => Object.prototype.hasOwnProperty.call(row, 'visited'));
          result = hasNewColumn
            ? { data: null, error: { code: '42703', message: 'column "visited" of relation "pins" does not exist' } }
            : { data: list, error: null };
        }
        return b;
      };
      b.select = rec('select');
      b.eq = rec('eq');
      b.order = rec('order');
      b.delete = rec('delete');
      b.upsert = rec('upsert');
      b.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      b.pending = () => pending;
      return b;
    },
  };
  return client;
}

setSupabaseConfig({ url: 'https://demo.supabase.co', anonKey: ANON });

__resetLegacySchemaFlag();
const legacyClient = makeLegacySchemaClient([{ id: 'r1', name: '구 행', created_at: '2026-11-01T00:00:00.000Z' }]);
__setSupabaseClient(legacyClient);
const legacyFetch = await fetchCloudPins(USER);
const selectCalls = legacyClient.calls.filter((c) => c[0] === 'select');
check('구스키마: 컬럼이 없으면 예전 컬럼으로 다시 읽음 (성공)', legacyFetch.ok === true && legacyFetch.legacySchema === true && legacyFetch.pins.length === 1);
check('구스키마: 읽기 두 번 (전체 → 예전)', selectCalls.length === 2 && String(selectCalls[0][1]).indexOf('visited') >= 0 && String(selectCalls[1][1]).indexOf('visited') < 0, JSON.stringify(selectCalls));

__resetLegacySchemaFlag();
const legacyUpload = await makeLegacyUpsert();
async function makeLegacyUpsert() {
  const client = makeLegacySchemaClient();
  __setSupabaseClient(client);
  return { client, result: await upsertCloudPins(USER, [cloudPin]) };
}
const uploadCalls = legacyUpload.result;
check('구스키마: 방문·메모를 올려도 저장은 실패하지 않음', uploadCalls.ok === true && uploadCalls.count === 1, JSON.stringify(uploadCalls));
const upsertCalls = legacyUpload.client.calls.filter((c) => c[0] === 'upsert');
check('구스키마: 두 번째 upsert 는 visited·memo 없이', upsertCalls.length === 2 && Object.prototype.hasOwnProperty.call(upsertCalls[0][1][0], 'visited') && !Object.prototype.hasOwnProperty.call(upsertCalls[1][1][0], 'visited'), JSON.stringify(upsertCalls.map((c) => Object.keys(c[1][0]).length)));

__resetLegacySchemaFlag();
__setSupabaseClient(null);
setSupabaseConfig(null);

// ─────────────────────────────────────────────────────────────
// 5. 🗄️ schema.sql — 새 컬럼 + 다시 실행해도 안전한 alter
// ─────────────────────────────────────────────────────────────
const schema = fs.readFileSync(path.join(root, 'supabase', 'schema.sql'), 'utf8');
const schemaLower = schema.toLowerCase();
check('스키마: visited boolean not null default false', /\bvisited\s+boolean\s+not\s+null\s+default\s+false/.test(schemaLower));
check('스키마: memo text not null default \'\'', /\bmemo\s+text\s+not\s+null\s+default\s+''/.test(schemaLower));
check(
  '스키마: 이미 만든 DB 용 alter ... add column if not exists (두 컬럼)',
  /alter table public\.pins add column if not exists visited/.test(schemaLower) && /alter table public\.pins add column if not exists memo/.test(schemaLower)
);
check('스키마: 기존 테이블 생성문에도 두 컬럼', /create table if not exists public\.pins[\s\S]*?visited[\s\S]*?memo[\s\S]*?constraint pins_pkey/.test(schemaLower));

// ─────────────────────────────────────────────────────────────
// 6. 🔗 공유 링크 — 방문·메모도 함께 (구 링크와 호환)
// ─────────────────────────────────────────────────────────────
const sharePin = { ...cloudPin, placeUrl: '', naverPlaceId: '', phone: '', address: '서울 성동구' };
const tuple = encodePinTuple(sharePin);
const decodedTuple = decodePinTuple(tuple, 0);
check('공유: 방문·메모가 튜플에 담김', decodedTuple.visited === true && decodedTuple.memo === '아기의자 있음');
check('공유: 형식 번호는 그대로 (v2 · r2-)', SHARE_VERSION === 2 && encodeSharePins([sharePin]).indexOf('r2-') === 0);
const roundShare = decodeSharePins(encodeSharePins([sharePin, { ...sharePin, id: 'x', visited: false, memo: '' }]));
check('공유: 왕복해도 방문·메모 유지', roundShare.pins.length === 2 && roundShare.pins[0].visited === true && roundShare.pins[0].memo === '아기의자 있음');
check('공유: 미방문 핀은 visited false', roundShare.pins[1].visited === false && roundShare.pins[1].memo === '');
const oldTuple = encodePinTuple({ ...sharePin, visited: false, memo: '' });
check('공유: 방문·메모 없는 핀은 예전과 같은 9칸', oldTuple.split('|').length === 9, String(oldTuple.split('|').length));
const oldDecoded = decodePinTuple('베통|맛집|성수동|37.5|127.0', 0);
check('공유: 구 버전 9칸 튜플도 읽힘 (미방문)', oldDecoded.visited === false && oldDecoded.memo === '' && oldDecoded.name === '베통');

// ─────────────────────────────────────────────────────────────
// 7. 화면 코드 — 한도 문구가 사라지고, 새 UI 가 배선됐는지 (소스 검사)
// ─────────────────────────────────────────────────────────────
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('App.js');
const paste = read('src/screens/PasteScreen.js');
const profile = read('src/screens/ProfileScreen.js');
const map = read('src/screens/MapScreen.js');
const list = read('src/components/PinListView.js');
const sheet = read('src/components/PinDetailSheet.js');
const seed = read('src/data/seedPins.js');

check('배선: App 이 한도 없이 추가 (planPinAddition)', app.indexOf('planPinAddition') > 0 && app.indexOf('FREE_PIN_LIMIT') < 0);
check('배선: App 이 방문·메모 핸들러를 지도에 넘김', app.indexOf('onTogglePinVisited={handleTogglePinVisited}') > 0 && app.indexOf('onChangePinMemo={handleSavePinMemo}') > 0);
check('배선: 저장 화면에 한도 잠금이 없음', paste.indexOf('FREE_PIN_LIMIT') < 0 && paste.indexOf('무료 플랜은 핀') < 0);
check('배선: 내 정보에 한도 문구·프로그레스 없음', profile.indexOf('FREE_PIN_LIMIT') < 0 && profile.indexOf('무료 한도를 다 채웠어요') < 0);
// v2.17 — 지도 상단 방문 칩은 사라지고, 왼쪽 하단 펼침 메뉴의 '가본 곳만 보기' Y/N 이 같은 visitFilter 를 씁니다.
check(
  '배선: 지도가 방문 필터(가본 곳만 보기)를 쓰고 상세 시트에 콜백 전달',
  map.indexOf('MapToolsMenu') > 0 &&
    map.indexOf('filterByVisit(baseFiltered, VISIT_DONE)') > 0 &&
    map.indexOf('const visitedOnly = visitFilter === VISIT_DONE') > 0 &&
    map.indexOf('onToggleVisited={onTogglePinVisited}') > 0 &&
    map.indexOf('onChangeMemo={onChangePinMemo}') > 0
);
check('배선: 목록 행에 방문 배지 + 메모 미리보기', list.indexOf('✓ 방문완료') > 0 && list.indexOf('pin-memo-preview-') > 0);
check('배선: 상세 시트에 가봤어요 토글 + 메모 입력', sheet.indexOf('pin-visited-toggle') > 0 && sheet.indexOf('pin-memo-input') > 0);
check('배선: 저장 화면에 선택 메모 입력', paste.indexOf('paste-memo-input') > 0);
check('배선: seedPins 의 한도 값은 무제한', /FREE_PIN_LIMIT\s*=\s*Infinity/.test(seed));
check(
  'v2.20.1 배선: 지도 마커에 방문 체크 원형 배지 없음 (초록 텍스트 라벨만)',
  read('src/components/RealMapView.web.js').indexOf('pinVisitedBadgeHtml') < 0 &&
    read('src/components/MapCanvas.js').indexOf('visitBadge') < 0
);
check('배선: 네이티브 지도 라벨에도 ✓', read('src/components/MapCanvas.js').indexOf("(pin.visited === true ? '✓ ' : '')") > 0);
check('배선: 웹 지도 라벨에도 ✓ (초록 글씨로 가봤어요)', read('src/components/RealMapView.web.js').indexOf("(visited ? '✓ ' : '')") > 0);

if (fails) {
  console.log('\nVISIT_MEMO_TEST_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nVISIT_MEMO_TESTS_OK');
