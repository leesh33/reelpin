/**
 * utils/cluster.js — v2.5
 * ─────────────────────────────────────────────────────────────
 * 📍 줌 겹침 방지(클러스터링)의 **순수 계산**만 모읍니다. (지도 API·DOM 없이 단위 테스트 가능)
 *
 * 지도가 화면 픽셀 좌표를 넘겨주면(네이버: getProjection().fromCoordToOffset,
 * Leaflet: latLngToContainerPoint) 이 파일이 "픽셀 거리로 가까운 핀"을 하나로 묶습니다.
 *
 * 규칙
 *   · 기준 거리 `CLUSTER_THRESHOLD_PX`(46px) 이내에 **2개 이상**이면 하나의 클러스터
 *   · 기준 거리로 이어진 핀들은 **한 무리**로 (a-b, b-c 가 가까우면 a·b·c 모두 한 무리)
 *     → 무리끼리 배지가 겹치는 일이 없습니다
 *   · 같은 클러스터 안의 핀들은 화면에서 서로 겹쳐 보이므로, 대표 배지 하나(예: `3`)로 줄입니다
 *   · 줌을 키워 픽셀 거리가 벌어지면 자동으로 1개짜리 그룹으로 풀립니다 (호출 쪽이 다시 계산)
 *   · 결과는 입력 순서와 무관하게 **정해진 순서**(위→아래, 왼→오른쪽)로 나옵니다
 *     → 같은 화면에서는 언제 계산해도 같은 묶음 (배지가 깜빡이지 않음)
 */
import { getCategoryColor } from './categories';

/** 이 거리(px) 안에 2개 이상이면 묶습니다 */
export const CLUSTER_THRESHOLD_PX = 46;
/** 클러스터로 묶이는 최소 개수 */
export const CLUSTER_MIN_SIZE = 2;
/** 클러스터 배지에서 한 번에 보여 줄 최대 숫자 */
export const CLUSTER_LABEL_MAX = 99;

/** 두 화면 좌표 사이의 픽셀 거리 */
export function pixelDistance(a, b) {
  if (!a || !b) return Infinity;
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return Infinity;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 좌표가 쓸 만한지 (x·y 가 유한한 숫자) */
export function isProjected(point) {
  return Boolean(point) && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 무리 하나 → 배지 하나 (대표 좌표는 무리 중심) */
function buildGroup(members) {
  const ids = members.map((member) => String(member.id));
  const latLngs = members.filter(
    (member) => Number.isFinite(Number(member.lat)) && Number.isFinite(Number(member.lng))
  );
  return {
    // 같은 무리인지 알아보는 열쇠 — 순서에 흔들리지 않게 정렬한 id 목록
    key: ids.slice().sort().join('|'),
    ids,
    count: members.length,
    x: average(members.map((member) => Number(member.x))),
    y: average(members.map((member) => Number(member.y))),
    lat: latLngs.length ? average(latLngs.map((member) => Number(member.lat))) : null,
    lng: latLngs.length ? average(latLngs.map((member) => Number(member.lng))) : null,
    members: members.slice(),
  };
}

/**
 * 화면 픽셀 좌표들을 클러스터로 묶습니다.
 *
 * @param {Array<{id:string|number, x:number, y:number, lat?:number, lng?:number}>} points
 * @param {{threshold?:number}} [options]
 * @returns {Array<{key:string, ids:string[], count:number, x:number, y:number, lat:number|null,
 *                  lng:number|null, members:Array<object>}>}
 *          묶이지 않은 핀도 count:1 그룹으로 함께 돌려줍니다 (호출 쪽에서 걸러 씁니다).
 */
export function clusterPoints(points, options = {}) {
  const threshold =
    Number(options.threshold) > 0 ? Number(options.threshold) : CLUSTER_THRESHOLD_PX;
  const items = (Array.isArray(points) ? points : [])
    .filter((point) => point && point.id != null && isProjected(point))
    .map((point) => ({ ...point, x: Number(point.x), y: Number(point.y) }));

  // 입력 순서와 무관하게 같은 결과가 나오도록 위→아래, 왼→오른쪽으로 먼저 정렬합니다.
  const sorted = items
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x || String(a.id).localeCompare(String(b.id)));

  // 기준 거리로 이어진 핀을 같은 무리로 묶습니다 (union-find)
  //   → a-b, b-c 가 가까우면 a·b·c 한 무리. 무리끼리 배지가 겹치는 일이 없습니다.
  const parent = sorted.map((_, index) => index);
  const find = (start) => {
    let index = start;
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (pixelDistance(sorted[i], sorted[j]) > threshold) continue;
      const left = find(i);
      const right = find(j);
      if (left !== right) parent[right] = left;
    }
  }

  const buckets = new Map();
  sorted.forEach((point, index) => {
    const root = find(index);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(point);
  });

  // 무리 순서도 화면 위→아래, 왼→오른쪽으로 고정 (배지 순서가 깜빡이지 않게)
  return Array.from(buckets.values())
    .map(buildGroup)
    .sort((a, b) => a.y - b.y || a.x - b.x || a.key.localeCompare(b.key));
}

/** 2개 이상 묶인 무리만 */
export function onlyClusters(groups) {
  return (Array.isArray(groups) ? groups : []).filter((group) => group && group.count >= CLUSTER_MIN_SIZE);
}

/** 무리에 속한 핀 id 들 (한 번에 Set 으로) */
export function clusteredIds(groups) {
  const out = new Set();
  (Array.isArray(groups) ? groups : []).forEach((group) => {
    if (!group || group.count < CLUSTER_MIN_SIZE) return;
    (group.ids || []).forEach((id) => out.add(String(id)));
  });
  return out;
}

/** 이 핀이 지금 클러스터 안에 숨어 있는지 */
export function isClusteredId(groups, id) {
  if (id == null) return false;
  return clusteredIds(groups).has(String(id));
}

/** 무리가 화면에서 차지하는 픽셀 폭·높이 (탭했을 때 fitBounds 로 벌릴지 판단) */
export function clusterSpanPx(group) {
  const members = (group && group.members) || [];
  if (!members.length) return { w: 0, h: 0 };
  const xs = members.map((member) => Number(member.x));
  const ys = members.map((member) => Number(member.y));
  return { w: Math.max.apply(null, xs) - Math.min.apply(null, xs), h: Math.max.apply(null, ys) - Math.min.apply(null, ys) };
}

/**
 * 클러스터 배지에 쓸 숫자 — 99곳이 넘으면 `99+`
 */
export function clusterLabel(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n > CLUSTER_LABEL_MAX ? CLUSTER_LABEL_MAX + '+' : String(Math.round(n));
}

/**
 * 클러스터 배지의 **테두리(헤일로) 색** — 무리 안 핀이 **한 분류**면 그 분류 색, 섞여 있으면 코랄.
 * (배지 본체는 어디서나 다크 네이비 + 흰 숫자 — 지도 핀·칩과 색이 어긋나지 않습니다)
 */
export function clusterColor(members, categories) {
  const list = Array.isArray(members) ? members : [];
  const names = [];
  list.forEach((member) => {
    const name = String((member && member.category) || '').trim();
    if (name && names.indexOf(name) < 0) names.push(name);
  });
  if (names.length === 1) return getCategoryColor(names[0], categories);
  return '#FF5A36';
}
