/**
 * utils/memoDraft.js (v2.20)
 * ─────────────────────────────────────────────────────────────
 * 저장 화면의 **한줄 메모 초안**을 만듭니다.
 *
 *   "추천: 고추삼선간짜장 · 주차 불가 · 아기의자 있음 · 웨이팅 있음"
 *
 * 재료는 두 갈래뿐입니다.
 *   1) AI(Gemini) 가 영상·사진에서 읽은 값 — `recommendedMenu` · `parking` · `kidsOrWaitingTip`
 *   2) 설명글·제목 글자에서 **표식이 붙은** 값 — "추천 메뉴: …" · "주차 불가" · "웨이팅 20분"
 *   3) 매장 상세 API 가 준 사실 — 추천 메뉴 이름 · 주차 여부(boolean)
 *
 * ⚠️ **없는 값은 만들지 않습니다.** 재료가 비면 빈 문자열을 돌려주고, 화면은 메모를 비워 둡니다.
 */

export const MEMO_DRAFT_MAX = 120;
/** 한 조각의 최대 길이 — 한줄 메모가 길어져 카드가 깨지지 않게 */
const PART_MAX = 18;

function clean(value, max = PART_MAX) {
  return String(value == null ? '' : value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[-·,:：\s]+|[-·,:：\s]+$/g, '')
    .trim()
    .slice(0, max);
}

/** 추천 메뉴 — 배열이면 첫 항목, 문자열이면 쉼표 앞 첫 항목 */
function menuPart(value) {
  const first = Array.isArray(value) ? value.find((v) => clean(v)) : String(value || '').split(/[,·/|]/)[0];
  const name = clean(first, 20);
  return name ? '추천: ' + name : '';
}

/** 여러 조각 → 한 줄 (중복 제거 + 120자 제한) */
export function memoDraftOfParts(parts = {}) {
  const out = [];
  const push = (text) => {
    const value = clean(text, MEMO_DRAFT_MAX);
    if (value && out.indexOf(value) < 0) out.push(value);
  };
  push(menuPart(parts.recommendedMenu || parts.menu));
  push(clean(parts.parking, PART_MAX));
  push(clean(parts.kids, PART_MAX));
  push(clean(parts.waiting, PART_MAX));
  // '아기의자/웨이팅 팁' 한 칸으로 오는 응답도 받아 줍니다. (Gemini 프롬프트의 kidsOrWaitingTip)
  const tip = clean(parts.kidsOrWaitingTip, 40);
  if (tip) {
    tip
      .split(/\s*·\s*|\s*,\s*/)
      .filter(Boolean)
      .forEach((piece) => push(clean(piece, PART_MAX)));
  }
  return out.join(' · ').slice(0, MEMO_DRAFT_MAX).trim();
}

/**
 * 설명글·제목에서 **표식이 붙은** 정보만 뽑습니다. (지어내지 않음)
 *   · "추천 메뉴: 지로케 라멘" · "대표: 마제소바"
 *   · "주차 불가" · "주차장 없음" · "무료 주차"
 *   · "아기의자 있음" · "노키즈존" · "웨이팅 20분"
 */
export function memoDraftFromText(rawText) {
  const text = String(rawText == null ? '' : rawText);
  if (!text.trim()) return '';
  const parts = { recommendedMenu: '', parking: '', kids: '', waiting: '' };

  const menuMatch =
    text.match(/(?:추천\s*메뉴|대표\s*메뉴|추천|대표|시그니처)\s*[:：]\s*([^\n]{2,40})/) ||
    text.match(/메뉴\s*[:：]\s*([^\n]{2,40})/);
  if (menuMatch) parts.recommendedMenu = menuMatch[1];

  if (/주차\s*(?:불가|안\s*됨)/.test(text) || /주차장\s*(?:없|준비되어 있지\s*않)/.test(text)) {
    parts.parking = '주차 불가';
  } else if (/무료\s*주차|주차\s*무료/.test(text)) {
    parts.parking = '무료 주차';
  } else if (/주차\s*(?:가능|있음|있)/.test(text)) {
    parts.parking = '주차 가능';
  }

  if (/노키즈\s*존|노키즈존/.test(text)) parts.kids = '노키즈존';
  else if (/아기\s*의자|유아\s*의자|키즈\s*체어/.test(text)) parts.kids = '아기의자 있음';

  const waiting = text.match(/웨이팅\s*(20분|30분|1시간|있음|있|필수|없음|없)/);
  if (waiting) parts.waiting = /없/.test(waiting[1]) ? '웨이팅 없음' : '웨이팅 있음';

  return memoDraftOfParts(parts);
}

/** 매장 상세 API 의 tips → 초안 (추천 메뉴·주차·아기) */
export function memoDraftFromPlaceTips(tips) {
  if (!tips || typeof tips !== 'object') return '';
  return memoDraftOfParts({
    recommendedMenu: tips.recommendedMenu,
    parking: tips.parking,
    kids: tips.kids,
    waiting: tips.waiting,
  });
}

/**
 * 두 초안 합치기 — 앞(우선) 초안의 조각을 먼저, 뒤 초안에서 **없는 조각만** 덧붙입니다.
 *   예) AI 초안 "추천: 마제소바" + 매장 정보 "주차 불가" → "추천: 마제소바 · 주차 불가"
 */
export function mergeMemoDrafts(primary, secondary) {
  const pieces = [];
  [primary, secondary]
    .map((draft) => String(draft || '').split(/\s*·\s*/))
    .forEach((list) => {
      list.forEach((piece) => {
        const value = clean(piece, MEMO_DRAFT_MAX);
        if (!value) return;
        // 같은 종류('추천:' · '주차' · '아기' · '웨이팅')는 앞의 것을 남깁니다.
        const kind = /^추천:/.test(value) ? 'menu' : /^주차/.test(value) ? 'parking' : /아기|노키즈/.test(value) ? 'kids' : /웨이팅/.test(value) ? 'waiting' : value;
        if (pieces.some((p) => p.kind === kind)) return;
        pieces.push({ kind, value });
      });
    });
  return pieces
    .map((p) => p.value)
    .join(' · ')
    .slice(0, MEMO_DRAFT_MAX)
    .trim();
}
