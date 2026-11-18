/**
 * test/run-tests.mjs
 * ─────────────────────────────────────────────────────────────
 * 소스(src)는 ESM + react-native import 를 쓰기 때문에 node 로 바로 돌릴 수 없습니다.
 * esbuild 로 react-native 를 테스트 스텁(또는 react-native-web)으로 치환해 번들한 뒤 실행합니다.
 *
 *   npm test            … 추출기·딥링크 + 프록시·API + 위치/거리 + 클라우드 로그인·동기화 + 분류 + 검색·목록·클러스터링 + 검색 이동·결과 목록 + 화면 렌더 스모크 테스트
 *   npm run test:extract  … 추출기 테스트만
 *   npm run test:location … 위치·거리·반경 500m 테스트만
 *   npm run test:cloud    … Supabase 설정·로그인·클라우드 동기화 테스트만
 *   npm run test:category … 분류(카테고리) 만들기·이름 변경·삭제 테스트만
 *   npm run test:search   … 내 핀 검색 · 목록 정렬 · 픽셀 클러스터링 테스트만 (v2.5)
 *   npm run test:nav      … 검색 결과 따른 지도 이동 · 결과 목록 테스트만 (v2.6)
 *   npm run test:visit    … ✅ 가봤어요 · 📝 한줄 메모 · 🔓 10개 한도 해제 테스트만 (v2.10)
 *   npm run test:collections … 📂 컬렉션 만들기·담기·공유·정리 테스트만 (v2.19)
 *   npm run test:hours     … 🕒 영업 상태 배지 · 📝 한줄 메모 초안 테스트만 (v2.20)
 *   npm run test:admin     … 🛡️ 어드민 인증(401·403)·화이트리스트·RPC 접근 테스트만 (v2.21)
 *   npm run test:curation  … 🗂️ 기획전·공유 링크·📌 배너 테스트만 (v2.31)
 *   npm run test:longpress … 📍 지도 꾹 눌러 장소 등록(꾹 누르기 판정·주변 조회·핀) 테스트만 (v2.33.0)
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'test', '.tmp');
const only = process.argv[2] || '';

fs.mkdirSync(outDir, { recursive: true });

const STUBS = {
  'expo-status-bar': './test/stubs/expo-status-bar.js',
  'expo-clipboard': './test/stubs/expo-clipboard.js',
  '@react-native-async-storage/async-storage': './test/stubs/async-storage.js',
  '@expo/vector-icons': './test/stubs/vector-icons.js',
};

async function runSuite({ name, entry, out, format, alias }) {
  const outFile = path.join(outDir, out);
  await build({
    absWorkingDir: root,
    entryPoints: [path.join(here, entry)],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format,
    alias,
    loader: { '.js': 'jsx' },
    logLevel: 'silent',
  });
  console.log('\n── ' + name + ' ──');
  const res = spawnSync(process.execPath, [outFile], { cwd: root, stdio: 'inherit' });
  return res.status === null ? 1 : res.status;
}

let failed = 0;

if (!only || only === 'extract') {
  // src/utils/links.js 가 react-native 를 import 하므로 node 용 최소 스텁으로 바꿔 줍니다.
  failed += await runSuite({
    name: '추출기·딥링크 테스트',
    entry: 'extractor-test.mjs',
    out: 'extractor-test.bundle.mjs',
    format: 'esm',
    alias: { 'react-native': './test/stubs/react-native.js' },
  });
}

if (!only || only === 'proxy') {
  // v1.4 — 웹 빌드(Platform.OS='web')에서 동일 출처 프록시(/api/*)를 타는지
  failed += await runSuite({
    name: '웹 프록시 연동 테스트',
    entry: 'proxy-test.mjs',
    out: 'proxy-test.bundle.mjs',
    format: 'esm',
    alias: { 'react-native': './test/stubs/react-native-web.js' },
  });
}

if (!only || only === 'api') {
  // Vercel Serverless Functions(api/*.js) 핸들러 단위 테스트 — 네트워크는 fetch 스텁
  failed += await runSuite({
    name: '서버리스 API 핸들러 테스트',
    entry: 'api-test.mjs',
    out: 'api-test.bundle.mjs',
    format: 'esm',
  });
}

if (!only || only === 'location') {
  // v1.5 — 거리 계산(Haversine) · 반경 500m · 내 위치(GPS) · 브라우저 알림
  failed += await runSuite({
    name: '위치·거리·반경 알림 테스트',
    entry: 'location-test.mjs',
    out: 'location-test.bundle.mjs',
    format: 'esm',
  });
}

if (!only || only === 'cloud') {
  // v2.1 — Supabase 설정 해석 · 로그인 · 클라우드 핀 병합/동기화 (네트워크·DB 없이 구조만 검사)
  failed += await runSuite({
    name: '클라우드 로그인·동기화 테스트',
    entry: 'cloud-test.mjs',
    out: 'cloud-test.bundle.mjs',
    format: 'esm',
    alias: { 'react-native': './test/stubs/react-native.js', ...STUBS },
  });
}

if (!only || only === 'category') {
  // v2.2 — 분류 직접 선택 · 만들기 · 이름 바꾸기(핀 일괄 반영) · 지우기(핀 안전 폴백)
  failed += await runSuite({
    name: '분류 선택·생성·수정·삭제 테스트',
    entry: 'category-test.mjs',
    out: 'category-test.bundle.mjs',
    format: 'esm',
    alias: { 'react-native': './test/stubs/react-native.js', ...STUBS },
  });
}

if (!only || only === 'search') {
  // v2.5 — 🔍 내 핀 검색 · 📋 목록 정렬 · 📍 픽셀 거리 클러스터링 (지도 컴포넌트의 조립 함수까지)
  failed += await runSuite({
    name: '핀 검색·목록·클러스터링 테스트',
    entry: 'search-cluster-test.mjs',
    out: 'search-cluster-test.bundle.mjs',
    format: 'esm',
    alias: { 'react-native': 'react-native-web', ...STUBS },
  });
}

if (!only || only === 'nav') {
  // v2.6 — 🔍 검색 결과 수에 따른 지도 이동·결과 목록 (지도·화면 없이 도는 순수 규칙)
  failed += await runSuite({
    name: '검색 결과 → 지도 이동·결과 목록 테스트',
    entry: 'search-nav-test.mjs',
    out: 'search-nav-test.bundle.mjs',
    format: 'esm',
    alias: { 'react-native': './test/stubs/react-native.js' },
  });
}

if (!only || only === 'visit') {
  // v2.10 — ✅ 가봤어요 · 📝 한줄 메모 · 🔓 무료 10개 한도 해제 (핀·검색·클라우드·공유)
  failed += await runSuite({
    name: '가봤어요·한줄 메모·한도 해제 테스트',
    entry: 'visit-memo-test.mjs',
    out: 'visit-memo-test.bundle.mjs',
    format: 'esm',
    alias: { 'react-native': './test/stubs/react-native.js', ...STUBS },
  });
}

if (!only || only === 'collections') {
  // v2.19 — 📂 컬렉션: 만들기·이름 검사·핀 담기/빼기·핀 삭제 시 정리·공유 문구·지도 필터
  failed += await runSuite({
    name: '컬렉션 만들기·담기·공유 테스트',
    entry: 'collections-test.mjs',
    out: 'collections-test.bundle.mjs',
    format: 'esm',
  });
}

if (!only || only === 'hours') {
  // v2.20 — 🕒 영업 상태 배지(한국 시간) · 📝 한줄 메모 초안 · 매장 상세 연결
  failed += await runSuite({
    name: '영업 상태·한줄 메모 초안 테스트',
    entry: 'opening-status-test.mjs',
    out: 'opening-status-test.bundle.mjs',
    format: 'esm',
    alias: { 'react-native': './test/stubs/react-native.js' },
  });
}

if (!only || only === 'admin') {
  // v2.21 — 🛡️ 어드민: 토큰 검증(401/403) · 화이트리스트 · RPC 데이터 접근 · service_role 미사용
  failed += await runSuite({
    name: '어드민 인증·API 테스트',
    entry: 'admin-test.mjs',
    out: 'admin-test.bundle.mjs',
    format: 'esm',
  });
}

if (!only || only === 'feedback') {
  // v2.23 — 💬 제안·버그 제보: 글 검사·쿨다운·정렬·공감 RPC·화면/어드민 연결
  failed += await runSuite({
    name: '제안·버그 제보 게시판 테스트',
    entry: 'feedback-test.mjs',
    out: 'feedback-test.bundle.mjs',
    format: 'esm',
    alias: { 'react-native': './test/stubs/react-native.js', ...STUBS },
  });
}

if (!only || only === 'curation') {
  // v2.31 — 🗂️ 기획전·공유 링크 · 📌 배너: 장소/배너 다듬기 · 중복 없는 담기 · 공개 RPC · 어드민 라우트
  failed += await runSuite({
    name: '기획전·공유 링크·배너 테스트',
    entry: 'curation-test.mjs',
    out: 'curation-test.bundle.mjs',
    format: 'esm',
    alias: { 'react-native': './test/stubs/react-native.js', ...STUBS },
  });
}

if (!only || only === 'longpress') {
  // v2.33.0 — 📍 지도 꾹 눌러 장소 등록: 꾹 누르기 판정 · /api/reverse-place · 이름/분류 제안 · 핀 만들기
  failed += await runSuite({
    name: '지도 꾹 눌러 장소 등록 테스트',
    entry: 'longpress-test.mjs',
    out: 'longpress-test.bundle.mjs',
    format: 'esm',
    // 지도 컴포넌트(RealMapView.web.js)의 계산 함수까지 함께 검사하므로 실제 react-native-web 으로 묶습니다.
    alias: { 'react-native': 'react-native-web', ...STUBS },
  });
}

if (!only || only === 'ssr') {
  failed += await runSuite({
    name: '화면 렌더 스모크 테스트',
    entry: 'ssr-smoke.jsx',
    out: 'ssr-smoke.cjs',
    format: 'cjs',
    alias: { 'react-native': 'react-native-web', ...STUBS },
  });
}

fs.rmSync(outDir, { recursive: true, force: true });
if (failed) {
  console.log('\nTEST_FAILED (exit ' + failed + ')');
  process.exit(1);
}
console.log('\nALL_TESTS_OK');
