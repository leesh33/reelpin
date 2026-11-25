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
 *   npm run test:visits    … 📊 어드민 접속자 통계(SQL·방문자 id·방문 1회·API) 테스트만 (v2.41)
 *   npm run test:curation  … 🗂️ 기획전·공유 링크·📌 배너 테스트만 (v2.31)
 *   npm run test:longpress … 📍 지도 꾹 눌러 장소 등록(꾹 누르기 판정·주변 조회·핀) 테스트만 (v2.33.0)
 *   npm run test:account   … 🗑️ 회원탈퇴(계정 삭제 · 2단계 확인 · delete_my_account) 테스트만 (v2.40.0)
 *   npm run test:apple     … 🍎 Sign in with Apple 스위치(꺼짐/켜짐 · Supabase 호출 가드) 테스트만 (v2.40.0)
 *   npm run test:fonts     … 🔤 Gmarket Sans 네이티브(OTF · expo-font · AppText) 테스트만 (v2.40.0)
 *   npm run test:bottom    … 📱 빌드 20 하단 안전 영역(홈 인디케이터) · 지도 풀블리드 · +/− 둥근 박스 테스트만
 *   npm run test:build22   … 🗺️ 빌드 22 지도 핀·이름표 세로 잘림(고정 폭 마커) · 백그라운드 복귀 까만 화면 테스트만
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
  // v2.40.0 — expo-font 는 네이티브에서만 실제로 쓰입니다(웹은 index.html 의 @font-face)
  'expo-font': './test/stubs/expo-font.js',
  '@react-native-async-storage/async-storage': './test/stubs/async-storage.js',
  '@expo/vector-icons': './test/stubs/vector-icons.js',
  // v2.41 — 네이티브 WebView(지도)는 node 에서 실제 모듈을 읽을 수 없어 스텁으로 바꿉니다.
  'react-native-webview': './test/stubs/react-native-webview.js',
  // v2.41 — 안전 영역(노치) 값은 node 테스트에서 0 으로 충분합니다.
  'react-native-safe-area-context': './test/stubs/safe-area-context.js',
  // v2.40.0 빌드 21 — 네이티브 OAuth 창(expo-web-browser)은 node 에서 열 수 없어 스텁으로 바꿉니다.
  //   (무엇을 열려 했는지 · 돌아온 주소를 어떻게 세션으로 바꾸는지 검사)
  'expo-web-browser': './test/stubs/expo-web-browser.js',
};

/** 모든 suite 가 같은 스텁 묶음을 쓰도록 — `react-native` 만 갈아 끼웁니다. */
const aliasFor = (reactNative) => ({ 'react-native': reactNative, ...STUBS });

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
    // v2.40.0 — assets/fonts/*.otf 는 Metro 가 묶는 자산이라 node 테스트에서는 파일 경로로만 처리
    loader: { '.js': 'jsx', '.otf': 'file' },
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
    alias: aliasFor('./test/stubs/react-native.js'),
  });
}

if (!only || only === 'proxy') {
  // v1.4 — 웹 빌드(Platform.OS='web')에서 동일 출처 프록시(/api/*)를 타는지
  failed += await runSuite({
    name: '웹 프록시 연동 테스트',
    entry: 'proxy-test.mjs',
    out: 'proxy-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('./test/stubs/react-native-web.js'),
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
    // v2.41 — location.js 가 네이티브에서 expo-location 을 쓰므로 react-native 스텁이 필요합니다.
    alias: aliasFor('./test/stubs/react-native.js'),
  });
}

if (!only || only === 'cloud') {
  // v2.1 — Supabase 설정 해석 · 로그인 · 클라우드 핀 병합/동기화 (네트워크·DB 없이 구조만 검사)
  failed += await runSuite({
    name: '클라우드 로그인·동기화 테스트',
    entry: 'cloud-test.mjs',
    out: 'cloud-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('./test/stubs/react-native.js'),
  });
}

if (!only || only === 'category') {
  // v2.2 — 분류 직접 선택 · 만들기 · 이름 바꾸기(핀 일괄 반영) · 지우기(핀 안전 폴백)
  failed += await runSuite({
    name: '분류 선택·생성·수정·삭제 테스트',
    entry: 'category-test.mjs',
    out: 'category-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('./test/stubs/react-native.js'),
  });
}

if (!only || only === 'search') {
  // v2.5 — 🔍 내 핀 검색 · 📋 목록 정렬 · 📍 픽셀 거리 클러스터링 (지도 컴포넌트의 조립 함수까지)
  failed += await runSuite({
    name: '핀 검색·목록·클러스터링 테스트',
    entry: 'search-cluster-test.mjs',
    out: 'search-cluster-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('react-native-web'),
  });
}

if (!only || only === 'nav') {
  // v2.6 — 🔍 검색 결과 수에 따른 지도 이동·결과 목록 (지도·화면 없이 도는 순수 규칙)
  failed += await runSuite({
    name: '검색 결과 → 지도 이동·결과 목록 테스트',
    entry: 'search-nav-test.mjs',
    out: 'search-nav-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('./test/stubs/react-native.js'),
  });
}

if (!only || only === 'visit') {
  // v2.10 — ✅ 가봤어요 · 📝 한줄 메모 · 🔓 무료 10개 한도 해제 (핀·검색·클라우드·공유)
  failed += await runSuite({
    name: '가봤어요·한줄 메모·한도 해제 테스트',
    entry: 'visit-memo-test.mjs',
    out: 'visit-memo-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('./test/stubs/react-native.js'),
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
    alias: aliasFor('./test/stubs/react-native.js'),
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

if (!only || only === 'visits') {
  // v2.41 — 📊 어드민 접속자 통계: SQL(RLS·anon 기록·관리자만 통계) · 방문자 id(UUID·재사용) ·
  //         앱 실행당 1회 · /api/admin?view=visits · 미리보기 화면
  failed += await runSuite({
    name: '어드민 접속자 통계 테스트',
    entry: 'visits-test.mjs',
    out: 'visits-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('./test/stubs/react-native.js'),
  });
}

if (!only || only === 'feedback') {
  // v2.23 — 💬 제안·버그 제보: 글 검사·쿨다운·정렬·공감 RPC·화면/어드민 연결
  failed += await runSuite({
    name: '제안·버그 제보 게시판 테스트',
    entry: 'feedback-test.mjs',
    out: 'feedback-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('./test/stubs/react-native.js'),
  });
}

if (!only || only === 'curation') {
  // v2.31 — 🗂️ 기획전·공유 링크 · 📌 배너: 장소/배너 다듬기 · 중복 없는 담기 · 공개 RPC · 어드민 라우트
  failed += await runSuite({
    name: '기획전·공유 링크·배너 테스트',
    entry: 'curation-test.mjs',
    out: 'curation-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('./test/stubs/react-native.js'),
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
    alias: aliasFor('react-native-web'),
  });
}

if (!only || only === 'paste') {
  // v2.33.4 — 저장 화면(링크·사진·가게명)의 ✅ 가봤어요 토글과 저장 페이로드(visited·visitedAt)
  failed += await runSuite({
    name: '저장 화면 가봤어요 토글·저장 페이로드 테스트',
    entry: 'paste-visited-test.mjs',
    out: 'paste-visited-test.bundle.mjs',
    format: 'esm',
  });
}

if (!only || only === 'legal') {
  // 2026-11-20 — 📄 개인정보처리방침(/privacy) · 이용약관(/terms) 페이지와 배포 배선(vercel.json) · 앱 안 링크
  failed += await runSuite({
    name: '개인정보처리방침·이용약관 페이지 테스트',
    entry: 'legal-test.mjs',
    out: 'legal-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('./test/stubs/react-native.js'),
  });
}

if (!only || only === 'rank') {
  // v2.34.0 — 가게명 찾기 정렬: 이름 정확도 → 내 위치에서 가까운 순 · 20km 2차 조회
  failed += await runSuite({
    name: '가게명 찾기 정확도·거리순 정렬 테스트',
    entry: 'search-rank-test.mjs',
    out: 'search-rank-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('./test/stubs/react-native.js'),
  });
}

if (!only || only === 'sheet') {
  // v2.34.0 — 장소 상세 시트를 헤더 부근에서 아래로 쓸어내려 닫기 (임계값·배선)
  failed += await runSuite({
    name: '상세 시트 아래로 쓸어내려 닫기 테스트',
    entry: 'sheet-dismiss-test.mjs',
    out: 'sheet-dismiss-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('./test/stubs/react-native.js'),
  });
}

if (!only || only === 'layersheet') {
  // v2.36.0 — 목록 보기 · 알림 · 내 정보 레이어 팝업을 헤더 아래로 쓸어내려 닫기 (임계값·배선)
  failed += await runSuite({
    name: '레이어 팝업 헤더·본문 스와이프 닫기 테스트',
    entry: 'layer-sheet-swipe-test.mjs',
    out: 'layer-sheet-swipe-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('./test/stubs/react-native.js'),
  });
}

if (!only || only === 'mapsearch') {
  // v2.35.0 — 🔍 지도 상단 통합 검색창(내 핀 + 새 장소 찾기): 배치·드롭다운 규칙·저장 탭 auto 실행
  failed += await runSuite({
    name: '지도 통합 검색창(내 핀 + 새 장소 찾기) 테스트',
    entry: 'map-search-test.mjs',
    out: 'map-search-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('./test/stubs/react-native.js'),
  });
}

if (!only || only === 'color') {
  // v2.36.2 — 분류 추가할 때 색상 지정 (팔레트·색 표·자동 배정 유지·화면·저장 배선)
  failed += await runSuite({
    name: '분류 색 지정 테스트',
    entry: 'category-color-test.mjs',
    out: 'category-color-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('./test/stubs/react-native.js'),
  });
}

if (!only || only === 'menu') {
  // v2.40.0 — ☰ 내 정보 설정 메뉴 순서 · 하단 고정 푸터 제거 · 개인정보처리방침/이용약관 행(클릭 배선)
  failed += await runSuite({
    name: '내 정보 메뉴 순서·푸터 제거 테스트',
    entry: 'menu-order-test.jsx',
    out: 'menu-order-test.cjs',
    format: 'cjs',
    alias: aliasFor('react-native-web'),
  });
}

if (!only || only === 'procard') {
  // 2026-11-21 — 🙈 `내 정보` 릴스핀 프로(PRO) 카드 숨김: 스위치 · 실화면(DOM) 미노출 · 나머지 레이아웃 유지
  failed += await runSuite({
    name: '내 정보 프로 카드 숨김 테스트',
    entry: 'pro-card-hidden-test.jsx',
    out: 'pro-card-hidden-test.cjs',
    format: 'cjs',
    alias: aliasFor('react-native-web'),
  });
}

if (!only || only === 'account') {
  // v2.40.0 — 🗑️ 회원탈퇴(App Store 5.1.1(v)): SQL(security definer·본인 행만) · RPC 호출 · 2단계 확인 창 · 화면 배선
  failed += await runSuite({
    name: '회원탈퇴(계정 삭제) 테스트',
    entry: 'account-deletion-test.jsx',
    out: 'account-deletion-test.cjs',
    format: 'cjs',
    alias: aliasFor('react-native-web'),
  });
}

if (!only || only === 'apple') {
  // v2.40.0 — 🍎 Sign in with Apple 스위치(4.8): 꺼짐/켜짐 두 상태 · Supabase 호출 가드 · README 순서
  failed += await runSuite({
    name: 'Apple 로그인 스위치 테스트',
    entry: 'apple-signin-test.jsx',
    out: 'apple-signin-test.cjs',
    format: 'cjs',
    alias: aliasFor('react-native-web'),
  });
}

if (!only || only === 'fonts') {
  // v2.40.0 — 🔤 Gmarket Sans 네이티브: OTF 파일 · expo-font 플러그인 · AppText(굵기→글꼴) · 웹/아이콘 무영향
  failed += await runSuite({
    name: 'Gmarket Sans 네이티브 글꼴 테스트',
    entry: 'fonts-test.mjs',
    out: 'fonts-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('./test/stubs/react-native.js'),
  });
}

if (!only || only === 'bottom') {
  // v2.42 · 빌드 20 — 📱 아래 안전 영역(홈 인디케이터)까지 화면 채우기 · 지도 +/− 버튼 둥근 박스
  failed += await runSuite({
    name: '하단 안전 영역·지도 풀블리드 테스트',
    entry: 'bottom-safe-test.mjs',
    out: 'bottom-safe-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('./test/stubs/react-native.js'),
  });
}

if (!only || only === 'v244') {
  // v2.44 — 웹·서버에서 바로 고친 P0/P1: 알림 반경 배선 · 영문 라벨 차단 · 가짜 후보 금지 ·
  //         샘플 핀 업로드/공유 제외 · 계정 전환 정리 · 문구/16px/삭제 확인
  failed += await runSuite({
    name: 'v2.44 웹·서버 버그 수정 테스트',
    entry: 'v244-fixes-test.mjs',
    out: 'v244-fixes-test.bundle.mjs',
    format: 'esm',
    alias: aliasFor('react-native-web'),
  });
}

if (!only || only === 'build22') {
  // v2.43 · 빌드 22 — 🗺️ 지도 핀 이름표 세로 잘림(고정 폭 마커 + 가운데 anchor) ·
  //                  백그라운드 복귀 까만 화면(onContentProcessDidTerminate → retry)
  failed += await runSuite({
    name: '빌드 22 지도 핀·백그라운드 복귀 테스트',
    entry: 'build22-test.mjs',
    out: 'build22-test.bundle.mjs',
    format: 'esm',
  });
}

if (!only || only === 'ssr') {
  failed += await runSuite({
    name: '화면 렌더 스모크 테스트',
    entry: 'ssr-smoke.jsx',
    out: 'ssr-smoke.cjs',
    format: 'cjs',
    alias: aliasFor('react-native-web'),
  });
}

fs.rmSync(outDir, { recursive: true, force: true });
if (failed) {
  console.log('\nTEST_FAILED (exit ' + failed + ')');
  process.exit(1);
}
console.log('\nALL_TESTS_OK');
