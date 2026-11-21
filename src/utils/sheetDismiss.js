/**
 * src/utils/sheetDismiss.js — v2.36.0
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
 *
 * v2.36.0 — 상훈 님 요청: "목록 보기 알림 내 정보는 레이어팝업 형태로 띄우는 거니까
 *   헤더를 아래로 스와이프 했을 때 아래로 접히는 걸로 하자"
 *   → 같은 판정 규칙을 레이어 팝업(LayerSheet)에도 씁니다. 헤더 · 본문(스크롤 맨 위)에서
 *     **언제 드래그를 시작할지**도 이 파일에서 정합니다(화면 없이 검사).
 */

/** 이만큼(px) 내리면 닫힘 */
export const SHEET_DISMISS_DISTANCE = 96;

/** 이 속도(px/ms) 이상으로 튕기면 조금만 내려도 닫힘 */
export const SHEET_DISMISS_VELOCITY = 0.5;

/** 플릭으로 인정하는 최소 이동(px) — 살짝 튕긴 실수로 닫히지 않게 */
export const SHEET_FLICK_MIN_DISTANCE = 24;

/** 시트 높이 대비 이만큼 끌어내리면 닫힘 (아주 큰 시트) */
export const SHEET_DISMISS_HEIGHT_RATIO = 0.4;

/** 헤더에서 아래로 끌기 시작하는 최소 이동(px) — ✕ 탭(움직임 0)을 건드리지 않게 */
export const SHEET_HEADER_DRAG_MIN = 6;

/** 본문에서 아래로 끌기 시작하는 최소 이동(px) — 스크롤과 헷갈리지 않게 조금 더 둡니다 */
export const SHEET_BODY_DRAG_MIN = 12;

/** 본문은 세로 이동이 가로 이동의 이 배수보다 커야 합니다 (가로 스와이프·칩 넘기기 방해 없음) */
export const SHEET_BODY_DRAG_AXIS_RATIO = 1.2;

/** 스크롤이 이만큼(px) 내려가 있으면 본문 당기기를 양보합니다 (0 = 맨 위) */
export const SHEET_BODY_SCROLL_TOP_TOLERANCE = 1;

/** 끄는 동안 시트가 따라 내려갈 거리(px) — 위로는 움직이지 않습니다 */
export function clampedDragOffset(dy) {
  const value = Number(dy);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

/**
 * 헤더(핸들·제목·✕ 줄)에서 아래로 끌기를 시작할지 판정합니다.
 *   · 6px 넘게, 세로로 움직였을 때만 — ✕ 를 누르는 탭은 그대로 눌립니다.
 * @param {{dy?:number, dx?:number, minDy?:number}} gesture
 * @returns {boolean}
 */
export function shouldStartHeaderDrag(gesture = {}) {
  const dy = Number(gesture.dy);
  const dx = Number(gesture.dx);
  if (!Number.isFinite(dy) || dy <= 0) return false;
  const minDy = Number.isFinite(Number(gesture.minDy)) ? Number(gesture.minDy) : SHEET_HEADER_DRAG_MIN;
  if (dy <= minDy) return false;
  return Math.abs(dy) > Math.abs(Number.isFinite(dx) ? dx : 0);
}

/**
 * 본문(스크롤 영역)에서 아래로 당기기를 시작할지 판정합니다.
 *   · 스크롤이 **맨 위일 때만** — 내려가 있으면 스크롤에 양보합니다.
 *   · 12px 넘게, 세로로(가로의 1.2배 이상) 움직였을 때만 — 탭·가로 스와이프는 그대로.
 * @param {{dy?:number, dx?:number, scrollY?:number, minDy?:number,
 *          axisRatio?:number, scrollTopTolerance?:number}} gesture
 * @returns {boolean}
 */
export function shouldStartBodyDrag(gesture = {}) {
  const dy = Number(gesture.dy);
  const dx = Number(gesture.dx);
  if (!Number.isFinite(dy) || dy <= 0) return false;
  const minDy = Number.isFinite(Number(gesture.minDy)) ? Number(gesture.minDy) : SHEET_BODY_DRAG_MIN;
  if (dy <= minDy) return false;
  const ratio = Number.isFinite(Number(gesture.axisRatio))
    ? Number(gesture.axisRatio)
    : SHEET_BODY_DRAG_AXIS_RATIO;
  const sideways = Math.abs(Number.isFinite(dx) ? dx : 0);
  if (Math.abs(dy) <= sideways * ratio) return false;
  const tolerance = Number.isFinite(Number(gesture.scrollTopTolerance))
    ? Number(gesture.scrollTopTolerance)
    : SHEET_BODY_SCROLL_TOP_TOLERANCE;
  const scrollY = Number(gesture.scrollY);
  if (Number.isFinite(scrollY) && scrollY > tolerance) return false;
  return true;
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
