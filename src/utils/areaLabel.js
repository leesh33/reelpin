/**
 * utils/areaLabel.js — v2.19.1
 * ─────────────────────────────────────────────────────────────
 * "인천 서구 당하동" 처럼 **시·군·구·동까지** 붙인 지역 라벨.
 *
 * 상훈 님 요청(2026-11-17): "6. 장소검색의 추천 장소에는 시군구동 까지 표현 (현재는 동 만 나옴)"
 *
 *   · 핀에는 `area`(추출기가 지번주소에서 뽑은 동네 — 예: `당하동`)와
 *     `address`(도로명주소 — 예: `인천 서구 이음2로 70`)가 따로 들어 있습니다.
 *     도로명주소에는 동이 없으므로 **주소에서 시/도·시·군·구를, `area` 에서 동을** 모아 붙입니다.
 *   · 주소가 없거나 지역을 못 읽으면 **지어내지 않고** `area` 만 그대로 보여 줍니다.
 *
 * 화면(장소 검색 추천·결과)은 이 함수가 돌려준 글자만 그립니다.
 */

/** 시/도 이름 → 짧은 표기 (`인천광역시` → `인천`, `경기도` → `경기`) */
const SIDO_PAIRS = [
  ['서울', '서울'],
  ['부산', '부산'],
  ['대구', '대구'],
  ['인천', '인천'],
  ['광주', '광주'],
  ['대전', '대전'],
  ['울산', '울산'],
  ['세종', '세종'],
  ['세종시', '세종'],
  ['경기', '경기'],
  ['강원', '강원'],
  ['충청북', '충북'],
  ['충북', '충북'],
  ['충청남', '충남'],
  ['충남', '충남'],
  ['전라북', '전북'],
  ['전북', '전북'],
  ['전라남', '전남'],
  ['전남', '전남'],
  ['경상북', '경북'],
  ['경북', '경북'],
  ['경상남', '경남'],
  ['경남', '경남'],
  ['제주', '제주'],
];

const SIDO_SUFFIX = /(특별시|광역시|특별자치시|특별자치도|도)$/;
const DONG_SUFFIX = /(동|읍|면)(\d+가)?$/;
const GU_SUFFIX = /(구|군)$/;
const SI_SUFFIX = /시$/;
// 도로명(`…로`, `…길`)이나 번지가 나오면 그 뒤로는 지역 이름이 아닙니다.
const ROAD_OR_NUMBER = /(로|길)\d*$|^\d/;

/** 이 토큰이 시/도 이름이면 짧은 표기, 아니면 '' */
export function sidoBase(token) {
  const text = String(token == null ? '' : token).replace(/[()]/g, '');
  if (!text) return '';
  const stripped = text.replace(SIDO_SUFFIX, '');
  for (let i = 0; i < SIDO_PAIRS.length; i += 1) {
    if (stripped === SIDO_PAIRS[i][0] || text === SIDO_PAIRS[i][0]) return SIDO_PAIRS[i][1];
  }
  return '';
}

/**
 * 주소에서 지역 토큰을 뽑습니다.
 * @returns {{ sido: string, si: string, gu: string, dong: string }}
 */
export function addressRegions(address) {
  const out = { sido: '', si: '', gu: '', dong: '' };
  const tokens = String(address == null ? '' : address)
    .replace(/[,()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!out.sido) {
      const base = sidoBase(token);
      if (base) {
        out.sido = base;
        continue;
      }
    }
    if (ROAD_OR_NUMBER.test(token)) break;
    if (DONG_SUFFIX.test(token)) {
      if (!out.dong) out.dong = token;
      continue;
    }
    if (GU_SUFFIX.test(token) && token.length > 1) {
      if (!out.gu) out.gu = token;
      continue;
    }
    if (SI_SUFFIX.test(token) && token.length > 1) {
      if (!out.si) out.si = token;
    }
  }
  return out;
}

/**
 * 핀 하나의 지역 라벨 — `인천 서구 당하동` / `서울 성동구 성수동` / `경기 고양시 일산서구 일산동`
 * 주소로 지역을 못 읽으면 `area` 만 (예: `당하동`) 돌려줍니다.
 */
export function placeAreaLabel(pin) {
  if (!pin) return '';
  const area = String(pin.area == null ? '' : pin.area).trim();
  const regions = addressRegions(pin.roadAddress || pin.address || '');
  const parts = [];
  const push = (value) => {
    const text = String(value == null ? '' : value).trim();
    if (!text) return;
    if (parts.indexOf(text) >= 0) return;
    parts.push(text);
  };
  push(regions.sido);
  push(regions.si);
  push(regions.gu);
  // 동 — 추출기가 저장해 둔 `area` 를 먼저 쓰고, 없으면 주소의 동을 씁니다.
  const dong = area || regions.dong;
  if (dong) {
    // '서울 서초구 서초동' 처럼 area 가 이미 시·구까지 담고 있으면 통째로 붙입니다.
    const covered = parts.some((part) => dong.indexOf(part) >= 0);
    if (!covered) push(dong);
  }
  if (!parts.length) return area;
  return parts.join(' ');
}

/** 분류·지역을 `맛집 · 인천 서구 당하동` 처럼 한 줄로 (추천·검색 결과 행) */
export function placeMetaLabel(pin) {
  if (!pin) return '';
  const category = String(pin.category == null ? '' : pin.category).trim();
  const area = placeAreaLabel(pin);
  const parts = [category, area].filter(Boolean);
  return parts.length ? parts.join(' · ') : '내 지도';
}
