/**
 * services/extractor.js
 * ─────────────────────────────────────────────────────────────
 * 릴스/쇼츠 URL → 장소 후보 추출기.
 *
 * 구조 (v1.2 — 카카오·네이버(NAVER API HUB + 구 개발자센터)·구글 3사 지도 API 통합)
 *   · 네이버는 2026년 7월 말 규격 변경(개발자센터 → NAVER API HUB)을 둘 다 지원합니다.
 *     `EXPO_PUBLIC_NAVER_HUB_CLIENT_ID/SECRET` 가 있으면 HUB를, 없으면 기존 키를 씁니다.
 *   extractPlaces(url)
 *     ├─ parseUrl(url)                    … 플랫폼·ID 파싱
 *     ├─ SourceAdapter.fetchMetadata()    … 유튜브 / 인스타 메타데이터
 *     ├─ LlmAdapter.extractPlaceJson()    … 캡션 → {가게명·지역·메뉴·카테고리}
 *     ├─ searchPlaceProviders()           … 카카오 로컬 + 네이버 지역검색 + 구글 Places 병렬 조회 → 후보 병합
 *     │    └─ backfillNaverByAddress()    … v2.12 카카오만 찾았고 네이버가 비었을 때 주소(동·도로명·구)로 네이버 교차 보강
 *     └─ offlineSmartExtract()            … API 키가 하나도 없거나 전부 실패하면 오프라인 추출기로 폴백
 *
 * 설계 원칙
 *   1. 세 지도 API 키 중 **설정된 키만** 골라 동시에 조회하고, 한 곳이 실패해도 나머지 결과로 후보를 채웁니다.
 *   2. 키가 하나도 없으면 예전처럼 오프라인 스마트 추출기로 끝까지 동작합니다(앱이 멈추지 않음).
 *   3. 키는 app.json extra가 아니라 EXPO_PUBLIC_* 환경변수로만 넣습니다. (.env.example 참고)
 *      → Expo는 `process.env.EXPO_PUBLIC_XXX` 를 빌드 시점에 문자열로 치환하므로
 *        반드시 아래처럼 **직접 표기**해야 합니다. (`process.env[name]` 동적 접근은 치환되지 않음)
 *
 * v1.2 (2026-11-15) — 유료 키 없이도 '실제 URL'에서 가게명·동네를 뽑습니다.
 *   · 유튜브는 **무인증 oEmbed**(youtube.com/oembed)로 제목을 읽습니다. 키가 필요 없습니다.
 *   · 공유 시트에서 복사한 `"성수동 소금빵 맛집 베통 https://instagram.com/reel/..."` 같은
 *     **텍스트+URL 혼합 입력**을 링크와 캡션으로 나눠 둘 다 힌트로 씁니다.
 *   · 네이티브(iOS/Android)에서는 일반 웹·네이버 블로그의 og:title/og:description도
 *     3.5초 타임아웃으로 읽습니다. (인스타 로그인 월은 조용히 폴백)
 *   · 캡션에서 이모지·해시태그 기호·상투적 수식어를 걷어낸 **검색어 후보 여러 개**를 만들어
 *     첫 후보로 결과가 없으면 다음 후보로 자동 재시도합니다.
 */
import { Platform } from 'react-native';
import { extractNaverPlaceId, isShortLinkUrl, naverPlaceDetailUrl } from '../utils/links';
// v2.20 — 저장 화면 `한줄 메모` 초안 (AI·설명글 키워드, 확인된 값만)
import { memoDraftFromText, memoDraftOfParts, mergeMemoDrafts } from '../utils/memoDraft';

export const PLATFORMS = {
  instagram: { label: '인스타 릴스', host: 'instagram.com' },
  youtube: { label: '유튜브 쇼츠', host: 'youtube.com' },
  tiktok: { label: '틱톡', host: 'tiktok.com' },
  naver: { label: '네이버 블로그', host: 'blog.naver.com' },
  unknown: { label: '링크', host: '' },
};

const PATTERNS = [
  { platform: 'instagram', re: /instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i },
  { platform: 'youtube', re: /youtube\.com\/(?:shorts|watch)\/?\??(?:v=)?([A-Za-z0-9_-]{6,})/i },
  { platform: 'youtube', re: /youtu\.be\/([A-Za-z0-9_-]{6,})/i },
  { platform: 'tiktok', re: /tiktok\.com\/@[^/]+\/video\/(\d+)/i },
  { platform: 'naver', re: /blog\.naver\.com\/([A-Za-z0-9_]+)\/(\d+)/i },
];

/** URL을 플랫폼·콘텐츠 ID로 파싱합니다. */
export function parseUrl(raw) {
  const url = String(raw || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, reason: '링크는 http:// 또는 https:// 로 시작해야 해요.', url };
  }
  for (const p of PATTERNS) {
    const m = url.match(p.re);
    if (m) {
      return {
        ok: true,
        url,
        platform: p.platform,
        platformLabel: PLATFORMS[p.platform].label,
        contentId: m[1] || m[2] || '',
      };
    }
  }
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return { ok: false, reason: '주소 형식을 확인해 주세요.', url };
  }
  return { ok: true, url, platform: 'unknown', platformLabel: host, contentId: '', host };
}

/**
 * v1.2: 인스타·유튜브뿐 아니라 **일반 웹 페이지(네이버 블로그·가게 홈페이지)** 도
 * 제목을 읽어 추출에 쓰기 때문에, 'http(s) 링크인가'만 판단합니다.
 */
export function isSupportedUrl(raw) {
  return parseUrl(raw).ok;
}

// ─────────────────────────────────────────────────────────────
// v1.2 · 공유 텍스트 ↔ URL 분리
// ─────────────────────────────────────────────────────────────
const URL_IN_TEXT = /https?:\/\/[^\s<>"'`]+/gi;
const URL_TAIL = /[)\].,!?:;'"’”»…]+$/;

/** 문장 끝에 붙어 온 괄호·마침표를 URL에서 떼어 냅니다. (`...reel/abc/,` → `...reel/abc/`) */
export function trimUrlTail(raw) {
  let u = String(raw == null ? '' : raw).trim();
  for (let i = 0; i < 4 && URL_TAIL.test(u); i += 1) u = u.replace(URL_TAIL, '');
  return u;
}

/**
 * 인스타·유튜브 공유 시트에서 복사한 문자열은 링크 하나만 오지 않습니다.
 *   "성수동 소금빵 맛집 베통 https://www.instagram.com/reel/C8xSg2... 더 보기"
 * 이런 문자열에서 **첫 URL**과 **주변 문구(캡션)**를 나눠 둘 다 추출 힌트로 씁니다.
 *
 * @param {string} raw
 * @returns {{url:string, urls:string[], caption:string, hasText:boolean}}
 */
export function splitSharedText(raw) {
  const text = String(raw == null ? '' : raw).replace(/\r\n?/g, '\n');
  const urls = [];
  const rest = text.replace(URL_IN_TEXT, (hit) => {
    const url = trimUrlTail(hit);
    if (url && urls.indexOf(url) < 0) urls.push(url);
    return ' ';
  });
  const caption = rest
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  return { url: urls[0] || '', urls, caption, hasText: Boolean(caption) };
}

// ─────────────────────────────────────────────────────────────
// v1.2 · 네트워크 도우미 — 짧은 타임아웃 · 무인증 YouTube oEmbed · OG 메타
// ─────────────────────────────────────────────────────────────
/** OG 메타를 기다리는 시간. 인스타처럼 응답이 느린 페이지에서 앱이 멈추지 않게 3.5초로 고정합니다. */
export const PAGE_META_TIMEOUT_MS = 3500;
export const YOUTUBE_OEMBED_ENDPOINT = 'https://www.youtube.com/oembed';
/** 캡션·제목을 밖에서 못 읽는 플랫폼(로그인 월) — 화면에서 '가게명으로 찾기' 안내를 띄웁니다. */
export const BLOCKED_PLATFORMS = ['instagram', 'tiktok'];

/** AbortController 로 ms 뒤에 끊는 fetch. 실패·타임아웃은 예외 없이 null. */
async function fetchWithTimeout(url, init = {}, timeoutMs = PAGE_META_TIMEOUT_MS) {
  if (typeof fetch !== 'function') return null;
  const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : PAGE_META_TIMEOUT_MS;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  if (controller) {
    timer = setTimeout(() => {
      try {
        controller.abort();
      } catch (e) {
        /* 이미 끝난 요청 */
      }
    }, ms);
  }
  try {
    return await fetch(url, controller ? { ...init, signal: controller.signal } : init);
  } catch (e) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** oEmbed에는 watch 주소를 넣어야 shorts·youtu.be 모두 같은 응답을 줍니다. */
export function youtubeWatchUrlOf(parsed) {
  const id = String((parsed && parsed.contentId) || '').trim();
  if (!id) return '';
  return 'https://www.youtube.com/watch?v=' + id;
}

/**
 * GET https://www.youtube.com/oembed?url=<encoded>&format=json  (키 없음, 웹/모바일 모두 동작)
 * → { title, author_name, thumbnail_url }
 * @returns {Promise<{title:string, authorName:string, thumbnail:string|null, source:string}|null>}
 */
export async function fetchYouTubeOembed(parsed, options = {}) {
  const watchUrl = youtubeWatchUrlOf(parsed);
  if (!watchUrl) return null;
  const endpoint =
    YOUTUBE_OEMBED_ENDPOINT + '?url=' + encodeURIComponent(watchUrl) + '&format=json';
  const res = await fetchWithTimeout(endpoint, { method: 'GET' }, options.timeoutMs);
  if (!res || !res.ok || typeof res.json !== 'function') return null;
  try {
    const json = await res.json();
    const title = stripTags(json && json.title);
    if (!title) return null;
    return {
      title,
      authorName: String((json && json.author_name) || ''),
      thumbnail: (json && json.thumbnail_url) || null,
      source: 'youtube-oembed',
    };
  } catch (e) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// v1.3 · 유튜브 설명글(description) — 영상 페이지 HTML 에서 읽기
//   oEmbed 는 **제목만** 줍니다. 실제 상호명은 설명글 첫머리에만 있는 경우가 많아서
//   (예: `제주시 연동 “엄마손횟집”`), 네이티브에서는 영상 페이지 HTML 을 한 번 더 읽습니다.
//   · 데스크톱 웹   : ytInitialPlayerResponse 의 "attributedDescription"(또는 "shortDescription")
//   · 모바일 웹     : ytInitialData 의 "attributedDescriptionBodyText"
//                    (따옴표·중괄호가 \x22·\x7b 로 이스케이프돼 옵니다 → 한 번 풀어서 읽음)
//   · 둘 다 없으면  : og:description (유튜브가 넣는 사이트 소개 문구는 걸러냄)
// ─────────────────────────────────────────────────────────────
export const YOUTUBE_PAGE_TIMEOUT_MS = PAGE_META_TIMEOUT_MS;

/** 유튜브가 설명글 대신 넣는 '사이트 소개' 문구 — 상호·지역과 무관하므로 버립니다. */
const YOUTUBE_GENERIC_TEXTS = [
  '친구, 가족을 비롯해 전 세계 사람들과 동영상 공유',
  'YouTube에서 마음에 드는 동영상',
  '동영상과 음악을 감상',
  '전 세계 사람들과 콘텐츠를 공유',
  '친구, 가족뿐 아니라',
  'Enjoy the videos and music you love',
  'Share your videos with friends, family, and the world',
];

function isGenericYouTubeText(value) {
  const v = String(value || '').trim();
  if (!v) return true;
  return YOUTUBE_GENERIC_TEXTS.some((g) => v.indexOf(g) >= 0);
}

/** `\x22` 같은 16진 이스케이프를 실제 문자로 풉니다. (모바일 유튜브 HTML 대응) */
function decodeHexEscapes(text) {
  if (String(text || '').indexOf('\\x') < 0) return '';
  return String(text).replace(/\\x([0-9a-fA-F]{2})/g, (m, h) =>
    String.fromCharCode(parseInt(h, 16))
  );
}

/** JSON 문자열 리터럴의 본문을 따옴표 전까지 그대로 읽습니다. (이스케이프는 보존) */
export function readEscapedJsonString(text, start) {
  const src = String(text || '');
  let out = '';
  let i = Math.max(0, Number(start) || 0);
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      out += ch + (src[i + 1] || '');
      i += 2;
      continue;
    }
    if (ch === '"') break;
    out += ch;
    i += 1;
  }
  return out;
}

/** `\n`·`\"`·`\uXXXX` 같은 JSON 이스케이프를 실제 문자로 풉니다. */
export function decodeJsonEscapes(raw) {
  const src = String(raw || '');
  if (src.indexOf('\\') < 0) return src;
  try {
    return JSON.parse('"' + src + '"');
  } catch (e) {
    return src
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\//g, '/')
      .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\\\/g, '\\');
  }
}

/**
 * 한 번 더 감싸인 이스케이프까지 풉니다.
 * 모바일 유튜브는 설명글을 두 번 이스케이프해서(`\\n`) 넣기 때문에, 남은 `\n`·`\"` 를 마저 풉니다.
 */
function decodeFully(raw) {
  let value = decodeJsonEscapes(raw).trim();
  for (let i = 0; i < 2 && /\\[nrt"u/]/.test(value); i += 1) {
    value = decodeJsonEscapes(value).trim();
  }
  return value;
}

/** 설명글이 들어 있는 JSON 키 — 앞에 오는 것부터 우선합니다. */
const YOUTUBE_DESCRIPTION_MARKERS = [
  '"shortDescription"',
  '"attributedDescription"',
  '"attributedDescriptionBodyText"',
];

/** 유튜브 HTML 한 벌에서 설명글 문자열 1건을 뽑습니다. (없으면 '') */
function readYouTubeDescription(text) {
  const src = String(text || '');
  for (const marker of YOUTUBE_DESCRIPTION_MARKERS) {
    const idx = src.indexOf(marker);
    if (idx < 0) continue;
    const valueStart = idx + marker.length;
    const window = src.slice(valueStart, Math.min(src.length, valueStart + 600));
    const re = marker === '"shortDescription"' ? /^\s*:\s*"/ : /"content"\s*:\s*"/;
    const m = re.exec(window);
    if (!m) continue;
    const value = decodeJsonEscapes(
      readEscapedJsonString(src, valueStart + m.index + m[0].length)
    );
    const cleaned = decodeFully(value);
    if (cleaned) return cleaned;
  }
  return '';
}

/**
 * 유튜브 HTML → { title, description }
 * 봇 차단(로그인 요구) 페이지여도 설명글이 ytInitialData 에 남아 있는 경우가 있어
 * 플레이어 응답 → 이스케이프 해제본 → og:description 순서로 시도합니다.
 * @returns {{title:string, description:string}}
 */
export function parseYouTubePageMeta(html) {
  const text = String(html || '');
  const og = parseHtmlMeta(text);
  const description =
    readYouTubeDescription(text) ||
    readYouTubeDescription(decodeHexEscapes(text)) ||
    (isGenericYouTubeText(og.description) ? '' : og.description);
  let title = og.title && !og.loginWall && !isGenericYouTubeText(og.title) ? og.title.trim() : '';
  // 페이지 <title> 은 '영상 제목 - YouTube' 형태 — 꼬리표를 떼고, 남는 게 없으면 버립니다.
  title = title.replace(/\s*-\s*YouTube\s*$/i, '').trim();
  if (isGenericYouTubeText(title)) title = '';
  return { title, description: String(description || '').trim().slice(0, 3000) };
}

/**
 * 네이티브에서만 유튜브 영상 페이지를 3.5초 안에 읽어 설명글을 가져옵니다.
 * (웹 빌드는 CORS 로 막혀 있어 조용히 건너뜁니다)
 * @returns {Promise<{title:string, description:string, source:string}|null>}
 */export async function fetchYouTubePageMeta(parsed, options = {}) {
  const watchUrl = youtubeWatchUrlOf(parsed);
  if (!watchUrl) return null;
  if (!isNativeRuntime()) return null;
  const timeoutMs = options.timeoutMs == null ? YOUTUBE_PAGE_TIMEOUT_MS : options.timeoutMs;
  const res = await fetchWithTimeout(
    watchUrl,
    {
      method: 'GET',
      headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ko-KR,ko;q=0.9' },
    },
    timeoutMs
  );
  if (!res || !res.ok || typeof res.text !== 'function') return null;
  let html = '';
  try {
    html = String(await res.text());
  } catch (e) {
    return null;
  }
  const meta = parseYouTubePageMeta(html);
  if (!meta.description && !meta.title) return null;
  return { ...meta, source: 'youtube-page' };
}

// ─────────────────────────────────────────────────────────────
// v1.3 · 유튜브 댓글(commentThreads) — API 키가 있을 때만 읽는 보조 단서
//   상호명이 제목·설명글에 없고 **영상 업로더가 단 댓글**(주로 고정 댓글)에만 있는 경우가 있습니다.
//   (예: 업로더 댓글 “여기 성수동 카모플라쥬에요!”)
//   댓글은 잡담이 섞이기 쉬워서 fetchMetadata 는 항상 `comments` 로 돌려만 주고,
//   검색어에 쓸지는 extractPlaces 가 '제목·설명글에 상호가 없을 때'만 결정합니다.
// ─────────────────────────────────────────────────────────────
export const YOUTUBE_COMMENTS_MAX = 5;
export const YOUTUBE_COMMENT_MAX_CHARS = 300;
export const YOUTUBE_COMMENTS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/commentThreads';

/**
 * 업로더가 쓴 댓글을 맨 앞으로, 나머지는 API 가 준 '관련도(인기)' 순서를 유지합니다.
 * (YouTube API 는 '고정 댓글' 플래그를 따로 주지 않아, 업로더 댓글을 고정 댓글로 간주합니다)
 * @param {Array<{text:string, authorChannelId:string, likeCount:number}>} list
 * @param {string} uploaderChannelId videos.snippet.channelId
 * @returns {Array<object>}
 */
export function orderYouTubeComments(list, uploaderChannelId) {
  const items = Array.isArray(list) ? list.filter((c) => c && String(c.text || '').trim()) : [];
  const owner = String(uploaderChannelId || '').trim();
  if (!owner) return items;
  const mine = [];
  const rest = [];
  items.forEach((c) => {
    if (String(c.authorChannelId || '').trim() === owner) mine.push(c);
    else rest.push(c);
  });
  return mine.concat(rest);
}

/** 댓글 목록 → 검색어 추출에 쓰는 텍스트 한 덩어리 (업로더 댓글 먼저) */
export function commentsToText(list, uploaderChannelId) {
  const ordered = orderYouTubeComments(list, uploaderChannelId);
  return ordered
    .map((c) => String(c.text || '').replace(/\s+/g, ' ').trim().slice(0, YOUTUBE_COMMENT_MAX_CHARS))
    .filter(Boolean)
    .join('\n')
    .slice(0, 1200);
}

/**
 * GET https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=…&order=relevance&maxResults=5&textFormat=plainText&key=…
 * 실패(403 댓글 비허용 · 404 · 네트워크 · 타임아웃)는 예의 없이 **빈 배열**입니다.
 * @returns {Promise<Array<{text:string, authorChannelId:string, likeCount:number}>>}
 */
export async function fetchYouTubeComments(parsed, options = {}) {
  const key = options.key || process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;
  const videoId = String((parsed && parsed.contentId) || '').trim();
  if (!key || !videoId) return [];
  const url =
    YOUTUBE_COMMENTS_ENDPOINT +
    '?part=snippet&videoId=' +
    encodeURIComponent(videoId) +
    '&order=relevance&maxResults=' +
    YOUTUBE_COMMENTS_MAX +
    '&textFormat=plainText&key=' +
    encodeURIComponent(key);
  const res = await fetchWithTimeout(url, { method: 'GET' }, options.timeoutMs);
  if (!res || !res.ok || typeof res.json !== 'function') return [];
  try {
    const json = await res.json();
    const items = (json && json.items) || [];
    return items
      .map((it) => {
        const s = (it && it.snippet && it.snippet.topLevelComment && it.snippet.topLevelComment.snippet) || {};
        return {
          text: String(s.textDisplay || s.textOriginal || '').trim(),
          authorChannelId: String((s.authorChannelId && s.authorChannelId.value) || ''),
          likeCount: Number(s.likeCount) || 0,
        };
      })
      .filter((c) => c.text);
  } catch (e) {
    return [];
  }
}

const META_ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * HTML 문자열 → { title, description, ogTitle, titleTag, loginWall }
 * og:title 우선, 없으면 twitter:title, 마지막으로 <title>. (네이버 블로그·가게 홈페이지 대응)
 */
export function parseHtmlMeta(html) {
  const text = String(html || '');
  const tags = [];
  const metaRe = /<meta\b[^>]*>/gi;
  let m;
  while ((m = metaRe.exec(text))) {
    const attrs = {};
    META_ATTR_RE.lastIndex = 0;
    let a;
    while ((a = META_ATTR_RE.exec(m[0]))) {
      attrs[a[1].toLowerCase()] = a[2] != null ? a[2] : a[3] != null ? a[3] : a[4];
    }
    tags.push(attrs);
  }
  const pick = (keys) => {
    for (const key of keys) {
      for (const t of tags) {
        const name = String(t.property || t.name || '').toLowerCase();
        if (name === key && t.content) {
          const v = decodeEntities(t.content).replace(/\s+/g, ' ').trim();
          if (v) return v;
        }
      }
    }
    return '';
  };
  const ogTitle = pick(['og:title']);
  const description = pick(['og:description', 'description']);
  const twitterTitle = pick(['twitter:title']);
  const titleTagMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titleTag = titleTagMatch
    ? decodeEntities(stripTags(titleTagMatch[1])).replace(/\s+/g, ' ').trim()
    : '';
  const title = ogTitle || twitterTitle || titleTag;
  // 로그인 월이거나, 브랜드 이름만 남은 껍데기 제목('Instagram' 등)은 읽은 것으로 치지 않습니다.
  const loginWall = /(^|\s)(로그인|login|sign in)/i.test(title);
  const genericTitle = /^(instagram|insta|tiktok|youtube|login|log in|sign in|facebook|로그인|페이스북)$/i.test(
    String(title).trim()
  );
  return { title, description, ogTitle, titleTag, loginWall: loginWall || genericTitle };
}

/** 웹(브라우저) 빌드인지 — OG 메타는 CORS가 막혀 있어 네이티브에서만 읽습니다. */
export function isNativeRuntime() {
  try {
    if (typeof Platform === 'undefined' || !Platform) return false;
    return String(Platform.OS || '') !== 'web';
  } catch (e) {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// v1.4 · 동일 출처 API 프록시 (Vercel Serverless Functions)
//   웹 빌드는 브라우저 CORS·키 노출 때문에 카카오/네이버/유튜브 Data API 를 직접 부를 수 없습니다.
//   그래서 배포 서버(Vercel)의 `/api/*` 함수가 **서버 키**로 대신 호출해 줍니다.
//     GET /api/youtube?id=<videoId>        → { title, description, thumbnail, comments, channelId }
//     GET /api/kakao-local?query=..&size=.. → 카카오 응답 그대로({ documents })
//     GET /api/naver-local?query=..&display=.. → 네이버 응답 그대로({ items })
//   · 네이티브(iOS/Android)는 지금처럼 기기에서 직접 호출합니다. (프록시 없이도 동작)
//   · 프록시가 없는 정적 호스팅(`expo start --web` 개발 서버 등)에서는 실패를 조용히 삼키고
//     기존 폴백(oEmbed · 오프라인 추출기)으로 이어집니다.
// ─────────────────────────────────────────────────────────────
export const API_PROXY = {
  youtube: '/api/youtube',
  kakao: '/api/kakao-local',
  naver: '/api/naver-local',
  // v2.9 — Gemini 영상 분석(음성·화면 자막). 키는 서버에만 있어 웹 프록시로만 부릅니다.
  gemini: '/api/gemini',
};
/** 프록시 응답을 기다리는 시간 — 서버 함수 자체 타임아웃(4초)보다 살짝 길게 */
export const API_PROXY_TIMEOUT_MS = 4500;

/** `Platform.OS === 'web'` — 브라우저 웹 빌드인지 */
export function isWebPlatform() {
  try {
    if (typeof Platform === 'undefined' || !Platform) return false;
    return String(Platform.OS || '') === 'web';
  } catch (e) {
    return false;
  }
}

/** `/api/kakao-local?query=...&size=3` 같은 동일 출처 프록시 주소를 만듭니다. */
export function proxyPathOf(name, params = {}) {
  const base = API_PROXY[name];
  if (!base) return '';
  const pairs = Object.keys(params || {})
    .filter((k) => params[k] != null && String(params[k]).trim() !== '')
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]).trim()));
  return pairs.length ? base + '?' + pairs.join('&') : base;
}

/** 프록시 GET → JSON. 실패·타임아웃·비 JSON 은 예외 없이 null. */
async function fetchProxyJson(path, options = {}) {
  if (!path) return null;
  const timeoutMs =
    options.timeoutMs == null ? API_PROXY_TIMEOUT_MS : Number(options.timeoutMs) || API_PROXY_TIMEOUT_MS;
  const res = await fetchWithTimeout(path, { method: 'GET' }, timeoutMs);
  if (!res || !res.ok || typeof res.json !== 'function') return null;
  try {
    return await res.json();
  } catch (e) {
    return null;
  }
}

/**
 * 웹에서만: `/api/youtube?id=...` 프록시로 제목·설명글·댓글을 읽습니다. (서버 키 사용)
 * @returns {Promise<{title:string, description:string, comments:string, thumbnail:string|null,
 *                    channelId:string, source:string}|null>}
 */
export async function fetchYouTubeProxy(parsed, options = {}) {
  const id = String((parsed && parsed.contentId) || '').trim();
  if (!id) return null;
  const json = await fetchProxyJson(proxyPathOf('youtube', { id }), options);
  if (!json) return null;
  const title = stripTags(json.title);
  const description = String(json.description || '').trim();
  const comments = String(json.comments || '').trim();
  if (!title && !description && !comments) return null;
  return {
    title,
    description: description.slice(0, 3000),
    comments: comments.slice(0, 1200),
    thumbnail: json.thumbnail || null,
    channelId: String(json.channelId || ''),
    source: 'youtube-proxy',
  };
}

/**
 * v2.9 · Gemini 영상 분석 — `/api/gemini` 프록시 (웹 전용)
 * ─────────────────────────────────────────────────────────────
 * 유튜브 쇼츠의 **음성·화면 자막**을 Gemini 가 직접 보고 가게를 찾습니다.
 *   · 제목·설명글에 상호가 없어 지도 검색이 실패했을 때만 호출합니다. (extractPlaces 3단계)
 *   · Gemini 키는 Vercel 환경변수(`GEMINI_API_KEY`)에만 있으므로 **웹에서만** 부를 수 있습니다.
 *     (네이티브 앱 번들에는 키를 넣지 않습니다 — 노출 0건 원칙)
 *   · 영상 길이·모델에 따라 10초 넘게 걸리므로 프록시 타임아웃을 길게 잡습니다.
 */
export const GEMINI_PROXY_TIMEOUT_MS = 59000;

/**
 * `/api/gemini` 로 영상을 보내 가게명·지역·메뉴를 받아 옵니다.
 * @returns {Promise<{storeName:string, area:string, menu:string, category:string,
 *                    places:Array<{name:string, area:string, menu:string}>, source:string}|null>}
 *          가게를 못 찾았거나(빈 결과) 프록시가 없으면 `null` — 호출부는 기존 폴백으로 이어집니다.
 */
/**
 * v2.20 — Gemini 응답에서 **한줄 메모 재료**만 꺼냅니다.
 *   응답이 `memo:{recommendedMenu,parking,kidsOrWaitingTip}` 로 오거나, 같은 이름이 최상위에 와도 받아 줍니다.
 *   (모델이 모양을 흘려도 앱이 조용히 무시하도록 문자열만 취합니다)
 */
export function memoPartsOf(json) {
  const source = json && json.memo && typeof json.memo === 'object' ? json.memo : json || {};
  const pick = (...keys) => {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
      if (Array.isArray(value)) {
        const first = value.map((v) => String(v || '').trim()).filter(Boolean)[0];
        if (first) return first.slice(0, 80);
      }
    }
    return '';
  };
  return {
    recommendedMenu: pick('recommendedMenu', 'recommended_menu', 'recommend', 'menu'),
    parking: pick('parking', 'parkingTip', 'parking_tip'),
    kidsOrWaitingTip: pick('kidsOrWaitingTip', 'kids_or_waiting_tip', 'kidsTip', 'waitingTip', 'tip'),
  };
}

export async function fetchGeminiAnalysis(parsed, meta, options = {}) {
  if (!parsed || parsed.platform !== 'youtube') return null;
  const videoUrl = youtubeWatchUrlOf(parsed);
  if (!videoUrl) return null;
  // 키가 브라우저 번들에 없으므로 서버 프록시가 있는 웹에서만 시도합니다.
  if (!isWebPlatform()) return null;
  const timeoutMs =
    options.timeoutMs == null
      ? GEMINI_PROXY_TIMEOUT_MS
      : Number(options.timeoutMs) || GEMINI_PROXY_TIMEOUT_MS;
  const payload = {
    url: videoUrl,
    title: String((meta && meta.title) || '').slice(0, 200),
    description: String((meta && meta.description) || '').slice(0, 1800),
  };
  const res = await fetchWithTimeout(
    API_PROXY.gemini,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    timeoutMs
  );
  if (!res || !res.ok || typeof res.json !== 'function') return null;
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    return null;
  }
  if (!json || typeof json !== 'object') return null;
  const storeName = String(json.storeName || '').trim().slice(0, 60);
  if (!storeName) return null; // 가게를 특정하지 못함 → 조용히 폴백
  const places = (Array.isArray(json.places) ? json.places : [])
    .map((p) => ({
      name: String((p && p.name) || '').trim().slice(0, 60),
      area: String((p && p.area) || '').trim().slice(0, 30),
      menu: String((p && p.menu) || '').trim().slice(0, 80),
    }))
    .filter((p) => p.name)
    .slice(0, 3);
  return {
    storeName,
    area: String(json.area || '').trim().slice(0, 30),
    menu: String(json.menu || '').trim().slice(0, 80),
    category: String(json.category || '').trim(),
    places,
    // v2.20 — 한줄 메모 초안 재료 (추천 메뉴·주차·아기/웨이팅)
    memo: memoPartsOf(json),
    source: 'gemini',
  };
}

/** Gemini 가 찾은 가게로 지도에 **다시** 물어볼 검색어 — 지역+상호 → 상호 → 나머지 가게 순서 */
export function geminiQueryList(analysis, limit = 3) {
  if (!analysis || !analysis.storeName) return [];
  const out = [];
  const push = (value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text && out.indexOf(text) < 0) out.push(text);
  };
  const area = String(analysis.area || '').trim();
  push([area, analysis.storeName].filter(Boolean).join(' '));
  push(analysis.storeName);
  for (const place of analysis.places || []) {
    push([area || (place && place.area) || '', place && place.name].filter(Boolean).join(' '));
  }
  return out.slice(0, Math.max(1, limit));
}

/** 화면에 한 줄로 띄울 근거 문구 — "AI 영상 분석으로 찾았어요 · “가게명” (동네)" */
export function geminiNoteOf(analysis) {
  const name = String((analysis && analysis.storeName) || '').trim();
  if (!name) return '';
  const area = String((analysis && analysis.area) || '').trim();
  return 'AI 영상 분석으로 찾았어요 · “' + name + '”' + (area ? ' (' + area + ')' : '');
}

/** 메뉴 문자열("돌돔, 전복") → 핀의 menuTags(최대 3개) */
function menuTagsOfGemini(analysis) {
  const raw = String((analysis && analysis.menu) || '');
  return raw
    .split(/[,，·\/]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

// ─────────────────────────────────────────────────────────────
// v2.13 · 📸 인스타 캡처·사진 → AI 가게 추출 (Gemini 이미지 분석)
//   · 아이폰 스크린샷은 수 MB 라 그대로 올리면 Vercel 4.5MB 한도에 걸립니다.
//     → 웹에서 <canvas> 로 **긴 변 1280px · JPEG 0.82** 로 줄인 뒤 `/api/gemini` 로 보냅니다.
//   · Gemini 키는 서버에만 있으므로 **웹(프록시)에서만** 동작합니다. 네이티브는 조용히 안내만 합니다.
//   · 결과는 기존 파이프라인(`searchPlacesDirect`/`searchMultiPlaces` + v2.12 네이버 주소 보강)을
//     그대로 타서, 링크로 찾은 가게와 **같은 후보·같은 배지**가 됩니다.
// ─────────────────────────────────────────────────────────────
/** 사진 긴 변 상한(px) — 인스타 캡처 글자가 읽히면서 300KB 안쪽으로 들어오는 값 */
export const IMAGE_MAX_EDGE = 1280;
/** canvas JPEG 품질 — 글자 경계가 뭉개지지 않는 선 */
export const IMAGE_JPEG_QUALITY = 0.82;
/** 서버(api/gemini.js)와 같은 상한 — 넘으면 서버가 413 으로 안내합니다. */
export const IMAGE_MAX_BASE64_CHARS = 4000000;
/** 사진 분석 응답 대기 (lite 모델 실측 2~4초 · 느릴 때 여유) */
export const IMAGE_ANALYSIS_TIMEOUT_MS = 30000;
/** 화면에 보여 줄 입력 이름 */
export const IMAGE_PLATFORM_LABEL = '사진';
/** Gemini 가 받는 사진 형식 */
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/**
 * 긴 변을 `maxEdge` 로 줄인 크기 (비율 유지 · **원본이 작으면 늘리지 않음**)
 * @returns {{width:number, height:number}}
 */
export function scaledImageSize(width, height, maxEdge = IMAGE_MAX_EDGE) {
  const w = Math.max(0, Math.round(Number(width) || 0));
  const h = Math.max(0, Math.round(Number(height) || 0));
  const edge = Math.max(64, Math.round(Number(maxEdge) || IMAGE_MAX_EDGE));
  if (!w || !h) return { width: 0, height: 0 };
  const longest = Math.max(w, h);
  if (longest <= edge) return { width: w, height: h };
  const ratio = edge / longest;
  return { width: Math.max(1, Math.round(w * ratio)), height: Math.max(1, Math.round(h * ratio)) };
}

/**
 * `data:image/jpeg;base64,…` → `{ mimeType, base64 }` (아니면 null)
 * @returns {{mimeType:string, base64:string}|null}
 */
export function parseImageDataUri(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return null;
  const m = /^data:([A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+)?(?:;[^,]*)*;base64,([\s\S]*)$/i.exec(text);
  if (!m) return null;
  const base64 = String(m[2] || '').replace(/\s+/g, '');
  if (!base64) return null;
  const mimeType = String(m[1] || 'image/jpeg').toLowerCase();
  return { mimeType, base64 };
}

/** base64 + mimeType → `data:` URL (미리보기·sourceThumbnail 공용) */
export function imageDataUrlOf(base64, mimeType = 'image/jpeg') {
  const data = String(base64 == null ? '' : base64).replace(/\s+/g, '');
  if (!data) return '';
  return 'data:' + (mimeType || 'image/jpeg') + ';base64,' + data;
}

/** base64 문자열의 원본 바이트 수(대략) */
function base64Bytes(base64) {
  const text = String(base64 == null ? '' : base64);
  if (!text) return 0;
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((text.length * 3) / 4) - padding);
}

/** File/Blob 처럼 생겼는지 (웹·네이티브 공통 판별) */
function isBlobLike(value) {
  return Boolean(
    value && typeof value === 'object' && typeof value.type === 'string' && typeof value.size === 'number'
  );
}

/** 이미지 원소 로딩 (objectURL) */
function loadImageElement(src) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    } catch (e) {
      resolve(null);
    }
  });
}

/** File/Blob → dataURL (canvas 를 못 쓸 때의 마지막 수단) */
function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    try {
      if (typeof FileReader === 'undefined') return resolve('');
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    } catch (e) {
      resolve('');
    }
  });
}

/**
 * 업로드 사진을 **긴 변 1280px · JPEG 0.82** 로 줄입니다. (브라우저 canvas)
 *   · 아이폰 스크린샷(1170×2532 · 수 MB) → 1280×… · 200~400KB
 *   · canvas·Image 가 없는 환경(네이티브·SSR)에서는 `{ ok:false, reason:'resize-unavailable' }`
 * @param {File|Blob} file
 * @param {{maxEdge?:number, quality?:number}} [options]
 * @returns {Promise<{ok:boolean, base64?:string, mimeType?:string, dataUrl?:string,
 *                    width?:number, height?:number, bytes?:number, resized?:boolean,
 *                    originalWidth?:number, originalHeight?:number, reason?:string}>}
 */
export async function resizeImageForUpload(file, options = {}) {
  const maxEdge = Number(options.maxEdge) || IMAGE_MAX_EDGE;
  const quality = options.quality == null ? IMAGE_JPEG_QUALITY : Number(options.quality);
  const hasDom =
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    typeof Image !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function';
  if (!hasDom) return { ok: false, reason: 'resize-unavailable' };

  let objectUrl = '';
  try {
    objectUrl = URL.createObjectURL(file);
  } catch (e) {
    return { ok: false, reason: 'resize-unavailable' };
  }
  try {
    const img = await loadImageElement(objectUrl);
    const originalWidth = Number((img && (img.naturalWidth || img.width)) || 0);
    const originalHeight = Number((img && (img.naturalHeight || img.height)) || 0);
    if (!img || !originalWidth || !originalHeight) return { ok: false, reason: 'decode-failed' };
    const size = scaledImageSize(originalWidth, originalHeight, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return { ok: false, reason: 'no-canvas' };
    ctx.fillStyle = '#FFFFFF'; // 투명 PNG 캡처도 JPEG 에서 검게 나오지 않게
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(img, 0, 0, size.width, size.height);
    const dataUrl = String(canvas.toDataURL('image/jpeg', quality) || '');
    const parsed = parseImageDataUri(dataUrl);
    if (!parsed) return { ok: false, reason: 'encode-failed' };
    return {
      ok: true,
      base64: parsed.base64,
      mimeType: 'image/jpeg',
      dataUrl: dataUrl,
      width: size.width,
      height: size.height,
      bytes: base64Bytes(parsed.base64),
      resized: size.width !== originalWidth || size.height !== originalHeight,
      originalWidth,
      originalHeight,
    };
  } catch (e) {
    return { ok: false, reason: 'resize-failed' };
  } finally {
    try {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    } catch (e) {
      /* 해제 실패는 무시 */
    }
  }
}

/**
 * 📸 사진 보관함/파일 선택창을 엽니다. (웹 전용 — 아이폰 사파리에서는 사진 보관함이 바로 뜹니다)
 *   · 사용자가 **버튼을 누른 그 순간** 불러야 iOS 가 허용합니다. (자동 호출 금지)
 *   · 취소하면 `null`. 네이티브·SSR 에서는 `null` — 화면은 조용히 아무 일도 하지 않습니다.
 * @param {{accept?:string}} [options]
 * @returns {Promise<File|null>}
 */
export function pickImageFile(options = {}) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let input = null;
    let settled = false;
    const finish = (file) => {
      if (settled) return;
      settled = true;
      try {
        if (input && input.parentNode) input.parentNode.removeChild(input);
      } catch (e) {
        /* 정리 실패는 무시 */
      }
      resolve(file || null);
    };
    try {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = String(options.accept || 'image/*');
      input.setAttribute('data-reelpin', 'photo-input');
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      input.style.top = '0';
      input.style.opacity = '0';
      input.addEventListener('change', () => {
        const files = input && input.files;
        finish(files && files[0] ? files[0] : null);
      });
      // iOS 16.4+ · Chrome 은 취소도 알려 줍니다. (없는 브라우저는 change 만 기다림)
      input.addEventListener('cancel', () => finish(null));
      if (typeof document.body !== 'undefined' && document.body && document.body.appendChild) {
        document.body.appendChild(input);
      }
      input.click();
    } catch (e) {
      finish(null);
    }
  });
}

/** 업로드 사진을 분석 가능한 `{ base64, mimeType, dataUrl }` 로 준비합니다. */
async function prepareImageInput(input, options = {}) {
  const tooLarge = {
    ok: false,
    reason: 'image-too-large',
    message: '사진이 너무 커요. 다시 고르거나 조금 작게 캡처해 주세요.',
  };
  const noImage = {
    ok: false,
    reason: 'no-image',
    message: '사진을 읽지 못했어요. 다시 골라 주세요.',
  };
  const wrap = (base64, mimeType, extra = {}) => {
    const data = String(base64 || '').replace(/\s+/g, '');
    if (!data) return noImage;
    if (data.length > IMAGE_MAX_BASE64_CHARS) return tooLarge;
    const type = IMAGE_MIME_TYPES.indexOf(String(mimeType || '').toLowerCase()) >= 0 ? mimeType : 'image/jpeg';
    return { ok: true, base64: data, mimeType: type, dataUrl: imageDataUrlOf(data, type), bytes: base64Bytes(data), ...extra };
  };

  // ① 이미 dataURL / base64 로 준 경우 (테스트·재사용)
  if (typeof input === 'string') {
    const parsed = parseImageDataUri(input);
    if (parsed) return wrap(parsed.base64, parsed.mimeType);
    return wrap(input, 'image/jpeg');
  }
  if (input && typeof input === 'object' && !isBlobLike(input)) {
    if (input.dataUrl) {
      const parsed = parseImageDataUri(input.dataUrl);
      if (parsed) return wrap(parsed.base64, input.mimeType || parsed.mimeType, { width: input.width, height: input.height });
    }
    if (input.base64) {
      return wrap(input.base64, input.mimeType || 'image/jpeg', { width: input.width, height: input.height });
    }
    return noImage;
  }

  // ② 브라우저가 준 File/Blob → 1280px · JPEG 0.82
  if (isBlobLike(input)) {
    // 아주 큰 원본은 canvas 가 실패했을 때를 대비해 미리 걸러 둡니다(30MB 넘는 사진).
    if (Number(input.size) > 30 * 1024 * 1024) return tooLarge;
    const resized = await resizeImageForUpload(input, {
      maxEdge: options.maxEdge,
      quality: options.quality,
    });
    if (resized.ok) return resized;
    const dataUrl = await readFileAsDataUrl(input);
    const parsed = parseImageDataUri(dataUrl);
    if (parsed) return wrap(parsed.base64, parsed.mimeType || input.type || 'image/jpeg');
    return {
      ok: false,
      reason: resized.reason || 'decode-failed',
      message: '이 사진은 열지 못했어요. 다른 사진으로 다시 시도해 주세요.',
    };
  }
  return noImage;
}

/**
 * `/api/gemini` 로 사진을 보내 가게 정보를 받아 옵니다. (v2.13)
 *   · 성공: `{ ok:true, analysis:{ storeName, area, menu, category, places }, elapsedMs, model }`
 *   · 실패: `{ ok:false, reason, message }` — 화면은 `message` 를 그대로 보여 줍니다.
 * @param {{base64:string, mimeType?:string}|string} image base64, data URL, 또는 `{ base64, mimeType }`
 * @param {{hint?:string, timeoutMs?:number}} [options]
 */
export async function fetchGeminiImageAnalysis(image, options = {}) {
  if (!isWebPlatform()) {
    return {
      ok: false,
      reason: 'web-only',
      message: '사진 분석은 배포된 웹 앱(아이폰 사파리)에서만 쓸 수 있어요.',
    };
  }
  const fromString = typeof image === 'string' ? parseImageDataUri(image) : null;
  const base64 = String(
    (fromString && fromString.base64) ||
      (image && image.base64) ||
      (typeof image === 'string' ? image : '')
  )
    .replace(/\s+/g, '');
  const mimeType = String(
    (fromString && fromString.mimeType) || (image && image.mimeType) || 'image/jpeg'
  ).toLowerCase();
  if (!base64) return { ok: false, reason: 'no-image', message: '사진을 읽지 못했어요. 다시 골라 주세요.' };
  if (base64.length > IMAGE_MAX_BASE64_CHARS) {
    return {
      ok: false,
      reason: 'image-too-large',
      message: '사진이 너무 커요. 다시 고르거나 조금 작게 캡처해 주세요.',
    };
  }
  const hint = String(options.hint || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const timeoutMs =
    options.timeoutMs == null
      ? IMAGE_ANALYSIS_TIMEOUT_MS
      : Number(options.timeoutMs) || IMAGE_ANALYSIS_TIMEOUT_MS;
  const res = await fetchWithTimeout(
    API_PROXY.gemini,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mimeType, ...(hint ? { hint } : {}) }),
    },
    timeoutMs
  );
  if (!res) {
    return {
      ok: false,
      reason: 'network',
      message: '사진 분석 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
    };
  }
  let json = null;
  try {
    json = typeof res.json === 'function' ? await res.json() : null;
  } catch (e) {
    json = null;
  }
  if (!res.ok) {
    const code = String((json && json.error) || '') || 'http-' + (Number(res.status) || 0);
    const fallback =
      code === 'image-too-large'
        ? '사진이 너무 커요. 다시 고르거나 조금 작게 캡처해 주세요.'
        : code === 'gemini-not-configured'
        ? '사진 분석 기능이 아직 연결되지 않았어요. 잠시 후 다시 시도해 주세요.'
        : '사진을 분석하지 못했어요. 잠시 후 다시 시도해 주세요.';
    return {
      ok: false,
      reason: code,
      status: Number(res.status) || 0,
      message: String((json && json.message) || '').trim() || fallback,
    };
  }
  if (!json || typeof json !== 'object') {
    return { ok: false, reason: 'bad-response', message: '사진 분석 결과를 읽지 못했어요. 다시 시도해 주세요.' };
  }
  const storeName = String(json.storeName || '').trim().slice(0, 60);
  const places = (Array.isArray(json.places) ? json.places : [])
    .map((p) => ({
      name: String((p && p.name) || '').trim().slice(0, 60),
      area: String((p && p.area) || '').trim().slice(0, 30),
      menu: String((p && p.menu) || '').trim().slice(0, 80),
    }))
    .filter((p) => p.name)
    .slice(0, 6);
  if (!storeName) {
    return {
      ok: false,
      reason: String(json.reason || 'gemini-no-store') || 'gemini-no-store',
      message: '사진에서 가게를 못 찾았어요. 가게 이름이나 위치 태그가 보이는 부분만 캡처해 다시 올려 주세요.',
      elapsedMs: Number(json.elapsedMs) || 0,
    };
  }
  return {
    ok: true,
    analysis: {
      storeName,
      area: String(json.area || '').trim().slice(0, 30),
      menu: String(json.menu || '').trim().slice(0, 80),
      category: String(json.category || '').trim(),
      places,
      // v2.20 — 한줄 메모 초안 재료 (사진에 적힌 추천 메뉴·주차·아기/웨이팅)
      memo: memoPartsOf(json),
      source: 'gemini',
      kind: 'image',
    },
    model: String(json.model || ''),
    elapsedMs: Number(json.elapsedMs) || 0,
  };
}

/** 화면 한 줄 근거 — "AI 사진 분석으로 찾았어요 · “가게명” (동네)" */
export function imageNoteOf(analysis) {
  const name = String((analysis && analysis.storeName) || '').trim();
  if (!name) return '';
  const area = String((analysis && analysis.area) || '').trim();
  return 'AI 사진 분석으로 찾았어요 · “' + name + '”' + (area ? ' (' + area + ')' : '');
}

/** 사진 분석의 places → `searchMultiPlaces` 가 먹는 후보 모양 (지역+상호 → 상호 순서) */
export function imagePlaceItems(analysis, max = 6) {
  const places = Array.isArray(analysis && analysis.places) ? analysis.places : [];
  const items = [];
  places.forEach((place) => {
    const name = String((place && place.name) || '').trim();
    if (!name) return;
    const area = String((place && place.area) || '').trim();
    const queries = [];
    const push = (q) => {
      const v = String(q || '').replace(/\s+/g, ' ').trim();
      if (v.length >= 2 && queries.indexOf(v) < 0) queries.push(v);
    };
    // 사진 속 이름이 '성수동 어니언' 처럼 동네를 이미 품고 있으면 두 번 붙이지 않습니다.
    if (area && name.indexOf(area) < 0) push(area + ' ' + name);
    push(name);
    if (!queries.length) return;
    items.push({
      index: items.length + 1,
      label: (area ? area + ' ' : '') + name,
      name,
      area,
      menu: String((place && place.menu) || '').trim(),
      queries: queries.slice(0, 3),
    });
  });
  return items.slice(0, Math.max(1, Number(max) || 6));
}

/**
 * 📸 사진·캡처 한 장 → 저장 후보. (v2.13)
 *   1) 사진을 1280px · JPEG 0.82 로 줄여 `/api/gemini` 에 보냅니다. (AI 가게 읽기)
 *   2) 가게가 2곳 이상이면 각각을 지도에서 찾고(`searchMultiPlaces`), 한 곳이면 `searchPlaceProviders` 로
 *      지역+상호 → 상호 순서로 조회합니다. (v2.12 네이버 주소 보강 포함)
 *   3) 지도가 좌표를 못 채워도 **사진에서 읽은 상호**는 좌표 없는 수동 후보로 남깁니다.
 *   4) 업로드 사진(data URL)을 `sourceThumbnail` 로 돌려줘 저장 화면 히어로 카드 배경이 됩니다.
 *
 * @param {File|Blob|string|{base64?:string, dataUrl?:string, mimeType?:string}} input
 * @param {{hint?:string, maxEdge?:number, quality?:number, geminiTimeoutMs?:number,
 *          providers?:string[], onStage?:(stage:number)=>void}} [options]
 * @returns {Promise<object>} `extractPlaces` 와 같은 모양(+ `mode:'single'|'multi'`, `platform:'photo'`)
 */
export async function extractFromImage(input, options = {}) {
  const prepared = await prepareImageInput(input, options);
  if (!prepared.ok) return { ok: false, reason: prepared.reason, message: prepared.message };
  const thumbnail = prepared.dataUrl;
  const stage = (n) => {
    if (typeof options.onStage === 'function') {
      try {
        options.onStage(n);
      } catch (e) {
        /* 화면 콜백 오류는 추출을 막지 않습니다 */
      }
    }
  };

  stage(1); // 'AI 사진 분석'
  const analyzed = await fetchGeminiImageAnalysis(
    { base64: prepared.base64, mimeType: prepared.mimeType },
    { hint: options.hint, timeoutMs: options.geminiTimeoutMs }
  );
  if (!analyzed.ok) {
    return {
      ok: false,
      reason: analyzed.reason,
      message: analyzed.message,
      status: analyzed.status || 0,
      sourceThumbnail: thumbnail,
    };
  }
  const analysis = analyzed.analysis;
  stage(2); // '지도 좌표 매칭'

  const baseInfo = {
    ok: true,
    mode: 'single',
    kind: 'image',
    platform: 'photo',
    platformLabel: IMAGE_PLATFORM_LABEL,
    sourceTitle: analysis.storeName,
    sourceDescription: '',
    sourceComments: '',
    sourceThumbnail: thumbnail,
    titleStatus: 'photo',
    titleNotice: '',
    suggestedQuery: geminiQueryList(analysis, 3)[0] || analysis.storeName,
    aiNote: imageNoteOf(analysis),
    aiAnalysis: analysis,
    // v2.20 — 사진에서 읽은 추천 메뉴·주차·아기/웨이팅 → 한줄 메모 초안 (없으면 빈 문자열)
    memoDraft: mergeMemoDrafts(
      memoDraftOfParts(analysis.memo || {}),
      memoDraftFromText(options.hint || '')
    ),
  };

  // ── 목록형 캡처(가게 2곳 이상) → 각 가게를 따로 지도 조회 ──
  const placeItems = imagePlaceItems(analysis);
  if (placeItems.length >= 2) {
    const multi = await searchMultiPlaces(placeItems, { limit: 3, providers: options.providers });
    if (multi.candidates.length) {
      const candidates = multi.candidates.map((c) => {
        const place = analysis.places[(Number(c.multiIndex) || 1) - 1] || null;
        const menuTags = place ? menuTagsOfGemini(place) : menuTagsOfGemini(analysis);
        return {
          ...c,
          // 지도사가 준 분류가 우선, 없을 때만 AI 분류
          category: c.rawCategory ? c.category : analysis.category || c.category || '맛집',
          menuTags: menuTags.length ? menuTags : c.menuTags || [],
        };
      });
      return {
        ...baseInfo,
        mode: 'multi',
        title: candidates[0].name,
        candidates,
        items: multi.items,
        unmatched: multi.unmatched,
        duplicates: multi.duplicates,
        query: placeItems.map((i) => i.queries[0]).filter(Boolean).join(' / '),
        queryList: placeItems.map((i) => i.queries[0]).filter(Boolean),
        usedAdapter: ['gemini-photo', 'multi'].concat(multi.providersUsed || []).join('+'),
        providersTried: multi.providersTried || [],
        providersUsed: multi.providersUsed || [],
        failures: multi.failures || [],
      };
    }
  }

  // ── 한 곳(또는 목록을 못 찾음) → 지역+상호 → 상호 순서로 조회 ──
  const queryList = geminiQueryList(analysis, 3);
  let chain = { candidates: [], providersTried: [], providersUsed: [], failures: [], reason: 'empty-query' };
  const attempts = [];
  let usedQuery = '';
  let naverBackfill = { queries: [], matched: 0 };
  for (const q of queryList) {
    const res = await searchPlaceProviders({ query: q, limit: 3, providers: options.providers });
    attempts.push({
      query: q,
      resultCount: (res.candidates || []).length,
      providersUsed: res.providersUsed || [],
      failures: res.failures || [],
      naverBackfill: res.naverBackfill && res.naverBackfill.matched ? res.naverBackfill : undefined,
      reason: res.reason,
    });
    if (res.naverBackfill && res.naverBackfill.matched) {
      naverBackfill = {
        queries: naverBackfill.queries.concat(res.naverBackfill.queries),
        matched: naverBackfill.matched + res.naverBackfill.matched,
      };
    }
    chain = {
      candidates: res.candidates || [],
      providersTried: Array.from(new Set([...(chain.providersTried || []), ...(res.providersTried || [])])),
      providersUsed: Array.from(new Set([...(chain.providersUsed || []), ...(res.providersUsed || [])])),
      failures: [...(chain.failures || []), ...(res.failures || [])],
      reason: res.reason,
    };
    if (chain.candidates.length) {
      usedQuery = q;
      break;
    }
  }

  const base = {
    ...baseInfo,
    query: usedQuery || queryList[0] || analysis.storeName,
    queryList,
    attempts,
    naverBackfill,
  };
  const menuTags = menuTagsOfGemini(analysis);

  if (chain.candidates.length) {
    return {
      ...base,
      title: chain.candidates[0].name,
      candidates: chain.candidates.map((c) => ({
        ...c,
        category: c.rawCategory ? c.category : analysis.category || c.category || '맛집',
        menuTags: menuTags.length ? menuTags : c.menuTags || [],
      })),
      usedAdapter: ['gemini-photo'].concat(chain.providersUsed || []).join('+'),
      providersTried: chain.providersTried,
      providersUsed: chain.providersUsed,
      failures: chain.failures,
    };
  }

  // 지도에서 좌표를 못 채워도 사진에서 읽은 **실제 상호**는 버리지 않습니다.
  return {
    ...base,
    title: analysis.storeName,
    candidates: [
      {
        id: 'gemini-photo-1',
        name: analysis.storeName,
        area: analysis.area || '',
        category: analysis.category || '맛집',
        menuTags,
        address: analysis.area ? analysis.area + ' 일대 (주소 확인 필요)' : '주소 확인 필요',
        lat: null,
        lng: null,
        confidence: 0.62,
        provider: 'gemini',
        manual: true,
      },
    ],
    usedAdapter: ['gemini-photo'].concat(chain.providersUsed || []).join('+'),
    providersTried: chain.providersTried,
    providersUsed: chain.providersUsed,
    failures: chain.failures,
  };
}

/**
 * 페이지의 OG 메타를 짧은 타임아웃으로 읽어 옵니다. (v1.2)
 * - 네이티브에서만 시도합니다. 웹은 CORS 로 막혀 있어 조용히 건너뜁니다.
 * - 인스타 릴스처럼 로그인 월이 떠 있으면 `{ ok:false, blocked:true }` 로 돌려주고,
 *   호출부는 예외 없이 다음 단계(후보 1탭 확인 / 가게명 찾기)로 넘어갑니다.
 *
 * @returns {Promise<{ok:boolean, reason?:string, blocked?:boolean, title?:string,
 *                    description?:string, url?:string}>}
 */
export async function fetchPageMeta(rawUrl, options = {}) {
  const url = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, reason: 'not-http' };
  if (!isNativeRuntime()) return { ok: false, reason: 'web-runtime' };
  const timeoutMs = options.timeoutMs == null ? PAGE_META_TIMEOUT_MS : options.timeoutMs;
  const res = await fetchWithTimeout(
    url,
    { method: 'GET', headers: { Accept: 'text/html,application/xhtml+xml' } },
    timeoutMs
  );
  if (!res) return { ok: false, reason: 'network' };
  if (!res.ok) return { ok: false, reason: 'http-' + res.status, status: res.status };
  if (typeof res.text !== 'function') return { ok: false, reason: 'no-body' };
  let html = '';
  try {
    html = String(await res.text());
  } catch (e) {
    return { ok: false, reason: 'body' };
  }
  const finalUrl = String(res.url || '');
  const meta = parseHtmlMeta(html);
  if (meta.loginWall || /\/accounts\/login|\/login\b/i.test(finalUrl)) {
    return { ok: false, reason: 'login-wall', blocked: true, status: res.status };
  }
  if (!meta.title && !meta.description) {
    return { ok: false, reason: 'no-meta', blocked: html.trim().length < 600 };
  }
  return { ok: true, ...meta, url: finalUrl || url };
}

// ─────────────────────────────────────────────────────────────
// v1.2 · 한국어 맛집·핫플 키워드 정제기
//   캡션은 대개 이렇게 생겼습니다:
//     "🍞 성수동 소금빵 맛집 베통 다녀왔어요 #성수맛집 #소금빵 #먹방 #shorts"
//   지도 검색은 '지역명 + 상호/메뉴'만 남겨야 정확도가 올라갑니다.
//   → 이모지·해시태그 기호·상투적 수식어를 걷어내고 검색어 후보를 만듭니다.
// ─────────────────────────────────────────────────────────────
const EMOJI_RE = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D\u20E3]/g;
const TAG_SYMBOL_RE = /[#＃]/g;
/** v2.7 — 설명글의 광고 문의 메일(`clclalsgml@naver.com`)이 검색어로 새지 않게 통째로 지웁니다. */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const HANDLE_RE = /@[A-Za-z0-9._]{2,}/g;
const PUNCT_RE = /[~!?.,:;'"“”‘’`^*+=_|\\/<>()\[\]{}·•…\-–—]/g;

/** 캡션에서 걷어낼 상투적 수식어·해시태그성 단어 (지도 검색에 도움이 안 되는 말) */
export const CAPTION_STOPWORDS = [
  '솔직후기', '솔직리뷰', '솔직하게', '후기', '리뷰', '추천', '추천해요', '추천템', '추천코스',
  '웨이팅', '줄서는식당', '줄서는', '줄서서', '인생맛집', '맛집', '맛집추천', '맛집투어', '맛스타그램',
  '핫플', '핫플레이스', '핫한', '오픈런', '오픈', '먹방', '먹방브이로그', '먹스타그램',
  '브이로그', 'vlog', 'shorts', 'short', '릴스', 'reels', '내돈내산', '내돈내먹',
  '꿀팁', '꿀조합', '신상', '신상카페', '데이트', '데이트코스', '데이트맛집', '코스',
  '저장', '공유', '정보', '리스트', '정리', '모음', '베스트', 'best',
  '완전', '진짜', '정말', '너무', '대박', '미쳤다', '레전드', '최고', '강추', '존맛',
  '꼭', '같이가자', '가자', '여기', '저기', '우리', '이번', '오늘', '어제', '매일',
  '로컬', '전문가', '사장님', '자영업', '평균리뷰', '이상', '근처', '주변',
  '점심', '저녁', '아침', '주말', '평일', '혼밥', '가성비', '가심비', '분위기', '인테리어',
  '뷰맛집', '감성', '감성카페', '촬영', '협찬', '광고', '제공', '이벤트', '쿠폰', '할인',
  '예약', '주차', '무료', '가격', '메뉴', '영업시간', '위치', '지도', '링크', '프로필',
  '더보기', '보기', '클릭', '확인', '구독', '좋아요', '댓글', '알림', '팔로우', '소개',
  '영상', '여행', '일상', '하루', '기록', '일기', '방문', '필수',
  '다녀왔어요', '다녀왔습니다', '다녀옴', '가봤어요', '먹어봤어요', '먹고', '시켜', '먹었어요',
  '가는', '오는', '있는', '없는', '하는', '정도', '이런', '그런', '저런', '요즘', '최근',
  '이번주', '다음주', '주말에', '평일에도', '진짜로', '완전히', '너무나',
  // v1.3 — 기간·수식어·감상 표현 (지도 검색에 도움이 안 됨)
  '한달', '두달', '세달', '네달', '몇달', '한달살기', '일주일', '이틀', '사흘', '몇주',
  '특별한', '특별', '무슨맛', '무슨맛일까', '무슨', '어떤맛', '자연산', '수준', '미친', '미쳐',
  '결론', '결론적으로', '말씀', '드리면', '비싸', '비쌉니다', '엄청', '어마어마', '먹킷리스트',
  '당일', '전날', '첫번째', '두번째', '마무리', '추천드려요', '궁금하면', '보세요', '거예요',
  // 댓글에서 흔한 군더더기
  '많이', '거의', '아주', '조금', '그냥', '완전', '계속', '다들', '저도', '제가',
  // v2.7 — 감상·수식 형용사. 상호가 아니라서 검색어가 되면 안 됩니다.
  //   (제목 “5만원대 강남 럭셔리 뷔페”, 댓글 “항상 솔직하게 말하셔서 좋다”)
  '럭셔리', '프리미엄', '갓성비', '유명', '유명한', '소문난', '대세', '핫한',
  '좋다', '맛있다', '맛나다', '예쁘다', '귀엽다', '괜찮다', '웃기다', '고맙다',
  '멋있다', '재밌다', '재미있다', '훌륭하다', '대단하다', '신기하다', '감동적이다',
  '좋은', '맛있는', '맛난', '귀여운', '예쁜', '멋진', '훌륭한', '신기한', '행복한',
  '항상', '늘', '감사', '문의', '이메일', '메일', '연락',
  // v2.8 — 설명글 줄글의 서술 명사. 목록 줄 판정에서 상호로 오인되지 않게 합니다.
  //   ("특이한 비주얼이 압권" → '압권'은 가게가 아님)
  '압권', '끝내줌', '꿀맛', '존맛', '굿',
];

/** 카테고리 단어는 지우지 않고 '지역 + 카테고리' 검색어 재료로 씁니다. */
export const CAPTION_CATEGORY_WORDS = [
  '맛집', '카페', '디저트', '베이커리', '빵집', '식당', '분식', '국밥', '고기집', '술집',
  '브런치', '레스토랑', '케이크', '파스타', '초밥', '라멘', '우동', '칼국수', '냉면', '치킨',
  // v1.3 — 핵심 외식 업종 보강 (제목만 있을 때 '지역 + 업종' 검색어가 나오게)
  '횟집', '초밥집', '이자카야', '포차', '오마카세', '스시', '고기', '해산물', '해물',
  '삼겹살', '곱창', '돈까스', '쌀국수', '피자', '버거', '한식', '일식', '중식', '양식',
  '참치', '장어', '대게', '떡볶이', '마라탕', '쭈꾸미', '닭갈비', '족발', '보쌈', '덮밥',
  // v2.7 — 제목에만 나오는 업종도 '지역 + 업종' 검색어 재료로 (예: “강남 럭셔리 뷔페”)
  '뷔페', '한정식', '코스요리', '스테이크', '리조또',
];

/** '지역 + 카테고리'를 키워드보다 먼저 쓸 만큼 구체적인 업종인지 */
const GENERIC_CATEGORY_WORDS = ['맛집', '식당', '카페', '디저트', '술집', '레스토랑'];

export function isSpecificCategory(word) {
  const w = String(word || '').trim();
  return Boolean(w) && CAPTION_CATEGORY_WORDS.indexOf(w) >= 0 && GENERIC_CATEGORY_WORDS.indexOf(w) < 0;
}

/** 영어권 해시태그 잔여물 */
const ENGLISH_NOISE = [
  'food', 'foodie', 'vlog', 'video', 'shorts', 'short', 'reels', 'reel', 'insta', 'instagram',
  'youtube', 'tiktok', 'new', 'best', 'open', 'daily', 'life', 'mukbang', 'asmr', 'cafe',
  'coffee', 'dessert', 'restaurant', 'review', 'map', 'link', 'follow', 'like', 'seoul', 'korea',
];

/** 토큰 끝에 붙은 수식어를 반복해서 걷어냅니다. ('성수동맛집' → '성수동', '카페추천' → '카페') */
const TOKEN_SUFFIXES = [
  '브이로그', '맛집추천', '카페추천', '데이트코스', '데이트맛집', '줄서는식당', '핫플레이스',
  '인생맛집', '먹방', '내돈내산', '솔직후기', '후기', '리뷰', '추천', '핫플', '데이트', '코스',
  '저장', '공유', '모음', '리스트', '정리', '정보', '신상', '오픈런', '웨이팅', '맛집',
  '브런치카페', '카페맛집', '카페',
  'shorts', 'vlog', '릴스', 'reels',
];

/** 조사(까지·에서·의·과…)를 떼어 냽니다. 짧은 지명('이태원')은 건드리지 않습니다. */
const PARTICLE_RE =
  /(이에요|었어요|였어요|입니다|에요|예요|까지|부터|에서|으로|하고|이랑|한테|께서|에는|에도|이나|거나|인데|지만|면서|니까|처럼|보다|만큼|마다|조차|밖에|라는|이라고|이라는|의|은|는|이|가|을|를|와|과|도|만|랑|에|로|들|고)$/;

function stripParticles(token) {
  let t = String(token || '');
  for (let i = 0; i < 2; i += 1) {
    const m = t.match(PARTICLE_RE);
    if (!m) break;
    // '돌돔은 → 돌돔'처럼 세 글자도 조사 하나는 떼되, 두 글자는 지킵니다('고기' 보존).
    if (t.length < 3 || t.length - m[0].length < 2) break;
    t = t.slice(0, t.length - m[0].length);
  }
  return t;
}

/** '서울맛집'처럼 너무 넓은 시·도 단서는 검색어를 흐리므로 버립니다. */
const CITY_NOISE = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남',
  '전북', '전남', '경북', '경남', '제주도', '한국', '대한민국',
];

function stripTokenSuffixes(token) {
  let t = String(token || '');
  let guard = 0;
  let changed = true;
  while (changed && guard < 3) {
    changed = false;
    for (const suf of TOKEN_SUFFIXES) {
      if (t.length > suf.length + 1 && t.toLowerCase().endsWith(suf.toLowerCase())) {
        t = t.slice(0, t.length - suf.length);
        changed = true;
        break;
      }
    }
    guard += 1;
  }
  return t;
}

/** 이모지·해시태그 기호·문장부호·URL을 걷어낸 한 줄 문자열 */
export function cleanCaptionText(text) {
  return String(text || '')
    .replace(URL_IN_TEXT, ' ')
    .replace(EMAIL_RE, ' ')
    .replace(EMOJI_RE, ' ')
    .replace(TAG_SYMBOL_RE, ' ')
    .replace(HANDLE_RE, ' ')
    .replace(PUNCT_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 서술어 꼬리(‘있고·나오는·해요’)를 가진 말은 지명·메뉴가 아니므로 걸러냅니다. */
const PREDICATE_TAIL_RE =
  /(습니다|입니다|해요|예요|이에요|했어요|했음|됐다|됐어요|되었|있었|없었|나옴|나오고|나오는|갔더니|맞춰|드렸고|해서|했는지|인데|는데|더니|지만|면서|니까|려고|도록|같음|같은|있고|없고|했던|하며|가요|네요|군요|데요|어요|지요|나요|래요|죠)$/;

/**
 * v2.7 — 형용사·동사 **기본형**('좋다'·'귀엽다'·'고맙다')은 상호가 아닙니다.
 * 시청자 댓글의 감상(“항상 솔직하게 말하셔서 좋다”)이 검색어가 되는 걸 막습니다.
 * 상호에 실제로 쓰는 명사('바다')는 예외로 둡니다.
 * @param {string} token
 * @returns {boolean}
 */
const BASE_PREDICATE_NOUN_ALLOW = ['바다'];
export function isBasePredicate(token) {
  const t = String(token || '').trim();
  if (!t || BASE_PREDICATE_NOUN_ALLOW.indexOf(t) >= 0) return false;
  // 두 글자('좋다')부터 여섯 글자('기분좋다')까지 — 마지막이 '다'인 기본형
  return /^[가-힣]{1,8}다$/.test(t);
}

/** 자주 쓰이는 동네·지역 이름 (동/역 접미사 없이 쓰이는 곳) */
export const KNOWN_AREAS = [
  '성수', '연남', '망원', '홍대', '합정', '상수', '이태원', '명동', '강남', '역삼', '잠실',
  '여의도', '검단', '을지로', '한남', '삼청', '서촌', '북촌', '신사', '압구정', '청담',
  '건대', '왕십리', '분당', '판교', '송도', '해운대', '광안리', '서면', '전주', '경주', '제주',
  '이시가키', '오키나와', '후쿠오카', '오사카', '도쿄', '교토', '나고야', '방콕', '다낭', '타이베이',
];

const AREA_SUFFIX_BLOCK = ['특별시', '광역시', '특별자치시', '특별자치도', '자치구', '자치동', '특별', '광역', '자치'];

/** '운동·이동·화면'처럼 동네가 아닌 말이 '동/읍/면'으로 끝나는 경우 — 지역명으로 쓰지 않습니다. */
const DONG_NOUN_BLOCK = [
  '운동', '활동', '이동', '공동', '자동', '노동', '행동', '부동', '변동', '진동', '충동',
  '유동', '소동', '작동', '가동', '발동', '합동', '혼동', '동조', '동참', '동원', '동의',
  '화면', '장면', '표면', '이면', '측면', '단면', '전면', '후면', '평면', '수면', '지면',
  '근면', '안면', '회면', '막면', '양면',
  '동네', '동안', '동생', '동시', '동일', '동물', '동부', '동쪽', '동해', '동전', '동화',
];

function isPlaceLikeDong(name) {
  const v = String(name || '');
  if (v.length < 2) return false;
  if (DONG_NOUN_BLOCK.indexOf(v) >= 0) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────
// v2.7 · 해시태그 상호('#디오디아') · 지역 어긋난 후보 거르기
// ─────────────────────────────────────────────────────────────
const HASHTAG_TOKEN_RE = /[#＃]([0-9A-Za-z가-힣_]{2,20})/g;

/**
 * 원문에서 `#상호` 꼴 **해시태그 낱말만** 따로 모읍니다. (v2.7)
 * `cleanCaptionText` 는 '#'을 먼저 지우기 때문에 `#디오디아` 가 뒤쪽 일반 단어로 밀려
 * 검색어 후보에서 아예 빠졌습니다. 그래서 해시태그는 원문에서 미리 읽어 둡니다.
 * @param {string} rawText
 * @returns {string[]} 중복 없는 낱말 목록 ('#' 제외)
 */
export function extractHashtagTokens(rawText) {
  const text = String(rawText || '');
  if (!text) return [];
  const out = [];
  HASHTAG_TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = HASHTAG_TOKEN_RE.exec(text))) {
    const tok = m[1];
    if (tok && out.indexOf(tok) < 0) out.push(tok);
  }
  return out;
}

/** '서울'·'부산' 같은 시·도 낱말과 '중구'·'강남대로' 같은 주소 낱말 */
const REGION_TOKEN_RE = /^([가-힣]{1,6})(특별시|광역시|특별자치시|특별자치도|시|도|구|군|동|읍|면|역)$/;

/**
 * 글에 나오는 **지역 낱말**(동네·시·도·구)을 모읍니다. (v2.7)
 * 제목에서 확정한 동네와 댓글에서 튀어나온 다른 동네를 구분하는 데 씁니다.
 * @param {string} text
 * @returns {Set<string>}
 */
export function regionWordsOf(text) {
  const set = new Set();
  const cleaned = cleanCaptionText(text);
  if (!cleaned) return set;
  const area = findAreaFromText(cleaned);
  if (area) set.add(area);
  cleaned.split(' ').filter(Boolean).forEach((tok) => {
    if (CITY_NOISE.indexOf(tok) >= 0) {
      set.add(tok);
      return;
    }
    // 아는 지명이 들어 있으면 그 낱말도 지역으로 봅니다. ('강남대로' → '강남')
    KNOWN_AREAS.forEach((known) => {
      if (tok.indexOf(known) >= 0) set.add(known);
    });
    const m = tok.match(REGION_TOKEN_RE);
    if (!m) return;
    if (AREA_SUFFIX_BLOCK.indexOf(tok) >= 0) return;
    if (/[동읍면]$/.test(tok) && !isPlaceLikeDong(tok)) return;
    set.add(tok);
    if (m[1].length >= 2) set.add(m[1]);
  });
  return set;
}

/**
 * 제목·설명글에서 확정한 동네와 **다른 동네**를 가리키는 검색어를 걷어냅니다. (v2.7)
 * 댓글 폴백이 “울산 중구 떡볶이” 같은 무관한 지역 후보를 1순위로 올리는 걸 막습니다.
 * 지역 낱말이 아예 없는 검색어(상호만 있는 `디오디아`)는 그대로 둡니다.
 * @param {string[]} queries
 * @param {string} area 기준 동네
 * @returns {string[]}
 */
export function filterQueriesByArea(queries, area) {
  const list = Array.isArray(queries) ? queries : [];
  const base = String(area || '').trim();
  if (!base) return list;
  return list.filter((q) => {
    const words = regionWordsOf(q);
    if (!words.size) return true;
    for (const w of words) {
      if (w === base || w.indexOf(base) >= 0 || base.indexOf(w) >= 0) return true;
    }
    return false;
  });
}

/**
 * 글에서 '동네'를 골라냅니다. (v1.3)
 *   1순위: 주소형 — '제주시 연동' / '성동구 성수동'처럼 시·도 이름 바로 뒤의 동네
 *          → 짧은 이름('연동')도 여기서는 확실한 동네로 봅니다.
 *   2순위: '동'으로 끝나는 말 (한 글자 + 동도 허용, 단 '운동·화면' 같은 일반명사는 제외)
 *   3순위: '★역 / ★구 / ★시' → 역명·구명만
 *   4순위: 널리 쓰이는 지명 목록(KNOWN_AREAS)
 */
export function findAreaFromText(cleaned) {
  const text = String(cleaned || '');
  if (!text) return '';
  let m;

  // 1) 주소형 '제주시 연동' · '성동구 성수동'
  const addressRe = /([가-힣]{2,6}(?:시|도|군|구))[\s,]*([가-힣]{1,4}(?:동|읍|면))(?=\s|$|[^가-힣])/g;
  while ((m = addressRe.exec(text))) {
    if (isPlaceLikeDong(m[2]) && AREA_SUFFIX_BLOCK.indexOf(m[2]) < 0) return m[2];
  }

  // 2) '동'으로 끝나는 말 (한 글자 + 동도 허용: '연동'). '읍/면'은 '하면·드리면' 같은
  //    서술어와 구분이 안 돼서 주소형(1번)에서만 인정합니다.
  const dongRe = /([가-힣]{1,5}동)(?=\s|$|[^가-힣])/g;
  while ((m = dongRe.exec(text))) {
    if (!isPlaceLikeDong(m[1])) continue;
    if (AREA_SUFFIX_BLOCK.indexOf(m[1]) >= 0) continue;
    return m[1];
  }

  // 3) '성수역' → '성수' / '성동구' → '성동' / '제주시' → '제주'
  const hits = [];
  const re = /([가-힣]{2,5})(역|구|시)(?=\s|$|[^가-힣])/g;
  while ((m = re.exec(text))) {
    const full = m[1] + m[2];
    if (AREA_SUFFIX_BLOCK.indexOf(full) >= 0 || AREA_SUFFIX_BLOCK.indexOf(m[1]) >= 0) continue;
    hits.push({ area: m[1], kind: m[2] });
  }
  if (hits.length) return hits[0].area;

  // 4) 널리 쓰이는 지명
  for (const name of KNOWN_AREAS) {
    if (text.indexOf(name) >= 0) return name;
  }
  return '';
}

/** 상호명처럼 보이는 말을 원문(대괄호·따옴표 유지)에서 찾습니다. */
const STORE_KEYWORD_RE =
  /(?:맛집|카페|식당|베이커리|빵집|디저트집|분식집|국밥집|고기집|술집|브런치|레스토랑)\s*[:\-–]?\s*([0-9A-Za-z가-힣]{2,12})/;
const VERB_TAIL_RE = /(어요|아요|여요|습니다|입니다|했다|한다|하는|했어|왔어|가요|해요|되요|돼요|같아요|주세요)$/;

export function findStoreName(rawText, area) {
  const full = String(rawText || '');
  const head = leadingText(full);
  const fromHead = findStoreNameInText(head, area);
  if (fromHead) return fromHead;
  if (!head || head.length >= full.length) return '';
  return findStoreNameInText(full, area);
}

function findStoreNameInText(rawText, area) {
  const raw = String(rawText || '')
    .replace(URL_IN_TEXT, ' ')
    .replace(EMOJI_RE, ' ');
  const candidates = [];
  const bracket = raw.match(/[\[(【〈《'"“]([^\])】〉》'"”]{2,20})[\])】〉》'"”]/);
  if (bracket) candidates.push(bracket[1]);
  const after = raw.match(STORE_KEYWORD_RE);
  if (after) candidates.push(after[1]);
  const quoted = raw.match(/[“"']([가-힣A-Za-z0-9 ]{2,15})[”"']/);
  if (quoted) candidates.push(quoted[1]);

  const stopSet = new Set(CAPTION_STOPWORDS.map((w) => w.toLowerCase()));
  for (const cand of candidates) {
    const cleaned = cleanCaptionText(cand);
    const first = cleaned.split(' ')[0] || '';
    const name = stripTokenSuffixes(stripParticles(first));
    if (!name || name.length < 2 || name.length > 15) continue;
    if (isStopToken(name, stopSet)) continue;
    if (CAPTION_CATEGORY_WORDS.indexOf(name) >= 0) continue;
    if (VERB_TAIL_RE.test(name)) continue;
    if (isBasePredicate(name)) continue;
    if (area && (name === area || name.indexOf(area) === 0)) continue;
    if (/^[0-9]/.test(name)) continue;
    return name;
  }
  return '';
}

/**
 * 설명글 전체를 다 보면 뒷부분의 무관한 문장·해시태그가 섞입니다. 앞부분(기본 500자·8줄)만 봅니다.
 * @param {string} text
 * @param {number} [maxChars]
 * @param {number} [maxLines]
 */
export function leadingText(text, maxChars = 500, maxLines = 8) {
  const lines = String(text == null ? '' : text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) return '';
  let head = lines.slice(0, maxLines).join('\n');
  if (head.length > maxChars) head = head.slice(0, maxChars);
  return head;
}

/**
 * 불용어 판정·'필수인'·'특별한'처럼 불용어 + 조사·접미사까지 막습니다.
 * @param {string} token
 * @param {Set<string>} stopSet
 */
function isStopToken(token, stopSet) {
  const t = String(token || '').toLowerCase();
  if (!t) return true;
  if (stopSet.has(t)) return true;
  if (t.length >= 3) {
    const stem = t.replace(/(인|한|된|될|함|들|가|임)$/, '');
    if (stem !== t && stem.length >= 2 && stopSet.has(stem)) return true;
  }
  return false;
}

/**
 * 제목·설명·캡션 → 지도 검색어 후보들. (v1.2)
 *   "성수동 소금빵 맛집 베통 다녀왔어요 #성수맛집"
 *   → { area:'성수동', storeName:'베통', keywords:['소금빵'], queries:['성수동 베통','베통','성수동 소금빵',...] }
 *
 * @param {string} text
 * @returns {{queries:string[], area:string, storeName:string, category:string, keywords:string[], cleaned:string}}
 */
export function extractSearchQueries(text) {
  const raw = String(text || '');
  const cleaned = cleanCaptionText(raw);
  // 설명글(description)이 길 때는 앞부분 → 뒷부분 순으로 씨알을 뽑아, 앞쪽 단서가 먼저 오게 합니다.
  const head = leadingText(raw);
  const headCleaned = head && head !== raw ? cleanCaptionText(head) : '';
  const allTokens = cleaned ? cleaned.split(' ').filter(Boolean) : [];
  const headTokens = headCleaned ? headCleaned.split(' ').filter(Boolean) : [];
  const headTokenSet = new Set(headTokens);
  const rawTokens = headTokens.concat(allTokens.filter((t) => !headTokenSet.has(t)));

  let area = (headCleaned && findAreaFromText(headCleaned)) || findAreaFromText(cleaned);
  let category = '';
  const keywords = [];
  const stopSet = new Set(CAPTION_STOPWORDS.map((w) => w.toLowerCase()));
  const pushUnique = (list, v) => {
    if (v && list.indexOf(v) < 0) list.push(v);
  };

  rawTokens.forEach((rawTok) => {
    const bare = String(rawTok).replace(/^[^0-9A-Za-z가-힣]+|[^0-9A-Za-z가-힣]+$/g, '');
    // 걷어낼 말은 원형 그대로 먼저 걸러냅니다. (단 '맛집'·'카페'는 카테고리 재료로 남깁니다)
    if (bare && isStopToken(bare, stopSet) && CAPTION_CATEGORY_WORDS.indexOf(bare) < 0) return;
    // '좋다'·'귀엽다' 같은 기본형은 상호가 아닙니다. (시청자 감상어)
    if (bare && isBasePredicate(bare)) return;
    // '떡볶이'처럼 조사처럼 끝나는 업종 단어는 그대로 카테고리로 남깁니다.
    if (bare && CAPTION_CATEGORY_WORDS.indexOf(bare) >= 0) {
      if (!category) category = bare;
      return;
    }
    let tok = stripTokenSuffixes(stripParticles(bare));
    if (!tok) return;
    if (/^[0-9]+(개|곳|분|초|원|년|월|일|명|위|차|인)?$/.test(tok)) return;
    // '35만원짜리' · '350,000원' · '5만원대' 같은 금액·수량 표현은 지도 검색어가 되지 않습니다.
    if (/^[0-9][0-9,.]*\s*(만|천|억|백)?\s*(원|만원|천원|억원)?\s*(짜리|정도|이상|미만|부터|까지|대)?$/.test(tok)) return;
    if (ENGLISH_NOISE.indexOf(tok.toLowerCase()) >= 0) return;
    if (PREDICATE_TAIL_RE.test(tok)) return;
    if (isBasePredicate(tok)) return;
    if (CITY_NOISE.indexOf(tok) >= 0) {
      // '제주도'·'경기도'처럼 시·도 이름만 있어도, 아는 지명이면 지역으로 살립니다. (제목만 있을 때)
      const base = tok.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, '');
      if (!area && base && base !== tok && KNOWN_AREAS.indexOf(base) >= 0) area = base;
      return;
    }
    // 카테고리 단어('맛집'·'카페'…)는 지우지 않고 검색어 재료로 남깁니다.
    if (CAPTION_CATEGORY_WORDS.indexOf(tok) >= 0) {
      if (!category) category = tok;
      return;
    }
    if (isStopToken(tok, stopSet)) return;

    // 지역명: '성수동' / '성수동맛집'(→성수동) / '이태원브런치'(→이태원 + 브런치)
    const suffixArea = tok.match(/^([가-힣]{2,5})(동|읍|면|역|구|시)$/);
    if (suffixArea && AREA_SUFFIX_BLOCK.indexOf(suffixArea[1]) < 0) {
      const name =
        suffixArea[2] === '역' || suffixArea[2] === '구' || suffixArea[2] === '시'
          ? suffixArea[1]
          : suffixArea[1] + suffixArea[2];
      if (!area) area = name;
      return;
    }
    if (KNOWN_AREAS.indexOf(tok) >= 0) {
      if (!area) area = tok;
      return;
    }
    const knownPrefix = KNOWN_AREAS.find((a) => tok.indexOf(a) === 0 && tok.length > a.length + 1);
    if (knownPrefix) {
      if (!area) area = knownPrefix;
      // '성수동카페' → 지역(성수) + 동 + 카테고리(카페)
      const rest = stripTokenSuffixes(
        tok.slice(knownPrefix.length).replace(/^(동|읍|면|역|구|시)(?=[가-힣])/, '')
      );
      if (rest && CAPTION_CATEGORY_WORDS.indexOf(rest) >= 0) {
        if (!category) category = rest;
        return;
      }
      if (rest.length >= 2 && !stopSet.has(rest.toLowerCase())) pushUnique(keywords, rest);
      return;
    }
    if (tok.length < 2) return;
    if (!/[가-힣A-Za-z]/.test(tok)) return;
    if (area && tok === area) return;
    pushUnique(keywords, tok);
  });

  const storeName = findStoreName(raw, area);
  // 상호명은 이미 첫 검색어('지역 + 상호')로 들어가므로 키워드 목록에서는 뺍니다.
  const keywordList = keywords
    .filter((k) => !storeName || normalizeName(k) !== normalizeName(storeName))
    .slice(0, 8); // 설명글이 길어도 검색어 후보가 후미의 무관한 단어로 넘치지 않게

  // v2.7 — `#디오디아` 처럼 **해시태그로 붙은 상호**는 지역·업종·감상어가 아닌 것만 우선 후보로 살립니다.
  const hashtagList = [];
  extractHashtagTokens(raw).forEach((tag) => {
    const bare = String(tag).replace(/^[^0-9A-Za-z가-힣]+|[^0-9A-Za-z가-힣]+$/g, '');
    if (!bare || bare.length < 2 || bare.length > 12) return;
    if (!/[가-힣A-Za-z]/.test(bare)) return;
    if (/^[0-9]/.test(bare)) return;
    if (CAPTION_CATEGORY_WORDS.indexOf(bare) >= 0) return;
    if (isStopToken(bare, stopSet)) return;
    const tok = stripTokenSuffixes(stripParticles(bare));
    if (!tok || tok.length < 2) return;
    if (CAPTION_CATEGORY_WORDS.indexOf(tok) >= 0) return;
    if (isStopToken(tok, stopSet)) return;
    if (ENGLISH_NOISE.indexOf(tok.toLowerCase()) >= 0) return;
    if (CITY_NOISE.indexOf(tok) >= 0) return;
    if (KNOWN_AREAS.indexOf(tok) >= 0 || isAreaToken(tok)) return;
    if (PREDICATE_TAIL_RE.test(tok) || isBasePredicate(tok)) return;
    if (area && tok === area) return;
    if (hashtagList.indexOf(tok) < 0) hashtagList.push(tok);
  });

  const queries = [];
  const pushQuery = (parts) => {
    const v = parts
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (v.length >= 2) pushUnique(queries, v);
  };

  if (storeName) {
    if (area) pushQuery([area, storeName]);
    pushQuery([storeName]);
  }
  // 해시태그 상호(‘디오디아’)는 지역과 묶어 먼저 찾습니다. (v2.7)
  hashtagList.slice(0, 3).forEach((tok) => {
    if (area) pushQuery([area, tok]);
    pushQuery([tok]);
  });
  // 구체적인 업종('횟집'·'초밥집' 등)은 메뉴 키워드보다 먼저 '지역 + 업종'으로 찾습니다.
  const categoryFirst = isSpecificCategory(category);
  if (area && category && categoryFirst) pushQuery([area, category]);
  if (area && keywordList.length) pushQuery([area, keywordList[0]]);
  if (area && category && !categoryFirst) pushQuery([area, category]);
  if (area && keywordList.length > 1) pushQuery([area, keywordList[0], keywordList[1]]);
  if (area) pushQuery([area]);
  if (!area && keywordList.length) pushQuery([keywordList[0]]);
  if (!area && keywordList.length > 1) pushQuery(keywordList.slice(0, 2));
  // v2.7 — 앞 1~2개만 보지 않고 키워드 후보를 최대 5개까지 '지역 + 키워드'로 이어서 시도합니다.
  keywordList.slice(0, 5).forEach((kw) => {
    if (area) pushQuery([area, kw]);
    else pushQuery([kw]);
  });
  if (!queries.length && cleaned) pushQuery([cleaned.slice(0, 40)]);

  return { queries, area, storeName, category, keywords: keywordList, hashtags: hashtagList, cleaned };
}

/** 캡션이 아니라 '제목'이 막힌 플랫폼에서 화면에 띄울 안내 문구 */
export function titleNoticeOf(platform) {
  if (platform === 'instagram') return '인스타는 보안상 제목을 못 읽어와요';
  if (platform === 'tiktok') return '틱톡은 보안상 제목을 못 읽어와요';
  return '이 링크는 제목을 못 읽어와요';
}

// ─────────────────────────────────────────────────────────────
// v2.0 · 쇼츠 '맛집 5곳' — 여러 가게 후보 한 번에 뽑기
// ─────────────────────────────────────────────────────────────
/** 한 번에 뽑는 후보 수 상한 (지도에 꽂을 수 있는 개수) */
export const MAX_MULTI_CANDIDATES = 8;

/** 목록 표식 — `1.` `2)` `①` `- ` `• ` `[3]` */
const LIST_MARKER_RE = /^\s*(?:[\u2460-\u2473\u2776-\u277F]|\(?\d{1,2}[.)\]]|\d{1,2}\s*\uBC88[.)]?|\[[0-9]{1,2}\]|[-\u2022*\u00b7\u2023\u25aa\u25e6])\s*/;
/** 번호가 붙은 줄인지 — 2줄 이상이면 '여러 곳 목록'으로 봅니다. */
const NUMBERED_LINE_RE = /^\s*(?:[\u2460-\u2473\u2776-\u277F]|\(?\d{1,2}[.)\]]|\d{1,2}\s*\uBC88[.)]?)\s*\S/;
/**
 * v2.8 — 불릿·체크·핀처럼 **사람이 목록으로 쓴 표식**으로 시작하는 줄.
 *   `- 성수동 베통` · `• 연남 뚜레쥬르` · `✅ 꿉당` · `📍 런던베이글`
 */
const BULLET_LINE_RE = /^\s*(?:[•*·‣▪◦]\s*|[-–—]\s+|[✅✔☑📍🔸🔹▶►→⭐]\uFE0F?\s*)/;

/** 명시적 목록 표식(번호·불릿·체크·핀)이 있는 줄인지 */
export function hasExplicitListMarker(line) {
  const raw = String(line || '');
  if (!raw.trim()) return false;
  return NUMBERED_LINE_RE.test(raw) || BULLET_LINE_RE.test(raw);
}

/**
 * v2.8 — 문장 꼬리(‘…했고’·‘…이면’·‘…세요’·‘…지만’).
 * `PREDICATE_TAIL_RE` 가 놓치는 연결형 어미까지 잡아, 줄글 설명이 목록으로 새지 않게 합니다.
 */
const SENTENCE_TAIL_RE =
  /(습니다|입니다|해요|예요|이에요|세요|했어요|했고|았고|었고|하고|되고|있고|없고|하며|되며|되었|했음|나옴|나오고|나오는|갔더니|해서|했는지|인데|는데|더니|지만|면서|니까|려고|도록|같음|같은|같으면서|이라면|있으면|없으면|있다면|없다면|하니|으니|어서|아서|여서|가요|네요|군요|데요|어요|지요|나요|래요|죠|하겠|되겠|면|음|함|됨)$/;

/** 가격·영업시간 같은 정보 조각 (`350,000원` · `19:00-21:30`) — 상호가 아닙니다. */
const PRICE_OR_TIME_RE = /[0-9][0-9,.]*\s*(?:만원|천원|원)|[0-9]{1,2}\s*:\s*[0-9]{2}/;
/** 한 줄 안에서 가게를 나누는 구분자 (`|` `·` `→` `-`) */
const ITEM_SPLIT_RE = /\s*[|\u00b7\u2022\u2023\u2192>]\s*|\s+[-\u2013\u2014]\s+/;

/** 목록 표식과 앞뒤 장식(이모지·화살표)을 걱어냅니다. */
export function stripListMarker(line) {
  return String(line || '')
    .replace(LIST_MARKER_RE, '')
    .replace(/^[\s\u2192>·•\-–—]+/, '')
    .trim();
}

/** 지역 이름 같은 토큰인지 ('성수동'·'연남'·'마포구') */
function isAreaToken(token) {
  const t = String(token || '').trim();
  if (!t) return false;
  if (KNOWN_AREAS.indexOf(t) >= 0) return true;
  return /^[가-힣]{1,6}(?:동|읍|면|역|구|시|도)$/.test(t);
}

/**
 * 목록 한 줄 → { name, area, queries }
 *   '1. 성수동 베통 (소금빵)'  → { name:'베통', area:'성수동', queries:['성수동 베통','베통',…] }
 * 이름은 '지역·카테고리·수식어'를 걸러 낸 마지막 토큰을 씁니다. (상호는 대개 줄 끝에 옵니다)
 */
export function parseListItem(line, index = 0, options = {}) {
  const bare = stripListMarker(line);
  if (!bare) return null;
  // '성수동 베통 - 소금빵' 처럼 대시·콜론 뒤는 대개 메뉴·설명이라, 이름은 **앞 구획**에서 찾습니다.
  const head = bare.split(/\s+[-–—]\s+|\s*[|:]\s*|\s*→\s*/)[0] || bare;
  const dropBrackets = (text) =>
    String(text || '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\{[^}]*\}/g, ' ');
  const cleanedHead = cleanCaptionText(dropBrackets(head));
  const cleaned = cleanCaptionText(dropBrackets(bare));
  if (!cleaned) return null;
  const area = findAreaFromText(cleaned) || findAreaFromText(cleanedHead);
  const stopSet = new Set(CAPTION_STOPWORDS.map((w) => w.toLowerCase()));
  const pickUsable = (tokens) =>
    tokens.filter((tok) => {
      if (tok.length < 2) return false;
      if (!/[가-힣A-Za-z]/.test(tok)) return false;
      if (isAreaToken(tok)) return false;
      if (area && tok === area) return false;
      if (CAPTION_CATEGORY_WORDS.indexOf(tok) >= 0) return false;
      if (ENGLISH_NOISE.indexOf(tok.toLowerCase()) >= 0) return false;
      if (PREDICATE_TAIL_RE.test(tok)) return false;
      if (SENTENCE_TAIL_RE.test(tok)) return false;
      if (isBasePredicate(tok)) return false;
      if (isStopToken(tok, stopSet)) return false;
      // '350' · '000원' · '3곳' 같은 수량·금액 토큰은 상호가 아닙니다.
      if (/^[0-9]/.test(tok)) return false;
      if (/^[0-9]+(?:개|곳|분|초|원|년|월|일|명|위|차|인|타임)$/.test(tok)) return false;
      return true;
    });
  let usable = pickUsable(cleanedHead.split(' ').filter(Boolean));
  if (!usable.length) usable = pickUsable(cleaned.split(' ').filter(Boolean));
  const name = usable.length ? usable[usable.length - 1] : '';
  const joined = usable.slice(-2).join(' ');
  const queries = [];
  const push = (q) => {
    const v = String(q || '').replace(/\s+/g, ' ').trim();
    if (v.length >= 2 && queries.indexOf(v) < 0) queries.push(v);
  };
  if (name) {
    if (area) push(area + ' ' + name);
    push(name);
    if (joined && joined !== name) {
      if (area) push(area + ' ' + joined);
      push(joined);
    }
  }
  // 이름을 못 잴았어도, **번호가 붙은 목록**이면 줄 전체를 검색어로 써 봅니다.
  // (설명글 문장을 목록으로 오인하지 않게, 번호 없는 줄에는 이 폴백을 쓰지 않습니다)
  if (!queries.length && options.allowFallback && cleaned.length >= 2 && cleaned.length <= 40) {
    push(cleaned);
  }
  if (!queries.length) return null;
  return {
    index: index + 1,
    label: bare.replace(/\s+/g, ' ').slice(0, 60),
    name: name || queries[0],
    area: area || '',
    queries: queries.slice(0, 4),
  };
}

/**
 * (번호 없는) 한 줄이 '가게 이름 줄'처럼 보이는지 (v2.8 강화)
 *   · 24자 이하로 짧고, 문장부호(? ! ..)·웃음(ㅋㅋ)으로 끝나지 않아야 합니다.
 *   · **세 낱말을 넘으면 문장**으로 봅니다. ("가격만 생각 안하면 너무 만족스럽게 다녀 온")
 *   · 이름 자리(마지막 낱말)가 조사·서술어·감탄·불용어·지역명이면 목록 줄이 아닙니다.
 *     ("특이한 비주얼이 압권", "벤자리 26만원 주문이 가능했고", "예약 해보세요")
 *   → 긴 줄글 설명이 '여러 가게 목록'으로 잘못 갈라지지 않게 합니다.
 */
export function looksLikeListLine(line) {
  const raw = String(line || '');
  const bare = stripListMarker(raw);
  const cleaned = cleanCaptionText(bare);
  if (cleaned.length < 2 || cleaned.length > 24) return false;
  // 감탄·말줄임·웃음(ㅋㅋ·ㅠㅠ)은 줄글
  if (/[?!]|\.\.|…|[\u314B\u314E\u3160\u315C]/.test(raw)) return false;
  if (PREDICATE_TAIL_RE.test(cleaned) || SENTENCE_TAIL_RE.test(cleaned)) return false;
  // '자연산 돌돔 350,000원' · '19:00-21:30' 같은 정보 줄은 가게 이름 줄이 아님
  if (PRICE_OR_TIME_RE.test(bare)) return false;
  // 대시·콜론 뒤는 메뉴·설명이라 이름은 앞 구획에서 셉니다. (parseListItem 과 같은 규칙)
  const head = bare.split(/\s+[-–—]\s+|\s*[|:]\s*|\s*→\s*/)[0] || bare;
  const headCleaned =
    cleanCaptionText(head.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ')) || cleaned;
  const tokens = headCleaned.split(' ').filter(Boolean);
  // 네 낱말을 넘으면 문장입니다. ('가격만 생각 안하면 너무 만족스럽게 다녀 온')
  if (tokens.length > 4) return false;
  const last = tokens[tokens.length - 1] || '';
  if (last.length < 2) return false;
  if (PARTICLE_RE.test(last)) return false;
  if (isBasePredicate(last)) return false;
  if (isAreaToken(last)) return false;
  if (CAPTION_CATEGORY_WORDS.indexOf(last) >= 0) return false;
  if (/^[0-9]/.test(last)) return false;
  const stopSet = new Set(CAPTION_STOPWORDS.map((w) => w.toLowerCase()));
  if (isStopToken(last, stopSet)) return false;
  return true;
}

/**
 * 설명글·댓글·붙여넣은 텍스트 → 여러 가게 후보 (최대 8곳)
 *   판단 순서 (v2.8 — 명시적 목록 표식을 먼저 봅니다)
 *     1) `1. … 2. …` 처럼 **번호가 붙은 줄**이 2개 이상 → 각 줄이 한 가게
 *     2) `• · - ✅ 📍` 같은 **불릿·체크 표식 줄**이 2개 이상 → 각 줄이 한 가게
 *     3) 표식 없는 줄 중 **이름처럼 보이는 짧은 줄**이 3개 이상 → 각 줄이 한 가게
 *        (세 낱말 이상·서술어·조사·감탄으로 끝나는 줄글은 배제 — looksLikeListLine)
 *     4) 한 줄에 `,` `·` 로 나열돼 있으면 → 그 조각들이 각각 한 가게
 *   후보가 1개 이하면 빈 배열을 돌려줍니다(기존 '한 곳' 흐름을 그대로 쓰기 위해).
 *
 * @param {string} text
 * @param {{max?:number}} [options]
 * @returns {Array<{index:number, label:string, name:string, area:string, queries:string[]}>}
 */
export function extractCandidatesFromText(text, options = {}) {
  const raw = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
  if (!raw.trim()) return [];
  const max = Math.max(1, Math.min(MAX_MULTI_CANDIDATES, Number(options.max) || MAX_MULTI_CANDIDATES));
  const lines = Array.from(
    new Set(
      raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    )
  );

  const numbered = lines.filter((l) => NUMBERED_LINE_RE.test(l));
  let items = [];

  if (numbered.length >= 2) {
    items = numbered.map((line, i) => parseListItem(line, i, { allowFallback: true })).filter(Boolean);
  }

  // v2.8 — 번호가 없어도 `• - ✅ 📍` 같은 **명시적 목록 표식**이 2줄 이상이면 목록입니다.
  //   단, 표식이 붙어 있어도 '가격·영업시간'이나 줄글 문장은 이름 줄이 아니므로 걸러 냅니다.
  //   (실제 설명글의 `✅자연산 돌돔 350,000원`, `✅19:00-21:30 …` 같은 정보 줄)
  if (items.length < 2) {
    const bulleted = lines.filter((l) => !NUMBERED_LINE_RE.test(l) && BULLET_LINE_RE.test(l));
    const usable = bulleted.filter(looksLikeListLine);
    if (usable.length >= 2) {
      items = usable.map((line, i) => parseListItem(line, i)).filter(Boolean);
    }
  }

  // 표식 없는 줄은 '이름처럼 보이는 짧은 줄'이 3개 이상일 때만 목록으로 봅니다.
  if (items.length < 2) {
    const listLines = lines.filter((l) => !hasExplicitListMarker(l) && looksLikeListLine(l));
    if (listLines.length >= 3) {
      items = listLines.map((line, i) => parseListItem(line, i)).filter(Boolean);
    }
  }

  if (items.length < 2) {
    // 한 줄에 '베통, 뚜레쥬르, 카페 온도' 처럼 이어 쓴 경우 (조각이 짧을 때만)
    const parts = raw
      .split(/,|、|\s[·•]\s/)
      .map((p) => p.trim())
      .filter((p) => cleanCaptionText(p).length >= 2 && cleanCaptionText(p).length <= 20);
    if (parts.length >= 2 && parts.length === raw.split(/,|、|\s[·•]\s/).length) {
      items = parts.map((p, i) => parseListItem(p, i)).filter(Boolean);
    }
  }

  // 같은 이름이 두 번 나오면 한 번만
  const seen = new Set();
  const unique = [];
  items.forEach((item) => {
    const key = normalizeName(item.name + '|' + item.area);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(item);
  });
  if (unique.length < 2) return [];
  return unique.slice(0, max).map((item, i) => ({ ...item, index: i + 1 }));
}

/**
 * 여러 후보를 각각 지도 3사에 물어보고, 첫 번째로 맞은 결과를 그 후보의 장소로 정합니다.
 * (후보의 검색어를 앞에서부터 시도 → 결과가 나오면 다음 후보로)
 *
 * @param {Array<object>} items extractCandidatesFromText 결과
 * @param {{limit?:number, providers?:string[]}} [options]
 * @returns {Promise<{items:Array<object>, candidates:Array<object>, matched:number, unmatched:Array<object>,
 *                    providersUsed:string[], providersTried:string[], failures:Array<object>}>}
 */
export async function searchMultiPlaces(items, options = {}) {
  const list = (Array.isArray(items) ? items : []).slice(0, MAX_MULTI_CANDIDATES);
  const limit = Number(options.limit) || 3;
  const providersUsed = new Set();
  const providersTried = new Set();
  const failures = [];

  const results = await Promise.all(
    list.map(async (item) => {
      const chainList = Array.isArray(item.queries) && item.queries.length ? item.queries : [item.name];
      for (const q of chainList) {
        const res = await searchPlaceProviders({
          query: q,
          limit,
          providers: options.providers,
          // 여러 가게를 동시에 찾을 때는 후보마다 1회까지만 보강합니다(요청 폭주 방지).
          backfill: 1,
        });
        (res.providersUsed || []).forEach((p) => providersUsed.add(p));
        (res.providersTried || []).forEach((p) => providersTried.add(p));
        (res.failures || []).forEach((f) => failures.push({ ...f, query: q }));
        if (res.candidates && res.candidates.length) {
          const top = res.candidates[0];
          return {
            ...item,
            query: q,
            status: 'matched',
            candidate: { ...top, multiIndex: item.index, multiLabel: item.label },
            alternatives: res.candidates.slice(1, 3),
          };
        }
      }
      return { ...item, status: 'unmatched', candidate: null, alternatives: [] };
    })
  );

  // 두 후보가 같은 가게로 매칭되면 뒤엣것은 '같은 가게'로 표시해 중복 저장을 막습니다.
  const seenIds = new Set();
  const candidates = [];
  results.forEach((r) => {
    if (!r.candidate) return;
    const key = String(r.candidate.naverPlaceId || '') || normalizeName(r.candidate.name) + '@' + r.candidate.lat + ',' + r.candidate.lng;
    if (seenIds.has(key)) {
      r.status = 'duplicate';
      r.candidate = null;
      return;
    }
    seenIds.add(key);
    candidates.push(r.candidate);
  });

  return {
    items: results,
    candidates,
    matched: candidates.length,
    unmatched: results.filter((r) => r.status === 'unmatched').map((r) => ({ label: r.label, name: r.name, queries: r.queries })),
    duplicates: results.filter((r) => r.status === 'duplicate').map((r) => ({ label: r.label, name: r.name })),
    providersUsed: Array.from(providersUsed),
    providersTried: Array.from(providersTried),
    failures,
  };
}

// ─────────────────────────────────────────────────────────────
// v2.0 · 네이버 지도 링크 → placeId 직행 저장
//   `naver.me/…` 단축 링크는 리다이렉트를 따라가야 목적지를 알 수 있어서
//   웹은 같은 출처 프록시(`/api/resolve-url`), 네이티브는 직접 페이지를 읽습니다.
// ─────────────────────────────────────────────────────────────
export const RESOLVE_URL_ENDPOINT = '/api/resolve-url';
export const RESOLVE_TIMEOUT_MS = 5500;

/** 네이버 플레이스 페이지 HTML → { title, lat, lng, address, phone } (SSR·테스트 공용 순수 함수) */
export function parseNaverPlaceHtml(html) {
  const text = String(html || '');
  if (!text) return { title: '', lat: null, lng: null, address: '', phone: '' };
  const meta = parseHtmlMeta(text);
  const cleanName = (value) =>
    decodeEntities(String(value || ''))
      .replace(/[\u0000-\u001f]/g, ' ')
      .replace(/\s*[:\-|]\s*네이버.*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  let title = cleanName(meta.ogTitle || meta.title || '');
  if (/^네이버\s*(지도|플레이스)?$/i.test(title)) title = '';
  // `&amp;` 가 그대로 들어 있는 HTML 도 있어서 한 번 풀고 읽습니다.
  const flat = text.replace(/&amp;/g, '&');
  const dname = (flat.match(/[?&]dname=([^&"'\\]{2,80})/) || [])[1];
  if (!title && dname) {
    try {
      title = cleanName(decodeURIComponent(dname));
    } catch (e) {
      title = cleanName(dname);
    }
  }
  const lat = Number((flat.match(/[?&]dlat=([0-9]{1,3}\.[0-9]{4,})/) || [])[1]);
  const lng = Number((flat.match(/[?&]dlng=([0-9]{1,3}\.[0-9]{4,})/) || [])[1]);
  const address = decodeEntities((text.match(/data-line-description="([^"]{4,120})"/) || [])[1] || '').trim();
  const phone = String((text.match(/href="tel:([0-9+\-]{7,20})"/) || [])[1] || '').trim();
  return {
    title,
    lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null,
    lng: Number.isFinite(lng) && Math.abs(lng) <= 180 ? lng : null,
    address,
    phone,
  };
}

/**
 * 단축 링크·네이버 플레이스 주소 → { ok, url, naverPlaceId, title, lat, lng, address, phone }
 * · 웹: `/api/resolve-url` 프록시가 서버에서 리다이렉트를 따라가고 제목까지 읽어 줍니다.
 * · 네이티브: 기기에서 직접 읽습니다(fetch 는 리다이렉트를 따라가고 `res.url` 에 최종 주소가 남습니다).
 * @param {string} rawUrl
 * @param {{timeoutMs?:number}} [options]
 */
export async function resolveShortLink(rawUrl, options = {}) {
  const url = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  const timeoutMs = Number(options.timeoutMs) || RESOLVE_TIMEOUT_MS;

  if (isWebPlatform()) {
    const json = await fetchProxyJson(
      RESOLVE_URL_ENDPOINT + '?url=' + encodeURIComponent(url),
      { timeoutMs }
    );
    if (!json || json.ok === false) return null;
    return {
      ok: true,
      url: String(json.url || url),
      naverPlaceId: String(json.naverPlaceId || '') || extractNaverPlaceId(String(json.url || url)),
      title: String(json.title || ''),
      lat: Number(json.lat),
      lng: Number(json.lng),
      address: String(json.address || ''),
      phone: String(json.phone || ''),
      source: 'proxy',
    };
  }

  const res = await fetchWithTimeout(url, { method: 'GET' }, timeoutMs);
  if (!res) return null;
  const finalUrl = String(res.url || url);
  let html = '';
  if (typeof res.text === 'function') {
    try {
      html = String(await res.text());
    } catch (e) {
      html = '';
    }
  }
  const meta = parseNaverPlaceHtml(html);
  return {
    ok: true,
    url: finalUrl,
    naverPlaceId: extractNaverPlaceId(finalUrl) || extractNaverPlaceId(html.slice(0, 4000)),
    ...meta,
    source: 'direct',
  };
}

/**
 * 붙여넣은 링크들 중 '네이버 플레이스로 바로 갈 수 있는 링크'를 찾습니다.
 * @param {string[]} urls
 * @param {{timeoutMs?:number}} [options]
 * @returns {Promise<null|{naverPlaceId:string, url:string, title?:string, lat?:number, lng?:number,
 *                        address?:string, phone?:string, source:string}>}
 */
export async function resolvePlaceLinkFromInput(urls, options = {}) {
  const list = (Array.isArray(urls) ? urls : [urls]).map((u) => String(u || '').trim()).filter(Boolean);
  for (const url of list) {
    const directId = extractNaverPlaceId(url);
    if (directId) {
      const detail = naverPlaceDetailUrl(directId);
      const info = await resolveShortLink(detail, options);
      return {
        naverPlaceId: directId,
        url: info && info.url ? info.url : url,
        title: (info && info.title) || '',
        lat: info ? info.lat : null,
        lng: info ? info.lng : null,
        address: (info && info.address) || '',
        phone: (info && info.phone) || '',
        source: 'naver-place',
      };
    }
    if (!isShortLinkUrl(url)) continue;
    const resolved = await resolveShortLink(url, options);
    if (!resolved) continue;
    const id = resolved.naverPlaceId || extractNaverPlaceId(resolved.url);
    if (!id) continue;
    return { ...resolved, naverPlaceId: id, url: resolved.url || url, source: 'short-link' };
  }
  return null;
}

/** 네이버 플레이스 링크 정보 → 저장할 후보 (좌표를 못 읽으면 manual=true) */
export function naverPlaceCandidate(link) {
  if (!link || !link.naverPlaceId) return null;
  const lat = Number(link.lat);
  const lng = Number(link.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const name = String(link.title || '').trim();
  if (!name && !hasCoords) return null;
  const address = String(link.address || '').trim();
  return {
    id: 'naver-place-' + link.naverPlaceId,
    name: name || '네이버 플레이스 ' + link.naverPlaceId,
    area: findAreaFromText(cleanCaptionText(address)),
    category: '맛집',
    menuTags: [],
    address: address || '주소 미확인',
    lat: hasCoords ? lat : null,
    lng: hasCoords ? lng : null,
    phone: String(link.phone || ''),
    placeUrl: naverPlaceDetailUrl(link.naverPlaceId),
    placeUrlLabel: '네이버 플레이스',
    naverPlaceId: String(link.naverPlaceId),
    provider: 'naver',
    providers: ['naver'],
    confidence: 0.95,
    manual: !hasCoords,
  };
}

// ─────────────────────────────────────────────────────────────
// 어댑터 1 · 소스 메타데이터 (유튜브 Data API / 인스타 og 태그)
// ─────────────────────────────────────────────────────────────
export const sourceAdapters = {
  youtube: {
    keyEnv: 'EXPO_PUBLIC_YOUTUBE_API_KEY',
    /**
     * 1) **무인증 oEmbed** — 키 없이 제목·썸네일을 읽습니다. (v1.2)
     *    GET https://www.youtube.com/oembed?url=<영상 URL>&format=json
     * 2) **영상 페이지 HTML** — 네이티브에서는 설명글(description)까지 읽습니다. (v1.3)
     *    실제 상호명은 제목이 아니라 설명글 첫머리에만 있는 경우가 많아서,
     *    설명글이 있을 때만 `title + '\n' + description` 으로 검색어를 뽑습니다.
     * 3) EXPO_PUBLIC_YOUTUBE_API_KEY 가 있으면 Data API v3 로 설명글을 더 정확히 읽습니다.
     * @returns {Promise<{title:string, description:string, thumbnail?:string, source:string}|null>}
     */
    async fetchMetadata(parsed) {
      const key = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;
      // v1.4 — 웹에서 번들 키가 없으면 우리 서버 프록시(/api/youtube)가 서버 키로 읽어 줍니다.
      //   실패하면 oEmbed 로 폴백합니다. (oEmbed 는 CORS 가 열려 있어 웹에서도 동작)
      const proxyPromise = !key && isWebPlatform() ? fetchYouTubeProxy(parsed) : Promise.resolve(null);
      // 키가 없으면 oEmbed 와 페이지 HTML 을 동시에 읽습니다. (한 번에 기다려 체감 지연을 줄임)
      const [oembed, page, proxied] = await Promise.all([
        fetchYouTubeOembed(parsed),
        key ? Promise.resolve(null) : fetchYouTubePageMeta(parsed),
        proxyPromise,
      ]);
      const base = {
        title: (proxied && proxied.title) || (oembed && oembed.title) || (page && page.title) || '',
        description: (proxied && proxied.description) || (page && page.description) || '',
        // 프록시가 상위·업로더 댓글을 한 덩어리 텍스트로 줍니다. (없으면 빈 문자열)
        comments: (proxied && proxied.comments) || '',
        thumbnail: (proxied && proxied.thumbnail) || (oembed ? oembed.thumbnail : null),
        authorName: (oembed && oembed.authorName) || '',
        source: proxied
          ? 'youtube-proxy'
          : page && page.description
          ? 'youtube-oembed+page'
          : 'youtube-oembed',
      };
      if (!key && !base.title && !base.description) return null;
      if (!key) return base; // 키가 없어도 oEmbed 제목(+프록시/페이지 설명글)으로 충분합니다.
      try {
        const endpoint =
          'https://www.googleapis.com/youtube/v3/videos?part=snippet&id=' +
          encodeURIComponent(parsed.contentId) +
          '&key=' +
          encodeURIComponent(key);
        // 설명글(videos)과 댓글(commentThreads)을 **동시에** 가져와 기다리는 시간을 합치지 않습니다.
        const [res, commentList] = await Promise.all([
          fetch(endpoint),
          fetchYouTubeComments(parsed, { key }),
        ]);
        if (!res || !res.ok) {
          // 설명글은 못 읽었어도 댓글이 있으면 댓글만 살립니다. (업로더 순서는 모르니 받은 순서)
          const fallbackText = commentsToText(commentList, '');
          return fallbackText ? { ...base, comments: fallbackText, source: base.source } : base;
        }
        const json = await res.json();
        const item = json && json.items && json.items[0];
        if (!item) {
          const fallbackText = commentsToText(commentList, '');
          return fallbackText ? { ...base, comments: fallbackText } : base;
        }
        const snippet = item.snippet || {};
        let description = snippet.description || base.description || '';
        if (!description) {
          // 키는 있지만 Data API 가 설명을 주지 못한 경우 → 네이티브면 페이지에서 한 번 더 시도
          const fallbackPage = await fetchYouTubePageMeta(parsed);
          description = (fallbackPage && fallbackPage.description) || '';
        }
        return {
          title: base.title || snippet.title || '',
          description,
          // 업로더(고정) 댓글을 맨 앞에 둔 상위 댓글 텍스트 — 없으면 빈 문자열
          comments: commentsToText(commentList, snippet.channelId),
          thumbnail:
            base.thumbnail ||
            (snippet.thumbnails && snippet.thumbnails.high ? snippet.thumbnails.high.url : null),
          source: base.title ? 'youtube-oembed+api' : 'youtube-api',
        };
      } catch (e) {
        return base;
      }
    },
  },
  instagram: {
    /**
     * 인스타는 공식 캡션 API를 열어 주지 않고, 페이지도 로그인 월로 막습니다.
     * 1) 공유 시트에서 함께 복사된 캡션을 우선 사용 (가장 정확)
     * 2) 캡션이 없으면 네이티브에서만 OG 메타를 best-effort — 로그인 월이면 조용히 null
     *    → 화면은 '인스타는 보안상 제목을 못 읽어와요' 안내 + [가게명으로 찾기] 버튼으로 이어집니다.
     */
    async fetchMetadata(parsed, sharedCaption) {
      if (sharedCaption && String(sharedCaption).trim()) {
        return {
          title: '',
          description: String(sharedCaption).trim(),
          thumbnail: null,
          source: 'shared-caption',
        };
      }
      const page = await fetchPageMeta(parsed.url);
      if (page && page.ok) {
        return { title: page.title, description: page.description, thumbnail: null, source: 'og' };
      }
      return null;
    },
  },
  tiktok: {
    async fetchMetadata() {
      return null; // 틱톡은 로그인 월 + 약관 확인 전 — v1.2 범위 밖
    },
  },
  naver: {
    /** 네이버 블로그·웹 페이지는 OG 메타로 제목을 읽습니다. (웹 런타임은 CORS 로 건너뜀) */
    async fetchMetadata(parsed) {
      const page = await fetchPageMeta(parsed.url);
      if (page && page.ok) {
        return { title: page.title, description: page.description, thumbnail: null, source: 'og' };
      }
      return null;
    },
  },
  unknown: {
    /** 일반 웹 페이지도 같은 방식으로 제목을 읽습니다. (v1.2) */
    async fetchMetadata(parsed) {
      const page = await fetchPageMeta(parsed.url);
      if (page && page.ok) {
        return { title: page.title, description: page.description, thumbnail: null, source: 'og' };
      }
      return null;
    },
  },
};

// ─────────────────────────────────────────────────────────────
// 어댑터 2 · LLM 장소 추출 (OpenAI)
// ─────────────────────────────────────────────────────────────
export const llmAdapter = {
  keyEnv: 'EXPO_PUBLIC_OPENAI_API_KEY',
  model: 'gpt-4o-mini',
  /**
   * 캡션·제목 → { name, area, category, menuTags[] } JSON 1건.
   * 프롬프트는 '없는 정보는 비워 두라'로 고정해 환각을 줄입니다.
   */
  async extractPlaceJson(text) {
    const key = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
    if (!key || !text) return null;
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + key,
        },
        body: JSON.stringify({
          model: this.model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                '한국 맛집 릴스 설명에서 장소를 추출한다. 확실하지 않은 값은 빈 문자열로 둔다. ' +
                'JSON 키: name, area, category(맛집|카페|디저트|베이커리|가볼곳), menuTags(최대 3개 배열), addressHint',
            },
            { role: 'user', content: String(text).slice(0, 2000) },
          ],
        }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const content =
        json && json.choices && json.choices[0] && json.choices[0].message
          ? json.choices[0].message.content
          : '';
      return content ? JSON.parse(content) : null;
    } catch (e) {
      return null;
    }
  },
};

// ─────────────────────────────────────────────────────────────
// 공통 유틸
// ─────────────────────────────────────────────────────────────
const KAKAO_KEYWORD_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';
/** 2026년 7월 말 이후 네이버 검색 API 신규 규격 — 네이버 클라우드 플랫폼 NAVER API HUB */
const NAVER_HUB_LOCAL_ENDPOINT = 'https://naverapihub.apigw.ntruss.com/search/v1/local';
/** 구 개발자센터(developers.naver.com) 규격 — 하위 호환용 */
const NAVER_LOCAL_ENDPOINT = 'https://openapi.naver.com/v1/search/local.json';
const GOOGLE_TEXT_SEARCH_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

/** 지도 3사 후보를 합친 뒤 화면에 보여 줄 최대 개수(라디오 선택 UX 기준) */
export const MAX_MAP_RESULTS = 5;

function stripTags(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[\s\u00a0()[\]{}<>·,.'"“”‘’\-_/|]/g, '');
}

/**
 * 저장된 장소 링크(placeUrl)를 앱에서 바로 열 수 있는 형태로 정리합니다.
 * - http → https 승격은 카카오맵·네이버처럼 https 를 지원하는 지도 계열 호스트만 합니다.
 *   (가게 자체 홈페이지는 http 만 지원하는 곳이 있어 스킴을 그대로 둡니다)
 * - http(s) 가 아닌 값은 버립니다.
 */
function toOpenableUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https:\/\//i.test(s)) return s;
  if (/^http:\/\//i.test(s)) {
    const host = s.replace(/^http:\/\//i, '').split(/[/?#]/)[0].toLowerCase();
    const mapHost = /(^|\.)(kakao\.com|kakao\.co\.kr|naver\.com|naver\.me|google\.com|goo\.gl)$/.test(host);
    return mapHost ? s.replace(/^http:\/\//i, 'https://') : s;
  }
  return '';
}

/** placeUrl 이 어느 서비스의 페이지인지 사람이 읽을 이름표로 바꿉니다. */
function placeUrlLabelOf(rawUrl) {
  const s = String(rawUrl || '').toLowerCase();
  if (!s) return '';
  if (s.indexOf('kakao.com') >= 0) return '카카오맵';
  if (s.indexOf('naver.com') >= 0 || s.indexOf('naver.me') >= 0) return '네이버';
  if (s.indexOf('google.com') >= 0 || s.indexOf('goo.gl') >= 0) return '구글 지도';
  return '매장 홈페이지';
}

function distanceMeters(a, b) {
  const lat1 = Number(a && a.lat);
  const lng1 = Number(a && a.lng);
  const lat2 = Number(b && b.lat);
  const lng2 = Number(b && b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 같은 가게를 3사가 각자 돌려줬을 때 하나로 합치기 위한 판정 */
function samePlace(a, b) {
  const na = normalizeName(a && a.name);
  const nb = normalizeName(b && b.name);
  if (!na || !nb) return false;
  const d = distanceMeters(a, b);
  if (na === nb) return d <= 300 || d === Infinity; // 이름이 같으면 같은 가게로 본다
  if (d <= 40) return true; // 좌표가 사실상 동일
  if (na.length >= 2 && nb.length >= 2 && (na.includes(nb) || nb.includes(na))) return d <= 150;
  return false;
}

// ─────────────────────────────────────────────────────────────
// v2.12 · 주소 기반 네이버 안전 교차 보강
// ─────────────────────────────────────────────────────────────
//  문제: `동대문 영화장` 처럼 **광역/구 단위 검색어**로 카카오는 찾는데 네이버 지역검색이
//        빈 결과(`items: []`)를 주는 경우가 있습니다. (같은 가게도 `동대문구 영화장`·`휘경로 영화장`
//        으로는 정상 반환) → 카카오 후보 **1곳만** 뜨고 네이버 배지가 빠집니다.
//  해결: 카카오 후보의 **실제 주소**(법정동·도로명·구)로 네이버를 1~2회 보강 조회합니다.
//  안전: 두 후보가 ① 이름이 정규화 일치/상호 포함이고 ② 좌표 200m 이내 **또는** 도로명·지번 주소가
//        같을 때만 합칩니다. 주소·좌표가 어긋나는 **동명이인은 절대 합치지 않습니다.**

/** 보강 조회로 인정할 최대 좌표 거리(m) — 이보다 멀면 주소가 같아야만 같은 가게로 봅니다. */
export const NAVER_BACKFILL_MAX_DISTANCE_M = 200;
/** 한 번의 지도 검색에서 네이버 보강 조회에 쓸 수 있는 최대 요청 수 (후보 3곳 × 2회 이내) */
export const NAVER_BACKFILL_MAX_QUERIES = 4;
/** 보강 조회 한 건의 응답 대기 한도 — 실패해도 원래 결과로 계속 진행합니다. */
export const NAVER_BACKFILL_TIMEOUT_MS = 3500;

/**
 * 주소에서 시·구(`동대문구`)·법정동(`이문동`)·도로명(`휘경로`)·번지(`3-8`) 조각을 뽑습니다.
 * 토큰 단위로 보기 때문에 `동대문구` 를 동으로 오인하지 않습니다.
 * @param {string} address
 * @returns {{gu:string, dong:string, road:string, roadNo:string, lot:string}}
 */
export function addressParts(address) {
  const text = String(address == null ? '' : address).replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = { gu: '', dong: '', road: '', roadNo: '', lot: '' };
  if (!text) return parts;
  const tokens = text.split(' ').filter(Boolean);
  tokens.forEach((token, i) => {
    if (!parts.gu && /^[가-힣]{2,6}[구군]$/.test(token)) parts.gu = token;
    if (!parts.dong && /^[가-힣]{1,6}(?:동|읍|면)(?:\d+가)?$/.test(token)) parts.dong = token;
    if (!parts.road && /^[가-힣]{2,10}(?:로|길)$/.test(token) && /^\d/.test(tokens[i + 1] || '')) {
      parts.road = token;
      parts.roadNo = tokens[i + 1];
    }
    // 번지 — 도로명 뒤 숫자(roadNo)는 번지로 세지 않습니다. (지번 주소에만 있는 값)
    if (!parts.lot && /^\d{1,5}(?:-\d{1,5})?$/.test(token) && token !== parts.roadNo) parts.lot = token;
  });
  return parts;
}

/** 두 주소가 같은 곳인지 — 도로명+번지 또는 법정동+번지가 같아야 합니다. (구가 다르면 다른 곳) */
export function sameAddress(a, b) {
  const A = addressParts(a);
  const B = addressParts(b);
  // 구가 다르면 다른 곳 — 도로명이 우연히 같아도(전국의 `중앙로`) 합치지 않습니다.
  if (A.gu && B.gu && A.gu !== B.gu) return false;
  if (A.road && B.road && A.road === B.road && A.roadNo && A.roadNo === B.roadNo) return true;
  if (A.dong && B.dong && A.dong === B.dong && A.lot && A.lot === B.lot) return true;
  return false;
}

/**
 * 카카오 후보 → 네이버 보강 검색어 1~2개.
 * `서울 동대문구 휘경로 3-8` + `영화장` → `휘경로 영화장`, `동대문구 영화장`
 * (법정동이 주소에 있으면 `이문동 영화장` 이 먼저 — 더 좁은 단위가 먼저입니다)
 * @param {object} candidate 카카오 후보
 * @returns {string[]} 최대 2개
 */
export function naverBackfillQueries(candidate) {
  const name = String((candidate && candidate.name) || '').trim();
  if (!name) return [];
  const nameKey = normalizeName(name);
  if (!nameKey) return [];
  const parts = addressParts(candidate.address);
  const tokens = [parts.dong, parts.road, parts.gu];
  const out = [];
  tokens.forEach((token) => {
    const value = String(token || '').trim();
    const key = normalizeName(value);
    if (!key) return;
    if (key === nameKey) return;
    // 이미 상호 안에 들어 있는 동네 이름은 붙이지 않습니다. (`이문동 영화장` + `이문동`)
    if (nameKey.indexOf(key) >= 0) return;
    const query = value + ' ' + name;
    if (out.indexOf(query) < 0) out.push(query);
  });
  return out.slice(0, 2);
}

/**
 * 네이버 후보가 카카오 후보와 **같은 가게**인지 안전하게 판정합니다.
 *   ① 상호 정규화 일치 또는 상호 포함 (두 글자 이상)
 *   ② 좌표 200m 이내 **또는** 도로명·지번 주소 일치
 * 하나라도 어긋나면 `false` — 동명이인은 합치지 않습니다.
 * @param {object} candidate 카카오 후보
 * @param {object} item 네이버 후보
 * @returns {boolean}
 */
export function naverBackfillMatch(candidate, item) {
  const na = normalizeName(candidate && candidate.name);
  const nb = normalizeName(item && item.name);
  if (!na || !nb) return false;
  const nameOk =
    na === nb ||
    (na.length >= 2 && nb.length >= 2 && (na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0));
  if (!nameOk) return false;
  const d = distanceMeters(candidate, item);
  if (Number.isFinite(d) && d <= NAVER_BACKFILL_MAX_DISTANCE_M) return true;
  return sameAddress(candidate && candidate.address, item && item.address);
}

/** 네이버가 확인해 준 후보를 카카오 후보에 합칩니다 — 배지·출처·빈 필드만 채웁니다. */
function mergeNaverBackfill(candidate, item, query) {
  const providers = Array.isArray(candidate.providers) ? candidate.providers.slice() : [];
  if (candidate.provider && providers.indexOf(candidate.provider) < 0) providers.push(candidate.provider);
  if (providers.indexOf('naver') < 0) providers.push('naver');
  candidate.providers = providers;
  // 두 지도가 같은 가게를 확인해 줬으니 신뢰도를 조금 올립니다. (기존 병합 규칙과 같은 폭)
  const base = Number.isFinite(candidate.confidence) ? candidate.confidence : 0.86;
  candidate.confidence = clamp(Math.max(base, 0.86) + 0.04, 0.3, 0.99);
  if (!candidate.phone && item.phone) candidate.phone = item.phone;
  if (!candidate.address && item.address) candidate.address = item.address;
  if (!candidate.area && item.area) candidate.area = item.area;
  if (!candidate.placeUrl && item.placeUrl) {
    candidate.placeUrl = item.placeUrl;
    candidate.placeUrlLabel = item.placeUrlLabel || '';
  }
  if (!candidate.naverPlaceId && item.naverPlaceId) candidate.naverPlaceId = item.naverPlaceId;
  // 근거 추적용 — 어떤 검색어로 네이버가 확인해 줬는지 남깁니다.
  candidate.naverBackfillQuery = query;
}

/**
 * 카카오만 잡힌 상위 후보(1~3곳)에 대해 주소 기반으로 네이버 지역검색을 보강합니다.
 * - 네이버 배지가 없는 **카카오 후보**만 대상
 * - 후보당 검색어 1~2개, 전체 요청 `maxQueries` 건 이내
 * - 실패·타임아웃은 조용히 넘어갑니다(원래 결과 유지)
 * @param {{candidates:Array<object>, maxQueries?:number, timeoutMs?:number}} options
 * @returns {Promise<{queries:string[], matched:number}>}
 */
export async function backfillNaverByAddress({ candidates, maxQueries = NAVER_BACKFILL_MAX_QUERIES, timeoutMs = NAVER_BACKFILL_TIMEOUT_MS } = {}) {
  const list = Array.isArray(candidates) ? candidates.slice(0, 3) : [];
  const budget = Math.max(0, Math.min(NAVER_BACKFILL_MAX_QUERIES, Number(maxQueries) || 0));
  const empty = { queries: [], matched: 0 };
  if (!list.length || !budget) return empty;

  const targets = list
    .filter((c) => {
      if (!c || !c.name) return false;
      const providers = Array.isArray(c.providers) ? c.providers : [];
      if (providers.indexOf('naver') >= 0) return false;
      // 카카오가 찾은 후보만 — 네이버·구글 단독 후보는 보강할 주소 기준이 없습니다.
      return c.provider === 'kakao' || providers.indexOf('kakao') >= 0;
    })
    .map((candidate) => ({ candidate, queries: naverBackfillQueries(candidate) }))
    .filter((t) => t.queries.length);
  if (!targets.length) return empty;

  // 1차로 후보마다 한 번씩, 예산이 남으면 2차 검색어까지.
  const plan = [];
  targets.forEach((t) => {
    if (plan.length < budget) plan.push({ candidate: t.candidate, query: t.queries[0] });
  });
  targets.forEach((t) => {
    if (plan.length < budget && t.queries[1]) plan.push({ candidate: t.candidate, query: t.queries[1] });
  });

  const withTimeout = (promise, ms) =>
    Promise.race([
      promise,
      new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), ms);
        if (timer && typeof timer.unref === 'function') timer.unref();
      }),
    ]);

  const outcomes = await Promise.all(
    plan.map(async (entry) => {
      try {
        const items = await withTimeout(
          naverLocalAdapter.search({ query: entry.query, limit: 3 }),
          timeoutMs
        );
        return { ...entry, items: Array.isArray(items) ? items : [] };
      } catch (e) {
        return { ...entry, items: [] };
      }
    })
  );

  const queries = [];
  let matched = 0;
  outcomes.forEach((outcome) => {
    const { candidate, query } = outcome;
    if (!candidate || !candidate.name) return;
    const providers = Array.isArray(candidate.providers) ? candidate.providers : [];
    if (providers.indexOf('naver') >= 0) return; // 이미 앞선 보강에서 확인됨
    const hit = (outcome.items || []).find((item) => naverBackfillMatch(candidate, item));
    if (!hit) return;
    mergeNaverBackfill(candidate, hit, query);
    queries.push(query);
    matched += 1;
  });

  return { queries, matched };
}

// 앱 카테고리(맛집·카페·디저트·베이커리·가볼곳)로 정규화
const GROUP_CODE_CATEGORY = {
  FD6: '맛집', // 음식점
  CE7: '카페', // 카페
  AT4: '가볼곳', // 관광명소
  CT1: '가볼곳', // 문화시설
  AD5: '가볼곳', // 숙박
};

const CATEGORY_RULES = [
  { category: '베이커리', words: ['제과', '베이커리', '빵집', '빵', 'bakery', 'pastry', 'croissant', 'bakeries'] },
  { category: '디저트', words: ['디저트', '케이크', '아이스크림', '빙수', '도넛', 'dessert', 'cake', 'ice cream', 'donut'] },
  { category: '카페', words: ['카페', '커피', '로스터리', '찻집', 'cafe', 'coffee', 'tea house', 'roastery'] },
  {
    category: '가볼곳',
    words: ['관광', '명소', '공원', '미술관', '박물관', '전시', '해변', '비치', '전망대', '온천', 'tourist', 'park', 'museum', 'attraction', 'garden', 'viewpoint', 'beach', 'landmark', 'shrine', 'temple', 'onsen'],
  },
  {
    category: '맛집',
    words: ['음식점', '식당', '한식', '일식', '중식', '양식', '분식', '국밥', '고기', '치킨', '피자', 'restaurant', 'food', 'diner', 'noodle', 'sushi', 'bbq'],
  },
];

function mapCategory(rawCategory, groupCode) {
  const raw = String(rawCategory || '').toLowerCase();
  const byCode = GROUP_CODE_CATEGORY[String(groupCode || '').toUpperCase()];
  if (byCode) {
    // 카카오 코드가 카페/음식점을 정확히 알려 주지만, '제과,베이커리'처럼 더 구체적인 표기는 존중
    for (const rule of CATEGORY_RULES) {
      if (rule.words.some((w) => raw.includes(w.toLowerCase()))) return rule.category;
    }
    return byCode;
  }
  for (const rule of CATEGORY_RULES) {
    if (rule.words.some((w) => raw.includes(w.toLowerCase()))) return rule.category;
  }
  return '맛집';
}

/** '서울 성동구 성수동2가 123-4' → '성수동' 처럼 동네 이름만 뽑습니다. (도로명주소에는 동이 없어 지번주소를 먼저 봅니다) */
function pickArea(address) {
  const text = String(address || '');
  const dong = text.match(/([가-힣]{1,6}(?:동|읍|면))(?:\d+가)?(?:\s|,|$)/);
  if (dong) return dong[1];
  const gu = text.match(/([가-힣]{1,6}[구군])(?:\s|,|$)/);
  return gu ? gu[1] : '';
}

/** 카카오 documents[] → 앱 후보 (직접 호출·프록시 공통) */
function mapKakaoDocuments(documents) {
  const docs = Array.isArray(documents) ? documents : [];
  return docs.map((d, i) => {
    const address = d.road_address_name || d.address_name || '';
    return {
      id: 'kakao-' + (d.id || i),
      name: d.place_name || '',
      area: pickArea(d.address_name) || pickArea(d.road_address_name),
      category: mapCategory(d.category_name, d.category_group_code),
      rawCategory: d.category_name || '',
      menuTags: [],
      address,
      lat: Number(d.y),
      lng: Number(d.x),
      phone: d.phone || '',
      placeUrl: toOpenableUrl(d.place_url),
      placeUrlLabel: placeUrlLabelOf(d.place_url),
      provider: 'kakao',
      manual: false,
    };
  });
}

/** 네이버 items[] → 앱 후보 (직접 호출·프록시 공통) */
function mapNaverItems(items) {
  const list = Array.isArray(items) ? items : [];
  return list.map((it, i) => {
    const name = stripTags(it.title);
    const address = it.roadAddress || it.address || '';
    return {
      id: 'naver-' + i,
      name,
      area: pickArea(it.address) || pickArea(address),
      category: mapCategory(it.category),
      rawCategory: it.category || '',
      menuTags: [],
      address,
      // 네이버는 mapx/mapy를 소수점 제거한 정수(1e7 스케일)로 줍니다.
      lat: Number(it.mapy) / 1e7,
      lng: Number(it.mapx) / 1e7,
      phone: it.telephone || '',
      // 지도사가 주는 link 는 업주 홈페이지·SNS 일 수 있고, 없으면 비워 둡니다.
      placeUrl: toOpenableUrl(it.link),
      placeUrlLabel: placeUrlLabelOf(it.link),
      // 가끔 link 가 네이버 플레이스 주소면 placeId 를 살려 둘다 (매장 정보 직행).
      naverPlaceId: extractNaverPlaceId(it.link),
      provider: 'naver',
      manual: false,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// 어댑터 3-A · 카카오 로컬 (키워드 장소 검색)
// ─────────────────────────────────────────────────────────────
export const kakaoLocalAdapter = {
  id: 'kakao',
  label: '카카오 로컬',
  keyEnv: 'EXPO_PUBLIC_KAKAO_REST_API_KEY',
  isConfigured() {
    // 웹은 번들 키가 없어도 같은 출처 프록시(/api/kakao-local)가 서버 키로 대신 부릅니다.
    return Boolean(process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY) || isWebPlatform();
  },
  /**
   * GET https://dapi.kakao.com/v2/local/search/keyword.json?query=성수 소금빵집&size=3
   * 응답 documents[] = { place_name, category_name, category_group_code, phone,
   *                       address_name, road_address_name, x(경도), y(위도), place_url }
   * → 도로명주소·위경도·카테고리·카카오맵 Place URL을 그대로 후보로 옮깁니다.
   */
  async search({ query, limit = 3 }) {
    const key = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
    if (!query) return [];
    // 카카오 로컬(dapi.kakao.com)도 브라우저 CORS 를 열지 않습니다 → 웹은 프록시가 답합니다.
    if (isWebPlatform()) {
      const proxied = await this.searchViaProxy({ query, limit });
      if (proxied) return proxied; // [] (결과 없음) 과 null(실패) 을 구분합니다
      if (!key) return [];
    }
    if (!key) return [];
    const url =
      KAKAO_KEYWORD_ENDPOINT +
      '?query=' +
      encodeURIComponent(query) +
      '&size=' +
      clamp(Number(limit) || 3, 1, 15) +
      '&sort=accuracy';
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: 'KakaoAK ' + key },
    });
    if (!res.ok) throw new Error('kakao ' + res.status);
    const json = await res.json();
    return mapKakaoDocuments(json && json.documents);
  },
  /**
   * 웹 전용: `/api/kakao-local?query=..&size=..` → 카카오 응답을 앱 후보로 옮깁니다.
   * @returns {Promise<Array<object>|null>} 실패는 null, 성공(결과 0개 포함)은 배열
   */
  async searchViaProxy({ query, limit = 3 }) {
    const json = await fetchProxyJson(
      proxyPathOf('kakao', { query, size: clamp(Number(limit) || 3, 1, 15) })
    );
    if (!json) return null;
    return mapKakaoDocuments(json.documents);
  },
};

// ─────────────────────────────────────────────────────────────
// 어댑터 3-B · 네이버 지역검색 (지오코딩 보조)
// ─────────────────────────────────────────────────────────────
export const naverLocalAdapter = {
  id: 'naver',
  label: '네이버 지역검색',
  // HUB 키 두 개가 있으면 HUB 규격, 없으면 구 개발자센터 키 두 개로 폴백합니다.
  keyEnvs: [
    'EXPO_PUBLIC_NAVER_HUB_CLIENT_ID',
    'EXPO_PUBLIC_NAVER_HUB_CLIENT_SECRET',
    'EXPO_PUBLIC_NAVER_CLIENT_ID',
    'EXPO_PUBLIC_NAVER_CLIENT_SECRET',
  ],
  /**
   * 어느 규격으로 호출할지 결정합니다. (키가 절반만 있으면 그 규격은 쓰지 않습니다)
   * @returns {{mode:'hub'|'legacy', endpoint:string, clientId:string, clientSecret:string}|null}
   */
  credentials() {
    const hubId = process.env.EXPO_PUBLIC_NAVER_HUB_CLIENT_ID;
    const hubSecret = process.env.EXPO_PUBLIC_NAVER_HUB_CLIENT_SECRET;
    if (hubId && hubSecret) {
      return { mode: 'hub', endpoint: NAVER_HUB_LOCAL_ENDPOINT, clientId: hubId, clientSecret: hubSecret };
    }
    const legacyId = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID;
    const legacySecret = process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET;
    if (legacyId && legacySecret) {
      return { mode: 'legacy', endpoint: NAVER_LOCAL_ENDPOINT, clientId: legacyId, clientSecret: legacySecret };
    }
    return null;
  },
  isConfigured() {
    // v1.4 — 웹은 번들 키가 없어도 같은 출처 프록시(/api/naver-local)가 서버 키로 대신 부릅니다.
    return Boolean(this.credentials()) || isWebPlatform();
  },
  /**
   * 환경변수 → 요청 URL·헤더. 규격 분기를 테스트에서 그대로 확인하려고 메서드로 분리했습니다.
   * @returns {{mode:'hub'|'legacy', url:string, headers:object}|null}
   */
  buildRequest({ query, limit = 3, credentials } = {}) {
    const creds = credentials || this.credentials();
    if (!creds || !query) return null;
    const display = clamp(Number(limit) || 3, 1, 5); // 두 규격 모두 display 상한이 5입니다.
    if (creds.mode === 'hub') {
      return {
        mode: 'hub',
        url:
          NAVER_HUB_LOCAL_ENDPOINT +
          '?query=' +
          encodeURIComponent(query) +
          '&display=' +
          display +
          '&sort=comment' +
          '&format=json',
        headers: {
          'X-NCP-APIGW-API-KEY-ID': creds.clientId,
          'X-NCP-APIGW-API-KEY': creds.clientSecret,
        },
      };
    }
    return {
      mode: 'legacy',
      url: NAVER_LOCAL_ENDPOINT + '?query=' + encodeURIComponent(query) + '&display=' + display,
      headers: {
        'X-Naver-Client-Id': creds.clientId,
        'X-Naver-Client-Secret': creds.clientSecret,
      },
    };
  },
  /**
   * 두 규격을 모두 지원합니다. (키가 있는 쪽을 자동 선택)
   *
   * 1) NAVER API HUB — 2026년 최신 규격 · 우선 사용
   *    GET https://naverapihub.apigw.ntruss.com/search/v1/local?query=...&display=3&sort=comment&format=json
   *    헤더: X-NCP-APIGW-API-KEY-ID(Client ID) / X-NCP-APIGW-API-KEY(Client Secret)
   *
   * 2) 구 개발자센터 — 하위 호환 (HUB 키가 없을 때만)
   *    GET https://openapi.naver.com/v1/search/local.json?query=...&display=3
   *    헤더: X-Naver-Client-Id / X-Naver-Client-Secret
   *
   * 두 규격의 응답 items[] 모양은 같습니다:
   *    { title(<b>태그 포함>), category, address, roadAddress, mapx(경도), mapy(위도) }
   *
   * ⚠️ 브라우저 CORS: 네이버는 두 규격 모두 Access-Control-Allow-Origin을 주지 않습니다(HUB 포함).
   *    → iOS/Android(Expo Go·네이티브 빌드)에서는 그대로 동작합니다.
   *    → 웹(v1.4)에서는 아래처럼 **같은 출처 프록시 `/api/naver-local`** 을 씁니다.
   *      Vercel 함수가 서버 키로 대신 호출하므로 웹에서도 네이버 결과가 나오고,
   *      키는 브라우저 번들에 들어가지 않습니다.
   *      (프록시가 없는 정적 호스팅·`expo start --web` 개발 서버에서는 실패를 실패로 기록하고
   *       카카오·구글 결과로 계속 진행합니다 — 앱은 멈지지 않습니다.)
   */
  async search({ query, limit = 3 }) {
    const q = String(query || '').trim();
    if (!q) return [];
    if (isWebPlatform()) return this.searchViaProxy({ query: q, limit });
    const req = this.buildRequest({ query: q, limit });
    if (!req) return [];
    const res = await fetch(req.url, { method: 'GET', headers: req.headers });
    if (!res.ok) throw new Error('naver ' + res.status);
    const json = await res.json();
    return mapNaverItems(json && json.items);
  },
  /**
   * 웹 전용: `/api/naver-local?query=..&display=..` → 네이버 응답({ items })을 앱 후보로 옮깁니다.
   * 프록시가 없거나 실패하면 던집니다(→ searchPlaceProviders 가 failure 로 기록).
   * @returns {Promise<Array<object>>}
   */
  async searchViaProxy({ query, limit = 3 }) {
    const json = await fetchProxyJson(
      proxyPathOf('naver', { query, display: clamp(Number(limit) || 3, 1, 5) })
    );
    if (!json) throw new Error('naver-proxy');
    return mapNaverItems(json.items);
  },
};

// ─────────────────────────────────────────────────────────────
// 어댑터 3-C · 구글 Places (Text Search, 해외·영문/일문 장소 커버)
// ─────────────────────────────────────────────────────────────
export const googlePlacesAdapter = {
  id: 'google',
  label: '구글 Places',
  keyEnv: 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
  isConfigured() {
    return Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);
  },
  /**
   * POST https://places.googleapis.com/v1/places:searchText
   * 헤더: X-Goog-Api-Key, X-Goog-FieldMask
   * 바디: { textQuery, maxResultCount, languageCode }
   * 응답 places[] = { id, displayName.text, formattedAddress, location{latitude,longitude},
   *                   primaryTypeDisplayName.text, googleMapsUri, phone }
   * 해외(이시가키·오키나와 등) 장소는 카카오/네이버에 없으므로 구글이 사실상 주력입니다.
   */
  async search({ query, limit = 3, languageCode = 'ko' }) {
    const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || !query) return [];
    const res = await fetch(GOOGLE_TEXT_SEARCH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,' +
          'places.primaryTypeDisplayName,places.googleMapsUri,places.internationalPhoneNumber',
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: clamp(Number(limit) || 3, 1, 5),
        languageCode,
      }),
    });
    if (!res.ok) throw new Error('google ' + res.status);
    const json = await res.json();
    const places = (json && json.places) || [];
    return places.map((p, i) => {
      const address = p.formattedAddress || '';
      const rawCategory = [p.primaryTypeDisplayName && p.primaryTypeDisplayName.text, address]
        .filter(Boolean)
        .join(' ');
      return {
        id: 'google-' + (p.id || i),
        name: (p.displayName && p.displayName.text) || '',
        area: pickArea(address),
        category: mapCategory(rawCategory),
        rawCategory,
        menuTags: [],
        address,
        lat: Number(p.location && p.location.latitude),
        lng: Number(p.location && p.location.longitude),
        phone: p.internationalPhoneNumber || '',
        placeUrl: toOpenableUrl(p.googleMapsUri),
        placeUrlLabel: placeUrlLabelOf(p.googleMapsUri),
        provider: 'google',
        manual: false,
      };
    });
  },
};

export const MAP_PROVIDERS = [kakaoLocalAdapter, naverLocalAdapter, googlePlacesAdapter];

// ─────────────────────────────────────────────────────────────
// 병렬 조회 + 후보 병합
// ─────────────────────────────────────────────────────────────
const PROVIDER_WEIGHT_KO = { kakao: 0.9, naver: 0.86, google: 0.82 };
const PROVIDER_WEIGHT_LATIN = { kakao: 0.78, naver: 0.74, google: 0.92 };

/** 이름이 검색어와 얼마나 맞는지에 따라 신뢰도를 살짝 올립니다. */
function nameMatchBonus(itemName, query) {
  const n = normalizeName(itemName);
  const q = normalizeName(query);
  if (!n || !q || n.length < 2) return 0;
  if (n === q) return 0.08;
  if (q.includes(n) || n.includes(q)) return 0.05;
  return 0;
}

function mergeProviderResults(groups, query) {
  const latin = !/[가-힣]/.test(String(query || ''));
  const weights = latin ? PROVIDER_WEIGHT_LATIN : PROVIDER_WEIGHT_KO;
  const merged = [];

  for (const group of groups) {
    (group.items || []).forEach((item, index) => {
      const dup = merged.find((m) => samePlace(m, item));
      if (dup) {
        // 두 번째 지도가 같은 가게를 확인해 준 것 → 신뢰도 상승 + 빈 필드 보강
        dup.providers = Array.from(new Set([...(dup.providers || []), group.provider]));
        dup.confidence = clamp(Math.max(dup.confidence, (weights[group.provider] || 0.8) - index * 0.05) + 0.04, 0.3, 0.99);
        if (!dup.address && item.address) dup.address = item.address;
        if (!dup.placeUrl && item.placeUrl) {
          dup.placeUrl = item.placeUrl;
          dup.placeUrlLabel = item.placeUrlLabel || '';
        }
        if (!dup.phone && item.phone) dup.phone = item.phone;
        if (!dup.area && item.area) dup.area = item.area;
        return;
      }
      const confidence = clamp(
        (weights[group.provider] || 0.8) - index * 0.05 + nameMatchBonus(item.name, query),
        0.3,
        0.99
      );
      merged.push({ ...item, providers: [group.provider], confidence });
    });
  }

  merged.sort((a, b) => b.confidence - a.confidence);
  return merged.slice(0, MAX_MAP_RESULTS);
}

/**
 * 설정된 지도 API(카카오·네이버·구글)를 동시에 조회하고 후보를 합칩니다.
 * - 한 곳이 실패(401·네트워크·CORS)해도 나머지 결과로 후보를 채웁니다.
 * - 카카오만 찾고 네이버가 비었으면 **카카오 후보의 주소(동·도로명·구)** 로 네이버를
 *   보강 조회합니다(v2.12). 이름+좌표 200m/주소가 모두 맞을 때만 `naver` 로 합칩니다.
 * - 키가 하나도 없으면 아무 요청도 보내지 않고 빈 결과를 돌려줍니다(→ 오프라인 추출기 폴백).
 *
 * @param {{query:string, limit?:number, providers?:string[], backfill?:number}} options
 *        `backfill` 은 v2.12 네이버 보강 조회 허용 건수(기본 4, 0이면 끔).
 * @returns {Promise<{candidates:Array<object>, providersTried:string[], providersUsed:string[],
 *                    failures:Array<{provider:string,error:string}>, naverBackfill?:object, reason?:string}>}
 */
export async function searchPlaceProviders({ query, limit = 3, providers, backfill } = {}) {
  const q = String(query || '').trim();
  const empty = { candidates: [], providersTried: [], providersUsed: [], failures: [] };
  if (!q) return { ...empty, reason: 'empty-query' };

  const active = MAP_PROVIDERS.filter(
    (p) => p.isConfigured() && (!providers || providers.includes(p.id))
  );
  if (!active.length) return { ...empty, reason: 'no-key' };

  const results = await Promise.all(
    active.map(async (p) => {
      try {
        const items = await p.search({ query: q, limit });
        return { provider: p.id, ok: true, items: Array.isArray(items) ? items : [] };
      } catch (e) {
        return { provider: p.id, ok: false, items: [], error: String((e && e.message) || e) };
      }
    })
  );

  const groups = results.filter((r) => r.items.length).map((r) => ({ provider: r.provider, items: r.items }));
  const candidates = mergeProviderResults(groups, q);

  // ── v2.12 · 카카오만 찾았는데 네이버가 비었을 때 — 주소 기반 네이버 안전 교차 보강 ──
  //   `동대문 영화장` → 카카오 1곳 · 네이버 `items: []` 인 경우, `휘경로 영화장`·`동대문구 영화장`
  //   으로 네이버를 1~2회 더 물어 이름+좌표/주소가 맞는 것만 `naver` 로 합칩니다.
  let backfillResult;
  const naverTried = results.some((r) => r.provider === 'naver' && r.ok);
  const naverAllowed = !providers || providers.includes('naver');
  const budget = backfill == null ? NAVER_BACKFILL_MAX_QUERIES : Math.max(0, Number(backfill) || 0);
  const needsBackfill =
    naverTried &&
    naverAllowed &&
    budget > 0 &&
    candidates.some((c) => {
      const list = Array.isArray(c.providers) ? c.providers : [];
      return list.indexOf('naver') < 0 && (c.provider === 'kakao' || list.indexOf('kakao') >= 0);
    });
  if (needsBackfill) {
    backfillResult = await backfillNaverByAddress({ candidates, maxQueries: budget });
    if (backfillResult.matched) {
      // 보강으로 확인된 후보가 있으면 신뢰도 순서를 다시 잡고, 출처에도 네이버를 넣습니다.
      candidates.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    }
  }

  const usedProviders = groups.map((g) => g.provider);
  if (backfillResult && backfillResult.matched && usedProviders.indexOf('naver') < 0) {
    usedProviders.push('naver');
  }

  return {
    candidates,
    providersTried: results.map((r) => r.provider),
    providersUsed: usedProviders,
    failures: results.filter((r) => !r.ok).map((r) => ({ provider: r.provider, error: r.error })),
    naverBackfill: backfillResult,
    reason: candidates.length ? undefined : 'no-result',
  };
}

/**
 * 직접 검색 — 릴스 캡션을 못 긁어온 상황에서 '가게명/동네'만으로 지도 3사를 조회합니다.
 * 화면(PasteScreen '가게명으로 찾기' 모드)에서 그대로 호출하고, 결과 후보를 핀으로 꽂습니다.
 *
 * @param {string} rawQuery 예: '성수동 소금빵', '연남동 딸기케이크'
 * @param {{limit?:number, providers?:string[]}} options
 * @returns {Promise<{ok:boolean, query:string, candidates:Array<object>, message?:string,
 *                    reason?:string, usedAdapter?:string, providersTried:string[],
 *                    providersUsed:string[], failures:Array<object>}>}
 */
export async function searchPlacesDirect(rawQuery, options = {}) {
  const query = String(rawQuery || '')
    .replace(/\s+/g, ' ')
    .trim();
  const empty = { candidates: [], providersTried: [], providersUsed: [], failures: [] };

  if (!query) {
    return { ok: false, ...empty, query, reason: 'empty-query', message: '가게명이나 동네를 먼저 입력해 주세요.' };
  }
  if (query.length < 2) {
    return { ok: false, ...empty, query, reason: 'too-short', message: '두 글자 이상으로 찾아 주세요. (예: 성수동 소금빵)' };
  }

  const chain = await searchPlaceProviders({ query, limit: options.limit || 4, providers: options.providers });

  if (chain.candidates.length) {
    return {
      ok: true,
      query,
      candidates: chain.candidates,
      usedAdapter: chain.providersUsed.join('+'),
      providersTried: chain.providersTried,
      providersUsed: chain.providersUsed,
      failures: chain.failures,
      // v2.12 — 주소 기반 네이버 보강 내역(근거 추적용)
      naverBackfill: chain.naverBackfill,
    };
  }

  const message =
    chain.reason === 'no-key'
      ? '지도 API 키가 없어 직접 검색을 쓸 수 없어요. 릴스 링크로 저장하거나 .env 에 카카오·네이버 키를 넣어 주세요.'
      : '“' + query + '” 로 찾은 가게가 없어요. 동네 이름을 붙여 다시 찾아보세요. (예: 성수동 소금빵)';
  return {
    ok: false,
    ...empty,
    query,
    candidates: chain.candidates,
    providersTried: chain.providersTried,
    providersUsed: chain.providersUsed,
    failures: chain.failures,
    reason: chain.reason || 'no-result',
    message,
  };
}

/** v1.0 호환용: 네이버 로컬 단독 검색 API를 그대로 쓰던 자리 */
export const localSearchAdapter = {
  async search({ name, area }) {
    if (!name) return null;
    const chain = await searchPlaceProviders({ query: [area, name].filter(Boolean).join(' '), limit: 3 });
    return chain.candidates.length ? chain.candidates : null;
  },
};

// ─────────────────────────────────────────────────────────────
// 검색어 만들기 — LLM이 있으면 정확하게, 없으면 v1.2 키워드 정제기로
// ─────────────────────────────────────────────────────────────
function deriveQuery(text, llm) {
  if (llm && llm.name) {
    // 가게명에 이미 동네 이름이 들어 있으면('성수동 소금빵집') 중복해서 붙이지 않습니다.
    const name = String(llm.name);
    const area = String(llm.area || '');
    const query = area && !name.includes(area) ? area + ' ' + name : name;
    return {
      query,
      name,
      area,
      category: llm.category || '',
      menuTags: Array.isArray(llm.menuTags) ? llm.menuTags : [],
      queryList: query ? [query] : [],
    };
  }
  // 키가 없거나 LLM 결과가 비었을 때: v1.2 정제기가 만든 '지역+상호/메뉴' 후보를 순서대로 씁니다.
  const keyworded = extractSearchQueries(text);
  return {
    query: keyworded.queries[0] || '',
    name: keyworded.storeName || '',
    area: keyworded.area || '',
    category: (llm && llm.category) || keyworded.category || '',
    menuTags: llm && Array.isArray(llm.menuTags) ? llm.menuTags : [],
    queryList: keyworded.queries,
    keywords: keyworded.keywords,
    cleaned: keyworded.cleaned,
  };
}

// ─────────────────────────────────────────────────────────────
// 오프라인 스마트 추출기 — API 키 없이도 앱이 끝까지 동작하게 하는 안전망
// ─────────────────────────────────────────────────────────────
const PLACE_INDEX = [
  {
    name: '성수동 소금빵집',
    area: '성수동',
    category: '베이커리',
    menuTags: ['소금빵', '크루아상'],
    address: '서울 성동구 연무장길 00',
    lat: 37.5445,
    lng: 127.0557,
    keywords: ['소금빵', '성수', '연무장', '베이커리', '빵'],
  },
  {
    name: '똑섬 카페',
    area: '성수동',
    category: '카페',
    menuTags: ['크루아상', '아메리카노'],
    address: '서울 성동구 아차산로 00',
    lat: 37.5412,
    lng: 127.0611,
    keywords: ['똑섬', '성수 카페', '아차산로', '카페'],
  },
  {
    name: '연남동 딸기 케이크 맛집',
    area: '연남동',
    category: '디저트',
    menuTags: ['딸기 케이크', '라떼'],
    address: '서울 마포구 성미산로 00',
    lat: 37.56,
    lng: 126.925,
    keywords: ['딸기', '케이크', '연남', '디저트', '성미산로'],
  },
  {
    name: '망원동 우동 맛집',
    area: '망원동',
    category: '맛집',
    menuTags: ['붓카케 우동', '튀김'],
    address: '서울 마포구 월드컵로 00',
    lat: 37.556,
    lng: 126.902,
    keywords: ['우동', '망원', '월드컵로', '튀김'],
  },
  {
    name: '아라뱃길 뷰 카페',
    area: '검단',
    category: '카페',
    menuTags: ['핸드드립', '뷰맛집'],
    address: '인천 서구 아라뱃길 00',
    lat: 37.592,
    lng: 126.69,
    keywords: ['아라뱃길', '검단', '인천 카페', '핸드드립', '뷰'],
  },
  {
    name: '연무장길 로스터리',
    area: '성수동',
    category: '카페',
    menuTags: ['스페셜티', '플랫화이트'],
    address: '서울 성동구 연무장길 00',
    lat: 37.5432,
    lng: 127.0522,
    keywords: ['로스터리', '스페셜티', '플랫화이트'],
  },
];

const AREA_HINTS = ['성수', '연남', '망원', '검단', '홍대', '강남', '잠실', '여의도'];

function scorePlace(place, text) {
  const t = String(text || '').toLowerCase();
  let score = 0;
  for (const kw of place.keywords) {
    if (t.includes(String(kw).toLowerCase())) score += kw.length >= 3 ? 2 : 1;
  }
  if (t.includes(place.name.toLowerCase())) score += 4;
  return score;
}

/**
 * 오프라인 추출기: URL·캡션에서 키워드를 찾아 후보 1~3개를 만듭니다.
 * 후보가 하나도 안 잡히면 '그럴듯한 거짓 장소'를 만들지 않고
 * 사용자가 이름을 직접 넣을 수 있는 빈 후보 1개를 돌려줍니다.
 */
export function offlineSmartExtract(parsed, caption) {
  const haystack = [parsed.url, caption, parsed.contentId].filter(Boolean).join(' ');
  const ranked = PLACE_INDEX.map((p) => ({ place: p, score: scorePlace(p, haystack) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  // 후보가 1개뿐이면 같은 동네의 다른 저장 후보를 2번째로 붙여
  // '라디오로 골라 확정'하는 UX가 항상 성립하게 합니다.
  if (ranked.length === 1) {
    const chosen = ranked[0].place;
    const alt =
      PLACE_INDEX.find((p) => p !== chosen && p.area === chosen.area) ||
      PLACE_INDEX.find((p) => p !== chosen);
    if (alt) ranked.push({ place: alt, score: 0 });
  }

  if (ranked.length === 0) {
    const area = AREA_HINTS.find((a) => haystack.includes(a)) || '';
    const guessName = area ? area + ' 릴스 장소' : '이름 없는 릴스 장소';
    return [
      {
        id: 'manual-1',
        name: guessName,
        area,
        category: '맛집',
        menuTags: [],
        address: area ? area + ' 일대 (주소 확인 필요)' : '주소 확인 필요',
        lat: area === '검단' ? 37.592 : 37.5445,
        lng: area === '검단' ? 126.69 : 127.0557,
        confidence: 0.32,
        provider: 'offline',
        manual: true,
      },
    ];
  }

  return ranked.map((x, i) => ({
    id: 'offline-' + i,
    name: x.place.name,
    area: x.place.area,
    category: x.place.category,
    menuTags: x.place.menuTags,
    address: x.place.address,
    lat: x.place.lat,
    lng: x.place.lng,
    confidence: i === 0 ? 0.86 : 0.54,
    provider: 'offline',
    manual: false,
  }));
}

// ─────────────────────────────────────────────────────────────
// 메인 엔트리
// ─────────────────────────────────────────────────────────────
export const EXTRACT_STAGES = ['링크 확인', '캡션 분석', '지도 좌표 매칭'];

/**
 * @param {string} rawInput URL 하나, 또는 공유 시트에서 복사한 **문구 + URL** 덩어리
 * @param {{caption?: string, maxQueries?: number, gemini?: boolean, geminiTimeoutMs?: number,
 *          onStage?: (stage:number)=>void}} options
 *        `gemini:false` 면 영상 분석 폴백을 쓰지 않습니다. `onStage(3)` 는 Gemini 분석을 시작할 때
 *        화면 진행 문구를 'AI 영상 분석'으로 바꾸려고 부릅니다(없어도 동작).
 * @returns {Promise<{ok:boolean, reason?:string, platform?:string, platformLabel?:string,
 *                    title?: string, sourceTitle?: string, titleStatus?: string, titleNotice?: string,
 *                    suggestedQuery?: string, query?: string, queryList?: string[],
 *                    attempts?: Array<object>, candidates?: Array<object>, usedAdapter?: string,
 *                    providersTried?: string[], providersUsed?: string[], failures?: Array<object>}>}
 */
export async function extractPlaces(rawInput, options = {}) {
  const shared = splitSharedText(rawInput);
  const targetUrl = shared.url || String(rawInput == null ? '' : rawInput).trim();
  const parsed = parseUrl(targetUrl);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: shared.hasText
        ? '링크가 들어 있지 않아요. 공유 문구와 함께 링크를 붙여넣어 주세요.'
        : parsed.reason,
    };
  }

  const sharedCaption = String(options.caption || shared.caption || '').trim();
  const adapter = sourceAdapters[parsed.platform];
  const meta = adapter ? await adapter.fetchMetadata(parsed, sharedCaption) : null;
  const sourceTitle = String((meta && meta.title) || '').trim();
  const description = String((meta && meta.description) || '').trim();
  const comments = String((meta && meta.comments) || '').trim();
  // 같은 문구가 제목·설명글·공유 캡션에 겹쳐 오는 경우가 있어(인스타 공유 캡션), 한 번만 씁니다.
  const primaryText = Array.from(new Set([sourceTitle, description, sharedCaption].filter(Boolean))).join('\n');
  // 댓글은 잡담이 섞이기 쉽습니다. (v2.7)
  //  · 제목·설명글에서 **상호를 잡았으면** 댓글은 아예 쓰지 않습니다.
  //  · 제목·설명글에서 **동네를 확정했으면**, 댓글이 다른 동네를 가리키는 후보는 걷어냅니다.
  //    (“항상 솔직하게 말하셔서 좋다” → 댓글 폴백이 '울산 중구 떡볶이' 를 1순위로 올리던 문제)
  //  · 댓글은 검색어 후보(commentQueries)로만 쓰고, 기본 분석(text)에는 섞지 않습니다.
  const primary = extractSearchQueries(primaryText);
  const useComments = Boolean(comments) && !primary.storeName;
  const text = primaryText || '';
  const commentQueries = useComments
    ? filterQueriesByArea(
        extractSearchQueries([sourceTitle, comments].filter(Boolean).join('\n')).queries,
        primary.area
      )
    : [];

  // 제목·캡션을 못 읽은 경우를 화면에 그대로 알려 줍니다. (인스타 로그인 월 등)
  const blocked = !sourceTitle && BLOCKED_PLATFORMS.indexOf(parsed.platform) >= 0;
  const titleStatus = sourceTitle
    ? String((meta && meta.source) || '').indexOf('youtube') === 0
      ? 'video'
      : 'page'
    : sharedCaption
    ? 'caption'
    : blocked
    ? 'blocked'
    : 'none';
  // 제목도 캡션도 없으면 플랫폼과 상관없이 '가게명으로 찾기'로 이어 줍니다.
  const titleNotice =
    !sourceTitle && !sharedCaption
      ? titleNoticeOf(parsed.platform) + ' — 가게명으로 바로 찾아보세요.'
      : '';
  const suggested = extractSearchQueries(text || sharedCaption);
  const suggestedQuery = suggested.queries[0] || '';

  // 결과 공통부 — 모든 반환 경로가 같은 모양(제목·상태·안내)을 갖게 합니다.
  const baseInfo = {
    ok: true,
    ...parsed,
    sourceTitle,
    sourceDescription: description.slice(0, 500),
    sourceComments: comments.slice(0, 300),
    // v2.8 — 영상 썸네일(유튜브 hqdefault 등). 저장 화면 히어로 카드의 배경으로 씁니다.
    sourceThumbnail: String((meta && meta.thumbnail) || '').trim(),
    titleStatus,
    titleNotice,
    suggestedQuery,
    // v2.20 — 제목·설명글에 **표식이 붙은** 추천 메뉴·주차·아기/웨이팅만 초안으로 뽑습니다.
    //         (없는 정보는 지어내지 않습니다 — 재료가 없으면 빈 문자열)
    memoDraft: memoDraftFromText(primaryText),
  };

  // ── v2.0 (1) 네이버 지도 링크는 지도 검색 없이 placeId 로 직행 저장 ──
  if (options.resolvePlaceLink !== false) {
    const placeLink = await resolvePlaceLinkFromInput(
      [targetUrl].concat(shared.urls || []),
      { timeoutMs: options.linkTimeoutMs }
    );
    const direct = naverPlaceCandidate(placeLink);
    if (direct) {
      const coordsOk = Number.isFinite(direct.lat) && Number.isFinite(direct.lng);
      if (coordsOk) {
        return {
          ...baseInfo,
          mode: 'single',
          title: direct.name,
          // 네이버 플레이스에서 이름을 읽어 왔으니 '제목을 못 읽어와요' 안내는 띄우지 않습니다.
          sourceTitle: direct.name,
          titleStatus: 'page',
          titleNotice: '',
          candidates: [direct],
          query: direct.name,
          usedAdapter: 'naver-place-link',
          providersTried: [],
          providersUsed: ['naver'],
          failures: [],
          naverPlaceId: direct.naverPlaceId,
        };
      }
      // 좌표를 못 읽었으면 이름으로 지도에서 찾아 좌표를 채우고 placeId 를 붙입니다.
      const nameQuery = [direct.area, direct.name].filter(Boolean).join(' ');
      const res = await searchPlaceProviders({ query: nameQuery, limit: 3 });
      if (res.candidates && res.candidates.length) {
        const top = {
          ...res.candidates[0],
          placeUrl: direct.placeUrl,
          placeUrlLabel: direct.placeUrlLabel,
          naverPlaceId: direct.naverPlaceId,
        };
        return {
          ...baseInfo,
          mode: 'single',
          title: top.name,
          sourceTitle: top.name,
          titleStatus: 'page',
          titleNotice: '',
          candidates: [top],
          query: nameQuery,
          usedAdapter: 'naver-place-link',
          providersTried: res.providersTried,
          providersUsed: res.providersUsed,
          failures: res.failures,
          naverPlaceId: direct.naverPlaceId,
        };
      }
    }
  }

  // ── v2.0 (2) 설명글에 여러 가게가 적혀 있으면 후보를 각각 매칭 ──
  const listItems = options.multi === false ? [] : extractCandidatesFromText(text || sharedCaption);
  if (listItems.length >= 2) {
    const multi = await searchMultiPlaces(listItems, { limit: 3 });
    if (multi.candidates.length) {
      return {
        ...baseInfo,
        mode: 'multi',
        title: multi.candidates[0].name,
        candidates: multi.candidates.map((c) => ({ ...c, category: c.category || '맛집' })),
        items: multi.items,
        unmatched: multi.unmatched,
        duplicates: multi.duplicates,
        query: listItems.map((i) => i.queries[0]).filter(Boolean).join(' / '),
        usedAdapter: ['multi'].concat(multi.providersUsed).join('+'),
        providersTried: multi.providersTried,
        providersUsed: multi.providersUsed,
        failures: multi.failures,
      };
    }
  }

  // 1) 캡션 분석(LLM) → 검색어 후보 확정
  const llm = await llmAdapter.extractPlaceJson(text);
  const derived = deriveQuery(text, llm);
  const limitQueries = Math.max(1, Number(options.maxQueries) || 2);
  // 댓글에서 나온 후보(구체적인 상호)를 맨 앞에, 그 뒤에 제목·설명글 후보를 붙입니다.
  const derivedList =
    derived.queryList && derived.queryList.length
      ? derived.queryList
      : derived.query
      ? [derived.query]
      : [];
  const mergedList = [];
  commentQueries.concat(derivedList).forEach((q) => {
    const v = String(q || '').trim();
    if (v && mergedList.indexOf(v) < 0) mergedList.push(v);
  });
  const queryList = mergedList.slice(0, limitQueries);

  // 2) 후보 검색어를 순서대로 조회 + 후보 병합 (첫 후보로 결과가 없으면 다음 후보로 자동 재시도)
  let chain = {
    candidates: [],
    providersTried: [],
    providersUsed: [],
    failures: [],
    reason: 'empty-query',
  };
  let usedQuery = '';
  const attempts = [];
  let naverBackfill = { queries: [], matched: 0 };
  for (const q of queryList) {
    const res = await searchPlaceProviders({ query: q, limit: 3 });
    attempts.push({
      query: q,
      resultCount: (res.candidates || []).length,
      providersUsed: res.providersUsed || [],
      failures: res.failures || [],
      // v2.12 — 주소 기반 네이버 보강 조회 내역(근거 추적용)
      naverBackfill: res.naverBackfill && res.naverBackfill.matched ? res.naverBackfill : undefined,
      reason: res.reason,
    });
    if (res.naverBackfill && res.naverBackfill.matched) {
      naverBackfill = {
        queries: naverBackfill.queries.concat(res.naverBackfill.queries),
        matched: naverBackfill.matched + res.naverBackfill.matched,
      };
    }
    chain = {
      candidates: res.candidates || [],
      providersTried: Array.from(
        new Set([...(chain.providersTried || []), ...(res.providersTried || [])])
      ),
      providersUsed: Array.from(
        new Set([...(chain.providersUsed || []), ...(res.providersUsed || [])])
      ),
      failures: [...(chain.failures || []), ...(res.failures || [])],
      reason: res.reason,
    };
    if (chain.candidates.length) {
      usedQuery = q;
      break;
    }
  }

  const base = {
    ...baseInfo,
    mode: 'single',
    query: usedQuery || derived.query || '',
    queryList,
    attempts,
    naverBackfill,
  };

  if (chain.candidates.length) {
    const kind = [llm && llm.name ? 'llm' : null, ...chain.providersUsed].filter(Boolean).join('+');
    return {
      ...base,
      title: chain.candidates[0].name,
      candidates: chain.candidates.map((c) => ({
        ...c,
        // 지도사가 준 분류(rawCategory)가 있으면 그쪽이 정확합니다. LLM 분류는 지도가 말해 주지 않을 때만.
        category: c.rawCategory ? c.category : derived.category || c.category || '맛집',
        menuTags: derived.menuTags && derived.menuTags.length ? derived.menuTags : c.menuTags || [],
      })),
      usedAdapter: kind,
      providersTried: chain.providersTried,
      providersUsed: chain.providersUsed,
      failures: chain.failures,
    };
  }

  // ── v2.9 (3) 1차(제목·설명글·댓글 + 지도)로 **실매장을 못 찾았을 때만** Gemini 가 영상을 봅니다 ──
  //   · 유튜브 쇼츠만 대상입니다. (인스타·틱톡은 영상 접근이 막혀 있어 프록시도 빈 결과)
  //   · 정상적으로 찾은 릴스(디오디아2.0·엄마손횟집 등)는 위에서 이미 반환되므로
  //     여기까지 오지 않습니다 → 0.5초 만에 끝나고 Gemini 호출·크레딧을 쓰지 않습니다.
  //   · 웹(프록시)에서만 호출합니다. 네이티브는 키가 번들에 없어 건너뜁니다.
  let gemini = null;
  if (options.gemini !== false && parsed.platform === 'youtube' && isWebPlatform()) {
    if (typeof options.onStage === 'function') {
      try {
        options.onStage(3); // 화면 진행 문구를 'AI 영상 분석' 단계로
      } catch (e) {
        /* 화면 콜백 오류는 추출을 막지 않습니다 */
      }
    }
    gemini = await fetchGeminiAnalysis(
      parsed,
      { title: sourceTitle, description },
      { timeoutMs: options.geminiTimeoutMs }
    );
  }
  if (gemini && gemini.storeName) {
    // Gemini 가 읽은 상호·지역으로 카카오/네이버 지도를 **한 번 더** 조회합니다.
    const geminiQueries = geminiQueryList(gemini, 3);
    const geminiAttempts = [];
    let geminiChain = {
      candidates: [],
      providersTried: [],
      providersUsed: [],
      failures: [],
      reason: 'empty-gemini-query',
    };
    let geminiUsedQuery = '';
    for (const q of geminiQueries) {
      const res = await searchPlaceProviders({ query: q, limit: 3 });
      geminiAttempts.push({
        query: q,
        resultCount: (res.candidates || []).length,
        providersUsed: res.providersUsed || [],
        failures: res.failures || [],
        reason: res.reason,
      });
      geminiChain = {
        candidates: res.candidates || [],
        providersTried: Array.from(
          new Set([...(geminiChain.providersTried || []), ...(res.providersTried || [])])
        ),
        providersUsed: Array.from(
          new Set([...(geminiChain.providersUsed || []), ...(res.providersUsed || [])])
        ),
        failures: [...(geminiChain.failures || []), ...(res.failures || [])],
        reason: res.reason,
      };
      if (geminiChain.candidates.length) {
        geminiUsedQuery = q;
        break;
      }
    }
    const aiNote = geminiNoteOf(gemini);
    const geminiAdapter = ['gemini', ...geminiChain.providersUsed].filter(Boolean).join('+');
    const geminiMenuTags = menuTagsOfGemini(gemini);

    if (geminiChain.candidates.length) {
      return {
        ...base,
        title: geminiChain.candidates[0].name,
        query: geminiUsedQuery,
        queryList: geminiQueries,
        attempts: geminiAttempts,
        candidates: geminiChain.candidates.map((c) => ({
          ...c,
          // 지도사가 준 분류가 우선, 없을 때만 Gemini 분류
          category: c.rawCategory ? c.category : gemini.category || c.category || '맛집',
          menuTags: geminiMenuTags.length ? geminiMenuTags : c.menuTags || [],
        })),
        usedAdapter: geminiAdapter,
        providersTried: Array.from(new Set([...(chain.providersTried || []), ...geminiChain.providersTried])),
        providersUsed: geminiChain.providersUsed,
        failures: [...(chain.failures || []), ...geminiChain.failures],
        aiNote,
        aiAnalysis: gemini,
        // v2.20 — AI 가 영상에서 읽은 추천 메뉴·주차·아기/웨이팅을 설명글 초안 앞에 둡니다.
        memoDraft: mergeMemoDrafts(memoDraftOfParts(gemini.memo || {}), base.memoDraft),
      };
    }

    // 지도에서 좌표를 못 채웠어도 Gemini 가 영상에서 읽은 **실제 상호**는 버리지 않습니다.
    //  → 이름·동네가 채워진 수동 확인 후보(좌표 없음)로 넘기고, 화면에 근거를 밝힙니다.
    return {
      ...base,
      title: gemini.storeName,
      query: geminiQueries[0] || gemini.storeName,
      queryList: geminiQueries,
      attempts: geminiAttempts,
      candidates: [
        {
          id: 'gemini-1',
          name: gemini.storeName,
          area: gemini.area || findAreaFromText(text) || '',
          category: gemini.category || '맛집',
          menuTags: geminiMenuTags,
          address: gemini.area ? gemini.area + ' 일대 (주소 확인 필요)' : '주소 확인 필요',
          lat: null,
          lng: null,
          confidence: 0.62,
          provider: 'gemini',
          manual: true,
        },
      ],
      usedAdapter: geminiAdapter,
      providersTried: Array.from(new Set([...(chain.providersTried || []), ...geminiChain.providersTried])),
      providersUsed: geminiChain.providersUsed,
      failures: [...(chain.failures || []), ...geminiChain.failures],
      aiNote,
      aiAnalysis: gemini,
      memoDraft: mergeMemoDrafts(memoDraftOfParts(gemini.memo || {}), base.memoDraft),
    };
  }

  // 3) 지도 결과는 없지만 LLM이 장소명을 잡은 경우 → 수동 확인 후보
  if (llm && llm.name) {
    return {
      ...base,
      title: llm.name,
      candidates: [
        {
          id: 'llm-1',
          name: llm.name,
          area: llm.area || '',
          category: llm.category || '맛집',
          menuTags: llm.menuTags || [],
          address: llm.addressHint || '주소 확인 필요',
          lat: 37.5445,
          lng: 127.0557,
          confidence: 0.7,
          provider: 'llm',
          manual: true,
        },
      ],
      usedAdapter: 'llm',
      providersTried: chain.providersTried,
      providersUsed: chain.providersUsed,
      failures: chain.failures,
    };
  }

  // 4) 키가 없거나 전부 실패 → 오프라인 스마트 추출기
  const candidates = offlineSmartExtract(parsed, text || sharedCaption);
  return {
    ...base,
    title: candidates[0] ? candidates[0].name : parsed.platformLabel,
    candidates,
    // 키는 넣었는데 결과가 없었던 경우와, 키 자체가 없는 경우를 구분해 둡니다.
    usedAdapter: chain.providersTried.length ? 'offline-fallback' : 'offline',
    providersTried: chain.providersTried,
    providersUsed: chain.providersUsed,
    failures: chain.failures,
  };
}


/** '가게명으로 찾기' 모드의 원탭 예시 검색어 */
export const DIRECT_PRESETS = ['성수동 소금빵', '연남동 딸기케이크', '검단 카페'];

// 원탭 테스트용 프리셋 (실제 존재하는 릴스 링크 형식 그대로)
export const PRESETS = [
  {
    label: '성수 소금빵 릴스',
    url: 'https://www.instagram.com/reel/C8xSg2BpQ1K/',
    caption: '성수동 소금빵 맛집 다녀왔어요. 연무장길 골목 안쪽, 오픈런 필수!',
  },
  {
    label: '연남동 케이크 쇼츠',
    url: 'https://www.youtube.com/shorts/9Xk2mQpLz7A',
    caption: '연남동 딸기 케이크 맛집 | 성미산로 디저트 카페 추천',
  },
  {
    label: '검단 아라뱃길 카페',
    url: 'https://www.instagram.com/reel/C6aRaCafe9/',
    caption: '검단 아라뱃길 뷰 카페. 아이랑 가기 좋고 주차 무료!',
  },
];
