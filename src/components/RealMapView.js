/**
 * src/components/RealMapView.js — v2.41
 * ─────────────────────────────────────────────────────────────
 * 🗺️ **아이폰·안드로이드의 실제 네이버 지도** (WebView).
 *
 *   v1.0~v2.40 은 네이티브에서 도식 지도(`MapCanvas`)로 내려가 있었습니다.
 *   빌드 16 을 아이폰에서 열어 보니 실제 지도가 아니라 격자 그림이 떠서,
 *   웹(`RealMapView.web.js`)과 **같은 네이버 지도 v3** 를 WebView 안에서 띄웁니다.
 *
 *   · 지도 페이지는 `mapEmbedHtml.js` 가 만듭니다(`baseUrl` = https://reelpin.vercel.app →
 *     NCP 콘솔에 등록된 도메인 제약을 그대로 통과).
 *   · 핀(분류 색·라벨·선택 강조·클러스터) · 내 위치 파란 점 + 반경 원 · 꾹 누른 자리 핀은
 *     모두 페이지 안에서 그리고, RN 과는 `postMessage` 로만 주고받습니다.
 *   · 확대/축소 버튼은 웹과 같은 모양으로 RN 쪽에 그립니다(지도 페이지에는 컨트롤이 없음).
 *   · 네이버 지도를 못 불러오면(도메인 미등록·네트워크) **v1.x 도식 지도(`MapCanvas`)** 로
 *     조용히 내려가 흰 화면이 나가지 않습니다. (웹의 Leaflet 폴백과 같은 역할)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from './AppText';
import MapCanvas from './MapCanvas';
import { colors, mapControls, radius, typography } from '../theme';
import { getCategoryColor } from '../utils/categories';
import { normalizeCoords } from '../services/location';
import { buildMapEmbedHtml } from './mapEmbedHtml';

/** 지도 페이지의 출처 — NCP 콘솔에 등록된 도메인이어야 네이버 지도가 그려집니다 */
export const MAP_EMBED_BASE_URL = 'https://reelpin.vercel.app';
/** 네이버 지도를 못 불러왔을 때의 안내 (웹과 같은 문구) */
export const MAP_FALLBACK_NOTICE = '네이버 지도를 불러오지 못했어요 · 임시 지도 표시';

/** 지도 페이지가 받는 핀 모양 — 분류 색은 여기서 한 번만 계산해 넘깁니다 */
export function toEmbedPin(pin, categories) {
  const coords = normalizeCoords(pin);
  if (!pin || pin.id == null || !coords) return null;
  return {
    id: pin.id,
    name: String(pin.name || ''),
    lat: coords.lat,
    lng: coords.lng,
    color: getCategoryColor((pin && pin.category) || '', categories),
    visited: pin.visited === true,
  };
}

export default function RealMapView({
  pins,
  selectedId,
  onSelect,
  myCoords,
  focus,
  focusKey,
  fit = null,
  fitKey = 0,
  radiusMeters = 500,
  initialCenter,
  initialZoom = 13,
  categories,
  onStatus,
  hideNotice = false,
  onLongPress = null,
  droppedPoint = null,
  focusAnchorY = 0.5,
  // v2.42 — 앱이 화면 끝(홈 인디케이터)까지 그리므로 확대/축소·안내도 이만큼 올립니다.
  bottomLift = 0,
}) {
  const webRef = useRef(null);
  const readyRef = useRef(false);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [reloadKey, setReloadKey] = useState(0);

  const html = useMemo(() => buildMapEmbedHtml(), []);
  const embedPins = useMemo(
    () => (Array.isArray(pins) ? pins : []).map((pin) => toEmbedPin(pin, categories)).filter(Boolean),
    [pins, categories]
  );

  useEffect(() => {
    if (typeof onStatus === 'function') onStatus(status);
  }, [status, onStatus]);

  /** 페이지로 메시지 보내기 — 로드 전에는 조용히 무시됩니다(준비되면 다시 보냅니다) */
  const post = useCallback((payload) => {
    const node = webRef.current;
    if (!node || typeof node.injectJavaScript !== 'function') return;
    try {
      node.injectJavaScript(
        'window.__reelpinReceive && window.__reelpinReceive(' + JSON.stringify(payload) + ');true;'
      );
    } catch (e) {
      /* 주입 실패는 다음 상태 전송에서 다시 시도합니다 */
    }
  }, []);

  const sendState = useCallback(() => {
    post({
      type: 'state',
      pins: embedPins,
      selectedId: selectedId == null ? null : selectedId,
      myCoords: normalizeCoords(myCoords),
      radiusMeters,
      droppedPoint: normalizeCoords(droppedPoint),
      fit: Array.isArray(fit) ? fit.map((point) => normalizeCoords(point)).filter(Boolean) : null,
      fitKey,
      focus: normalizeCoords(focus),
      focusKey,
      focusAnchorY,
      initialCenter: normalizeCoords(initialCenter),
      initialZoom,
    });
  }, [
    post,
    embedPins,
    selectedId,
    myCoords,
    radiusMeters,
    droppedPoint,
    fit,
    fitKey,
    focus,
    focusKey,
    focusAnchorY,
    initialCenter,
    initialZoom,
  ]);

  // 준비된 뒤에는 무엇이 바뀌든 전체 상태를 한 번 보냅니다 (페이지가 알아서 비교)
  useEffect(() => {
    if (status !== 'ready') return;
    sendState();
  }, [status, sendState]);

  const handleMessage = useCallback(
    (event) => {
      let message = null;
      try {
        message = JSON.parse((event && event.nativeEvent && event.nativeEvent.data) || '{}');
      } catch (e) {
        return;
      }
      if (!message || !message.type) return;
      if (message.type === 'ready') {
        readyRef.current = true;
        setStatus('ready');
        sendState();
        return;
      }
      if (message.type === 'error') {
        readyRef.current = false;
        setStatus('error');
        return;
      }
      if (message.type === 'select') {
        if (typeof onSelect === 'function') onSelect(message.id);
        return;
      }
      if (message.type === 'longpress') {
        const coords = normalizeCoords({ lat: message.lat, lng: message.lng });
        if (coords && typeof onLongPress === 'function') onLongPress(coords);
      }
    },
    [onSelect, onLongPress, sendState]
  );

  const zoom = useCallback(
    (dir) => {
      post({ type: 'zoom', dir });
    },
    [post]
  );

  const retry = useCallback(() => {
    readyRef.current = false;
    setStatus('loading');
    setReloadKey((n) => n + 1);
  }, []);

  return (
    <View style={styles.root}>
      {status !== 'error' && (
        <WebView
          key={reloadKey}
          ref={webRef}
          style={styles.web}
          originWhitelist={['*']}
          source={{ html, baseUrl: MAP_EMBED_BASE_URL }}
          javaScriptEnabled
          domStorageEnabled={false}
          cacheEnabled={false}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback
          androidLayerType="hardware"
          onMessage={handleMessage}
          onError={() => setStatus('error')}
          // v2.43 · 빌드 22 — iOS 가 백그라운드에서 WKWebView 프로세스를 종료한 채 돌아오면
          //   죽은 WebView 위에 #0F172A 배경과 +/− 버튼만 남았습니다(빌드 21 TestFlight IMG_9336,
          //   30분 이상 백그라운드 후 복귀). iOS 콜백 `onContentProcessDidTerminate` 가 없어서
          //   아무것도 다시 그리지 못한 탓입니다 — 프로세스가 죽으면 곧바로 key 를 올려 다시 띄웁니다.
          onContentProcessDidTerminate={retry}
          onRenderProcessGone={retry}
          testID="map-webview"
        />
      )}

      {status === 'error' && (
        <Pressable style={styles.fallbackWrap} onPress={retry} accessibilityRole="button" accessibilityLabel="지도 다시 불러오기">
          <MapCanvas
            pins={pins}
            selectedId={selectedId}
            onSelect={onSelect}
            radius={radiusMeters}
            categories={categories}
          />
        </Pressable>
      )}

      {status === 'ready' && (
        // v2.42 · 빌드 20 — 두 버튼을 **하나의 둥근 박스**로 감싸 `−` 버튼 아래 모서리가
        //   잘린 듯 보이지 않게 했습니다(빌드 19 스크린샷 IMG_9332: "축소버튼도 짤려있어").
        //   모양은 웹(RealMapView.web.js)과 같습니다 — 둥근 네모 + 가운데 1px 구분선.
        <View style={[styles.zoomCol, { bottom: mapControls.zoomBottom + bottomLift }]} pointerEvents="box-none">
          <View style={styles.zoomBox}>
            <Pressable
              style={[styles.zoomBtn, styles.zoomBtnTop]}
              onPress={() => zoom('in')}
              accessibilityRole="button"
              accessibilityLabel="지도 확대"
              hitSlop={6}
            >
              <Ionicons name="add" size={18} color={colors.white} />
            </Pressable>
            <View style={styles.zoomDivider} />
            <Pressable
              style={styles.zoomBtn}
              onPress={() => zoom('out')}
              accessibilityRole="button"
              accessibilityLabel="지도 축소"
              hitSlop={6}
            >
              <Ionicons name="remove" size={18} color={colors.white} />
            </Pressable>
          </View>
        </View>
      )}

      {status === 'error' && !hideNotice && (
        <View style={[styles.noticeWrap, { bottom: mapControls.zoomBottom + 52 + bottomLift }]} pointerEvents="none">
          <Pressable style={styles.noticePill} onPress={retry} accessibilityRole="button" accessibilityLabel="지도 다시 불러오기">
            <Ionicons name="information-circle" size={12} color={colors.white} />
            <Text style={styles.noticeText} numberOfLines={2}>
              {MAP_FALLBACK_NOTICE}
            </Text>
          </Pressable>
        </View>
      )}

      {status === 'loading' && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.overlayCard}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.overlayTitle}>지도를 불러오는 중…</Text>
            <Text style={styles.overlaySub}>네이버 지도를 연결하고 있어요</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy, overflow: 'hidden' },
  web: { flex: 1, backgroundColor: colors.navy },
  fallbackWrap: { flex: 1 },
  zoomCol: {
    position: 'absolute',
    right: mapControls.rightInset,
    bottom: mapControls.zoomBottom,
    alignItems: 'center',
  },
  // v2.42 — 위(`+`)·아래(`−`)를 담는 하나의 둥근 박스. 예전엔 위 버튼에만 위쪽 모서리 라운드를 주고
  //   아래 버튼은 각진 사각형이라, 마지막(축소) 버튼이 잘린 것처럼 보였습니다.
  zoomBox: {
    width: mapControls.controlSize,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(15,23,42,0.82)',
    overflow: 'hidden',
  },
  zoomBtn: {
    width: '100%',
    height: mapControls.controlSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnTop: {
    // 모서리는 감싸는 박스(zoomBox)가 맡습니다 — 여기서는 배경만.
  },
  zoomDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  noticeWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: mapControls.zoomBottom + 52, // + bottomLift 는 화면에서 더합니다(v2.42)
    alignItems: 'center',
  },
  noticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15,23,42,0.86)',
  },
  noticeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCard: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(15,23,42,0.86)',
  },
  overlayTitle: { color: colors.white, fontSize: typography.small, fontWeight: '800' },
  overlaySub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '500' },
});
