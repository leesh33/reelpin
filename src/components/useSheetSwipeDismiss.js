/**
 * src/components/useSheetSwipeDismiss.js — v2.36.0
 * ─────────────────────────────────────────────────────────────
 * **레이어 팝업(LayerSheet)을 헤더 아래로 쓸어내려 닫는** 제스처 한 벌.
 *
 * 상훈 님 요청 (2026-11-21)
 *   "목록 보기 알림 내 정보는 레이어팝업 형태로 띄우는 거니까
 *    헤더를 아래로 스와이프 했을 때 아래로 접히는 걸로 하자"
 *
 *   · 판정 규칙은 장소 상세 시트와 **같은 파일**(`utils/sheetDismiss.js`)을 씁니다
 *     → 두 시트가 서로 다른 손맛을 낼 수 없습니다.
 *   · 헤더(아이콘 + 제목 + ✕ 줄)를 잡고 내리면 손가락을 따라 내려오고,
 *     96px 이상 내리거나 빠르게 튕기면 아래로 접혀 닫힙니다. 모자라면 제자리로.
 *   · 본문도 **스크롤이 맨 위**일 때만 같은 방식으로 당겨 닫을 수 있습니다
 *     (`useSheetBodyScroll()` 를 본문 ScrollView 에 펼쳐 스크롤 위치를 알려 줍니다).
 *   · ✕ 닫기 버튼 탭(움직임 0)과 본문 스크롤·가로 스와이프는 건드리지 않습니다.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder } from 'react-native';
import {
  SHEET_SPRING_BACK,
  clampedDragOffset,
  shouldDismissSheet,
  shouldStartBodyDrag,
  shouldStartHeaderDrag,
  sheetCloseDuration,
} from '../utils/sheetDismiss';

/** 본문 ScrollView 가 자기 스크롤 위치를 시트에 알려 주는 통로 */
const SheetBodyScrollContext = createContext(null);

/** 본문 스크롤 보고 props — 레이어 팝업 밖이면 빈 객체라 그대로 펼쳐도 안전합니다. */
export function useSheetBodyScroll() {
  const report = useContext(SheetBodyScrollContext);
  if (typeof report !== 'function') return EMPTY_SCROLL_PROPS;
  return { onScroll: report, scrollEventThrottle: 16 };
}

const EMPTY_SCROLL_PROPS = {};

/** LayerSheet 본문을 감싸 스크롤 보고 통로를 열어 줍니다. */
export function SheetBodyScrollScope({ reportScrollY, children }) {
  return (
    <SheetBodyScrollContext.Provider value={reportScrollY || null}>
      {children}
    </SheetBodyScrollContext.Provider>
  );
}

export function useSheetSwipeDismiss({ onClose, visible = true, enabled = true } = {}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const draggedRef = useRef(0);
  const sheetHeightRef = useRef(0);
  const scrollYRef = useRef(0);
  const closingRef = useRef(false);
  const enabledRef = useRef(enabled);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  /** 끄는 동안 시트를 손가락 위치로 (위로는 올라가지 않음) */
  const dragTo = useCallback(
    (dy) => {
      draggedRef.current = clampedDragOffset(dy);
      translateY.setValue(draggedRef.current);
    },
    [translateY]
  );

  /** 모자라면 제자리로 — 부드러운 스프링 */
  const springBack = useCallback(() => {
    draggedRef.current = 0;
    Animated.spring(translateY, { ...SHEET_SPRING_BACK, useNativeDriver: false }).start();
  }, [translateY]);

  /** 충분히 내렸으면 팝업을 화면 아래로 접어 내리고 닫기 */
  const closeWithAnimation = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const height = sheetHeightRef.current || 500;
    Animated.timing(translateY, {
      toValue: height,
      duration: sheetCloseDuration(draggedRef.current, height),
      useNativeDriver: false,
    }).start(() => {
      if (typeof closeRef.current === 'function') closeRef.current();
    });
  }, [translateY]);

  const releaseDrag = useCallback(
    (gesture) => {
      const dismiss = shouldDismissSheet({
        dy: gesture.dy,
        vy: gesture.vy,
        height: sheetHeightRef.current,
      });
      if (dismiss) closeWithAnimation();
      else springBack();
    },
    [closeWithAnimation, springBack]
  );

  /** 다시 열 때는 항상 처음(제자리·스크롤 맨 위)에서 시작 */
  const reset = useCallback(() => {
    closingRef.current = false;
    draggedRef.current = 0;
    scrollYRef.current = 0;
    translateY.setValue(0);
  }, [translateY]);

  useEffect(() => {
    if (visible) reset();
  }, [visible, reset]);

  /** 헤더 — 항상 잡힙니다. ✕ 탭은 움직임이 없어 그대로 눌립니다. */
  const headerPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (event, gesture) =>
          enabledRef.current &&
          !closingRef.current &&
          shouldStartHeaderDrag({ dy: gesture.dy, dx: gesture.dx }),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (event, gesture) => dragTo(gesture.dy),
        onPanResponderRelease: (event, gesture) => releaseDrag(gesture),
        onPanResponderTerminate: () => springBack(),
      }),
    [dragTo, releaseDrag, springBack]
  );

  /**
   * 본문 — 스크롤이 맨 위일 때만. 캡처 단계에서 잡아야
   * 안쪽 ScrollView 가 먼저 제스처를 가져가지 않습니다.
   */
  const bodyPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (event, gesture) =>
          enabledRef.current &&
          !closingRef.current &&
          shouldStartBodyDrag({ dy: gesture.dy, dx: gesture.dx, scrollY: scrollYRef.current }),
        onMoveShouldSetPanResponder: (event, gesture) =>
          enabledRef.current &&
          !closingRef.current &&
          shouldStartBodyDrag({ dy: gesture.dy, dx: gesture.dx, scrollY: scrollYRef.current }),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (event, gesture) => dragTo(gesture.dy),
        onPanResponderRelease: (event, gesture) => releaseDrag(gesture),
        onPanResponderTerminate: () => springBack(),
      }),
    [dragTo, releaseDrag, springBack]
  );

  const reportBodyScroll = useCallback((event) => {
    const y =
      event && event.nativeEvent && event.nativeEvent.contentOffset
        ? event.nativeEvent.contentOffset.y
        : 0;
    scrollYRef.current = Number.isFinite(y) ? y : 0;
  }, []);

  const onSheetLayout = useCallback((event) => {
    const height =
      event && event.nativeEvent && event.nativeEvent.layout
        ? event.nativeEvent.layout.height
        : 0;
    if (Number.isFinite(height) && height > 0) sheetHeightRef.current = height;
  }, []);

  return {
    translateY,
    headerPanHandlers: headerPan.panHandlers,
    bodyPanHandlers: bodyPan.panHandlers,
    onSheetLayout,
    reportBodyScroll,
    reset,
  };
}

export default useSheetSwipeDismiss;
