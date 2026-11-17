/**
 * test/curation-test.mjs — v2.31 🗂️ 컬렉션 기획전 · 공유 링크 · 📌 배너 테스트
 * ─────────────────────────────────────────────────────────────
 *   ① utils/curation.js — 장소·배너·기획전 다듬기, 공유 링크, 중복 없는 담기 계획
 *   ② services/curation.js — 공개 RPC 4개 호출 모양 (가짜 Supabase 클라이언트)
 *   ③ api/admin.js — 기획전·배너 어드민 라우트 (권한 · 입력 검증 · RPC 인자)
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  BANNER_LIMITS,
  CURATED_LIMITS,
  buildCollectionShareUrl,
  clearCollectionShareFromLocation,
  collectionShareBody,
  importSummary,
  normalizeBanner,
  normalizeCurated,
  normalizePlace,
  normalizePlaces,
  parseCollectionShareParam,
  placesFromPins,
  planCuratedImport,
  readCollectionShareFromLocation,
} from '../src/utils/curation.js';
import {
  CURATION_RPC,
  fetchPublicBanners,
  fetchPublicCurated,
  fetchSharedCollection,
  friendlyCurationError,
  shareCollectionSnapshot,
  sharedAsCurated,
} from '../src/services/curation.js';
import adminHandler from '../api/admin.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails++;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

// ─────────────────────────────────────────────────────────────
// ① utils/curation.js
// ─────────────────────────────────────────────────────────────
check('utils: 장소 이름이 없으면 버림', normalizePlace({ name: '   ' }) === null, JSON.stringify(normalizePlace({ name: ' ' })));

const place = normalizePlace({
  name: '  베통 성수 ',
  category: '베이커리',
  area: '성수동',
  address: '서울 성동구 연무장길 18',
  lat: '37.5445',
  lng: 127.0557,
  memo: '아기의자 있음',
  phone: '02-123-4567',
});
check('utils: 이름·동네 공백 정리', place && place.name === '베통 성수' && place.area === '성수동', JSON.stringify(place));
check('utils: 좌표는 숫자로', place && place.lat === 37.5445 && place.lng === 127.0557, JSON.stringify(place));
check(
  'utils: 공유 장소에는 메모·전화번호가 없음',
  place && place.memo === undefined && place.phone === undefined && Object.keys(place).sort().join(',') === 'address,area,category,lat,lng,name',
  Object.keys(place || {}).join(',')
);
check('utils: 잘못된 좌표는 null', normalizePlace({ name: 'A', lat: 999, lng: -181 }).lat === null, '');
check(
  'utils: 장소 목록 중복 제거 + 상한',
  normalizePlaces([{ name: 'A', lat: 1, lng: 2 }, { name: 'A', lat: 1, lng: 2 }, { name: 'B' }]).length === 2,
  ''
);
check('utils: placesFromPins 는 필요한 6개 필드만', (() => {
  const list = placesFromPins([{ id: 'p1', name: 'A', category: '맛집', area: '당하동', address: 'x', lat: 37.5, lng: 126.7, memo: 'm', phone: '1' }]);
  return list.length === 1 && Object.keys(list[0]).sort().join(',') === 'address,area,category,lat,lng,name';
})(), '');

const banner = normalizeBanner({ id: 'b1', title: ' 이번 주 인기 ', subtitle: '지금 담아 두세요', badge: '', linkUrl: 'javascript:alert(1)' });
check('utils: 배너 제목 정리 · 기본 배지', banner && banner.title === '이번 주 인기' && banner.badge === '기획전', JSON.stringify(banner));
check('utils: 배너 링크는 http(s) 만', banner && banner.linkUrl === '', JSON.stringify(banner));
check(
  'utils: 배너 제목 없으면 버림',
  normalizeBanner({ title: '  ' }) === null,
  ''
);
check(
  'utils: 배너 글자 수 상한 상수',
  BANNER_LIMITS.title === 40 && BANNER_LIMITS.subtitle === 80 && BANNER_LIMITS.badge === 10,
  JSON.stringify(BANNER_LIMITS)
);

const curatedRaw = normalizeCurated({
  id: 'c1',
  title: '영등포 점심 코스',
  description: '회사 근처 12시',
  sponsor: '운영자 추천',
  badge: '스폰서',
  emoji: '🍜',
  color: 'red',
  places: [{ name: 'A', lat: 37.5, lng: 126.7 }, { name: 'B' }],
  active: true,
});
check('utils: 기획전 장소 수', curatedRaw && curatedRaw.placeCount === 2, JSON.stringify(curatedRaw && curatedRaw.placeCount));
check('utils: 기획전 색은 hex 만', curatedRaw && curatedRaw.color === '#0D9488', curatedRaw && curatedRaw.color);
check('utils: 기획전 상한 상수', CURATED_LIMITS.places === 50 && CURATED_LIMITS.title === 40, JSON.stringify(CURATED_LIMITS));

// 중복 없는 담기 — 같은 이름 + 60m 는 같은 곳, 먼 곳은 새 핀
const existing = [
  { id: 'pin-existing-1', name: '베통 성수', area: '성수동', category: '베이커리', lat: 37.5445, lng: 127.0557, placeUrl: '', naverPlaceId: '' },
];
const plan = planCuratedImport(
  {
    title: '영등포 점심 코스',
    description: '12시',
    emoji: '🍜',
    color: '#0D9488',
    places: [
      { name: '베통 성수', category: '베이커리', area: '성수동', lat: 37.5446, lng: 127.0558 },
      { name: '디오디아', category: '카페', area: '연남동', lat: 37.5628, lng: 126.9252 },
      { name: '좌표없는곳', category: '맛집', area: '어딘가' },
    ],
  },
  existing
);
check('utils: 이미 있는 곳은 새 핀을 만들지 않음', plan.added === 2 && plan.fresh.length === 2, JSON.stringify({ added: plan.added }));
check('utils: 이미 있는 핀 id 도 컬렉션에 들어감', plan.pinIds.indexOf('pin-existing-1') >= 0 && plan.pinIds.length === 3, JSON.stringify(plan.pinIds));
check('utils: 중복 수 보고', plan.existing === 1, String(plan.existing));
check('utils: 담기 계획에 컬렉션 이름·핀 id', plan.collection.name === '영등포 점심 코스' && plan.collection.pinIds.length === 3, JSON.stringify(plan.collection));
check(
  'utils: 담기 결과 문구',
  importSummary({ added: 2, existing: 1 }) === '2곳을 내 지도에 담았어요 · 1곳은 이미 있어요',
  importSummary({ added: 2, existing: 1 })
);
check('utils: 담을 곳이 없으면 문구', importSummary({ added: 0, existing: 0 }) === '담을 장소가 없어요', '');

check(
  'utils: 공유 문구에 제목·설명·장소',
  (() => {
    const text = collectionShareBody({ title: '점심', description: '12시', emoji: '🍜' }, [
      { name: 'A', category: '맛집', area: '당하동' },
    ]);
    return text.indexOf('🍜 점심 · 12시 · 1곳') === 0 && text.indexOf('1. A (맛집 · 당하동)') > 0;
  })(),
  ''
);

check(
  'utils: 공유 링크 ?col=',
  buildCollectionShareUrl('abc-123', 'https://reelpin.vercel.app') === 'https://reelpin.vercel.app/?col=abc-123',
  buildCollectionShareUrl('abc-123', 'https://reelpin.vercel.app')
);
check('utils: 빈 id 는 빈 링크', buildCollectionShareUrl('', 'https://x') === '', '');
check(
  'utils: 주소에서 ?col= 읽기',
  parseCollectionShareParam('?a=1&col=ff00-aa') === 'ff00-aa' &&
    parseCollectionShareParam('?col=abc#x') === 'abc' &&
    parseCollectionShareParam('?nope=1') === '',
  ''
);
check('utils: window 없으면 빈 값', readCollectionShareFromLocation() === '' && clearCollectionShareFromLocation() === false, '');

// ─────────────────────────────────────────────────────────────
// ② services/curation.js (가짜 Supabase 클라이언트)
// ─────────────────────────────────────────────────────────────
const rpcCalls = [];
function fakeClient(reply) {
  return {
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      return typeof reply === 'function' ? reply(name, args) : reply;
    },
  };
}

let res = await fetchPublicBanners({
  client: fakeClient({ data: [{ id: 'b1', title: '배너', badge: '기획전', linkUrl: 'https://a.b', sortOrder: 1 }], error: null }),
});
check('service: 배너 RPC 이름', rpcCalls[0] && rpcCalls[0].name === CURATION_RPC.banners, JSON.stringify(rpcCalls[0]));
check('service: 배너 목록 정리', res.ok && res.items.length === 1 && res.items[0].linkUrl === 'https://a.b', JSON.stringify(res));

rpcCalls.length = 0;
res = await fetchPublicCurated({
  client: fakeClient({ data: [{ id: 'c1', title: '기획전', places: [{ name: 'A' }] }], error: null }),
});
check('service: 기획전 RPC 이름·인자', rpcCalls[0] && rpcCalls[0].name === CURATION_RPC.curated && rpcCalls[0].args.p_id === null, JSON.stringify(rpcCalls[0]));
check('service: 기획전 목록 정리', res.ok && res.items[0].placeCount === 1, JSON.stringify(res));

rpcCalls.length = 0;
const pins = [
  { id: 'p1', name: '베통 성수', category: '베이커리', area: '성수동', address: '주소', lat: 37.5, lng: 127.0, memo: '비밀메모' },
];
const shared = await shareCollectionSnapshot(
  { name: '점심 코스', desc: '12시', emoji: '🍜', color: '#0D9488' },
  pins,
  { client: fakeClient({ data: { ok: true, shareId: 'share-1' }, error: null }), origin: 'https://reelpin.vercel.app' }
);
check('service: 공유 RPC 이름', rpcCalls[0] && rpcCalls[0].name === CURATION_RPC.share, JSON.stringify(rpcCalls[0]));
check(
  'service: 공유는 메모를 보내지 않음',
  rpcCalls[0] && JSON.stringify(rpcCalls[0].args.p_places).indexOf('비밀메모') < 0,
  JSON.stringify(rpcCalls[0] && rpcCalls[0].args.p_places)
);
check('service: 공유 링크 반환', shared.ok && shared.url === 'https://reelpin.vercel.app/?col=share-1', JSON.stringify(shared));

rpcCalls.length = 0;
const emptyShare = await shareCollectionSnapshot({ name: '빈 컬렉션' }, [], { client: fakeClient({ data: {}, error: null }) });
check('service: 핀 없으면 공유하지 않음', emptyShare.ok === false && rpcCalls.length === 0, JSON.stringify(emptyShare));

const sharedItem = await fetchSharedCollection('share-1', {
  client: fakeClient({
    data: {
      ok: true,
      item: {
        shareId: 'share-1',
        title: '점심 코스',
        description: '12시',
        emoji: '🍜',
        color: '#0D9488',
        places: [{ name: 'A', lat: 37.5, lng: 127 }],
        viewCount: 3,
      },
    },
    error: null,
  }),
});
check(
  'service: 공유받은 컬렉션 읽기',
  sharedItem.ok && sharedItem.item.title === '점심 코스' && sharedItem.item.places.length === 1 && sharedItem.item.shareId === 'share-1',
  JSON.stringify(sharedItem)
);
const missing = await fetchSharedCollection('gone', {
  client: fakeClient({ data: { ok: false, error: 'not-found' }, error: null }),
});
check('service: 없는 공유 링크는 안내', missing.ok === false && missing.message.indexOf('찾지 못했어요') > 0, JSON.stringify(missing));
check(
  'service: 공유받은 → 미리보기 모양',
  (() => {
    const item = sharedAsCurated(sharedItem.item);
    return item && item.title === '점심 코스' && item.placeCount === 1;
  })(),
  ''
);
check(
  'service: DB 준비 안 됨 오류 문구',
  friendlyCurationError({ code: 'PGRST202', message: 'Could not find the function' }).indexOf('curation.sql') > 0,
  friendlyCurationError({ code: 'PGRST202' })
);

// ─────────────────────────────────────────────────────────────
// ③ api/admin.js — 기획전·배너 라우트
// ─────────────────────────────────────────────────────────────
function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    ended: false,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    end(chunk) {
      if (chunk != null) this.body = String(chunk);
      this.ended = true;
    },
    jsonBody() {
      try {
        return JSON.parse(this.body || 'null');
      } catch (e) {
        return null;
      }
    },
  };
}

const jsonRes = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const errRes = (status, data) => ({ ok: false, status, json: async () => data || {} });

let calls = [];
let adminUser = { id: 'u-admin', email: 'andy.leesh33@gmail.com' };
let rpcReply = { ok: true, body: [] };
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  calls.push({ url: u, init });
  if (u.indexOf('/auth/v1/user') >= 0) return jsonRes({ user: adminUser });
  if (u.indexOf('/rest/v1/rpc/') >= 0) {
    if (!rpcReply.ok) return errRes(rpcReply.status || 400, rpcReply.body || {});
    return jsonRes(rpcReply.body);
  }
  return errRes(404, { message: 'not found' });
};
process.env.SUPABASE_URL = 'https://zdcdvjlssncsawpqsjwe.supabase.co';
process.env.SUPABASE_ANON_KEY = 'sb_publishable_test_key_1234567890';
delete process.env.ADMIN_EMAILS;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminReq = (method, { query = '', body = null } = {}) => ({
  method,
  headers: { authorization: 'Bearer admin-token' },
  body,
  query: Object.fromEntries(new URLSearchParams(query).entries()),
  url: '/api/admin' + (query ? '?' + query : ''),
});

// GET view=banners / curated
rpcReply = { ok: true, body: [{ id: 'b1', title: '배너', active: true }] };
let res2 = makeRes();
await adminHandler(adminReq('GET', { query: 'view=banners' }), res2);
check('admin: GET banners 200', res2.statusCode === 200 && Array.isArray(res2.jsonBody().data), res2.body);
check(
  'admin: GET banners 는 reelpin_admin_banners 호출',
  calls.some((c) => c.url.indexOf('/rpc/reelpin_admin_banners') >= 0),
  ''
);

calls = [];
rpcReply = { ok: true, body: [{ id: 'c1', title: '기획전', places: [] }] };
res2 = makeRes();
await adminHandler(adminReq('GET', { query: 'view=curated' }), res2);
check('admin: GET curated 200', res2.statusCode === 200 && res2.jsonBody().data.length === 1, res2.body);
check(
  'admin: GET curated 는 reelpin_admin_curated 호출',
  calls.some((c) => c.url.indexOf('/rpc/reelpin_admin_curated') >= 0),
  ''
);

// 비관리자 403
adminUser = { id: 'u-other', email: 'someone@else.com' };
res2 = makeRes();
await adminHandler(adminReq('GET', { query: 'view=banners' }), res2);
check('admin: 비관리자 banners 403', res2.statusCode === 403 && res2.jsonBody().error === 'not-admin', res2.body);
adminUser = { id: 'u-admin', email: 'andy.leesh33@gmail.com' };

// save-banner — 링크 검증
calls = [];
rpcReply = { ok: true, body: { ok: true } };
res2 = makeRes();
await adminHandler(
  adminReq('POST', { body: { action: 'save-banner', title: '배너', linkUrl: 'javascript:alert(1)' } }),
  res2
);
check('admin: 배너 링크는 http 만 (400)', res2.statusCode === 400 && calls.filter((c) => c.url.indexOf('/rpc/') >= 0).length === 0, res2.body);

calls = [];
res2 = makeRes();
await adminHandler(adminReq('POST', { body: { action: 'save-banner', title: '  ' } }), res2);
check('admin: 빈 배너 제목 400', res2.statusCode === 400, res2.body);

calls = [];
res2 = makeRes();
await adminHandler(
  adminReq('POST', {
    body: { action: 'save-banner', title: '이번 주 인기', subtitle: '담아 두세요', badge: '스폰서', linkUrl: 'https://a.b', active: false, sortOrder: 2 },
  }),
  res2
);
const bannerCall = calls.find((c) => c.url.indexOf('/rpc/reelpin_admin_save_banner') >= 0);
const bannerArgs = bannerCall ? JSON.parse(bannerCall.init.body) : {};
check('admin: 배너 저장 RPC 200', res2.statusCode === 200, res2.body);
check(
  'admin: 배너 저장 인자',
  bannerArgs.p_title === '이번 주 인기' && bannerArgs.p_link_url === 'https://a.b' && bannerArgs.p_active === false && bannerArgs.p_sort_order === 2,
  JSON.stringify(bannerArgs)
);

// save-curated — 장소 없으면 400, 있으면 50개 상한
calls = [];
res2 = makeRes();
await adminHandler(adminReq('POST', { body: { action: 'save-curated', title: '기획전', places: [] } }), res2);
check('admin: 장소 없는 기획전 400', res2.statusCode === 400, res2.body);

calls = [];
const manyPlaces = Array.from({ length: 60 }, (_, i) => ({ name: 'P' + i, lat: 37.5, lng: 127 }));
manyPlaces.push({ name: '   ' });
res2 = makeRes();
await adminHandler(
  adminReq('POST', {
    body: { action: 'save-curated', title: '기획전', description: '설명', sponsor: '추천', badge: '기획전', emoji: '🍜', color: 'blue', places: manyPlaces },
  }),
  res2
);
const curatedCall = calls.find((c) => c.url.indexOf('/rpc/reelpin_admin_save_curated') >= 0);
const curatedArgs = curatedCall ? JSON.parse(curatedCall.init.body) : {};
check('admin: 기획전 저장 200', res2.statusCode === 200, res2.body);
check('admin: 기획전 장소 50개 상한', Array.isArray(curatedArgs.p_places) && curatedArgs.p_places.length === 50, JSON.stringify(curatedArgs.p_places && curatedArgs.p_places.length));
check('admin: 빈 장소 이름 제거', (curatedArgs.p_places || []).every((p) => p.name), '');
check('admin: 잘못된 색은 기본값', curatedArgs.p_color === '#0D9488', curatedArgs.p_color);

// delete-banner / delete-curated
calls = [];
res2 = makeRes();
await adminHandler(adminReq('POST', { body: { action: 'delete-banner', id: 'b1' } }), res2);
check(
  'admin: 배너 삭제 RPC',
  res2.statusCode === 200 && calls.some((c) => c.url.indexOf('/rpc/reelpin_admin_delete_banner') >= 0),
  res2.body
);

calls = [];
res2 = makeRes();
await adminHandler(adminReq('POST', { body: { action: 'delete-curated', id: 'c1' } }), res2);
check(
  'admin: 기획전 삭제 RPC',
  res2.statusCode === 200 && calls.some((c) => c.url.indexOf('/rpc/reelpin_admin_delete_curated') >= 0),
  res2.body
);

// 스키마 없음 → 503 안내에 curation.sql
rpcReply = { ok: false, status: 400, body: { code: 'PGRST202', message: 'Could not find the function public.reelpin_admin_banners' } };
res2 = makeRes();
await adminHandler(adminReq('GET', { query: 'view=banners' }), res2);
check(
  'admin: 스키마 없으면 503 + curation.sql 안내',
  res2.statusCode === 503 && res2.jsonBody().error === 'admin-schema-missing' && res2.jsonBody().message.indexOf('curation.sql') > 0,
  res2.body
);
rpcReply = { ok: true, body: [] };

// 보안 — service_role 키 미사용
const adminDbSource = fs.readFileSync(path.join(process.cwd(), 'server/admin-db.js'), 'utf8');
const curationSql = fs.readFileSync(path.join(process.cwd(), 'supabase/curation.sql'), 'utf8');
const adminApiSource = fs.readFileSync(path.join(process.cwd(), 'api/admin.js'), 'utf8');
check(
  '보안: 서버 코드가 service_role 키를 읽지 않음',
  adminDbSource.indexOf('process.env.SUPABASE_SERVICE_ROLE_KEY') < 0 &&
    adminApiSource.indexOf('process.env.SUPABASE_SERVICE_ROLE_KEY') < 0,
  ''
);
check(
  '보안: 테이블은 RLS + 정책 없음 (함수로만 접근)',
  curationSql.indexOf('enable row level security') > 0 && curationSql.indexOf('create policy') < 0,
  ''
);
check(
  '보안: 공유 응답에 이메일·작성자 id 가 없음',
  curationSql.indexOf("'email',") < 0 && curationSql.indexOf("'ownerId',") < 0 && curationSql.indexOf("'userEmail',") < 0,
  ''
);
check(
  'DB: 관리자 함수는 매번 reelpin_is_admin() 확인',
  (curationSql.match(/if not public\.reelpin_is_admin\(\) then/g) || []).length === 6,
  String((curationSql.match(/if not public\.reelpin_is_admin\(\) then/g) || []).length)
);

console.log(fails ? '\nCURATION_TEST_FAILED (' + fails + ')' : '\nCURATION_TESTS_OK');
if (fails) process.exit(1);
