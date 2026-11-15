/**
 * test/live-e2e-case.mjs
 * ─────────────────────────────────────────────────────────────
 * 라이브 E2E 본문 — test/live-e2e.mjs 가 번들해서 실행합니다.
 * 실제 유튜브 영상 → oEmbed 제목 → 키워드 정제 → 카카오·네이버 실검색.
 */
import { extractPlaces, extractSearchQueries } from '../src/services/extractor.js';

const CASES = [
  {
    label: '① 유튜브 쇼츠 — 성수동 로컬 맛집',
    input: 'https://www.youtube.com/shorts/3ZbtV8YXFGo',
  },
  {
    label: '② 유튜브 쇼츠 — 성수동 카페(이모지·해시태그 제목)',
    input: 'https://www.youtube.com/shorts/EKbeq6BnREI',
  },
  {
    label: '③ 유튜브 쇼츠 — 이태원 브런치(해시태그 다수)',
    input: 'https://www.youtube.com/shorts/0nz3ONW9OP8',
  },
  {
    label: '④ 공유 시트 혼합 입력(문구 + 링크)',
    input: '성수동 소금빵 맛집 베통 https://www.youtube.com/shorts/3ZbtV8YXFGo 더 보기',
  },
  {
    label: '⑤ 일반 웹 문서 — OG 메타(제목·설명) 읽기',
    input: 'https://icandoit-1.tistory.com/191',
  },
  {
    label: '⑥ 인스타 릴스 — 로그인 월 → 우아한 폴백 + 가게명 찾기 안내',
    input: 'https://www.instagram.com/reel/C8xSg2BpQ1K/',
  },
];

let withResults = 0;
let kakaoHits = 0;
let naverHits = 0;

for (const c of CASES) {
  console.log('\n══ ' + c.label + ' ══');
  console.log('  입력: ' + c.input);
  const started = Date.now();
  const result = await extractPlaces(c.input);
  const elapsed = Date.now() - started;

  if (!result.ok) {
    console.log('  ✗ 추출 실패: ' + result.reason);
    continue;
  }
  console.log('  플랫폼      : ' + result.platformLabel + ' (' + result.platform + ')');
  console.log('  읽어온 제목 : ' + (result.sourceTitle || '(없음)') + ' [' + result.titleStatus + ']');
  if (result.titleNotice) console.log('  화면 안내    : ' + result.titleNotice);
  const kw = extractSearchQueries((result.sourceTitle || '') + ' ' + (result.suggestedQuery || ''));
  console.log('  정제 결과   : 지역=' + (kw.area || '-') + ' / 상호=' + (kw.storeName || '-') + ' / 키워드=' + kw.keywords.join(','));
  console.log('  검색어 후보 : ' + result.queryList.join('  →  '));
  (result.attempts || []).forEach((a) => {
    console.log(
      '    · "' + a.query + '" → ' + a.resultCount + '건 (' + (a.providersUsed.join('+') || '없음') + ')'
    );
  });
  console.log('  사용한 검색어: ' + result.query);
  console.log('  소요        : ' + elapsed + 'ms');

  if (result.candidates && result.candidates.length) {
    // 실제 지도에서 확인된 후보가 있을 때만 '결과 있음'으로 셉니다(오프라인 수동 후보 제외).
    if (result.candidates.some((c) => (c.providers || []).length)) withResults += 1;
    result.candidates.slice(0, 3).forEach((cand, i) => {
      const prov = (cand.providers || [cand.provider]).join('+');
      console.log(
        '    ' + (i + 1) + '. ' + cand.name + ' | ' + (cand.address || '-') + ' | ' + cand.category +
          ' | ' + prov + ' | ' + Math.round(cand.lat * 1e4) / 1e4 + ',' + Math.round(cand.lng * 1e4) / 1e4
      );
      if ((cand.providers || []).includes('kakao')) kakaoHits += 1;
      if ((cand.providers || []).includes('naver')) naverHits += 1;
    });
  } else {
    console.log('    (후보 없음)');
  }
  if (result.failures && result.failures.length) {
    console.log('  ⚠ 실패한 지도 API: ' + JSON.stringify(result.failures));
  }
}

console.log('\n── 요약 ──');
console.log('  실제 지도 결과가 나온 케이스: ' + withResults + '/' + CASES.length);
console.log('  카카오 출처 후보: ' + kakaoHits + '건 · 네이버 출처 후보: ' + naverHits + '건');

if (withResults === 0) {
  console.log('LIVE_E2E_FAILED (실제 결과 0건 — 키/네트워크를 확인하세요)');
  process.exit(1);
}
if (naverHits === 0) {
  console.log('LIVE_E2E_PARTIAL (네이버 결과 0건 — HUB 키/규격을 확인하세요)');
  process.exit(2);
}
console.log('LIVE_E2E_OK');
