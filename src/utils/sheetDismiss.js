/**
 * src/utils/sheetDismiss.js — v2.34.0
 * ─────────────────────────────────────────────────────────────
 * 바텀시트를 **아래로 쓸어내려 닫는** 판정 규칙만 모읍니다. (화면 없이 단위 테스트)
 *
 * 상훈 님 요청 (IMG_9274)
 *   "장소 상세 화면에서 헤더 부근을 아래로 쓸어 내리면 닫히게 해 줘"
 *
 *   · 손가락을 아래로 끄는 동안 시트가 그만큼 따라 내려오고(translateY),
 *     **충분히 내리거나 빠르게 튕기면 닫힙니다**. 모자라면 제자리로 돌아옵니다.
 *   · 임계값: 96px 이상 내리면 닫힘 · 24px 이상 + 빠른 플릭(0.5px/ms 이상)도 닫힘
 *   · 아주 큰 시트는 40%까지 끌어내려도 닫힘 (화면 밖으로 끌고 가는 느낌 방지)
 */

/** 이만큼(px) 내리면 닫힘 */
export const SHEET_DISMISS_DISTANCE = 96;

/** 이 속도(px/ms) 이상으로 튕기면 조금만 내려도 닫힘 */
export const SHEET_DISMISS_VELOCITY = 0.5;

/** 플릭으로 인정하는 최소 이동(px) — 살짝 튕긴 실수로 닫히지 않게 */
export const SHEET_FLICK_MIN_DISTANCE = 24;

/** 시트 높이 대비 이만큼 끌어내리면 닫힘 (아주 큰 시트) */
export const SHEET_DISMISS_HEIGHT_RATIO = 0.4;

/** 끄는 동안 시트가 따라 내려갈 거리(px) — 위로는 움직이지 않습니다 */
export function clampedDragOffset(dy) {
  const value = Number(dy);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

/**
 * 손을 뗄 때 닫을지 판정합니다.
 * @param {{dy:number, vy?:number, height?:number,
 *          distance?:number, velocity?:number, flickMin?:number, heightRatio?:number}} gesture
 *        dy … 아래로 끈 거리(px) · vy … 손을 뗄 때 속도(px/ms, 아래가 +)
 *        height … 시트 높이(px, 모르면 0)
 * @returns {boolean}
 */
export function shouldDismissSheet(gesture = {}) {
  const dy = Number(gesture.dy);
  if (!Number.isFinite(dy) || dy <= 0) return false;

  const distance = Number.isFinite(Number(gesture.distance))
    ? Number(gesture.distance)
    : SHEET_DISMISS_DISTANCE;
  const velocity = Number.isFinite(Number(gesture.velocity))
    ? Number(gesture.velocity)
    : SHEET_DISMISS_VELOCITY;
  const flickMin = Number.isFinite(Number(gesture.flickMin))
    ? Number(gesture.flickMin)
    : SHEET_FLICK_MIN_DISTANCE;
  const heightRatio = Number.isFinite(Number(gesture.heightRatio))
    ? Number(gesture.heightRatio)
    : SHEET_DISMISS_HEIGHT_RATIO;

  if (dy >= distance) return true;

  const vy = Number(gesture.vy);
  if (Number.isFinite(vy) && vy >= velocity && dy >= flickMin) return true;

  const height = Number(gesture.height);
  if (Number.isFinite(height) && height > 0 && dy >= height * heightRatio) return true;

  return false;
}

/**
 * 닫힘 애니메이션 시간(ms) — 남은 거리가 길수록 조금 더 걸립니다 (120~320ms).
 * 시트 높이를 모르면 300px 로 가정합니다.
 */
export function sheetCloseDuration(dy, height) {
  const dragged = clampedDragOffset(dy);
  const total = Number.isFinite(Number(height)) && Number(height) > 0 ? Number(height) : 300;
  const remaining = Math.max(0, total - dragged);
  return Math.min(320, Math.max(120, Math.round(remaining * 0.6)));
}

/** 제자리로 돌아올 때 스프링 설정 (웹·네이티브 공통 · useNativeDriver:false) */
export const SHEET_SPRING_BACK = { toValue: 0, damping: 26, stiffness: 240, mass: 0.9 };
