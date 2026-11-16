/**
 * api/gemini.js — Vercel Serverless Function
 * ─────────────────────────────────────────────────────────────
 * POST /api/gemini
 *   body: { url: "https://youtube.com/shorts/…", title?: "…", description?: "…" }
 *   응답: { storeName, area, menu, category, places: [{ name, area, menu }] }
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
 *   6. Gemini 영상 분석은 10초를 넘기는 경우가 흔합니다 — 타임아웃 22초 + `maxDuration` 60초.
 */
const { fetchWithTimeout, sendJson, warn } = require('../server/http.js');

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
const DEFAULT_MODEL = 'gemini-3.8-flash';
/** 모델이 폐기·미제공이면(404/400) 이 순서로 내려갑니다. */
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];
/**
 * 한 번의 영상 분석 응답 타임아웃.
 *   실측: 같은 영상·같은 요청이 24초 ~ 50초+ 로 흔들립니다(무료 등급 대기열 영향으로 보임).
 *   → 55초까지 기다리고, 넘기면 앱은 조용히 기존 폴백으로 이어집니다.
 */
const GEMINI_TIMEOUT_MS = 55000;
/** 모델 폴백까지 포함한 전체 예산 — Vercel maxDuration 60초 안 */
const TOTAL_BUDGET_MS = 57000;
/** 요청 본문 상한 (제목·설명글 몇 줄이면 충분) */
const MAX_BODY_BYTES = 16 * 1024;
const MAX_TITLE_CHARS = 200;
const MAX_DESCRIPTION_CHARS = 1800;
const MAX_PLACES = 3;

/** 실패·미확인 시 돌려주는 빈 결과 — 앱은 이 모양만 보고 폴백합니다. */
function emptyResult(reason) {
  return { storeName: '', area: '', menu: '', category: '', places: [], reason: String(reason || '') };
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
].join('\n');

/** 요청 본문 — 영상 + 참고용 메타데이터(제목·설명글) */
function buildRequestBody({ videoUrl, title, description, thinking }) {
  const hints = [];
  if (title) hints.push('영상 제목: ' + title);
  if (description) hints.push('영상 설명글: ' + description);
  const ask =
    '이 영상을 보고, 영상에 나온 가게 정보를 아래 키만 가진 JSON 하나로 답해줘(설명·코드블록 없이).\n' +
    '{"storeName":"가게 상호","area":"동네","menu":"대표 메뉴 1~3개(쉼표)","category":"맛집|카페|디저트|베이커리|가볼곳|기타","places":[{"name":"","area":"","menu":""}]}\n' +
    '영상 속 말(음성)과 화면 자막·간판에서 실제 가게 이름을 찾아줘. 없으면 빈 문자열로 두고 지어내지 마.' +
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

/** 모델 응답(모양이 흔들릴 수 있음) → 고정된 응답 모양으로 다듬습니다. */
function coerceAnalysis(obj) {
  if (!obj || typeof obj !== 'object') return emptyResult('gemini-unparsed');
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
    if (places.length >= MAX_PLACES) break;
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
  if (!storeName) return { ...emptyResult('gemini-no-store'), area, menu, category, places };
  return { storeName, area, menu, category, places };
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

  const rawUrl = String(body.url == null ? '' : body.url).slice(0, 500).trim();
  if (!rawUrl) return sendJson(res, 400, { error: 'missing-url' });

  // 유튜브가 아니면(인스타·틱톡 등) 조용히 빈 결과 — Gemini 키를 쓰지 않습니다.
  const videoUrl = normalizeYouTubeUrl(rawUrl);
  if (!videoUrl) return sendJson(res, 200, emptyResult('not-youtube'));

  const title = cleanText(body.title, MAX_TITLE_CHARS);
  const description = cleanText(body.description, MAX_DESCRIPTION_CHARS);

  // 모델이 폐기·미제공(404/400)이면 다음 모델로 내려갑니다. 그 밖의 실패(429·5xx)는 바로 끝냅니다.
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const models = modelCandidates();
  const THINKING_MODES = ['level', 'budget', 'off'];
  let attempt = { ok: false, status: 0, json: null };
  let usedModel = models[0];
  let usedThinking = THINKING_MODES[0];
  // 모델(404/400) × 생각 옵션(400) 을 바꿔 가며 시도합니다. 그 밖의 실패(429·5xx)는 바로 끝냅니다.
  modelLoop: for (const model of models) {
    usedModel = model;
    for (const thinking of THINKING_MODES) {
      const left = deadline - Date.now();
      if (left < 4000) break modelLoop;
      usedThinking = thinking;
      attempt = await callGemini({
        apiKey,
        model,
        timeoutMs: Math.min(GEMINI_TIMEOUT_MS, left),
        body: buildRequestBody({ videoUrl, title, description, thinking }),
      });
      if (attempt.ok) break modelLoop;
      // 400 = 이 모델이 이 옵션을 모름 → 다음 옵션으로. 그 외(404·429·5xx·타임아웃)는 옵션 문제가 아님
      if (attempt.status !== 400) break;
    }
    if (attempt.status !== 404) break;
  }

  if (!attempt.ok) {
    // 업스트림 본문·키는 절대 돌려주지 않습니다. (상태 코드만 로그)
    warn('gemini: upstream failed status=' + attempt.status + ' model=' + usedModel);
    return sendJson(res, 200, {
      ...emptyResult(attempt.status ? 'gemini-upstream-' + attempt.status : 'gemini-timeout'),
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
    return sendJson(res, 200, emptyResult('gemini-unparsed'));
  }

  const analysis = coerceAnalysis(parsed);
  return sendJson(res, 200, {
    ...analysis,
    model: usedModel,
    thinking: usedThinking,
    source: 'gemini',
    elapsedMs: Date.now() - startedAt,
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
module.exports.parseJsonLoose = parseJsonLoose;
module.exports.coerceAnalysis = coerceAnalysis;
module.exports.modelCandidates = modelCandidates;
module.exports.GEMINI_TIMEOUT_MS = GEMINI_TIMEOUT_MS;
module.exports.TOTAL_BUDGET_MS = TOTAL_BUDGET_MS;
module.exports.DEFAULT_MODEL = DEFAULT_MODEL;
