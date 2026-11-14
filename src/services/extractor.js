/**
 * services/extractor.js
 * ─────────────────────────────────────────────────────────────
 * 릴스/쇼츠 URL → 장소 후보 추출기.
 *
 * 구조 (v1.1 — 카카오·네이버·구글 3사 지도 API 통합)
 *   extractPlaces(url)
 *     ├─ parseUrl(url)                    … 플랫폼·ID 파싱
 *     ├─ SourceAdapter.fetchMetadata()    … 유튜브 / 인스타 메타데이터
 *     ├─ LlmAdapter.extractPlaceJson()    … 캡션 → {가게명·지역·메뉴·카테고리}
 *     ├─ searchPlaceProviders()           … 카카오 로컬 + 네이버 지역검색 + 구글 Places 병렬 조회 → 후보 병합
 *     └─ offlineSmartExtract()            … API 키가 하나도 없거나 전부 실패하면 오프라인 추출기로 폴백
 *
 * 설계 원칙
 *   1. 세 지도 API 키 중 **설정된 키만** 골라 동시에 조회하고, 한 곳이 실패해도 나머지 결과로 후보를 채웁니다.
 *   2. 키가 하나도 없으면 예전처럼 오프라인 스마트 추출기로 끝까지 동작합니다(앱이 멈추지 않음).
 *   3. 키는 app.json extra가 아니라 EXPO_PUBLIC_* 환경변수로만 넣습니다. (.env.example 참고)
 *      → Expo는 `process.env.EXPO_PUBLIC_XXX` 를 빌드 시점에 문자열로 치환하므로
 *        반드시 아래처럼 **직접 표기**해야 합니다. (`process.env[name]` 동적 접근은 치환되지 않음)
 */

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

export function isSupportedUrl(raw) {
  const parsed = parseUrl(raw);
  return parsed.ok && parsed.platform !== 'unknown';
}

// ─────────────────────────────────────────────────────────────
// 어댑터 1 · 소스 메타데이터 (유튜브 Data API / 인스타 og 태그)
// ─────────────────────────────────────────────────────────────
export const sourceAdapters = {
  youtube: {
    keyEnv: 'EXPO_PUBLIC_YOUTUBE_API_KEY',
    /**
     * 유튜브 Data API v3 videos.list (part=snippet) 1유닛.
     * @returns {Promise<{title:string, description:string, thumbnail?:string}|null>}
     */
    async fetchMetadata(parsed) {
      const key = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;
      if (!key) return null; // 키 없음 → 오프라인 추출기로 폴백
      try {
        const endpoint =
          'https://www.googleapis.com/youtube/v3/videos?part=snippet&id=' +
          encodeURIComponent(parsed.contentId) +
          '&key=' +
          encodeURIComponent(key);
        const res = await fetch(endpoint);
        if (!res.ok) return null;
        const json = await res.json();
        const item = json && json.items && json.items[0];
        if (!item) return null;
        return {
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnail:
            item.snippet.thumbnails && item.snippet.thumbnails.high
              ? item.snippet.thumbnails.high.url
              : null,
        };
      } catch (e) {
        return null;
      }
    },
  },
  instagram: {
    /**
     * 인스타는 공식 캡션 API를 열어 주지 않습니다.
     * 공유 시트에서 넘어온 캡션(caption)을 우선 쓰고, 없으면 og 메타데이터 best-effort.
     * v1.0은 '캡션 없음'이 기본값이라고 보고 후보 1탭 확인 UX로 보완합니다.
     */
    async fetchMetadata(parsed, sharedCaption) {
      if (sharedCaption) return { title: '', description: sharedCaption, thumbnail: null };
      return null;
    },
  },
  tiktok: {
    async fetchMetadata() {
      return null; // v1.0 범위 밖 (약관 확인 후 v1.1)
    },
  },
  naver: {
    async fetchMetadata() {
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
    words: ['관광', '명소', '공원', '미술관', '박물관', '전시', '해변', '전망대', 'tourist', 'park', 'museum', 'attraction', 'garden', 'viewpoint'],
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

/**
 * 엑스포 웹(브라우저) 빌드 여부.
 * 네이버 지역검색은 응답에 CORS 헤더를 주지 않아 브라우저에서 호출하면 막힙니다(아래 주석 참고).
 */
function isWebRuntime() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

// ─────────────────────────────────────────────────────────────
// 어댑터 3-A · 카카오 로컬 (키워드 장소 검색)
// ─────────────────────────────────────────────────────────────
export const kakaoLocalAdapter = {
  id: 'kakao',
  label: '카카오 로컬',
  keyEnv: 'EXPO_PUBLIC_KAKAO_REST_API_KEY',
  isConfigured() {
    return Boolean(process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY);
  },
  /**
   * GET https://dapi.kakao.com/v2/local/search/keyword.json?query=성수 소금빵집&size=3
   * 응답 documents[] = { place_name, category_name, category_group_code, phone,
   *                       address_name, road_address_name, x(경도), y(위도), place_url }
   * → 도로명주소·위경도·카테고리·카카오맵 Place URL을 그대로 후보로 옮깁니다.
   */
  async search({ query, limit = 3 }) {
    const key = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
    if (!key || !query) return [];
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
    const docs = (json && json.documents) || [];
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
        placeUrl: String(d.place_url || '').replace(/^http:/, 'https:'),
        provider: 'kakao',
        manual: false,
      };
    });
  },
};

// ─────────────────────────────────────────────────────────────
// 어댑터 3-B · 네이버 지역검색 (지오코딩 보조)
// ─────────────────────────────────────────────────────────────
export const naverLocalAdapter = {
  id: 'naver',
  label: '네이버 지역검색',
  keyEnvs: ['EXPO_PUBLIC_NAVER_CLIENT_ID', 'EXPO_PUBLIC_NAVER_CLIENT_SECRET'],
  isConfigured() {
    return Boolean(process.env.EXPO_PUBLIC_NAVER_CLIENT_ID && process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET);
  },
  /**
   * GET https://openapi.naver.com/v1/search/local.json?query=성수 소금빵집&display=3
   * 헤더: X-Naver-Client-Id / X-Naver-Client-Secret
   * 응답 items[] = { title(<b>태그 포함>), category, address, roadAddress, mapx(경도), mapy(위도) }
   *
   * ⚠️ 브라우저 CORS: 네이버 오픈 API는 Access-Control-Allow-Origin을 주지 않습니다.
   *    → iOS/Android(Expo Go·네이티브 빌드)에서는 그대로 동작하지만,
   *      `expo start --web` / `expo export --platform web` 브라우저에서는 요청이 차단됩니다.
   *    그래서 웹 런타임에서는 이 어댑터를 건너뛰고(콘솔 에러 방지) 카카오·구글 결과로 채웁니다.
   *    웹에서도 네이버 결과가 꼭 필요하면 서버리스 프록시(예: /api/naver-local)를 두고
   *    그 주소로 fetch하는 방식으로 우회해야 합니다. (키를 브라우저에 노출하지 않는 편이 안전)
   */
  async search({ query, limit = 3 }) {
    const clientId = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID;
    const clientSecret = process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET;
    if (!clientId || !clientSecret || !query) return [];
    if (isWebRuntime()) return []; // 위 CORS 주석 참고 — 웹에서는 조용히 건너뜁니다.

    const url =
      NAVER_LOCAL_ENDPOINT +
      '?query=' +
      encodeURIComponent(query) +
      '&display=' +
      clamp(Number(limit) || 3, 1, 5);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });
    if (!res.ok) throw new Error('naver ' + res.status);
    const json = await res.json();
    const items = (json && json.items) || [];
    return items.map((it, i) => {
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
        phone: '',
        placeUrl: '',
        provider: 'naver',
        manual: false,
      };
    });
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
        placeUrl: p.googleMapsUri || '',
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
        if (!dup.placeUrl && item.placeUrl) dup.placeUrl = item.placeUrl;
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
 * - 키가 하나도 없으면 아무 요청도 보내지 않고 빈 결과를 돌려줍니다(→ 오프라인 추출기 폴백).
 *
 * @param {{query:string, limit?:number, providers?:string[]}} options
 * @returns {Promise<{candidates:Array<object>, providersTried:string[], providersUsed:string[],
 *                    failures:Array<{provider:string,error:string}>, reason?:string}>}
 */
export async function searchPlaceProviders({ query, limit = 3, providers } = {}) {
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

  return {
    candidates,
    providersTried: results.map((r) => r.provider),
    providersUsed: groups.map((g) => g.provider),
    failures: results.filter((r) => !r.ok).map((r) => ({ provider: r.provider, error: r.error })),
    reason: candidates.length ? undefined : 'no-result',
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
// 검색어 만들기 — LLM이 있으면 정확하게, 없으면 캡션 첫 문장으로
// ─────────────────────────────────────────────────────────────
function deriveQuery(text, llm) {
  if (llm && llm.name) {
    return {
      query: [llm.area, llm.name].filter(Boolean).join(' '),
      name: llm.name,
      area: llm.area || '',
      category: llm.category || '',
      menuTags: Array.isArray(llm.menuTags) ? llm.menuTags : [],
    };
  }
  // LLM 키가 없을 때의 2차 폴백: 해시태그·링크·이모지를 걷어낸 첫 문장을 검색어로 씁니다.
  // (구글 Text Search는 자연어 문장도 잘 받아 주고, 카카오/네이버는 앞부분 키워드 위주로 매칭합니다)
  const cleaned = String(text || '')
    .replace(/#[^\s#]+/g, ' ')
    .replace(/@[A-Za-z0-9._]+/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const llmExtras = {
    category: (llm && llm.category) || '',
    menuTags: llm && Array.isArray(llm.menuTags) ? llm.menuTags : [],
  };
  if (!cleaned) return { query: '', name: '', area: '', ...llmExtras };
  const first = cleaned.split(/[|\n·,]/)[0].trim() || cleaned;
  return { query: first.slice(0, 40), name: '', area: '', ...llmExtras };
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
 * @param {string} rawUrl
 * @param {{caption?: string}} options
 * @returns {Promise<{ok:boolean, reason?:string, platform?:string, platformLabel?:string,
 *                    title?: string, candidates?: Array<object>, usedAdapter?: string,
 *                    providersTried?: string[], providersUsed?: string[], failures?: Array<object>}>}
 */
export async function extractPlaces(rawUrl, options = {}) {
  const parsed = parseUrl(rawUrl);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason };
  }

  const adapter = sourceAdapters[parsed.platform];
  const meta = adapter ? await adapter.fetchMetadata(parsed, options.caption) : null;
  const text = [meta && meta.title, meta && meta.description, options.caption]
    .filter(Boolean)
    .join('\n');

  // 1) 캡션 분석(LLM) → 검색어 확정
  const llm = await llmAdapter.extractPlaceJson(text);
  const derived = deriveQuery(text, llm);

  // 2) 카카오·네이버·구글 병렬 조회 + 후보 병합 (설정된 키만)
  const chain = derived.query
    ? await searchPlaceProviders({ query: derived.query, limit: 3 })
    : { candidates: [], providersTried: [], providersUsed: [], failures: [], reason: 'empty-query' };

  if (chain.candidates.length) {
    const kind = [llm && llm.name ? 'llm' : null, ...chain.providersUsed].filter(Boolean).join('+');
    return {
      ok: true,
      ...parsed,
      title: chain.candidates[0].name,
      candidates: chain.candidates.map((c) => ({
        ...c,
        // LLM이 분류한 카테고리가 더 구체적이면 그쪽을 우선
        category: derived.category || c.category || '맛집',
        menuTags: derived.menuTags && derived.menuTags.length ? derived.menuTags : c.menuTags || [],
      })),
      usedAdapter: kind,
      query: derived.query,
      providersTried: chain.providersTried,
      providersUsed: chain.providersUsed,
      failures: chain.failures,
    };
  }

  // 3) 지도 결과는 없지만 LLM이 장소명을 잡은 경우 → 수동 확인 후보
  if (llm && llm.name) {
    return {
      ok: true,
      ...parsed,
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
      query: derived.query,
      providersTried: chain.providersTried,
      providersUsed: chain.providersUsed,
      failures: chain.failures,
    };
  }

  // 4) 키가 없거나 전부 실패 → 오프라인 스마트 추출기
  const candidates = offlineSmartExtract(parsed, text || options.caption || '');
  return {
    ok: true,
    ...parsed,
    title: candidates[0] ? candidates[0].name : parsed.platformLabel,
    candidates,
    // 키는 넣었는데 결과가 없었던 경우와, 키 자체가 없는 경우를 구분해 둡니다.
    usedAdapter: chain.providersTried.length ? 'offline-fallback' : 'offline',
    query: derived.query || '',
    providersTried: chain.providersTried,
    providersUsed: chain.providersUsed,
    failures: chain.failures,
  };
}

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
