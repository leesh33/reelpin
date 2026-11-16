import React, { useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, typography } from '../theme';

/**
 * 지오펜스 알림 배너
 * · v1.5 실제 위치: title/sub 를 넘겨 "반경 500m 앞 …" + "가게명 · 320m" 로 표시
 * · 위치를 아직 모를 때(needsLocation): 데모 문구 대신 **솔직한 안내 + [내 위치] 버튼**
 * 탭하면 해당 핀으로 포커스(상세 시트) — 상위 화면이 onPress 로 처리합니다.
 *
 * v2.1.2 — 흰 지도·밝은 타일 위에서 묻히지 않도록 **다크 차콜 카드 + 흰 글씨**로 바꿨습니다.
 *   · 반경 안(진입, `지금`): 코랄 아이콘 + 진한 코랄 테두리 + 코랄 배지로 한 번 더 강조
 *   · 반경 밖(가장 가까운 곳, tone='muted'): 차콜 카드 + 회색 배지
 *
 * v2.1.3 — '반경 300m 앞, 저장한 맛집이 있어요 / 뚝섬 카페 · 크루아상' 처럼 **없는 사실을
 *   지어내지 않습니다.** 상위 화면이 넘긴 title 이 없으면 아무것도 그리지 않고(return null),
 *   위치를 모를 때는 needsLocation 안내 배너만 보여 줍니다.
 *
 * v2.14.1 — **위로 스와이프해서 닫기** (상훈 님 요청: "맨위에 알림배너는 위로 스와이프하면 없어지게").
 *   · 손가락을 따라 배너가 위로 밀려 올라가고, 32px 이상 끌거나 빠르게 튕기면(onDismiss) 부드럽게
 *     위로 사라집니다. 살짝만 끌다 놓으면 원위치로 스냅백.
 *   · 웹(아이폰 사파리)에서는 React Native Web 의 PanResponder 가 터치 스크롤과 부딪히므로
 *     **DOM 터치 이벤트(onTouchStart/Move/End) + 포인터(마우스) 드래그**로 직접 처리하고,
 *     네이티브(iOS·안드로이드)는 PanResponder 로 처리합니다.
 *   · 스와이프로 닫을 때 손가락이 배너 위에서 떨어져도 '탭'으로 오인해 핀 상세가 열리지 않도록
 *     움직임이 있었던 제스처의 onPress 는 한 번 무시합니다.
 */

/** 위로 이만큼(px) 끌면 닫힙니다. */
export const DISMISS_SWIPE_DISTANCE = 32;
/** 살짝만 끌어도 이만큼(px) 이상 + 이 속도(px/ms, 위로)로 튕기면 닫힙니다. */
export const DISMISS_FLICK_MIN_DISTANCE = 12;
export const DISMISS_FLICK_VELOCITY = 0.5;
/** 닫힐 때 위로 밀려 올라가는 거리(px). */
export const DISMISS_OFFSCREEN_DISTANCE = 96;
/** 닫힘 애니메이션 길이(ms). */
export const DISMISS_ANIM_MS = 160;

/**
 * 스와이프 결과 판정 — 화면 없이 규칙만 검사할 수 있게 따로 둡니다.
 * @param {{dy?: number, vy?: number}} gesture dy … 시작점 대비 세로 이동(위로 = 음수), vy … px/ms(위로 = 음수)
 */
export function swipeDismissDecision(gesture = {}) {
  const dy = Number(gesture.dy) || 0;
  const vy = Number(gesture.vy) || 0;
  const upDistance = -dy;
  if (upDistance <= 0) return false; // 아래로 끄는 건 닫기가 아닙니다(스냅백).
  if (upDistance >= DISMISS_SWIPE_DISTANCE) return true;
  return upDistance >= DISMISS_FLICK_MIN_DISTANCE && vy <= -DISMISS_FLICK_VELOCITY;
}

/** 위치를 아직 모를 때의 기본 안내 문구 (상위 화면이 hintTitle 로 바꿀 수 있음) */
export const NEEDS_LOCATION_TITLE = '내 위치를 켜면 가까운 맛집과 500m 알림이 보여요';
export const NEEDS_LOCATION_SUB = '지금 있는 곳 기준으로 알려드려요';
export const NEEDS_LOCATION_ACTION = '내 위치';

/**
 * v2.17 — 지도 위 상단 배너를 띄울 상태인가?
 *
 *   상훈 님: "가까운 저장 장소 알림 배너는 상시로 저렇게 떠 있는 건 아니지? 근처에 해당되는 핀이
 *            있을 때만 저렇게 뜨는 거지?" → "진짜 반경 500m 안에 들어왔을 때만 뜨고 밖일 땐 지도를
 *            안 가리게 숨길까요?" → **"응, 그렇게 해 줘"**
 *
 * 그래서 **반경 500m 안에 핀이 있는 'near' 일 때만** 배너를 그립니다.
 *   · 'closest'       … 반경 밖 가장 가까운 곳 (예전엔 늘 떠 있었음) → 숨김
 *   · 'needs-location' … 내 위치를 아직 모를 때 → 숨김 (오른쪽 아래 [내 위치] 버튼·🔔 알림 모음이 안내)
 *   · 'empty' / 'none' … 저장한 핀이 없거나 좌표가 없을 때 → 숨김 (지도 가운데 안내 카드가 대신)
 * 반경 밖에서도 가까운 저장 장소는 헤더 **🔔 알림 모음**에서 언제든 볼 수 있습니다.
 */
export function shouldShowBanner(mode) {
  return mode === 'near';
}

// 드래그 중에는 Animated.Value.setValue 로 직접 따라가므로, 애니메이션도 같은 JS 드라이버로 통일합니다.
// (네이티브 드라이버와 섞으면 setValue ↔ native animation 사이에서 경고·충돌이 날 수 있습니다)
const USE_NATIVE_DRIVER = false;
const now = () => Date.now();

export default function GeofenceBanner({
  pin,
  radiusMeters,
  onPress,
  onLocate,
  onDismiss,
  locating,
  empty,
  needsLocation,
  hintTitle,
  hintSub,
  title,
  sub,
  badge,
  tone,
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const dismissingRef = useRef(false);
  const lastDismissAtRef = useRef(0);
  // 진행 중인 드래그 상태 — 웹(touch/pointer)과 네이티브(PanResponder)가 같은 값을 씁니다.
  const gestureRef = useRef({ active: false, source: null, startY: 0, lastY: 0, lastT: 0, vy: 0 });
  // 스와이프로 손가락을 뗀 직후의 '탭'을 한 번 무시합니다(핀 상세가 엉뚱하게 열리지 않게).
  const skipPressRef = useRef(false);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const beginGesture = useCallback(
    (source, y) => {
      if (dismissingRef.current) return;
      const g = gestureRef.current;
      if (g.active && g.source !== source) return;
      g.active = true;
      g.source = source;
      g.startY = y;
      g.lastY = y;
      g.startT = now();
      g.lastT = g.startT;
      g.vy = 0;
      translateY.stopAnimation();
    },
    [translateY]
  );

  const moveGesture = useCallback(
    (source, y) => {
      const g = gestureRef.current;
      if (!g.active || g.source !== source) return;
      const t = now();
      const dt = Math.max(1, t - g.lastT);
      g.vy = (y - g.lastY) / dt; // 위로 갈수록 음수
      g.lastY = y;
      g.lastT = t;
      const dy = y - g.startY;
      // 아래로 끌 때는 저항을 줘서 카드가 제자리에서 살짝만 따라오게 합니다.
      const followed = dy > 0 ? dy * 0.18 : dy;
      translateY.setValue(Math.max(followed, -DISMISS_OFFSCREEN_DISTANCE));
    },
    [translateY]
  );

  const settle = useCallback(
    (dy, vy) => {
      const canDismiss = typeof onDismissRef.current === 'function';
      if (canDismiss && swipeDismissDecision({ dy, vy })) {
        dismissingRef.current = true;
        lastDismissAtRef.current = now();
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -DISMISS_OFFSCREEN_DISTANCE,
            duration: DISMISS_ANIM_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: DISMISS_ANIM_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
        ]).start(({ finished }) => {
          if (finished && typeof onDismissRef.current === 'function') onDismissRef.current();
        });
        return;
      }
      // 살짝만 끌었다 놓으면 원위치로 부드럽게 되돌립니다.
      Animated.spring(translateY, {
        toValue: 0,
        bounciness: 0,
        speed: 18,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
      Animated.timing(opacity, {
        toValue: 1,
        duration: 120,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    },
    [opacity, translateY]
  );

  const endGesture = useCallback(
    (source) => {
      const g = gestureRef.current;
      if (!g.active || g.source !== source) return;
      g.active = false;
      g.source = null;
      const dy = g.lastY - g.startY;
      // 터치가 끝난 뒤 브라우저가 보내는 click(=onPress) 한 번을 무시합니다.
      if (Math.abs(dy) >= 8) {
        skipPressRef.current = true;
        // click 이 오지 않는 경우(스크롤 등)에 대비해 잠시 뒤 스스로 풀립니다.
        setTimeout(() => {
          skipPressRef.current = false;
        }, 600);
      }
      settle(dy, g.vy);
    },
    [settle]
  );

  // 네이티브 — PanResponder (세로로 6px 이상 움직였을 때만 가져옵니다: 탭은 그대로 Pressable 로)
  const panResponder = useRef(null);
  if (!panResponder.current && Platform.OS !== 'web') {
    panResponder.current = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (e, g) => g.dy <= -6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: (e, g) => beginGesture('native', g.y0),
      onPanResponderMove: (e, g) => {
        if (!gestureRef.current.active) beginGesture('native', g.y0);
        moveGesture('native', g.moveY);
      },
      onPanResponderRelease: (e, g) => {
        gestureRef.current.vy = g.vy;
        gestureRef.current.lastY = gestureRef.current.startY + g.dy;
        endGesture('native');
      },
      onPanResponderTerminate: (e, g) => {
        gestureRef.current.vy = g.vy;
        endGesture('native');
      },
      onPanResponderTerminationRequest: () => true,
    });
  }
  const panHandlers = panResponder.current ? panResponder.current.panHandlers : null;

  // 웹 — 아이폰 사파리 터치 + 마우스(포인터) 드래그. React Native Web 이 그대로 DOM 에 넘깁니다.
  const touchY = (event, changed) => {
    const ne = event && event.nativeEvent;
    const list = changed ? ne && ne.changedTouches : ne && ne.touches;
    if (!list || !list.length) return null;
    return list[0].clientY;
  };

  const webGestureProps = Platform.OS === 'web'
    ? {
        onTouchStart: (e) => {
          const y = touchY(e, false);
          if (y !== null) beginGesture('touch', y);
        },
        onTouchMove: (e) => {
          const y = touchY(e, false);
          if (y !== null) moveGesture('touch', y);
        },
        onTouchEnd: (e) => {
          const y = touchY(e, true);
          if (y !== null && gestureRef.current.source === 'touch') {
            gestureRef.current.lastY = y;
          }
          endGesture('touch');
        },
        onTouchCancel: () => endGesture('touch'),
        onPointerDown: (e) => {
          const ne = e && e.nativeEvent;
          if (!ne) return;
          if (ne.pointerType === 'touch') return; // 터치는 위 touch 핸들러가 맡습니다(중복 방지)
          if (ne.pointerType === 'mouse' && ne.buttons === 0) return;
          beginGesture('pointer', ne.clientY);
        },
        onPointerMove: (e) => {
          const ne = e && e.nativeEvent;
          if (!ne || ne.pointerType === 'touch') return;
          moveGesture('pointer', ne.clientY);
        },
        onPointerUp: () => endGesture('pointer'),
        onPointerCancel: () => endGesture('pointer'),
      }
    : {};

  /** 탭 — 방금 스와이프로 뗀 손가락이면 한 번 무시합니다. */
  const handlePress = (handler) => () => {
    if (skipPressRef.current) {
      skipPressRef.current = false;
      return;
    }
    if (typeof handler === 'function') handler();
  };

  let content = null;

  if (empty) {
    content = (
      <Pressable style={styles.wrap} onPress={handlePress(onPress)} accessibilityRole="button">
        <View style={[styles.iconWrap, styles.iconEmpty]}>
          <Ionicons name="add" size={22} color={colors.white} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>아직 저장한 핀이 없어요</Text>
          <Text style={styles.sub} numberOfLines={1}>
            릴스 링크를 붙여넣어 첫 핀을 꽂아 보세요
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#8B96AB" />
      </Pressable>
    );
  } else if (needsLocation) {
    // 위치를 아직 모를 때 — 가짜 거리·가게명 대신, 무엇을 켜면 무엇이 보이는지 솔직하게.
    content = (
      <View style={styles.wrap} accessibilityLabel={hintTitle || NEEDS_LOCATION_TITLE}>
        <Pressable
          style={styles.hintBody}
          onPress={handlePress(onPress)}
          accessibilityRole="button"
          accessibilityLabel="지금 있는 곳 기준으로 보기"
        >
          <View style={[styles.iconWrap, styles.iconNeeds]}>
            <Ionicons name="locate-outline" size={22} color={colors.coral} />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.title} numberOfLines={2}>
              {hintTitle || NEEDS_LOCATION_TITLE}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {hintSub || NEEDS_LOCATION_SUB}
            </Text>
          </View>
        </Pressable>
        <Pressable
          style={styles.locateBtn}
          onPress={handlePress(onLocate)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="내 위치 켜기"
        >
          {locating ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.locateText}>{NEEDS_LOCATION_ACTION}</Text>
          )}
        </Pressable>
      </View>
    );
  } else {
    // 실시간 배너는 상위 화면이 넘긴 사실만 그립니다. 넘긴 값이 없으면 아무것도 그리지 않습니다.
    const mainTitle = title || '';
    const mainSub = sub || '';
    if (mainTitle || mainSub) {
      const mainBadge = badge || '지금';
      const muted = tone === 'muted';
      content = (
        <Pressable
          style={[styles.wrap, muted ? styles.wrapMuted : styles.wrapLive]}
          onPress={handlePress(onPress)}
          accessibilityRole="button"
          accessibilityLabel={mainTitle + (mainSub ? ', ' + mainSub : '')}
        >
          <View style={[styles.iconWrap, muted ? styles.iconMuted : styles.iconLive]}>
            <Ionicons name={muted ? 'navigate-outline' : 'location'} size={22} color={colors.white} />
          </View>
          <View style={styles.textWrap}>
            {!!mainTitle && (
              <Text style={styles.title} numberOfLines={1}>
                {mainTitle}
              </Text>
            )}
            {!!mainSub && (
              <Text style={styles.sub} numberOfLines={1}>
                {mainSub}
              </Text>
            )}
          </View>
          <View style={[styles.nowChip, muted ? styles.nowChipMuted : styles.nowChipLive]}>
            <Text style={[styles.nowText, muted ? styles.nowTextMuted : styles.nowTextLive]}>
              {mainBadge}
            </Text>
          </View>
        </Pressable>
      );
    }
  }

  if (!content) return null;

  return (
    <Animated.View
      style={[
        styles.swipeWrap,
        { transform: [{ translateY }], opacity },
      ]}
      {...webGestureProps}
      {...(panHandlers || {})}
      testID="geofence-banner"
      accessibilityHint="위로 밀면 이 알림을 닫을 수 있어요"
    >
      {content}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // 스와이프 래퍼 — 배너 카드 자체의 모양·여백은 그대로 두고 위아래로만 움직입니다.
  swipeWrap: {},
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    // 흰 지도·밝은 타일 위에서도 카드 경계가 보이도록 다크 차콜 + 밝은 테두리
    backgroundColor: colors.charcoal,
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.34,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  // 반경 500m 안(지금 근처) — 코랄 테두리로 한 번 더 눈에 띄게
  wrapLive: {
    borderColor: 'rgba(255,90,54,0.72)',
  },
  wrapMuted: {
    borderColor: 'rgba(255,255,255,0.18)',
  },
  hintBody: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLive: {
    backgroundColor: colors.coral,
  },
  // 위치를 아직 모를 때 — 채우지 않고 테두리만(아직 '켜짐'이 아니라는 표시)
  iconNeeds: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  iconEmpty: {
    backgroundColor: '#3E4A63',
  },
  iconMuted: {
    backgroundColor: '#2C3546',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typography.h3,
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  sub: {
    ...typography.sub,
    fontSize: 12,
    marginTop: 2,
    color: '#C7D0E0',
  },
  locateBtn: {
    height: 34,
    minWidth: 62,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locateText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  nowChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  nowChipLive: {
    backgroundColor: colors.coral,
  },
  nowChipMuted: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  nowText: {
    ...typography.tiny,
    fontSize: 10,
    fontWeight: '800',
  },
  nowTextLive: {
    color: colors.white,
  },
  nowTextMuted: {
    color: '#C7D0E0',
  },
});
