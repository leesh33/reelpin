/**
 * src/components/RealMapView.web.js
 * ─────────────────────────────────────────────────────────────
 * v1.6 — 웹 지도를 **네이버 지도(NAVER Maps Dynamic Map v3)** 로 교체
 *
 * · 1순위: 네이버 지도 (NCP Maps Dynamic Map v3, `ncpKeyId` 파라미터)
 * · 안전 폴백: 도메인 미등록 등으로 **인증 실패**(`window.navermap_authFailure`) 하거나
 *   스크립트를 못 받아오면, 하얀 화면 대신 **안내 배너 + 기존 Leaflet(OSM) 지도**로 자동 전환합니다.
 * · 지도 스크립트는 **useEffect 안에서만** 불러옵니다.
 *   → node(react-dom/server) 에서 이 컴포넌트를 렌더해도 `window is not defined` 가 나지 않습니다.
 * · 핀(카테고리별 색 + 선택 강조 + 클릭) · 내 위치 파란 점 · 반경 500m 원(naver.maps.Circle)
 *   · 확대/축소 버튼 · focus 변경 시 부드럽게 이동(panTo/morph) · 첫 화면 핀 전체 보이게(fitBounds)
 *
 * 클라이언트 아이디(`a1mxcz4n34`)는 **웹 JS 스크립트에 그대로 노출되는 공개 ID**입니다.
 * (NCP 콘솔에 등록한 도메인에서만 동작하도록 제한하는 용도 — Client Secret 과 다릅니다.)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, mapControls, radius, typography } from '../theme';
import { normalizeCoords } from '../services/location';

// ── 네이버 지도 설정 ──────────────────────────────────────────
/**
 * NCP Maps Dynamic Map v3 의 **공개 클라이언트 아이디**.
 * 2025년 3월 NCP 콘솔 개편 이후 신규 앱은 `ncpClientId` 가 아니라 **`ncpKeyId`** 파라미터를 씁니다.
 *   https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html
 */
export const NAVER_MAP_CLIENT_ID = 'a1mxcz4n34';
export const NAVER_MAPS_ORIGIN = 'https://oapi.map.naver.com/openapi/v3/maps.js';

/** 빌드 시 주입되는 `EXPO_PUBLIC_NAVER_MAP_CLIENT_ID` → 없으면 위 상수. */
export function resolveNaverClientId() {
  try {
    if (typeof process !== 'undefined' && process && process.env) {
      const fromEnv = process.env.EXPO_PUBLIC_NAVER_MAP_CLIENT_ID;
      if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
    }
  } catch (e) {}
  return NAVER_MAP_CLIENT_ID;
}

/** 네이버 지도 v3 스크립트 주소 — 신규 앱 규격(`ncpKeyId`) */
export function buildNaverScriptUrl(clientId) {
  const id = (clientId && String(clientId).trim()) || NAVER_MAP_CLIENT_ID;
  return NAVER_MAPS_ORIGIN + '?ncpKeyId=' + encodeURIComponent(id);
}

/** 폴백 안내 문구 — 브리프 문구 그대로 */
export const FALLBACK_NOTICE = '네이버 콘솔에 도메인 등록 확인 중 · 임시 지도 표시';
export const FALLBACK_NOTICE_NETWORK = '네이버 지도를 불러오지 못했어요 · 임시 지도 표시';

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@' + LEAFLET_VERSION + '/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@' + LEAFLET_VERSION + '/dist/leaflet.js';

// 타일: OpenStreetMap 표준 지도 (무료 · 키 없음) — 폴백 지도용
// · 2026-11 CartoDB Voyager 는 키 없는 타일에 'API KEY REQUIRED' 워터마크를 넣어 OSM 표준으로 바꿨습니다.
// · OSM 타일 이용 정책: 출처 표기 필수 · 대량 수집 금지 (개인용 앱 수준 사용은 문제 없음)
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

const SEOUL = { lat: 37.5665, lng: 126.978 };
const NAVER_SCRIPT_TIMEOUT_MS = 9000;

/** 카테고리별 핀 색 — 앱 지도(MapCanvas)와 같은 결 */
export function pinColor(pin, selected) {
  if (selected) return colors.coral;
  const category = (pin && pin.category) || '';
  if (category === '카페') return colors.mint;
  if (category === '디저트') return '#FFB86B';
  if (category === '베이커리') return '#FF8A6E';
  return '#FF7A5C';
}

// ── 네이버 지도 로더 (브라우저에서만) ─────────────────────────
let naverPromise = null;
/** 인증 실패는 도메인 등록 전까지 계속 실패하므로, 한 번 확인되면 다시 시도하지 않습니다. */
let naverBlocked = null;
/** 지금 화면에 떠 있는 네이버 지도가 인증 실패를 통보받는 통로 */
let naverFailureListener = null;

function notifyNaverFailure(reason) {
  naverBlocked = naverBlocked || new Error(reason);
  if (typeof naverFailureListener === 'function') {
    try {
      naverFailureListener(reason);
    } catch (e) {}
  }
}

function installAuthFailureHook() {
  if (typeof window === 'undefined') return;
  // 스크립트를 넣기 **전에** 정의해야 인증 실패를 놓치지 않습니다.
  window.navermap_authFailure = function () {
    notifyNaverFailure('naver_auth');
  };
}

function naverMapsApi() {
  if (typeof window === 'undefined') return null;
  const nv = window.naver;
  if (nv && nv.maps && typeof nv.maps.Map === 'function') return nv.maps;
  return null;
}

function loadNaverMaps() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('no_dom'));
  }
  if (naverBlocked) return Promise.reject(naverBlocked);
  const already = naverMapsApi();
  if (already) return Promise.resolve(already);
  if (naverPromise) return naverPromise;

  naverPromise = new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const fail = (reason) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      naverPromise = null;
      reject(new Error(reason));
    };

    try {
      installAuthFailureHook();
      timer = setTimeout(() => fail('naver_timeout'), NAVER_SCRIPT_TIMEOUT_MS);

      const done = () => {
        if (settled) return;
        const api = naverMapsApi();
        if (!api) return fail('naver_missing');
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(api);
      };

      const existing = document.querySelector('script[data-reelpin-naver="js"]');
      if (existing) {
        existing.addEventListener('load', done);
        existing.addEventListener('error', () => fail('naver_network'));
        return;
      }

      const script = document.createElement('script');
      script.src = buildNaverScriptUrl(resolveNaverClientId());
      script.async = true;
      script.setAttribute('data-reelpin-naver', 'js');
      script.onload = done;
      script.onerror = () => fail('naver_network');
      document.head.appendChild(script);
    } catch (e) {
      fail('naver_network');
    }
  }).catch((err) => {
    // 다음 시도(새로고침·재진입)에서 다시 받아올 수 있게 캐시를 비웁니다.
    naverPromise = null;
    throw err;
  });

  return naverPromise;
}

// ── Leaflet 로더 (폴백 지도, 브라우저에서만 한 번만) ───────────
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

function startLatLng(initialCenter, myCoords, pins) {
  return (
    normalizeCoords(initialCenter) ||
    normalizeCoords(myCoords) ||
    (pins && pins[0] ? normalizeCoords(pins[0]) : null) ||
    SEOUL
  );
}

function measuredSize(node) {
  if (!node) return null;
  const w = node.clientWidth || node.offsetWidth || 0;
  const h = node.clientHeight || node.offsetHeight || 0;
  if (!(w > 0 && h > 0)) return null;
  return { w, h };
}

// ═════════════════════════════════════════════════════════════
// 1) 네이버 지도 (1순위)
// ═════════════════════════════════════════════════════════════
function NaverMap({
  pins,
  selectedId,
  onSelect,
  myCoords,
  focus,
  focusKey,
  radiusMeters = 500,
  initialCenter,
  initialZoom = 13,
  controlsRef,
  onReady,
  onFail,
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const nvRef = useRef(null);
  const markersRef = useRef(new Map());
  const meRef = useRef({ dot: null, circle: null });
  const didFitRef = useRef(false);
  const myCoordsRef = useRef(myCoords);
  const onSelectRef = useRef(onSelect);
  const onReadyRef = useRef(onReady);
  const onFailRef = useRef(onFail);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    myCoordsRef.current = myCoords;
  }, [myCoords]);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    onFailRef.current = onFail;
  }, [onFail]);

  // 1) 지도 초기화 — 여기서만 네이버 지도/DOM 을 건드립니다.
  useEffect(() => {
    let cancelled = false;
    let resizeObserver = null;
    const start = startLatLng(initialCenter, myCoordsRef.current, pins);

    // 인증 실패는 지도 생성 뒤에 늦게 올 수도 있어, 화면이 살아 있는 동안 계속 듣습니다.
    naverFailureListener = (reason) => {
      if (!cancelled) onFailRef.current(reason || 'naver_auth');
    };

    loadNaverMaps()
      .then((nv) => {
        if (cancelled) return;
        const node = toDomNode(hostRef.current);
        if (!node) {
          onFailRef.current('no_node');
          return;
        }
        const size = measuredSize(node);
        const map = new nv.Map(
          node,
          Object.assign(
            {
              center: new nv.LatLng(start.lat, start.lng),
              zoom: initialZoom,
              minZoom: 3,
              maxZoom: 19,
              zoomControl: false,
              scaleControl: false,
              mapDataControl: false,
              logoControl: true,
            },
            size ? { size: new nv.Size(size.w, size.h) } : {}
          )
        );
        nvRef.current = nv;
        mapRef.current = map;

        const applySize = () => {
          if (cancelled || mapRef.current !== map) return;
          const next = measuredSize(node);
          if (!next) return;
          try {
            map.setSize(new nv.Size(next.w, next.h));
          } catch (e) {}
        };

        // RNW 레이아웃이 늦게 잡히는 경우가 있어 한 번 더 크기를 알려 줍니다.
        setTimeout(applySize, 80);
        if (typeof ResizeObserver === 'function') {
          resizeObserver = new ResizeObserver(applySize);
          resizeObserver.observe(node);
        }

        controlsRef.current = {
          zoomIn: () => {
            try {
              map.setZoom(Math.min(map.getZoom() + 1, map.getMaxZoom()), true);
            } catch (e) {}
          },
          zoomOut: () => {
            try {
              map.setZoom(Math.max(map.getZoom() - 1, map.getMinZoom()), true);
            } catch (e) {}
          },
        };
        setReady(true);
        if (typeof onReadyRef.current === 'function') onReadyRef.current();
      })
      .catch((err) => {
        if (!cancelled) onFailRef.current((err && err.message) || 'naver_failed');
      });

    return () => {
      cancelled = true;
      if (naverFailureListener) naverFailureListener = null;
      if (controlsRef) controlsRef.current = null;
      if (resizeObserver) {
        try {
          resizeObserver.disconnect();
        } catch (e) {}
      }
      markersRef.current.clear();
      meRef.current = { dot: null, circle: null };
      const map = mapRef.current;
      mapRef.current = null;
      if (map) {
        try {
          map.destroy();
        } catch (e) {}
      }
    };
    // 최초 1회만 — 이후 변화는 아래 effect 들이 반영합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) 핀 마커 (카테고리 색 + 선택 강조 + 클릭 → onSelect)
  useEffect(() => {
    const map = mapRef.current;
    const nv = nvRef.current;
    if (!map || !nv || !ready) return;

    const alive = new Set();
    (pins || []).forEach((pin) => {
      const coords = normalizeCoords(pin);
      if (!coords || !pin.id) return;
      alive.add(pin.id);
      const isOn = pin.id === selectedId;
      const position = new nv.LatLng(coords.lat, coords.lng);
      const icon = pinIcon(nv, pin, isOn);

      let marker = markersRef.current.get(pin.id);
      if (!marker) {
        marker = new nv.Marker({
          position,
          map,
          icon,
          title: pin.name || '',
          zIndex: isOn ? 100 : 1,
          clickable: true,
        });
        nv.Event.addListener(marker, 'click', () => {
          if (typeof onSelectRef.current === 'function') onSelectRef.current(pin.id);
        });
        markersRef.current.set(pin.id, marker);
      } else {
        marker.setPosition(position);
        marker.setIcon(icon);
        marker.setTitle(pin.name || '');
        marker.setZIndex(isOn ? 100 : 1);
      }
    });

    // 첫 렌더에서 핀이 여러 개면 한눈에 보이게 범위를 맞춥니다 (내 위치가 이미 있으면 그대로).
    if (!didFitRef.current) {
      const coords = (pins || []).map((pin) => normalizeCoords(pin)).filter(Boolean);
      if (!normalizeCoords(myCoordsRef.current) && coords.length >= 2) {
        didFitRef.current = true;
        try {
          const bounds = new nv.LatLngBounds();
          coords.forEach((c) => bounds.extend(new nv.LatLng(c.lat, c.lng)));
          map.fitBounds(bounds, { top: 56, right: 56, bottom: 56, left: 56, maxZoom: 15 });
        } catch (e) {}
      }
    }

    Array.from(markersRef.current.keys()).forEach((id) => {
      if (alive.has(id)) return;
      const marker = markersRef.current.get(id);
      try {
        marker.setMap(null);
      } catch (e) {}
      markersRef.current.delete(id);
    });
  }, [pins, selectedId, ready]);

  // 3) 내 위치 파란 점 + 반경 500m 원
  useEffect(() => {
    const map = mapRef.current;
    const nv = nvRef.current;
    if (!map || !nv || !ready) return;

    const coords = normalizeCoords(myCoords);
    if (!coords) {
      if (meRef.current.dot) {
        try {
          meRef.current.dot.setMap(null);
        } catch (e) {}
        meRef.current.dot = null;
      }
      if (meRef.current.circle) {
        try {
          meRef.current.circle.setMap(null);
        } catch (e) {}
        meRef.current.circle = null;
      }
      return;
    }

    const position = new nv.LatLng(coords.lat, coords.lng);
    if (!meRef.current.dot) {
      meRef.current.dot = new nv.Marker({
        position,
        map,
        icon: myDotIcon(nv),
        title: '내 위치',
        zIndex: 200,
        clickable: false,
      });
    } else {
      meRef.current.dot.setPosition(position);
    }

    const circleRadius = Number(radiusMeters) > 0 ? Number(radiusMeters) : 500;
    if (!meRef.current.circle) {
      meRef.current.circle = new nv.Circle({
        map,
        center: position,
        radius: circleRadius,
        strokeColor: '#3B82F6',
        strokeWeight: 1.5,
        strokeOpacity: 0.9,
        fillColor: '#3B82F6',
        fillOpacity: 0.12,
        zIndex: 50,
      });
    } else {
      meRef.current.circle.setCenter(position);
      meRef.current.circle.setRadius(circleRadius);
    }
  }, [myCoords, radiusMeters, ready]);

  // 4) focusCoords 부드럽게 이동
  const focusLat = normalizeCoords(focus) ? normalizeCoords(focus).lat : null;
  const focusLng = normalizeCoords(focus) ? normalizeCoords(focus).lng : null;
  useEffect(() => {
    const map = mapRef.current;
    const nv = nvRef.current;
    if (!map || !nv || !ready || focusLat === null || focusLng === null) return;
    const zoom = Math.max(map.getZoom() || initialZoom, 16);
    const target = new nv.LatLng(focusLat, focusLng);
    try {
      // morph: 가까우면 부드럽게, 줌이 바뀌면 애니메이션만 유지
      map.morph(target, zoom, { duration: 500, easing: 'easeOutCubic' });
    } catch (e) {
      try {
        map.panTo(target);
        map.setZoom(zoom, true);
      } catch (err) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusLat, focusLng, focusKey, ready]);

  return <View ref={hostRef} style={styles.mapHost} accessibilityLabel="네이버 지도" />;
}

/** 저장 핀 — 카테고리 색 원형 + 흰 테두리, 선택 시 확대 */
function pinIcon(nv, pin, selected) {
  const size = selected ? 26 : 18;
  const border = selected ? 3 : 2;
  const color = pinColor(pin, selected);
  const html =
    '<div style="width:' +
    size +
    'px;height:' +
    size +
    'px;box-sizing:border-box;border-radius:50%;background:' +
    color +
    ';border:' +
    border +
    'px solid #FFFFFF;box-shadow:0 2px 6px rgba(0,0,0,0.35);cursor:pointer;"></div>';
  return { content: html, anchor: new nv.Point(size / 2, size / 2) };
}

/** 내 위치 파란 점 */
function myDotIcon(nv) {
  const html =
    '<div style="width:14px;height:14px;box-sizing:border-box;border-radius:50%;background:#2563EB;' +
    'border:3px solid #FFFFFF;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>';
  return { content: html, anchor: new nv.Point(7, 7) };
}

// ═════════════════════════════════════════════════════════════
// 2) Leaflet 폴백 지도 (네이버 인증 실패·스크립트 실패 시)
// ═════════════════════════════════════════════════════════════
function LeafletMap({
  pins,
  selectedId,
  onSelect,
  myCoords,
  focus,
  focusKey,
  radiusMeters = 500,
  initialCenter,
  initialZoom = 13,
  controlsRef,
  onReady,
  onFail,
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef(new Map());
  const meRef = useRef({ dot: null, circle: null });
  const didFitRef = useRef(false);
  const myCoordsRef = useRef(myCoords);
  const onSelectRef = useRef(onSelect);
  const onReadyRef = useRef(onReady);
  const onFailRef = useRef(onFail);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    myCoordsRef.current = myCoords;
  }, [myCoords]);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    onFailRef.current = onFail;
  }, [onFail]);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver = null;
    let onWindowResize = null;

    const start = startLatLng(initialCenter, myCoordsRef.current, pins);

    loadLeaflet()
      .then((L) => {
        if (cancelled) return;
        const node = toDomNode(hostRef.current);
        if (!node) {
          onFailRef.current('no_node');
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

        // 확대·축소는 RN 버튼(styles.zoomCol)이 담당 — Leaflet 기본 컨트롤은 끕니다.
        if (typeof L.control.attribution === 'function') {
          map.attributionControl.setPosition('bottomleft');
        }

        mapRef.current = map;

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

        controlsRef.current = {
          zoomIn: () => {
            try {
              map.zoomIn(1);
            } catch (e) {}
          },
          zoomOut: () => {
            try {
              map.zoomOut(1);
            } catch (e) {}
          },
        };
        setReady(true);
        if (typeof onReadyRef.current === 'function') onReadyRef.current();
      })
      .catch((err) => {
        if (!cancelled) onFailRef.current((err && err.message) || 'leaflet_failed');
      });

    return () => {
      cancelled = true;
      if (controlsRef) controlsRef.current = null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 핀 마커
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !ready) return;

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
  }, [pins, selectedId, ready]);

  // 내 위치 파란 점 + 반경 원
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !ready) return;

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
  }, [myCoords, radiusMeters, ready]);

  // focusCoords 부드럽게 이동
  const focusLat = normalizeCoords(focus) ? normalizeCoords(focus).lat : null;
  const focusLng = normalizeCoords(focus) ? normalizeCoords(focus).lng : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || focusLat === null || focusLng === null) return;
    try {
      const zoom = Math.max(map.getZoom() || initialZoom, 16);
      map.flyTo([focusLat, focusLng], zoom, { duration: 0.9 });
    } catch (e) {
      try {
        map.setView([focusLat, focusLng], 16);
      } catch (err) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusLat, focusLng, focusKey, ready]);

  return <View ref={hostRef} style={styles.mapHost} accessibilityLabel="임시 지도" />;
}

// ═════════════════════════════════════════════════════════════
// 3) 껍데기 — 엔진 선택(네이버 → Leaflet 폴백) + 공용 버튼·안내
// ═════════════════════════════════════════════════════════════
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
  const controlsRef = useRef(null);
  // 인증 실패가 이미 확인된 세션이면 곧바로 폴백 지도로 시작합니다.
  const [engine, setEngine] = useState(() => (naverBlocked ? 'leaflet' : 'naver'));
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [notice, setNotice] = useState(() => (naverBlocked ? FALLBACK_NOTICE : ''));

  useEffect(() => {
    if (typeof onStatus === 'function') onStatus(status);
  }, [status, onStatus]);

  const naverReady = useCallback(() => {
    setStatus('ready');
  }, []);

  const naverFail = useCallback((reason) => {
    setNotice(reason === 'naver_network' || reason === 'naver_timeout' || reason === 'naver_missing'
      ? FALLBACK_NOTICE_NETWORK
      : FALLBACK_NOTICE);
    setStatus('loading');
    setEngine('leaflet');
  }, []);

  const leafletReady = useCallback(() => {
    setStatus('ready');
  }, []);

  const leafletFail = useCallback(() => {
    setStatus('error');
  }, []);

  const zoom = useCallback((direction) => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (direction === 'in' && typeof controls.zoomIn === 'function') controls.zoomIn();
    if (direction === 'out' && typeof controls.zoomOut === 'function') controls.zoomOut();
  }, []);

  const engineProps = {
    pins,
    selectedId,
    onSelect,
    myCoords,
    focus,
    focusKey,
    radiusMeters,
    initialCenter,
    initialZoom,
    controlsRef,
  };

  const summary = useMemo(() => {
    if (status === 'ready') return null;
    if (status === 'error') {
      return {
        title: '지도를 불러오지 못했어요',
        sub: '인터넷 연결을 확인한 뒤 새로고침해 주세요. 핀·거리 알림은 그대로 쓸 수 있어요.',
        spinner: false,
      };
    }
    if (engine === 'naver') {
      return { title: '지도를 불러오는 중…', sub: '네이버 지도를 연결하고 있어요', spinner: true };
    }
    return { title: '지도를 불러오는 중…', sub: 'OpenStreetMap 타일을 받아오고 있어요', spinner: true };
  }, [status, engine]);

  return (
    <View style={styles.root}>
      {engine === 'naver' ? (
        <NaverMap {...engineProps} onReady={naverReady} onFail={naverFail} />
      ) : (
        <LeafletMap {...engineProps} onReady={leafletReady} onFail={leafletFail} />
      )}

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

      {!!notice && (
        <View style={styles.noticeWrap} pointerEvents="none">
          <View style={styles.noticePill}>
            <Ionicons name="information-circle" size={12} color={colors.white} />
            <Text style={styles.noticeText} numberOfLines={2}>
              {notice}
            </Text>
          </View>
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
    // '주변 500m · 지도 공유 · 내 위치'와 같은 오른쪽 끝선 (theme.mapControls)
    right: mapControls.rightInset,
    // 지도 아래 끝의 NAVER 로고와 겹치지 않게 띄웁니다.
    bottom: mapControls.zoomBottom,
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
  noticeWrap: {
    position: 'absolute',
    left: 12,
    bottom: 56,
    maxWidth: '74%',
  },
  noticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15,23,42,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  noticeText: {
    color: '#E4EAF4',
    fontSize: 10.5,
    fontWeight: '700',
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
