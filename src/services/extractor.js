/**
 * services/extractor.js
 * ─────────────────────────────────────────────────────────────
 * 릴스/쇼츠 URL → 장소 후보 추출기.
 *
 * 구조 (v1.0)
 *   extractPlaces(url)
 *     ├─ parseUrl(url)                    … 플랫폼·ID 파싱
 *     ├─ SourceAdapter.fetchMetadata()    … 유튜브 / 인스타 메타데이터
 *     ├─ LlmAdapter.extractPlaceJson()    … 캡션 → {가게명·지역·메뉴·카테고리}
 *     ├─ LocalSearchAdapter.search()      … 네이버·카카오 로컬 → 좌표·도로명주소
 *     └─ offlineSmartExtract()            … API 키가 없어도 동작하는 오프라인 추출기
 *
 * 지금은 API 키가 없으므로 마지막 단계(오프라인 추출기)만 실제로 동작하고,
 * 나머지 어댑터는 키를 채우는 순간 그대로 살아나도록 자리와 입출력 규격을 잡아 두었습니다.
 * (키는 app.json extra가 아니라 EXPO_PUBLIC_* 환경변수로만 넣습니다.)
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
// 어댑터 3 · 로컬 검색 지오코딩 (네이버 / 카카오)
// ─────────────────────────────────────────────────────────────
export const localSearchAdapter = {
  /**
   * 가게명 + 지역 → 후보 3개(좌표·도로명주소 포함).
   * 네이버 지역검색은 서버에서 호출해야 키가 노출되지 않습니다.
   * 여기서는 앱에서 직접 호출하는 형태로 규격만 잡아 두었습니다.
   */
  async search({ name, area }) {
    const key = process.env.EXPO_PUBLIC_NAVER_SEARCH_KEY_ID;
    const secret = process.env.EXPO_PUBLIC_NAVER_SEARCH_SECRET;
    if (!key || !secret || !name) return null;
    try {
      const query = encodeURIComponent([area, name].filter(Boolean).join(' '));
      const res = await fetch('https://openapi.naver.com/v1/search/local.json?query=' + query + '&display=3', {
        headers: { 'X-Naver-Client-Id': key, 'X-Naver-Client-Secret': secret },
      });
      if (!res.ok) return null;
      const json = await res.json();
      const items = (json && json.items) || [];
      return items.map((it, i) => ({
        id: 'naver-' + i,
        name: stripTags(it.title),
        area: area || '',
        category: it.category || '',
        address: it.roadAddress || it.address || '',
        lat: Number(it.mapy) / 1e7,
        lng: Number(it.mapx) / 1e7,
        menuTags: [],
      }));
    } catch (e) {
      return null;
    }
  },
};

function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, '');
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
 *                    title?: string, candidates?: Array<object>, usedAdapter?: string}>}
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

  // 1) LLM 추출 + 로컬 지오코딩이 가능한 경우
  const llm = await llmAdapter.extractPlaceJson(text);
  if (llm && llm.name) {
    const geo = await localSearchAdapter.search({ name: llm.name, area: llm.area });
    if (geo && geo.length) {
      return {
        ok: true,
        ...parsed,
        title: llm.name,
        candidates: geo.map((g, i) => ({
          ...g,
          category: llm.category || g.category || '맛집',
          menuTags: llm.menuTags || [],
          confidence: i === 0 ? 0.9 : 0.6,
        })),
        usedAdapter: 'llm+local',
      };
    }
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
          manual: true,
        },
      ],
      usedAdapter: 'llm',
    };
  }

  // 2) 키가 없거나 실패 → 오프라인 스마트 추출기
  const candidates = offlineSmartExtract(parsed, text || options.caption || '');
  return {
    ok: true,
    ...parsed,
    title: candidates[0] ? candidates[0].name : parsed.platformLabel,
    candidates,
    usedAdapter: 'offline',
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
