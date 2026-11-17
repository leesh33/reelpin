/**
 * api/gemini.js — Vercel Serverless Function
 * ─────────────────────────────────────────────────────────────
 * POST /api/gemini
 *   ① 영상 모드:  body { url: "https://youtube.com/shorts/…", title?, description? }
 *   ② 사진 모드:  body { imageBase64: "…" | "data:image/jpeg;base64,…", mimeType?: "image/jpeg", hint? }
 *   응답: { storeName, area, menu, category, places: [{ name, area, menu }], kind: 'video'|'image' }
 *
 * 왜 서버를 거치나
 *   · Gemini 키는 **서버 환경변수(`GEMINI_API_KEY`)에만** 둡니다.
 *     브라우저 번들(`EXPO_PUBLIC_*`)에는 절대 넣지 않습니다 — 키 노출 0건.
 *   · 유튜브 URL은 Gemini 가 `fileData.fileUri` 로 **직접 시청**합니다.
 *     (영상 속 말·화면 자막을 함께 읽으므로, 제목·설명글에 상호가 없어도 찾을 수 있음)
 *
 * 규칙
 *   1. 키가 없으면 503 `{ error: 'gemini-not-configured' }` — 앱은 조용히 기존 폴백으로 이어집니다.
 *   2. 유튜브 URL이 아니거나(인스타 등) 가게를 특정하지 못하면 **200 + 빈 결과**
 *      `{ storeName: '', area: '', menu: '', category: '', places: [] }` 로 조용히 돌려줍니다.
 *   3. 실패 응답에 **키·업스트림 본문을 담지 않습니다.** (로그에도 키를 찍지 않음)
 *   4. 키는 쿼리스트링이 아니라 `x-goog-api-key` 헤더로 보냅니다. (프록시 로그·Referer 에 남지 않게)
 *   5. CORS 헤더를 열지 않아 우리 사이트에서만 호출됩니다.
 *   6. Gemini 영상 분석은 모델에 따라 오래 걸립니다 — 기본 `gemini-3.5-flash-lite` 는 실측 4초대,
 *      무거운 모델은 24~50초+. 타임아웃 55초 + `maxDuration` 60초 안에서만 기다립니다.
 *   7. (v2.13) 사진 모드는 `inlineData { mimeType, data }` 로 보냅니다. Vercel 요청 본문 한도가
 *      4.5MB 라, base64 가 4,000,000자(원본 약 3MB)를 넘으면 업스트림을 부르지 않고
 *      **413 `image-too-large`** 로 안내합니다. (앱은 업로드 전에 1280px·JPEG 0.82 로 줄입니다)
 *   8. (v2.13) 사진 모드에서도 가게를 못 읽으면 200 빈 결과 — 앱은 "사진에서 가게를 못 찾았어요"로 안내합니다.
 */
const { fetchWithTimeout, sendJson, warn } = require('../server/http.js');

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
/**
 * 모델이 폐기·미제공이면(404/400) 이 순서로 내려갑니다. (앞의 기본 모델과 중복은 modelCandidates 가 제거)
 *   실측(2026-11-16, 같은 키·같은 영상):
 *     · gemini-3.5-flash-lite → 약 4초 (`_Yc2CwHTKtY` → 영화장 / LPLE_SH2b9U → 착한부대찌개)
 *     · gemini-3.8-flash      → 영상에 따라 24~50초+ (55초 타임아웃으로 실패한 적 있음)
 *   → 속도를 위해 lite 를 기본으로 두고, lite 가 없을 때만 무거운 모델로 내려갑니다.
 */
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
/**
 * 한 번의 영상 분석 응답 타임아웃.
 *   실측: 기본 `gemini-3.5-flash-lite` 는 약 4초 — 이 상한에 거의 닿지 않습니다.
 *        (무거운 폴백 모델은 24초 ~ 50초+ 로 흔들립니다 — 무료 등급 대기열 영향으로 보임)
 *   → 55초까지 기다리고, 넘기면 앱은 조용히 기존 폴백으로 이어집니다.
 */
const GEMINI_TIMEOUT_MS = 55000;
/** 모델 폴백까지 포함한 전체 예산 — Vercel maxDuration 60초 안 */
const TOTAL_BUDGET_MS = 57000;
/** 요청 본문 상한 — URL 모드(제목·설명글 몇 줄)에도 넉넉하고, 사진 모드 base64 도 담을 수 있게 4.4MB */
const MAX_BODY_BYTES = 4.4 * 1024 * 1024;
/** 사진 모드 base64 상한 — Vercel 요청 본문 4.5MB 안 (base64 4,000,000자 ≈ 원본 3MB) */
const MAX_IMAGE_BASE64_CHARS = 4000000;
/** Gemini 가 받는 사진 형식 (앱은 항상 jpeg 로 변환해 보냅니다) */
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_TITLE_CHARS = 200;
const MAX_DESCRIPTION_CHARS = 1800;
const MAX_PLACES = 3;
/** 사진 모드는 목록형 캡처(여러 가게)를 담아야 해서 조금 더 뽑습니다. */
const MAX_IMAGE_PLACES = 6;

/** 실패·미확인 시 돌려주는 빈 결과 — 앱은 이 모양만 보고 폴백합니다. */
function emptyResult(reason) {
  return {
    storeName: '',
    area: '',
    menu: '',
    category: '',
    places: [],
    // v2.20 — 한줄 메모 초안 재료 (없으면 빈 문자열 — 앱은 메모를 비워 둡니다)
    memo: { recommendedMenu: '', parking: '', kidsOrWaitingTip: '' },
    reason: String(reason || ''),
  };
}

function cleanText(value, maxLength) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * 유튜브 URL만 통과시킵니다. (인스타·임의 주소로 Gemini 키를 쓰지 못하게)
 * shorts·youtu.be·watch·embed·live 모두 **watch 주소**로 정규화합니다.
 * @returns {string} `https://www.youtube.com/watch?v=<id>` 또는 '' (유튜브 아님)
 */
function normalizeYouTubeUrl(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!/^https?:\/\//i.test(text)) return '';
  let parsed = null;
  try {
    parsed = new URL(text);
  } catch (e) {
    return '';
  }
  const host = String(parsed.hostname || '').toLowerCase().replace(/^(www|m|music)\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'youtube-nocookie.com') return '';
  let id = '';
  if (host === 'youtu.be') {
    id = parsed.pathname.slice(1).split('/')[0];
  } else if (/^\/watch\/?$/.test(parsed.pathname)) {
    id = parsed.searchParams.get('v') || '';
  } else {
    const m = /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{6,20})/.exec(parsed.pathname);
    if (m) id = m[1];
  }
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(String(id || ''))) return '';
  return 'https://www.youtube.com/watch?v=' + id;
}

/** ms 만큼 쉬기 (503 재시도 사이) */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

/** Vercel 은 JSON 본문을 req.body 로 주지만, 로컬·테스트를 위해 스트림도 읽습니다. */
function readBody(req) {
  if (req && req.body != null) {
    if (typeof req.body === 'object') return Promise.resolve(req.body);
    if (typeof req.body === 'string') {
      try {
        return Promise.resolve(JSON.parse(req.body));
      } catch (e) {
        return Promise.resolve(null);
      }
    }
  }
  if (!req || typeof req.on !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    let size = 0;
    let raw = '';
    req.on('data', (chunk) => {
      size += chunk && chunk.length ? chunk.length : 0;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        if (typeof req.destroy === 'function') req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch (e) {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

const SYSTEM_INSTRUCTION = [
  '너는 한국 맛집·카페 릴스/쇼츠 영상에서 "실제로 나온 가게"를 찾아내는 도우미다.',
  '영상의 음성(말소리)과 화면에 보이는 자막·간판·메뉴판 글자를 함께 보고 판단한다.',
  '규칙:',
  '1) 영상에 실제로 나온 이름만 적는다. 추측·창작·일반화 금지. 확실하지 않으면 빈 문자열.',
  '2) storeName: 영상에서 확인되는 가게 상호. "맛집", "릴스", "카페" 같은 일반 명사는 쓰지 않는다.',
  '3) area: 동네·지역 단위 (예: 성수동, 연남동, 제주 연동). 모르면 "".',
  '4) menu: 영상에 나온 대표 메뉴 1~3개를 쉼표로 구분한 한 줄.',
  '5) category: 맛집|카페|디저트|베이커리|가볼곳|기타 중 하나.',
  '6) places: 영상에 서로 다른 가게가 여러 곳 나오면 최대 3곳까지 [{name, area, menu}].',
  '7) 가게를 하나도 특정할 수 없으면 storeName 을 "" 로, places 를 [] 로 둔다.',
  // v2.20 — 저장 화면의 한줄 메모를 자동으로 채우기 위한 재료. 확인된 것만.
  '8) memo.recommendedMenu: 영상에서 확인된 대표 메뉴 이름 하나(예: "지로케 라멘"). 메뉴가 여럿이면 가장 많이 강조된 것. 없으면 "".',
  '9) memo.parking: 주차에 대한 말이 나오면 "주차 불가"·"주차 가능"·"무료 주차"처럼 짧게. 나오지 않으면 "".',
  '10) memo.kidsOrWaitingTip: 아기의자·유아 동반·웨이팅(대기)에 대한 말이 나오면 "아기의자 있음"·"웨이팅 있음"처럼 짧게. 없으면 "".',
  '11) 8~10 은 **영상에서 확인된 내용만** 적는다. 추측·일반론("보통 웨이팅이 있다")은 금지. 모르면 빈 문자열.',
].join('\n');

/** 요청 본문 — 영상 + 참고용 메타데이터(제목·설명글) */
function buildRequestBody({ videoUrl, title, description, thinking }) {
  const hints = [];
  if (title) hints.push('영상 제목: ' + title);
  if (description) hints.push('영상 설명글: ' + description);
  const ask =
    '이 영상을 보고, 영상에 나온 가게 정보를 아래 키만 가진 JSON 하나로 답해줘(설명·코드블록 없이).\n' +
    '{"storeName":"가게 상호","area":"동네","menu":"대표 메뉴 1~3개(쉼표)","category":"맛집|카페|디저트|베이커리|가볼곳|기타","places":[{"name":"","area":"","menu":""}],' +
    '"memo":{"recommendedMenu":"","parking":"","kidsOrWaitingTip":""}}\n' +
    '영상 속 말(음성)과 화면 자막·간판에서 실제 가게 이름을 찾아줘. 없으면 빈 문자열로 두고 지어내지 마.\n' +
    'memo 는 영상에 실제로 나온 추천 메뉴·주차·아기/웨이팅 정보만 적고, 확인되지 않으면 빈 문자열로 둬.' +
    (hints.length ? '\n\n[참고 — 영상 메타데이터]\n' + hints.join('\n') : '');
  const generationConfig = {
    temperature: 0.2,
    maxOutputTokens: 4096, // Gemini 3 는 '생각' 토큰도 여기서 나가므로 넉넉히
    // JSON 만 받습니다. (responseSchema 는 구조를 보장하지만 영상 분석이 26초를 넘겨
    //  타임아웃이 났습니다 — 형식은 시스템 프롬프트로 강제하고 앱에서 느슨하게 파싱합니다)
    responseMimeType: 'application/json',
  };
  // '생각' 토큰은 영상 분석 지연의 가장 큰 몫입니다 — 모델 세대마다 옵션 이름이 달라서
  // ① Gemini 3: thinkingLevel LOW ② Gemini 2.5: thinkingBudget 0 ③ 옵션 없음 순서로 시도합니다.
  if (thinking === 'level') generationConfig.thinkingConfig = { thinkingLevel: 'LOW' };
  else if (thinking === 'budget') generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: 'user',
        parts: [
          { fileData: { fileUri: videoUrl, mimeType: 'video/*' } },
          { text: ask },
        ],
      },
    ],
    generationConfig,
  };
}

/**
 * 사진(인스타 캡처·스크린샷·매장 사진) 분석용 지시문 (v2.13)
 *   영상 지시문과 달리 **화면 글자(캡션·위치 태그·해시태그)** 를 근거로 삼고,
 *   앱 UI 글자(팔로우·좋아요·조회수)를 상호로 오인하지 않게 못 박습니다.
 *   목록형 캡처는 places 로 여러 곳을 뽑습니다.
 */
const IMAGE_SYSTEM_INSTRUCTION = [
  '너는 인스타그램 릴스·피드 캡처, 스크린샷, 매장 사진에서 "실제로 나온 가게"를 찾아내는 도우미다.',
  '사진에 적힌 글자(상호·간판·메뉴판·캡션·위치 태그·해시태그)를 읽어 판단한다.',
  '규칙:',
  '1) 사진에 실제로 적힌 이름만 적는다. 추측·창작·일반화 금지. 확실하지 않으면 빈 문자열.',
  '2) storeName: 사진에서 확인되는 가게 상호. "맛집", "릴스", "카페" 같은 일반 명사와 앱 UI 글자(팔로우·좋아요·댓글·조회수·더보기)는 쓰지 않는다.',
  // v2.26 — 간판의 숫자·기간을 떼어 내 상호를 반쪽만 읽던 문제 ("3일 한우국밥" → "한우국밥")
  '2-1) 간판에서 **숫자·기간이 앞이나 뒤에 붙은 상호는 숫자를 떼지 말고 통째로** 읽는다. 숫자도 상호의 일부다 — "3일 한우국밥"(×한우국밥), "24시 국밥", "1988", "3대째 손칼국수", "1.5℃ 커피".',
  '2-2) 간판이 흐리게 찍혔거나 일부가 가려졌어도 **보이는 글자를 모두 이어 붙여** 읽는다. 간판 왼쪽·가장자리에 작게 붙은 숫자·기간 표기도 놓치지 않는다. 읽지 못한 글자는 지어내지 말고, 읽은 글자만 붙여 적는다.',
  '2-3) 화면 캡처(스크린샷) 안에 매장 사진·영상이 들어 있으면 **그 사진 속 간판**을 먼저 읽는다. 앱 UI 글자(상단 제목·버튼·주소 안내·"AI 사진 분석")는 상호가 아니다.',
  '3) area: 동네·지역 단위 (예: 성수동, 연남동, 제주 연동). 간판·캡션·위치 태그에 도로명이 적혀 있으면 도로명까지 그대로 옮긴다(예: 영등포로36길, 테헤란로). 모르면 "".',
  '4) menu: 사진에 나온 대표 메뉴 1~3개를 쉼표로 구분한 한 줄.',
  '5) category: 맛집|카페|디저트|베이커리|가볼곳|기타 중 하나.',
  '6) places: 사진에 서로 다른 가게가 여러 곳(목록형 캡처)이면 최대 6곳까지 [{name, area, menu}].',
  '7) 가게를 하나도 특정할 수 없으면 storeName 을 "" 로, places 를 [] 로 둔다.',
  // v2.20 — 한줄 메모 재료. 사진에 적힌 글자에 있는 것만.
  '8) memo.recommendedMenu: 사진에 적힌 대표 메뉴 이름 하나(없으면 "").',
  '9) memo.parking: 사진에 주차 안내가 적혀 있으면 "주차 불가"·"주차 가능"처럼 짧게(없으면 "").',
  '10) memo.kidsOrWaitingTip: 사진에 아기의자·유아 동반·웨이팅 안내가 적혀 있으면 "아기의자 있음"·"웨이팅 있음"처럼 짧게(없으면 "").',
  '11) 8~10 은 사진에 적힌 내용만. 추측 금지.',
].join('\n');

/** 사진 모드 요청 본문 — inlineData(사진) + 프롬프트 */
function buildImageRequestBody({ mimeType, data, hint, thinking }) {
  const ask =
    '이 사진(인스타 캡처·스크린샷)을 보고, 사진에 적힌 가게 정보를 아래 키만 가진 JSON 하나로 답해줘(설명·코드블록 없이).\n' +
    '{"storeName":"가게 상호","area":"동네","menu":"대표 메뉴 1~3개(쉼표)","category":"맛집|카페|디저트|베이커리|가볼곳|기타","places":[{"name":"","area":"","menu":""}],' +
    '"memo":{"recommendedMenu":"","parking":"","kidsOrWaitingTip":""}}\n' +
    '사진 속 캡션·간판·메뉴판·위치 태그에서 실제 가게 이름을 찾아줘. 없으면 빈 문자열로 두고 지어내지 마.\n' +
    '간판의 숫자·기간(3일·24시·1988·3대째)은 상호의 일부이니 떼지 말고 그대로 읽어.\n' +
    'memo 는 사진에 적힌 추천 메뉴·주차·아기/웨이팅 정보만 적고, 확인되지 않으면 빈 문자열로 둬.' +
    (hint ? '\n\n[참고 — 사용자가 함께 적은 메모]\n' + hint : '');
  const generationConfig = {
    temperature: 0.2,
    maxOutputTokens: 4096,
    responseMimeType: 'application/json',
  };
  if (thinking === 'level') generationConfig.thinkingConfig = { thinkingLevel: 'LOW' };
  else if (thinking === 'budget') generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return {
    systemInstruction: { parts: [{ text: IMAGE_SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: 'user',
        parts: [{ inlineData: { mimeType, data } }, { text: ask }],
      },
    ],
    generationConfig,
  };
}

/**
 * 요청 본문 → 사진 입력. (v2.13)
 *   · `{ imageBase64, mimeType }` · `{ image, mimeType }` · `{ imageBase64: 'data:image/jpeg;base64,…' }` 모두 허용
 *   · 사진이 없으면 `{ present: false }` — 호출부는 기존 영상 모드로 이어집니다.
 *   · 너무 큰 사진은 업스트림을 부르지 않고 413 으로 안내합니다. (Vercel 4.5MB 한도)
 * @returns {{present:boolean, mimeType?:string, data?:string, bytes?:number,
 *            status?:number, error?:string, message?:string}}
 */
function parseImageInput(body) {
  const raw =
    body == null
      ? null
      : body.imageBase64 != null
      ? body.imageBase64
      : body.image != null
      ? body.image
      : body.dataUrl;
  if (raw == null || typeof raw !== 'string' || !raw.trim()) return { present: false };

  let text = String(raw).trim();
  let mimeType = cleanText(body && body.mimeType, 40).toLowerCase();
  const dataUri = /^data:([A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+)?(?:;[^,]*)*;base64,/i.exec(text);
  if (dataUri) {
    if (!mimeType && dataUri[1]) mimeType = dataUri[1].toLowerCase();
    text = text.slice(dataUri[0].length);
  }
  text = text.replace(/\s+/g, '');
  if (!mimeType) mimeType = 'image/jpeg';
  if (IMAGE_MIME_TYPES.indexOf(mimeType) < 0) {
    return {
      present: true,
      status: 400,
      error: 'unsupported-image-type',
      message: 'JPG · PNG · WEBP 사진만 분석할 수 있어요. 다시 골라 주세요.',
    };
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(text) || text.length < 64) {
    return {
      present: true,
      status: 400,
      error: 'invalid-image',
      message: '사진 데이터를 읽지 못했어요. 다시 골라 주세요.',
    };
  }
  if (text.length > MAX_IMAGE_BASE64_CHARS) {
    return {
      present: true,
      status: 413,
      error: 'image-too-large',
      message: '사진이 너무 커요(약 3MB 이하). 다시 고르거나 조금 작게 캡처해 주세요.',
    };
  }
  const bytes = Math.floor((text.length * 3) / 4) - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0);
  return { present: true, mimeType, data: text, bytes };
}

/** 응답 → 후보 텍스트(여러 파트 합치기) */
function responseTextOf(json) {
  const candidates = (json && json.candidates) || [];
  const parts = (candidates[0] && candidates[0].content && candidates[0].content.parts) || [];
  return parts
    .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
}

/** ```json 울타리·앞뒤 잡담을 걷어내고 JSON 만 파싱합니다. */
function parseJsonLoose(text) {
  let raw = String(text || '').trim();
  if (!raw) return null;
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(raw);
  } catch (e) {
    /* 아래에서 첫 { … } 덩어리만 다시 시도 */
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

const CATEGORY_WHITELIST = ['맛집', '카페', '디저트', '베이커리', '가볼곳'];

/**
 * v2.20 — 모델 응답의 `memo` → 앱이 쓰는 고정 모양.
 *   · 문자열이 아니거나 비면 빈 문자열 (앱의 한줄 메모 초안이 비어 있게 — 지어내지 않음)
 *   · 최대 40자로 잘라 한줄 메모(120자)에 여러 조각이 들어가게 합니다.
 */
function coerceMemo(obj) {
  const source = obj && obj.memo && typeof obj.memo === 'object' ? obj.memo : obj || {};
  const pick = (...keys) => {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) return cleanText(value, 40);
      if (Array.isArray(value)) {
        const first = value.map((v) => cleanText(v, 40)).filter(Boolean)[0];
        if (first) return first;
      }
    }
    return '';
  };
  return {
    recommendedMenu: pick('recommendedMenu', 'recommended_menu', 'recommend'),
    parking: pick('parking', 'parkingTip', 'parking_tip'),
    kidsOrWaitingTip: pick('kidsOrWaitingTip', 'kids_or_waiting_tip', 'kidsTip', 'waitingTip'),
  };
}

/** 모델 응답(모양이 흔들릴 수 있음) → 고정된 응답 모양으로 다듬습니다. */
function coerceAnalysis(obj, options = {}) {
  if (!obj || typeof obj !== 'object') return emptyResult('gemini-unparsed');
  const maxPlaces = Math.max(1, Number(options.maxPlaces) || MAX_PLACES);
  const pick = (...keys) => {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    return '';
  };
  const places = [];
  const rawPlaces = Array.isArray(obj.places) ? obj.places : [];
  for (const item of rawPlaces) {
    if (places.length >= maxPlaces) break;
    const name = cleanText(item && (item.name || item.storeName || item.store_name), 60);
    if (!name) continue;
    places.push({
      name,
      area: cleanText(item.area, 30),
      menu: cleanText(item.menu || item.menuTags, 80),
    });
  }
  let storeName = cleanText(pick('storeName', 'store_name', 'name'), 60);
  if (!storeName && places[0]) storeName = places[0].name;
  const area = cleanText(pick('area', 'region', 'district'), 30) || (places[0] && places[0].area) || '';
  const menu = cleanText(pick('menu', 'menuTags', 'menus'), 80);
  const rawCategory = cleanText(pick('category'), 12);
  const category = CATEGORY_WHITELIST.indexOf(rawCategory) >= 0 ? rawCategory : '';
  const memo = coerceMemo(obj);
  if (!storeName) return { ...emptyResult('gemini-no-store'), area, menu, category, places, memo };
  return { storeName, area, menu, category, places, memo };
}

/** Gemini 호출 1회. 실패하면 { ok:false, status } */
async function callGemini({ apiKey, model, body, timeoutMs }) {
  const endpoint = GEMINI_ENDPOINT + encodeURIComponent(model) + ':generateContent';
  const res = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 키는 헤더로 — URL(로그·Referer)에 남기지 않습니다.
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  );
  if (!res) return { ok: false, status: 0 };
  let json = null;
  try {
    json = typeof res.json === 'function' ? await res.json() : null;
  } catch (e) {
    json = null;
  }
  // 400/404(잘못된 인자·없는 모델)일 때는 업스트림이 준 **오류 메시지**를 함께 보관합니다.
  //   → 어떤 옵션 이름이 틀렸는지 서버 로그·진단 필드로 바로 알 수 있습니다. (키는 담기지 않음)
  let message = '';
  try {
    message = String((json && json.error && json.error.message) || '').slice(0, 240);
  } catch (e) {
    message = '';
  }
  return { ok: Boolean(res.ok), status: Number(res.status) || 0, json, message };
}

/**
 * 모델별로 '생각(thinking)' 옵션을 끄는 순서.
 *   · lite 계열: thinkingConfig 없이도 4초대에 답합니다 — **옵션 없이(off) 먼저** 시도해 가장 빠른 길로 갑니다.
 *   · 그 밖(3.8-flash 등): 생각 토큰이 지연의 큰 몫이라 thinkingLevel LOW → thinkingBudget 0 순서로 줄여 봅니다.
 *   · 모델이 옵션 이름을 모르면 400 이 오고, 그때 다음 모드로 넘어갑니다(아래 modelLoop).
 */
function thinkingModesFor(model) {
  return /lite/i.test(String(model || '')) ? ['off', 'level', 'budget'] : ['level', 'budget', 'off'];
}

/** 시도할 모델 목록 — GEMINI_MODEL 이 있으면 그것부터, 그 뒤 기본 모델·구형 모델 */
function modelCandidates() {
  const preferred = String(process.env.GEMINI_MODEL || '').trim();
  const list = [];
  [preferred, DEFAULT_MODEL, ...FALLBACK_MODELS].forEach((m) => {
    const name = String(m || '').trim();
    if (name && list.indexOf(name) < 0) list.push(name);
  });
  return list;
}

/**
 * 모델(404/400 폴백) × 생각 옵션(400 재시도) 을 바꿔 가며 Gemini 를 부릅니다. — 영상·사진 공통 (v2.13)
 *   · 요청 본문은 `buildBody(thinking)` 이 매번 새로 만듭니다. (사진 inlineData·영상 fileData)
 *   · 바깥 코드가 응답 모양을 다듬을 수 있게 시도 결과와 마지막 모델·옵션을 그대로 돌려줍니다.
 * @returns {Promise<{attempt:object, usedModel:string, usedThinking:string}>}
 */
async function runModelLoop({ apiKey, buildBody }) {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const models = modelCandidates();
  let attempt = { ok: false, status: 0, json: null };
  let usedModel = models[0];
  let usedThinking = thinkingModesFor(models[0])[0];
  // 모델(404/400) × 생각 옵션(400) 을 바꿔 가며 시도합니다. 그 밖의 실패(429·5xx)는 바로 끝냅니다.
  modelLoop: for (const model of models) {
    usedModel = model;
    for (const thinking of thinkingModesFor(model)) {
      const left = deadline - Date.now();
      if (left < 4000) break modelLoop;
      usedThinking = thinking;
      // 503(모델 과부하)은 구글이 권하는 대로 잠깐 쉬고 한 번 더 — 무료 등급에서 실제로 자주 납니다.
      for (let tries = 1; ; tries += 1) {
        const remain = deadline - Date.now();
        attempt = await callGemini({
          apiKey,
          model,
          timeoutMs: Math.min(GEMINI_TIMEOUT_MS, remain),
          body: buildBody(thinking),
        });
        if (attempt.ok) break;
        const retryable = attempt.status === 503 || attempt.status === 502;
        if (retryable && tries < 2 && deadline - Date.now() > 8000) {
          await sleep(1200);
          continue;
        }
        break;
      }
      if (attempt.ok) break modelLoop;
      // 400 = 이 모델이 이 옵션을 모름 → 다음 옵션으로. 그 외(404·429·5xx·타임아웃)는 옵션 문제가 아님
      if (attempt.status !== 400) break;
    }
    if (attempt.status !== 404) break;
  }
  return { attempt, usedModel, usedThinking };
}

module.exports = async function handler(req, res) {
  if (String((req && req.method) || '').toUpperCase() !== 'POST') {
    return sendJson(res, 405, { error: 'method-not-allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) return sendJson(res, 503, { error: 'gemini-not-configured' });

  const startedAt = Date.now();
  const body = await readBody(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return sendJson(res, 400, { error: 'invalid-body' });
  }

  // ── v2.13 · 사진 모드 — 인스타 캡처·스크린샷을 inlineData 로 보냅니다 ──
  //   너무 큰 사진은 업스트림을 부르지 않고 413 으로 안내합니다. (Vercel 요청 본문 4.5MB)
  const image = parseImageInput(body);
  if (image.present && image.error) {
    warn('gemini: image rejected ' + image.error);
    return sendJson(res, image.status, { error: image.error, message: image.message });
  }
  const isImage = Boolean(image.present);

  const rawUrl = String(body.url == null ? '' : body.url).slice(0, 500).trim();
  if (!isImage && !rawUrl) return sendJson(res, 400, { error: 'missing-url' });

  // 사진 모드가 아니면 지금처럼 유튜브만 통과 — 인스타·틱톡은 조용히 빈 결과(키를 쓰지 않음)
  let videoUrl = '';
  if (!isImage) {
    videoUrl = normalizeYouTubeUrl(rawUrl);
    if (!videoUrl) return sendJson(res, 200, emptyResult('not-youtube'));
  }

  const title = cleanText(body.title, MAX_TITLE_CHARS);
  const description = cleanText(body.description, MAX_DESCRIPTION_CHARS);
  const hint = cleanText(body.hint || body.caption, MAX_TITLE_CHARS);

  const buildBody = isImage
    ? (thinking) => buildImageRequestBody({ mimeType: image.mimeType, data: image.data, hint, thinking })
    : (thinking) => buildRequestBody({ videoUrl, title, description, thinking });

  const { attempt, usedModel, usedThinking } = await runModelLoop({ apiKey, buildBody });

  if (!attempt.ok) {
    // 업스트림 본문·키는 절대 돌려주지 않습니다. (상태 코드만 로그)
    warn('gemini: upstream failed status=' + attempt.status + ' model=' + usedModel);
    return sendJson(res, 200, {
      ...emptyResult(attempt.status ? 'gemini-upstream-' + attempt.status : 'gemini-timeout'),
      kind: isImage ? 'image' : 'video',
      model: usedModel,
      thinking: usedThinking,
      elapsedMs: Date.now() - startedAt,
      ...(attempt.status === 400 || attempt.status === 404 ? { upstreamMessage: attempt.message || '' } : {}),
    });
  }

  const text = responseTextOf(attempt.json);
  const parsed = parseJsonLoose(text);
  if (!parsed) {
    warn('gemini: unparsed response (finishReason=' + finishReasonOf(attempt.json) + ')');
    return sendJson(res, 200, { ...emptyResult('gemini-unparsed'), kind: isImage ? 'image' : 'video' });
  }

  // 사진은 목록형 캡처(여러 가게)를 담아야 해서 places 상한이 조금 더 큽니다.
  const analysis = coerceAnalysis(parsed, isImage ? { maxPlaces: MAX_IMAGE_PLACES } : undefined);
  return sendJson(res, 200, {
    ...analysis,
    kind: isImage ? 'image' : 'video',
    model: usedModel,
    thinking: usedThinking,
    source: 'gemini',
    elapsedMs: Date.now() - startedAt,
    ...(isImage ? { imageBytes: image.bytes } : {}),
  });
};

function finishReasonOf(json) {
  try {
    return String(json.candidates[0].finishReason || '');
  } catch (e) {
    return '';
  }
}

module.exports.normalizeYouTubeUrl = normalizeYouTubeUrl;
module.exports.parseImageInput = parseImageInput;
module.exports.buildImageRequestBody = buildImageRequestBody;
module.exports.IMAGE_SYSTEM_INSTRUCTION = IMAGE_SYSTEM_INSTRUCTION;
module.exports.runModelLoop = runModelLoop;
module.exports.MAX_IMAGE_BASE64_CHARS = MAX_IMAGE_BASE64_CHARS;
module.exports.MAX_IMAGE_BODY_BYTES = MAX_BODY_BYTES;
module.exports.MAX_IMAGE_PLACES = MAX_IMAGE_PLACES;
module.exports.parseJsonLoose = parseJsonLoose;
module.exports.coerceAnalysis = coerceAnalysis;
module.exports.coerceMemo = coerceMemo;
module.exports.modelCandidates = modelCandidates;
module.exports.thinkingModesFor = thinkingModesFor;
module.exports.GEMINI_TIMEOUT_MS = GEMINI_TIMEOUT_MS;
module.exports.TOTAL_BUDGET_MS = TOTAL_BUDGET_MS;
module.exports.DEFAULT_MODEL = DEFAULT_MODEL;
