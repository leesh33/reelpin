/**
 * src/components/longPressGesture.js — v2.33.0
 * ─────────────────────────────────────────────────────────────
 * 지도 위 **꾹 누르기**를 잡아 주는 작은 DOM 도우미 (웹 전용).
 *
 * 왜 지도 엔진 이벤트만 쓰지 않나
 *   · 네이버 지도는 `longtap`(1초 유지 후 뗄 때)을 주지만, Leaflet 폴백 지도는
 *     `contextmenu`(터치에서는 길게 누르기)라 엔진마다 이름·시점이 다릅니다.
 *   · 두 지도에 같은 체감(550ms)과 같은 규칙을 주려고 **포인터 이벤트로 직접** 잽니다.
 *   · 지도를 끌거나(12px 이상 이동) 두 손가락으로 확대할 때는 취소되어,
 *     기존 **핀 탭·팬·줌을 방해하지 않습니다**. (preventDefault 를 쓰지 않습니다)
 *
 * iOS 사파리(아이폰)도 포인터 이벤트를 지원하므로 같은 코드가 그대로 동작합니다.
 * `contextmenu` 만 막아, 꾹 누를 때 브라우저의 "이미지 저장" 같은 메뉴가 뜨지 않게 합니다.
 */
import {
  LONG_PRESS_MS,
  LONG_PRESS_MOVE_TOLERANCE_PX,
  movedBeyondTolerance,
  offsetPoint,
} from '../utils/longPressPlace';

/**
 * @param {HTMLElement} node 지도 DOM 컨테이너
 * @param {object} options
 *   · onLongPress({ x, y, clientX, clientY }) … x·y 는 컨테이너 안 offset 좌표
 *   · delay   … 꾹 누르기 인정 시간(ms)
 *   · tolerance … 취소되는 이동 거리(px)
 * @returns {() => void} 해제 함수
 */
export function bindLongPress(node, options = {}) {
  if (!node || typeof node.addEventListener !== 'function') return () => {};
  if (typeof window === 'undefined') return () => {};
  const delay = Number(options.delay) > 0 ? Number(options.delay) : LONG_PRESS_MS;
  const tolerance =
    Number(options.tolerance) > 0 ? Number(options.tolerance) : LONG_PRESS_MOVE_TOLERANCE_PX;
  const handler = typeof options.onLongPress === 'function' ? options.onLongPress : null;
  if (!handler) return () => {};

  let timer = null;
  let start = null;
  let pointerId = null;

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    start = null;
    pointerId = null;
  };

  const fire = () => {
    timer = null;
    const pressed = start;
    start = null;
    pointerId = null;
    if (!pressed) return;
    try {
      handler({
        x: pressed.x,
        y: pressed.y,
        clientX: pressed.clientX,
        clientY: pressed.clientY,
      });
    } catch (e) {
      /* 화면 쪽 오류로 지도가 멈추지 않게 */
    }
  };

  const onPointerDown = (event) => {
    if (!event) return;
    if (event.button != null && event.button !== 0 && event.pointerType === 'mouse') return;
    // 두 번째 손가락(핀치)이 닿으면 꾹 누르기가 아닙니다.
    if (event.isPrimary === false) {
      clear();
      return;
    }
    const rect = node.getBoundingClientRect();
    const point = offsetPoint(rect, event.clientX, event.clientY);
    if (!point) return;
    if (timer) clearTimeout(timer);
    start = {
      x: point.x,
      y: point.y,
      clientX: event.clientX,
      clientY: event.clientY,
      rectLeft: rect.left,
      rectTop: rect.top,
    };
    pointerId = event.pointerId == null ? null : event.pointerId;
    timer = setTimeout(fire, delay);
  };

  const onPointerMove = (event) => {
    if (!start || !event) return;
    if (pointerId != null && event.pointerId != null && event.pointerId !== pointerId) return;
    const next = offsetPoint(
      { left: start.rectLeft, top: start.rectTop },
      event.clientX,
      event.clientY
    );
    if (!next) return;
    if (movedBeyondTolerance(start, next, tolerance)) clear();
  };

  const onPointerUp = () => clear();
  const onPointerCancel = () => clear();

  const onContextMenu = (event) => {
    // 꾹 누를 때 브라우저 메뉴(이미지 저장·복사)가 지도 위에 뜨지 않게만 막습니다.
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    clear();
  };

  node.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerCancel, { passive: true });
  node.addEventListener('contextmenu', onContextMenu);

  return () => {
    clear();
    try {
      node.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      node.removeEventListener('contextmenu', onContextMenu);
    } catch (e) {
      /* 이미 사라진 노드 */
    }
  };
}
