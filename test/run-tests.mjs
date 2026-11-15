/**
 * test/run-tests.mjs
 * ─────────────────────────────────────────────────────────────
 * 소스(src)는 ESM + react-native import 를 쓰기 때문에 node 로 바로 돌릴 수 없습니다.
 * esbuild 로 react-native 를 테스트 스텁(또는 react-native-web)으로 치환해 번들한 뒤 실행합니다.
 *
 *   npm test            … 추출기·딥링크 + 프록시·API + 위치/거리 + 클라우드 로그인·동기화 + 분류 + 검색·목록·클러스터링 + 화면 렌더 스모크 테스트
 *   npm run test:extract  … 추출기 테스트만
 *   npm run test:location … 위치·거리·반경 500m 테스트만
 *   npm run test:cloud    … Supabase 설정·로그인·클라우드 동기화 테스트만
 *   npm run test:category … 분류(카테고리) 만들기·이름 변경·삭제 테스트만
 *   npm run test:search   … 내 핀 검색 · 목록 정렬 · 픽셀 클러스터링 테스트만 (v2.5)
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
