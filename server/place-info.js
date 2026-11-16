/**
 * server/place-info.js — 매장 상세(영업시간) 도우미 (v2.20)
 * ─────────────────────────────────────────────────────────────
 * `api/naver-place.js` · `api/kakao-place.js` 가 함께 쓰는 **순수 함수** 모음입니다.
 *   · 요일 표기 정규화('월요일' → '월', '매일' → '매일')
 *   · 정기휴무 문장 → 휴무 요일 배열
 *   · `11:30 ~ 21:30` 같은 시간 범위 문자열 → { start, end }
 *   · 주차 안내 문장 → 아주 짧은 사실 한 조각('주차 불가' / '주차 가능')
 *
 * 원칙: **확인되지 않은 값은 만들지 않습니다.** 문장에 없으면 빈 문자열입니다.
 */

/** 요일 표기 정규화 — '월' · '월요일' · '월(11/17)' → '월', '매일' · '연중무휴' 는 '매일' */
const WEEKDAY_CHARS = ['일', '월', '화', '수', '목', '금', '토'];

function normalizeDayLabel(raw) {
  const text = String(raw == null ? '' : raw).replace(/\s+/g, '');
  if (!text) return '';
  if (/매일|연중무휴|상시/.test(text)) return '매일';
  const hit = WEEKDAY_CHARS.find((d) => text.indexOf(d) >= 0);
  if (hit) return hit;
  if (/평일/.test(text)) return '평일';
  if (/주말/.test(text)) return '주말';
  return text.slice(0, 4);
}

/** '매주 화요일 휴무' · '매월 첫째 월요일 휴무' 같은 문장 → ['화'] (요일만) */
function weekdaysFromText(raw) {
  const text = String(raw == null ? '' : raw);
  if (!text.trim()) return [];
  const out = [];
  const re = /([일월화수목금토])\s*요일|(?<![0-9])([일월화수목금토])(?=[,\s·/]|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const day = m[1] || m[2];
    if (day && out.indexOf(day) < 0) out.push(day);
  }
  return out;
}

/** `2026-11-20` · `2026.11.20` 모양의 날짜만 뽑습니다. */
function isoDatesFrom(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  list.forEach((item) => {
    const text = typeof item === 'string' ? item : JSON.stringify(item || {});
    const m = text.match(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/);
    if (!m) return;
    const iso = m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
    if (out.indexOf(iso) < 0) out.push(iso);
  });
  return out;
}

/** 'HH:MM' 만 남깁니다. ('11:30 ~ 21:30' → ['11:30','21:30']) */
function timesIn(text) {
  const out = [];
  const re = /(\d{1,2})\s*:\s*(\d{2})/g;
  let m;
  while ((m = re.exec(String(text == null ? '' : text)))) {
    const hh = String(Math.min(23, Math.max(0, Number(m[1])))).padStart(2, '0');
    out.push(hh + ':' + m[2]);
  }
  return out;
}

/** '11:30 ~ 21:30' → { start:'11:30', end:'21:30' } (없으면 빈 문자열) */
function timeRangeOf(text) {
  const times = timesIn(text);
  return { start: times[0] || '', end: times[1] || '' };
}

/** 주차 안내 문장 → 아주 짧은 사실 한 조각 ('주차 불가' / '주차 가능' / '') */
function parkingPhrase(description) {
  const text = String(description || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (/(주차[^.]{0,12}(불가|없|안\s*됨)|주차장[^.]{0,10}(없|준비되어 있지\s*않))/.test(text)) return '주차 불가';
  if (/발렛|대리\s*주차/.test(text)) return '발렛 주차';
  if (/무료\s*주차/.test(text)) return '무료 주차';
  if (/주차/.test(text)) return '주차 가능';
  return '';
}

module.exports = {
  WEEKDAY_CHARS,
  normalizeDayLabel,
  weekdaysFromText,
  isoDatesFrom,
  timesIn,
  timeRangeOf,
  parkingPhrase,
};
