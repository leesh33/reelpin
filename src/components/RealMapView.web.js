/**
 * src/components/RealMapView.web.js
 * ─────────────────────────────────────────────────────────────
 * v1.5 — 웹에서 진짜 지도(Leaflet + OpenStreetMap · CartoDB Voyager 타일)
 *
 * · 지도 키가 필요 없습니다. (타일 서버도 무료·무키)
 * · Leaflet 은 **useEffect 안에서만** 불러옵니다.
 *   → node(react-dom/server) 에서 이 컴포넌트를 렌더해도 `window is not defined` 가 나지 않습니다.
 * · 핀(카테고리별 색) · 내 위치 파란 점 · 반경 500m 원 · focus 변경 시 부드럽게 이동(flyTo)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, typography } from '../theme';
import { normalizeCoords } from '../services/location';

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@' + LEAFLET_VERSION + '/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@' + LEAFLET_VERSION + '/dist/leaflet.js';

// 타일: OpenStreetMap 표준 지도 (무료 · 키 없음)
// · 2026-11 CartoDB Voyager 는 키 없는 타일에 'API KEY REQUIRED' 워터마크를 넣어 OSM 표준으로 바꿨습니다.
// · OSM 타일 이용 정책: 출처 표기 필수 · 대량 수집 금지 (개인용 앱 수준 사용은 문제 없음)
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

const SEOUL = { lat: 37.5665, lng: 126.978 };

/** 카테고리별 핀 색 — 앱 지도(MapCanvas)와 같은 결 */
export function pinColor(pin, selected) {
  if (selected) return colors.coral;
  const category = (pin && pin.category) || '';
  if (category === '카페') return colors.mint;
  if (category === '디저트') return '#FFB86B';
  if (category === '베이커리') return '#FF8A6E';
  return '#FF7A5C';
}

// ── Leaflet 로더 (브라우저에서만, 한 번만) ────────────────────
let leafletPromise = null;

function loadLeaflet() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('no_dom'));
  }
  if (window.L && typeof window.L.map === 'function') return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    try {
      if (!document.querySelector('link[data-reelpin-leaflet]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = LEAFLET_CSS;
        link.setAttribute('data-reelpin-leaflet', 'css');
        document.head.appendChild(link);
      }

      const existing = document.querySelector('script[data-reelpin-leaflet="js"]');
      const done = () => {
        if (window.L && typeof window.L.map === 'function') resolve(window.L);
        else reject(new Error('leaflet_missing'));
      };
      if (existing) {
        existing.addEventListener('load', done);
        existing.addEventListener('error', () => reject(new Error('leaflet_network')));
        return;
      }

      const script = document.createElement('script');
      script.src = LEAFLET_JS;
      script.async = true;
      script.setAttribute('data-reelpin-leaflet', 'js');
      script.onload = done;
      script.onerror = () => reject(new Error('leaflet_network'));
      document.head.appendChild(script);
    } catch (e) {
      reject(e);
    }
  }).catch((err) => {
    // 다음 시도에서 다시 받아올 수 있게 캐시를 비웁니다.
    leafletPromise = null;
    throw err;
  });

  return leafletPromise;
}

/** RNW View 의 ref → 실제 DOM 노드 (SSR·구형 ref 형태 방어) */
function toDomNode(refValue) {
  if (!refValue) return null;
  if (typeof refValue === 'object' && refValue.nodeType === 1) return refValue;
  if (typeof refValue === 'object' && refValue._node && refValue._node.nodeType === 1) return refValue._node;
  return null;
}

export default function RealMapView({
  pins,
  selectedId,
  onSelect,
  myCoords,
  focus,
  focusKey,
  radiusMeters = 500,
  initialCenter,
  initialZoom = 13,
  onStatus,
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef(new Map());
  const meRef = useRef({ dot: null, circle: null });
  const didFitRef = useRef(false);
  const myCoordsRef = useRef(myCoords);
  const onSelectRef = useRef(onSelect);
  const [status, setStatus] = useState('loading'); // loading | ready | error

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    myCoordsRef.current = myCoords;
  }, [myCoords]);

  useEffect(() => {
    if (typeof onStatus === 'function') onStatus(status);
  }, [status, onStatus]);

  // 1) 지도 초기화 — 여기서만 Leaflet/DOM 을 건드립니다.
  useEffect(() => {
    let cancelled = false;
    let resizeObserver = null;
    let onWindowResize = null;

    const start = normalizeCoords(initialCenter) || normalizeCoords(myCoords) || (pins && pins[0] ? normalizeCoords(pins[0]) : null) || SEOUL;

    loadLeaflet()
      .then((L) => {
        if (cancelled) return;
        const node = toDomNode(hostRef.current);
        if (!node) {
          setStatus('error');
          return;
        }
        leafletRef.current = L;
        const map = L.map(node, {
          center: [start.lat, start.lng],
          zoom: initialZoom,
          zoomControl: false,
          attributionControl: true,
          zoomSnap: 0.5,
          tap: true,
          worldCopyJump: true,
        });

        L.tileLayer(TILE_URL, {
          maxZoom: 19,
          minZoom: 3,
          detectRetina: false,
          attribution: TILE_ATTRIBUTION,
        }).addTo(map);

        // 확대·축소는 아래 RN 버튼(styles.zoomCol)이 담당 — Leaflet 기본 컨트롤은 끕니다.
        if (typeof L.control.attribution === 'function') {
          map.attributionControl.setPosition('bottomleft');
        }

        mapRef.current = map;
        setStatus('ready');

        // RNW 레이아웃이 늦게 잡히는 경우가 있어 한 번 더 크기를 알려 줍니다.
        setTimeout(() => {
          if (!cancelled && mapRef.current === map) {
            try {
              map.invalidateSize();
            } catch (e) {}
          }
        }, 60);

        if (typeof ResizeObserver === 'function') {
          resizeObserver = new ResizeObserver(() => {
            try {
              map.invalidateSize();
            } catch (e) {}
          });
          resizeObserver.observe(node);
        }
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
          onWindowResize = () => {
            try {
              map.invalidateSize();
            } catch (e) {}
          };
          window.addEventListener('resize', onWindowResize);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      if (resizeObserver) {
        try {
          resizeObserver.disconnect();
        } catch (e) {}
      }
      if (onWindowResize && typeof window !== 'undefined') {
        window.removeEventListener('resize', onWindowResize);
      }
      markersRef.current.clear();
      meRef.current = { dot: null, circle: null };
      const map = mapRef.current;
      mapRef.current = null;
      if (map) {
        try {
          map.remove();
        } catch (e) {}
      }
    };
    // 최초 1회만 — 이후 변화는 아래 effect 들이 반영합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) 핀 마커
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || status !== 'ready') return;

    const alive = new Set();
    (pins || []).forEach((pin) => {
      const coords = normalizeCoords(pin);
      if (!coords || !pin.id) return;
      alive.add(pin.id);
      const isOn = pin.id === selectedId;
      const style = {
        radius: isOn ? 12 : 8,
        color: '#FFFFFF',
        weight: isOn ? 3 : 2,
        fillColor: pinColor(pin, isOn),
        fillOpacity: 1,
        opacity: 1,
      };

      let marker = markersRef.current.get(pin.id);
      if (!marker) {
        marker = L.circleMarker([coords.lat, coords.lng], style).addTo(map);
        marker.on('click', () => {
          if (typeof onSelectRef.current === 'function') onSelectRef.current(pin.id);
        });
        markersRef.current.set(pin.id, marker);
      } else {
        marker.setLatLng([coords.lat, coords.lng]);
        marker.setStyle(style);
      }
      marker.bindTooltip(pin.name || '', { direction: 'top', offset: [0, -8], opacity: 0.95 });
      if (isOn && typeof marker.bringToFront === 'function') marker.bringToFront();
    });

    // 첫 렌더에서 핀이 여러 개면 한눈에 보이게 범위를 맞춥니다 (내 위치가 이미 있으면 그대로).
    if (!didFitRef.current) {
      const points = (pins || [])
        .map((pin) => normalizeCoords(pin))
        .filter(Boolean)
        .map((c) => [c.lat, c.lng]);
      if (!normalizeCoords(myCoordsRef.current) && points.length >= 2) {
        didFitRef.current = true;
        try {
          map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 15 });
        } catch (e) {}
      }
    }

    Array.from(markersRef.current.keys()).forEach((id) => {
      if (alive.has(id)) return;
      const marker = markersRef.current.get(id);
      try {
        map.removeLayer(marker);
      } catch (e) {}
      markersRef.current.delete(id);
    });
  }, [pins, selectedId, status]);

  // 3) 내 위치 파란 점 + 반경 원
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || status !== 'ready') return;

    const coords = normalizeCoords(myCoords);
    if (!coords) {
      if (meRef.current.dot) {
        try {
          map.removeLayer(meRef.current.dot);
        } catch (e) {}
        meRef.current.dot = null;
      }
      if (meRef.current.circle) {
        try {
          map.removeLayer(meRef.current.circle);
        } catch (e) {}
        meRef.current.circle = null;
      }
      return;
    }

    const latlng = [coords.lat, coords.lng];
    if (!meRef.current.dot) {
      meRef.current.dot = L.circleMarker(latlng, {
        radius: 7,
        color: '#FFFFFF',
        weight: 3,
        fillColor: '#2563EB',
        fillOpacity: 1,
      }).addTo(map);
      meRef.current.dot.bindTooltip('내 위치', { direction: 'top', offset: [0, -8] });
    } else {
      meRef.current.dot.setLatLng(latlng);
    }

    const circleRadius = Number(radiusMeters) > 0 ? Number(radiusMeters) : 500;
    if (!meRef.current.circle) {
      meRef.current.circle = L.circle(latlng, {
        radius: circleRadius,
        color: '#3B82F6',
        weight: 1.5,
        opacity: 0.9,
        fillColor: '#3B82F6',
        fillOpacity: 0.12,
      }).addTo(map);
    } else {
      meRef.current.circle.setLatLng(latlng);
      meRef.current.circle.setRadius(circleRadius);
    }
  }, [myCoords, radiusMeters, status]);

  // 4) focusCoords 부드럽게 이동
  const focusLat = normalizeCoords(focus) ? normalizeCoords(focus).lat : null;
  const focusLng = normalizeCoords(focus) ? normalizeCoords(focus).lng : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready' || focusLat === null || focusLng === null) return;
    try {
      const zoom = Math.max(map.getZoom() || initialZoom, 16);
      map.flyTo([focusLat, focusLng], zoom, { duration: 0.9 });
    } catch (e) {
      try {
        map.setView([focusLat, focusLng], 16);
      } catch (err) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusLat, focusLng, focusKey, status]);

  const zoom = useCallback((direction) => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (direction === 'in') map.zoomIn(1);
      else map.zoomOut(1);
    } catch (e) {}
  }, []);

  const summary = useMemo(() => {
    if (status === 'ready') return null;
    if (status === 'error') {
      return {
        title: '지도를 불러오지 못했어요',
        sub: '인터넷 연결을 확인한 뒤 새로고침해 주세요. 핀·거리 알림은 그대로 쓸 수 있어요.',
        spinner: false,
      };
    }
    return { title: '지도를 불러오는 중…', sub: 'OpenStreetMap 타일을 받아오고 있어요', spinner: true };
  }, [status]);

  return (
    <View style={styles.root}>
      <View ref={hostRef} style={styles.mapHost} accessibilityLabel="실제 지도" />
      {status === 'ready' && (
        <View style={styles.zoomCol} pointerEvents="box-none">
          <Pressable
            style={[styles.zoomBtn, styles.zoomBtnTop]}
            onPress={() => zoom('in')}
            accessibilityRole="button"
            accessibilityLabel="지도 확대"
            hitSlop={6}
          >
            <Ionicons name="add" size={18} color={colors.white} />
          </Pressable>
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
      )}
      {summary && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.overlayCard}>
            {summary.spinner && <ActivityIndicator color={colors.coral} />}
            <Text style={styles.overlayTitle}>{summary.title}</Text>
            <Text style={styles.overlaySub}>{summary.sub}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.navy,
    overflow: 'hidden',
  },
  mapHost: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  zoomCol: {
    position: 'absolute',
    right: 12,
    bottom: 14,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  zoomBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.78)',
  },
  zoomBtnTop: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.24)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  overlayCard: {
    backgroundColor: 'rgba(15,23,42,0.86)',
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 8,
    maxWidth: 300,
  },
  overlayTitle: {
    ...typography.h3,
    fontSize: 14,
    color: colors.white,
  },
  overlaySub: {
    ...typography.sub,
    fontSize: 11,
    color: '#9FB0C8',
    textAlign: 'center',
  },
});
