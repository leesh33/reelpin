import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import RealMapView from '../components/RealMapView';
import AppHeader from '../components/AppHeader';
import FilterChips from '../components/FilterChips';
// v2.5 — 🔍 내 핀 검색 · 📋 목록 보기
// v2.6 — 검색 결과 1곳이면 그 핀으로 지도 이동, 2곳 이상이면 검색창 아래 결과 목록
// v2.16 — 지도 위 검색창은 상단 헤더 🔍(검색 레이어 팝업)로 올라갔습니다.
//         지도 화면에는 분류 필터 칩만 남기고, 목록 보기의 검색은 그대로 둡니다.
// v2.17 — 지도 상단 2번째 줄(방문 필터 칩)과 오른쪽 `지도 공유` 를 없애고,
//         **가본 곳만 보기 · 지도 공유하기** 를 왼쪽 하단 펼침 메뉴(MapToolsMenu)로 모았습니다.
import PinListView from '../components/PinListView';
import MapToolsMenu, { toolsSummary } from '../components/MapToolsMenu';
import LayerSheet from '../components/LayerSheet';
import {
  DEFAULT_CATEGORIES,
  countByCategory,
  filterOptions,
  nextFilterAfterRemoval,
  nextFilterAfterRename,
} from '../utils/categories';
import GeofenceToast, { GEOFENCE_TOAST_MS, nearbyToastMessage } from '../components/GeofenceToast';
import PinDetailSheet from '../components/PinDetailSheet';
// v2.20 — 매장 상세 조회(영업시간·추천 메뉴)
// v2.28.0 — 지도 위 영업 상태 뱃지(bannerOpeningBadge)는 배너와 함께 걷어냈습니다(한 줄 토스트엔 넣지 않음).
import { fetchPlaceInfo, needsPlaceInfo, pinHoursPatch } from '../services/placeInfo';
import {
  NEARBY_RADIUS_M,
  distanceMap,
  findNearbyPins,
  formatDistance,
  geolocationPermissionState,
  nearestPin,
  readLocationGrantedFlag,
  requestCurrentPosition,
  shouldAutoLocate,
  watchPosition,
  writeLocationGrantedFlag,
} from '../services/location';
import {
  firstNewNearby,
  isNotificationSupported,
  notificationPermission,
  requestNotificationPermission,
  showNearbyNotification,
} from '../services/notifications';
import { colors, cardShadow, mapControls, radius, typography } from '../theme';
import { buildShareUrl, canNativeShare, nativeShare, shareMessage } from '../utils/shareMap';
import {
  VISIT_ALL,
  VISIT_DONE,
  countByVisit,
  filterAndSearchPins,
  filterByVisit,
  normalizeVisitFilter,
} from '../utils/searchPins';
import {
  SEARCH_DEBOUNCE_MS,
  mapCoordsOf,
  pinMapCoords,
  planSearchNavigation,
  searchMatches,
  searchNavigationKey,
} from '../utils/searchNav';

export default function MapScreen({
  pins,
  categories = DEFAULT_CATEGORIES,
  lastCategoryChange = null,
  onChangePinCategory,
  onAddCategory,
  selectedPinId,
  onSelectPin,
  radiusMeters,
  onGoPaste,
  onDeletePin,
  onTogglePinVisited,
  onChangePinMemo,
  // v2.20 — 매장 상세(영업시간·추천 메뉴)를 확인해 핀에 저장 (App 이 로컬에 보관)
  onSavePinHours,
  onToast,
  sharedPins = [],
  onAddSharedPins,
  onDismissShared,
  header,
  onMyCoords,
  focusPin,
  alertCoords,
  // v2.19 — 컬렉션만 보기: { id, name, emoji, pinIds } · null 이면 전체
  collectionFilter = null,
  onClearCollectionFilter,
  // v2.19.1 — 🔔 반경 내 알림 (내 정보 › 알림 설정 과 같은 상태) — App 이 갖고 있습니다
  alertsEnabled = false,
  onToggleAlerts,
  // v2.25.0 — 상세 시트의 [🗺️ 지도에서 보기]: 검색·알림·메뉴 같은 앞선 레이어를 닫고 지도 탭으로
  onDismissOverlays,
  // v2.28.0 — `목록 보기` 레이어가 열렸는지 App 에게 알려 줍니다(하단 탭바를 숨기기 위해).
  onListSheetChange,
}) {
  /**
   * v2.15 — 공통 헤더(🔔 알림 모음 · 👤 계정)가 어느 탭에서든 지금 위치를 알 수 있게,
   * 위치를 잡을 때마다 상위(App)로 한 번씩 알려 줍니다.
   */
  const onMyCoordsRef = useRef(typeof onMyCoords === 'function' ? onMyCoords : null);
  useEffect(() => {
    onMyCoordsRef.current = typeof onMyCoords === 'function' ? onMyCoords : null;
  }, [onMyCoords]);
  const [filter, setFilter] = useState('전체');
  // v2.10 — ✅ 방문 상태 필터 ('전체' | '미방문' | '가봤어요')
  // v2.17 — 지도 상단 칩이 없어지고 왼쪽 하단 메뉴의 **가본 곳만 보기 Y/N** 이 이 값을 켜고 끕니다.
  //         (목록 보기의 방문 칩은 그대로 이 값을 씁니다 → 어느 쪽에서 바꿔도 지도·목록이 같은 상태)
  const [visitFilter, setVisitFilter] = useState(VISIT_ALL);
  // v2.17 — 왼쪽 하단 지도 도구(가본 곳만 보기 · 지도 공유하기) 펌찌기
  const [toolsOpen, setToolsOpen] = useState(false);
  const visitedOnly = visitFilter === VISIT_DONE;

  // ── v2.5 검색어 · 지도/목록 전환 ──────────────────────────────
  //   query … 내 핀 검색어 (가게명·지역·주소·분류·메뉴태그)
  //   view  … 'map'(지도) | 'list'(목록)
  const [query, setQuery] = useState('');
  const [view, setView] = useState('map');
  // navQuery … 디바운스된 검색어 (지도 이동은 이 값으로만 결정 → 한글 조합 중 튐 방지)
  const [navQuery, setNavQuery] = useState('');
  // fit … 검색 결과·목록의 핀 여러 곳을 한 화면에 담을 좌표 묶음 (지도에 범위 맞추기 요청)
  const [fit, setFit] = useState(null);
  const [fitKey, setFitKey] = useState(0);

  const viewRef = useRef(view);
  const myCoordsRef = useRef(null);
  const viewBeforeRef = useRef('map');
  const searchActiveRef = useRef(false);
  const navKeyRef = useRef('');

  /**
   * v2.28.0 — `목록 보기` 레이어가 열려 있는 동안 App 은 하단 탭바를 숨깁니다.
   *   목록 시트는 화면 바닥까지 내려오므로, 그 뒤에 남은 알약이 시트 아래로 비쳐 보이지 않게 합니다.
   */
  useEffect(() => {
    if (typeof onListSheetChange !== 'function') return undefined;
    onListSheetChange(view === 'list');
    return () => onListSheetChange(false);
  }, [view, onListSheetChange]);

  // v2.19 — 컬렉션만 보기: 지금 걸린 컬렉션과 그 핀 id 집합 (아래 필터·효과가 함께 씁니다)
  const collectionActive = Boolean(collectionFilter && collectionFilter.id);
  const collectionIdSet = useMemo(
    () => new Set(collectionActive ? collectionFilter.pinIds || [] : []),
    [collectionActive, collectionFilter]
  );

  /**
   * v2.2 — 분류를 이름 바꾸거나 지우면 지도 필터도 함께 정리합니다.
   *   · 이름을 바꿈 → 그 분류를 보고 있었다면 새 이름을 계속 봅니다
   *   · 지움         → 그 분류를 보고 있었다면 '전체'로 돌아갑니다
   *   · 목록에 없는 분류 → '전체'
   */
  useEffect(() => {
    setFilter((current) => {
      if (current === '전체') return current;
      if (lastCategoryChange && lastCategoryChange.type === 'rename' && current === lastCategoryChange.from) {
        return nextFilterAfterRename(current, lastCategoryChange.from, lastCategoryChange.to);
      }
      if (lastCategoryChange && lastCategoryChange.type === 'remove' && current === lastCategoryChange.name) {
        return nextFilterAfterRemoval(current, lastCategoryChange.name);
      }
      if (filterOptions(categories).indexOf(current) < 0) return '전체';
      return current;
    });
  }, [categories, lastCategoryChange]);

  /**
   * v2.19 — 컬렉션 [지도에서 보기] 로 들어오면:
   *   · 분류·방문·검색 필터를 '전체'로 되돌리고
   *   · 지도를 그 컬렉션의 핀들에 바로 맞춥니다(한눈에 들어오게)
   * 같은 컬렉션에 머무는 동안(핀을 담고 빼는 중)에는 다시 움직이지 않습니다.
   */
  const collectionKeyRef = useRef(null);
  useEffect(() => {
    const key = collectionActive ? collectionFilter.id : '';
    if (collectionKeyRef.current === key) return;
    collectionKeyRef.current = key;
    if (!collectionActive) return;
    setFilter('전체');
    setVisitFilter(VISIT_ALL);
    setQuery('');
    setView('map');
    setNearbyOpen(false);
    const coords = mapCoordsOf((pins || []).filter((p) => p && collectionIdSet.has(String(p.id))));
    if (coords.length >= 2) {
      setFit(coords);
      setFitKey((k) => k + 1);
    } else if (coords.length === 1) {
      setFocus({ lat: coords[0].lat, lng: coords[0].lng });
      setFocusKey((k) => k + 1);
    }
  }, [collectionActive, collectionFilter, collectionIdSet, pins]);

  // ── v1.5 실제 위치 ────────────────────────────────────────
  const [myCoords, setMyCoords] = useState(null);
  const [focus, setFocus] = useState(null);
  const [focusKey, setFocusKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [nearbyOpen, setNearbyOpen] = useState(false);
  // v2.19.1 — 반경 내 알림은 App(내 정보 › 알림 설정)이 가진 값 하나를 그대로 따릅니다.
  //           (예전처럼 지도 안에서만 켜고 끄면 설정 화면과 어귯나는 일이 없음)
  const alertsOn = Boolean(alertsEnabled);
  // v2.28.0 — 반경 500m 알림 토스트 상태
  //   nearbyToast     … 지금 떠 있는 한 줄 알림 { key, count } · null 이면 안 보임
  //   shownNearKeyRef … 이번 세션에서 이미 알린 가게 묶음 키 (같은 묶음은 다시 띄우지 않음)
  //   nearKeyNonce    … [내 위치]를 직접 누르면 +1 — 같은 묶음이라도 다시 보여 줍니다
  const [nearbyToast, setNearbyToast] = useState(null);
  const shownNearKeyRef = useRef('');
  const [nearKeyNonce, setNearKeyNonce] = useState(0);
  const nearbyToastTimer = useRef(null);
  const [notifyPermission, setNotifyPermission] = useState(() => notificationPermission());

  const notifiedRef = useRef(new Set());
  const pinsRef = useRef(pins);
  const toastRef = useRef(onToast);
  const autoLocateRef = useRef(false);

  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    myCoordsRef.current = myCoords;
  }, [myCoords]);

  useEffect(() => {
    toastRef.current = onToast;
  }, [onToast]);

  const showToast = useCallback((message) => {
    if (typeof toastRef.current === 'function') toastRef.current(message);
  }, []);

  //분류 필터 **AND** 검색어 — 지도에 꽂히는 핀과 목록이 같은 목록을 씁니다.
  // v2.10 — 그 위에 ✅ 방문 상태까지 AND. 칩 숫자는 방문 필터를 빼고 세야 맞습니다.
  // v2.19 — 컬렉션을 보고 있으면 그 컬렉션에 담긴 핀만 남깁니다(상단 📂칩).
  const baseFiltered = useMemo(() => {
    const list = filterAndSearchPins(pins, { filter, query });
    if (!collectionActive) return list;
    return list.filter((p) => p && collectionIdSet.has(String(p.id)));
  }, [pins, filter, query, collectionActive, collectionIdSet]);
  const visitCounts = useMemo(() => countByVisit(baseFiltered), [baseFiltered]);
  const filtered = useMemo(() => filterByVisit(baseFiltered, visitFilter), [baseFiltered, visitFilter]);
  // v2.0 — 공유받은 지도는 '미리보기'로 지도에 함께 띄우고, 상세 시트는 읽기 전용으로 엽니다.
  const previewPins = useMemo(() => (Array.isArray(sharedPins) ? sharedPins.filter(Boolean) : []), [sharedPins]);
  // v2.25.0 — 상세 시트의 [🗺️ 지도에서 보기]로 연 핀이 분류·검색·방문·컬렉션 필터에 가려져 있으면
  //   필터를 풀지 않고 **이 핀만** 지도에 함께 꿴습니다. (아래 mapPins)
  const [revealPinId, setRevealPinId] = useState(null);
  const revealPin = useMemo(() => {
    if (!revealPinId) return null;
    const all = previewPins.concat(Array.isArray(pins) ? pins : []);
    return all.find((p) => p && String(p.id) === String(revealPinId)) || null;
  }, [revealPinId, pins, previewPins]);
  const mapPins = useMemo(() => {
    const base = previewPins.length ? previewPins.concat(filtered) : filtered;
    if (!revealPin) return base;
    if (base.some((p) => p && String(p.id) === String(revealPin.id))) return base;
    return base.concat(revealPin);
  }, [previewPins, filtered, revealPin]);
  // 필터를 바꾸면 "이 핀만 보여 주기"도 끝냅니다 — 다음부터는 그 필터의 규칙을 그대로 따릅니다.
  useEffect(() => {
    setRevealPinId(null);
  }, [filter, query, visitFilter, collectionActive]);

  const counts = useMemo(() => countByCategory(pins, categories), [pins, categories]);

  const selectedPin = useMemo(
    () => pins.find((p) => p.id === selectedPinId) || previewPins.find((p) => p.id === selectedPinId) || null,
    [pins, previewPins, selectedPinId]
  );
  const selectedIsShared = useMemo(
    () => Boolean(selectedPinId) && previewPins.some((p) => p.id === selectedPinId),
    [previewPins, selectedPinId]
  );

  // 내 위치로부터의 실제 거리 (핀 id → m)
  const distanceById = useMemo(() => distanceMap(pins, myCoords), [pins, myCoords]);

  // 반경 500m 안의 핀 (가까운 순)
  const nearby = useMemo(
    () => (myCoords ? findNearbyPins(pins, myCoords, NEARBY_RADIUS_M) : []),
    [pins, myCoords]
  );

  // 반경 밖이어도 가장 가까운 저장 장소
  const closest = useMemo(() => (myCoords ? nearestPin(pins, myCoords) : null), [pins, myCoords]);

  const applyPosition = useCallback((position, options = {}) => {
    const fly = options.fly !== false;
    setMyCoords(position);
    setLocationError('');
    // v2.15 — 공통 헤더의 🔔 알림 모음 뱃지도 같은 위치를 쓰도록 위로 알립니다.
    if (position && onMyCoordsRef.current) onMyCoordsRef.current(position);
    if (fly) {
      setFocus({ lat: position.lat, lng: position.lng });
      setFocusKey((k) => k + 1);
    }
  }, []);

  const locate = useCallback(
    async (options = {}) => {
      const announce = options.announce !== false;
      // silent — 첫 진입 자동 복구용. 실패해도 오류 칩·토스트 없이 안내 배너만 남깁니다.
      const silent = options.silent === true;
      setLocating(true);
      if (!silent) setLocationError('');
      try {
        const position = await requestCurrentPosition();
        applyPosition(position);
        // 한 번 허용된 브라우저는 다음 방문·새로고침에서 바로 위치를 잡을 수 있게 기록
        writeLocationGrantedFlag(true);
        if (announce) {
          const near = findNearbyPins(pinsRef.current, position, NEARBY_RADIUS_M);
          // v2.28.0 — 반경 안에 저장한 곳이 있으면 **한 줄 토스트**(nearKey 효과)가 알립니다. (v2.32.2 — 6초)
          //   예전처럼 `주변 500m` 패널을 저절로 열어 지도를 가리지 않습니다.
          if (!near.length) {
            const close = nearestPin(pinsRef.current, position);
            showToast(
              close
                ? '현재 위치 확인 · 가장 가까운 곳은 ' + formatDistance(close.distanceMeters) + ' 거리예요'
                : '현재 위치를 찾았어요'
            );
          }
        }
        return position;
      } catch (err) {
        const message = (err && err.message) || '위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
        // 권한이 꺼졌거나 위치를 못 잡았으면 다음 방문에 또 시도하지 않도록 허용 기록을 지웁니다.
        writeLocationGrantedFlag(false);
        if (silent) return null;
        setLocationError(message);
        showToast(message);
        return null;
      } finally {
        setLocating(false);
      }
    },
    [applyPosition, showToast]
  );

  /**
   * v2.14.1 — 사용자가 직접 누른 [내 위치] 버튼.
   * v2.28.0 — 한 번 지나간 반경 500m 알림도 위치를 새로 확인하면 **다시** 한 번 보여 줍니다.
   */
  const locateFromUser = useCallback(
    (options) => {
      shownNearKeyRef.current = '';
      setNearKeyNonce((n) => n + 1);
      return locate(options);
    },
    [locate]
  );

  /**
   * v2.1.3 — 웹에서 다시 열었을 때 내 위치를 알아서 잡습니다.
   * · permissions.query 가 'granted'  → 버튼 없이 바로 현재 위치로 이동
   * · 'prompt'/'unknown'(iOS 사파리 등) → 한 번 허용한 적이 있으면(localStorage 기록) 시도
   * · 'denied' → 시도하지 않고 [내 위치] 버튼을 기다립니다.
   * 실패하면 조용히 기록을 지우고 안내 배너만 남깁니다.
   */
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    if (autoLocateRef.current) return undefined;
    autoLocateRef.current = true;
    let cancelled = false;
    (async () => {
      const permission = await geolocationPermissionState();
      if (cancelled) return;
      const grantedFlag = readLocationGrantedFlag();
      if (!shouldAutoLocate({ permission, grantedFlag })) return;
      await locate({ announce: false, silent: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [locate]);

  /**
   * v2.5 — 지도 ↔ 목록 전환. 목록으로 갈 때는 '주변 500m' 패널을 닫아 겹치지 않게 합니다.
   * v2.24.0 — 목록을 닫을 때는 **지도를 건드리지 않습니다**.
   *   (v2.6 에서는 닫을 때 보이는 핀 전체에 `fit` 을 다시 걸어서, 보던 동네가 전국으로
   *    튀었습니다. 지도는 목록 뒤에 그대로 살아 있으므로 화면만 되돌리면 됩니다.)
   *   목록에서 특정 장소를 눌러 이동하는 경우만 openPinFromList 가 그 핀으로 옮깁니다.
   */
  const toggleView = useCallback(() => {
    if (view === 'map') {
      setNearbyOpen(false);
      setView('list');
      return;
    }
    setView('map');
  }, [view]);

  /** v2.6 — 목록·검색 결과에서 핀을 고르면 지도로 돌아가 그 핀을 확대하고 상세 시트를 엽니다. */
  const openPinFromList = useCallback(
    (pin) => {
      const coords = pinMapCoords(pin);
      if (coords) {
        setFocus(coords);
        setFocusKey((k) => k + 1);
      }
      setNearbyOpen(false);
      setView('map');
      if (typeof onSelectPin === 'function') onSelectPin(pin.id);
    },
    [onSelectPin]
  );

  /** 검색어 지우기 — 300ms 기다리지 않고 바로 원래 지도 상태로 돌아갑니다. */
  const clearSearch = useCallback(() => {
    setQuery('');
    setNavQuery('');
  }, []);

  // ── v2.6 🔍 검색 결과 → 지도 이동 / 결과 목록 (한글 IME 조합 중에는 기다립니다) ──
  useEffect(() => {
    const text = String(query || '').trim();
    if (!text) {
      setNavQuery('');
      return undefined;
    }
    const timer = setTimeout(() => setNavQuery(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const matches = searchMatches(pins, { filter, query: navQuery, visit: visitFilter });
    const plan = planSearchNavigation({
      query: navQuery,
      matches,
      view: viewRef.current,
      viewBefore: viewBeforeRef.current,
      myCoords: myCoordsRef.current,
      pins,
      wasActive: searchActiveRef.current,
    });
    // 같은 결과로 지도를 두 번 옮기지 않습니다 (지도를 손으로 옮긴 뒤에도 그대로).
    const key = searchNavigationKey(plan, navQuery);
    if (key === navKeyRef.current) return;
    navKeyRef.current = key;
    if (plan.mode === 'idle') {
      searchActiveRef.current = false;
    } else {
      if (!searchActiveRef.current) viewBeforeRef.current = viewRef.current;
      searchActiveRef.current = true;
    }
    plan.actions.forEach((action) => {
      if (action.type === 'view') {
        setView(action.view);
      } else if (action.type === 'focus') {
        setFocus({ lat: action.coords.lat, lng: action.coords.lng });
        setFocusKey((k) => k + 1);
        setNearbyOpen(false);
      } else if (action.type === 'fit') {
        setFit(action.coords);
        setFitKey((k) => k + 1);
        setNearbyOpen(false);
      } else if (action.type === 'toast') {
        showToast(action.message);
      }
    });
  }, [navQuery, filter, pins, visitFilter, showToast]);

  const focusOnPin = useCallback(
    (pin) => {
      if (!pin) return;
      if (typeof onSelectPin === 'function') onSelectPin(pin.id);
      setFocus({ lat: pin.lat, lng: pin.lng });
      setFocusKey((k) => k + 1);
      setNearbyOpen(false);
    },
    [onSelectPin]
  );

  /**
   * v2.25.0 — 장소 상세 시트의 [🗺️ 지도에서 보기]:
   *   · 먼저 열려 있던 레이어(🔍 검색 · 🔔 알림 · ☰ 메뉴 · 💬 제보)를 닫고 지도 탭으로 돌아갑니다.
   *   · 목록 보기 레이어·주변 500m 패널·지도 도구 메뉴도 함께 닫습니다.
   *   · 분류·검색·방문·컬렉션 필터에 가려져 있던 핀이면 필터는 건드리지 않고
   *     그 핀만 지도에 함께 보여 줍니다(revealPinId).
   *   · 마지막으로 상세 시트를 닫고 그 핀 좌표로 지도 중심·줌을 맞춥니다(setFocus → 줌 16 이상).
   */
  const showPinOnMap = useCallback(
    (pin) => {
      const target = pin || selectedPin;
      if (typeof onDismissOverlays === 'function') onDismissOverlays();
      setView('map');
      setNearbyOpen(false);
      setToolsOpen(false);
      const coords = pinMapCoords(target);
      if (coords && target) {
        setRevealPinId(target.id);
        setFocus({ lat: coords.lat, lng: coords.lng });
        setFocusKey((k) => k + 1);
      }
      if (typeof onSelectPin === 'function') onSelectPin(null);
      showToast(
        coords && target
          ? String(target.name || '이 장소') + ' 위치로 지도를 옮겼어요'
          : '이 핀은 좌표가 없어 지도에 표시할 수 없어요'
      );
    },
    [onDismissOverlays, onSelectPin, selectedPin, showToast]
  );

  /**
   * v2.15 — 🔔 알림 모음에서 [내 위치 켜기]로 잡은 위치도 지도가 함께 씁니다.
   * (지도가 아직 위치를 모를 때만 받아들임 — 이미 잡아 둔 위치를 되돌리지 않음)
   */
  useEffect(() => {
    if (!alertCoords || myCoords) return;
    applyPosition(alertCoords, { fly: false });
  }, [alertCoords, myCoords, applyPosition]);

  /**
   * v2.15 — 🔔 알림 모음(헤더)에서 장소를 눌렀을 때:
   * 상위가 `focusPin={{ id, key }}` 로 알려 주면 지도를 그 핀으로 옮기고 상세 시트를 엽니다.
   * `key` 가 같으면 다시 움직이지 않습니다(핀이 바뀔 때만).
   */
  const focusPinKeyRef = useRef(null);
  useEffect(() => {
    const request = focusPin;
    if (!request || !request.id) return;
    if (focusPinKeyRef.current === request.key) return;
    focusPinKeyRef.current = request.key;
    const target = (pins || []).find((p) => p && p.id === request.id);
    if (!target) return;
    const coords = pinMapCoords(target);
    if (coords) {
      setFocus({ lat: coords.lat, lng: coords.lng });
      setFocusKey((k) => k + 1);
    }
    setNearbyOpen(false);
    if (typeof onSelectPin === 'function') onSelectPin(target.id);
  }, [focusPin, pins, onSelectPin]);

  const toggleNearby = useCallback(async () => {
    if (nearbyOpen) {
      setNearbyOpen(false);
      return;
    }
    setNearbyOpen(true);
    if (!myCoords) await locate({ announce: true });
  }, [nearbyOpen, myCoords, locate]);

  const toggleAlerts = useCallback(async () => {
    const next = !alertsOn;
    // v2.19.1 — 앱이 알림 설정을 갖고 있으면 그 스위치를 그대로 누릅니다(권한·안내 문구도 거기서).
    if (typeof onToggleAlerts === 'function') {
      await onToggleAlerts(next);
      setNotifyPermission(notificationPermission());
      if (next && !myCoords) await locate({ announce: false });
      return;
    }
    if (alertsOn) {
      setNotifyPermission(notificationPermission());
      notifiedRef.current = new Set();
      showToast('근처 알림을 껐어요');
      return;
    }
    const permission = await requestNotificationPermission();
    setNotifyPermission(permission);
    if (permission === 'granted') {
      showToast('근처 알림을 켰어요 · 반경 ' + NEARBY_RADIUS_M + 'm 안에 들어오면 알려드려요');
    } else if (permission === 'unsupported') {
      showToast('이 브라우저에는 알림창이 없어 앱 안에서 알려드릴게요');
    } else {
      showToast('알림 권한이 꺼져 있어 앱 안 배너로 알려드릴게요');
    }
    if (!myCoords) await locate({ announce: false });
  }, [alertsOn, onToggleAlerts, myCoords, locate, showToast]);

  // 알림을 켠 동안 위치를 계속 따라가며 500m 진입을 감지합니다.
  useEffect(() => {
    if (!alertsOn) return undefined;
    const stop = watchPosition(
      (position) => {
        applyPosition(position, { fly: false });
        const near = findNearbyPins(pinsRef.current, position, NEARBY_RADIUS_M);
        const fresh = firstNewNearby(near, notifiedRef.current);
        if (!fresh) return;
        notifiedRef.current.add(fresh.pin.id);
        const label = formatDistance(fresh.distanceMeters);
        showNearbyNotification(fresh.pin, fresh.distanceMeters, NEARBY_RADIUS_M);
        showToast('📍 ' + fresh.pin.name + '이 ' + label + ' 앞에 있어요');
      },
      (err) => {
        setLocationError((err && err.message) || '');
        // v2.19.1 — 감시가 끊기면 알림 설정도 같이 꺼진 상태로 되돌립니다(App 과 같은 스위치).
        if (typeof onToggleAlerts === 'function') onToggleAlerts(false);
        showToast((err && err.message) || '위치 추적을 멈췄어요');
      }
    );
    return () => {
      if (typeof stop === 'function') stop();
    };
  }, [alertsOn, applyPosition, showToast, onToggleAlerts]);

  // ── v2.28.0 반경 500m 알림 = **한 줄 토스트** (v2.32.2 — 6초로 연장) ─────────
  //   상훈 님 결정(2026-11-18): "지도 위에 큰 카드로 떠 있는 배너는 지도를 가린다.
  //   반경 500m 안에 저장한 곳이 있으면 작은 한 줄 토스트로 몇 초만 알려 주고,
  //   계속 남는 표시는 헤더 🔔 뱃지 하나로 충분하다."
  //
  //   · 예전 GeofenceBanner(큰 카드 · 스와이프 닫기 · 영업 상태 뱃지)는 지도에서 걷어냈습니다.
  //   · 토스트는 **반경 안(near)일 때만**, 한 번 뜨고 GEOFENCE_TOAST_MS(6초) 뒤 스스로 사라집니다.
  //   · 같은 가게 묶음(nearKey)은 세션에서 한 번만 — [내 위치]를 새로 누르면 다시 보입니다.
  //   · 지도는 가리지 않습니다: 상단 분류 칩 아래 한 줄, 좌우 🎛·`내 위치` 버튼과 멀리 떨어진 자리.
  const nearKey = useMemo(() => {
    if (!nearby.length) return '';
    return 'near:' + nearby.map((hit) => hit.pin.id).join(',');
  }, [nearby]);

  useEffect(() => {
    if (!nearKey) {
      if (nearbyToastTimer.current) {
        clearTimeout(nearbyToastTimer.current);
        nearbyToastTimer.current = null;
      }
      setNearbyToast(null);
      return undefined;
    }
    // 같은 가게 묶음은 세션에서 한 번만 — 다만 [내 위치]를 누르면 shownNearKeyRef 를 비웁니다.
    if (shownNearKeyRef.current === nearKey) return undefined;
    shownNearKeyRef.current = nearKey;
    setNearbyToast({ key: nearKey, count: nearby.length });
    if (nearbyToastTimer.current) clearTimeout(nearbyToastTimer.current);
    nearbyToastTimer.current = setTimeout(() => {
      nearbyToastTimer.current = null;
      setNearbyToast(null);
    }, GEOFENCE_TOAST_MS);
    // 정리(cleanup)에서 타이머를 끄지 않습니다 — 위치 갱신으로 nearby 가 새 배열이 되어도
    // GEOFENCE_TOAST_MS(6초) 타이머는 그대로 흘러 스스로 사라져야 하기 때문입니다(아래 unmount 정리만).
    return undefined;
  }, [nearKey, nearKeyNonce, nearby.length]);

  // 화면을 떠날 때 남은 타이머 정리
  useEffect(
    () => () => {
      if (nearbyToastTimer.current) {
        clearTimeout(nearbyToastTimer.current);
        nearbyToastTimer.current = null;
      }
    },
    []
  );

  /** 토스트의 [보기] — 헤더 🔔 알림 모음(같은 위치 기준)을 열고 토스트는 닫습니다. */
  const openNearbyFromToast = useCallback(() => {
    setNearbyToast(null);
    if (header && typeof header.onPressAlerts === 'function') header.onPressAlerts();
    else setNearbyOpen(true);
  }, [header]);

  /**
   * v2.20 — 지금 화면에 필요한 매장 상세(영업시간·추천 메뉴)를 **조용히** 확인해 핀에 저장합니다.
   *   · 대상: 보고 있는 핀 + 반경 500m 안의 핀(최대 3곳). (배너의 영업 상태 배지도 실제 값으로)
   *   · 핀마다 6시간에 한 번만(placeInfo.needsPlaceInfo) — 화면을 열 때마다 서버를 부르지 않습니다.
   *   · 실패는 10분 뒤 다시 시도 (일시적인 네트워크 오류로 6시간 비워 두지 않게)
   *   · 읽기 전용(공유받은 지도) 핀은 건드리지 않습니다.
   */
  const placeInfoBusy = useRef({});
  const placeInfoFailedAt = useRef({});
  useEffect(() => {
    if (typeof onSavePinHours !== 'function') return;
    const now = Date.now();
    const targets = [];
    const push = (pin) => {
      if (!pin || !pin.id || pin.readOnly) return;
      if (targets.some((p) => p.id === pin.id)) return;
      if (placeInfoBusy.current[pin.id]) return;
      const failedAt = placeInfoFailedAt.current[pin.id] || 0;
      if (failedAt && now - failedAt < 10 * 60 * 1000) return;
      if (!needsPlaceInfo(pin, now)) return;
      targets.push(pin);
    };
    push(selectedPin);
    nearby.slice(0, 3).forEach((hit) => push(hit.pin));
    if (!targets.length) return;
    let cancelled = false;
    targets.forEach((pin) => {
      placeInfoBusy.current[pin.id] = true;
      fetchPlaceInfo(pin)
        .then((result) => {
          if (cancelled) return;
          if (!result || !result.ok) {
            placeInfoFailedAt.current[pin.id] = Date.now();
            return;
          }
          delete placeInfoFailedAt.current[pin.id];
          onSavePinHours(pin.id, pinHoursPatch(result.place));
        })
        .catch(() => {
          placeInfoFailedAt.current[pin.id] = Date.now();
        })
        .finally(() => {
          delete placeInfoBusy.current[pin.id];
        });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPin, nearby, onSavePinHours]);

  /** v2.0 — 내 맛집 지도를 링크로 공유(공유 시트 또는 클립보드) */
  const shareMyMap = useCallback(async () => {
    if (!pins.length) {
      showToast('공유할 핀이 아직 없어요');
      return;
    }
    const url = buildShareUrl(pins);
    const text = shareMessage(pins);
    if (canNativeShare()) {
      const result = await nativeShare(url, { title: text, text });
      if (result.shared) {
        showToast('공유 시트를 열었어요');
        return;
      }
      if (result.cancelled) return;
    }
    try {
      await Clipboard.setStringAsync(url);
      showToast('내 지도 공유 링크를 복사했어요');
    } catch (e) {
      showToast('링크 복사에 실패했어요. 다시 시도해 주세요');
    }
  }, [pins, showToast]);

  const nearbyList = myCoords ? nearby : [];

  /** v2.10 — 방문 상태 칩: 같은 칩을 다시 누르면 '전체'로 돌아갑니다 */
  const changeVisitFilter = useCallback((next) => {
    const value = normalizeVisitFilter(next);
    setVisitFilter((current) => (current === value && value !== VISIT_ALL ? VISIT_ALL : value));
  }, []);

  /**
   * v2.17.1 — 왼쪽 하단 메뉴의 「가본 곳만 보기」 스위치.
   *
   * 상훈 님 제보(2026-11-16): "가본곳만 보기가 반대로 되어있는거 같아 · ON을 했을 때
   * 안가본곳이 나오는거같아" — 필터 자체는 `filterByVisit(…, VISIT_DONE)` 로 옳게 걸리고
   * 있었지만(visited === true 핀만), **지도는 그 자리에 그대로 있고 핀만 사라져서**
   * 가본 곳이 화면 밖이면(예: 12km 밖) 아무 일도 안 일어난 것처럼 보였고, 화면에 남은
   * 네이버 기본 지도의 가게 라벨들이 '안 가본 곳' 처럼 읽혔습니다.
   * → 켜면 지도를 **가본 곳에 바로 맞춰**(범위·확대) 보여 주고, 문구로도 상태를 알립니다.
   *   끄면 전체로 돌아가며 지도도 전체 핀에 맞춥니다. 가본 곳이 0곳이면 안내를 띄웁니다.
   */
  const toggleVisitedOnly = useCallback(() => {
    if (visitedOnly) {
      setVisitFilter(VISIT_ALL);
      const coords = mapCoordsOf(baseFiltered);
      if (coords.length >= 2) {
        setFit(coords);
        setFitKey((k) => k + 1);
      } else if (coords.length === 1) {
        setFocus({ lat: coords[0].lat, lng: coords[0].lng });
        setFocusKey((k) => k + 1);
      }
      showToast('전체 핀 ' + baseFiltered.length + '곳을 다시 보여드려요');
      return;
    }
    const visitedPins = filterByVisit(baseFiltered, VISIT_DONE);
    setVisitFilter(VISIT_DONE);
    const coords = mapCoordsOf(visitedPins);
    if (coords.length >= 2) {
      setFit(coords);
      setFitKey((k) => k + 1);
    } else if (coords.length === 1) {
      setFocus({ lat: coords[0].lat, lng: coords[0].lng });
      setFocusKey((k) => k + 1);
    }
    setNearbyOpen(false);
    if (!visitedPins.length) {
      showToast('아직 [가봤어요]로 체크한 곳이 없어요 · 핀을 열어 체크해 두세요');
    } else {
      showToast('가본 곳만 보는 중 · ' + visitedPins.length + '곳');
    }
  }, [visitedOnly, baseFiltered, showToast]);

  return (
    <View style={styles.root}>
      <AppHeader badge="지도" {...header} />

      {/* v2.15 — 헤더는 지도 '위' 고정 바입니다. 지도·오버레이는 이 아래 영역에서만 그려져
          검색창·분류 칩·알림 배너가 헤더와 겹치지 않습니다. */}
      <View style={styles.mapArea}>
        <RealMapView
          pins={mapPins}
          selectedId={selectedPinId}
          onSelect={onSelectPin}
          myCoords={myCoords}
          focus={focus}
          focusKey={focusKey}
          fit={fit}
          fitKey={fitKey}
          radiusMeters={NEARBY_RADIUS_M}
          categories={categories}
          hideNotice={toolsOpen}
        />

        {/* 상단 오버레이(지도 보기): 분류 필터 칩 → (공유받은 지도 · 위치 오류) */}
        {view === 'map' && (
        <View style={styles.topOverlay} pointerEvents="box-none">
          {/* v2.16 — 헤더 바로 아래는 호갱노노처럼 **필터 칩 바 하나**만 둡니다. */}
          {/* v2.17 — 2번째 줄(전체 / ○ 미방문 / ✓ 가봤어요) 은 없어졌습니다.
              방문 필터는 왼쪽 하단 펼침 메뉴의 `가본 곳만 보기` Y/N 하나로 → 지도가 한 줄 더 넓어졌습니다. */}
          <View style={styles.chipWrap}>
            {/* v2.18 — 흰색 반투명 분류 칩 + **맨 앞 목록 아이콘 버튼**
                (오른쪽 하단 주황 `목록 보기` 는 없어졌습니다) */}
            <FilterChips
              value={filter}
              onChange={setFilter}
              counts={counts}
              categories={categories}
              onToggleView={toggleView}
            />
          </View>
          {/* v2.19 — 컬렉션만 보기 중이면 분류 칩 아래에 `📂 컬렉션명 N곳 ×` 해제 칩 */}
          {collectionActive && (
            <View style={styles.collectionChipWrap} pointerEvents="box-none">
              <View style={styles.collectionChip} testID="map-collection-chip">
                <Text style={styles.collectionChipEmoji}>{collectionFilter.emoji || '📂'}</Text>
                <Text style={styles.collectionChipText} numberOfLines={1}>
                  {collectionFilter.name}
                </Text>
                <Text style={styles.collectionChipCount}>{(collectionFilter.pinIds || []).length + '곳'}</Text>
                <Pressable
                  style={styles.collectionChipClose}
                  onPress={() => (typeof onClearCollectionFilter === 'function' ? onClearCollectionFilter() : null)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="컬렉션 필터 해제"
                  testID="map-collection-chip-clear"
                >
                  <Ionicons name="close" size={13} color={colors.white} />
                </Pressable>
              </View>
            </View>
          )}
          {previewPins.length > 0 && (
            <View style={styles.sharedBanner}>
              <View style={styles.sharedIcon}>
                <Ionicons name="share-social" size={15} color={colors.white} />
              </View>
              <View style={styles.sharedTextWrap}>
                <Text style={styles.sharedTitle} numberOfLines={1}>
                  {'공유받은 맛집 지도 (' + previewPins.length + '곳)'}
                </Text>
                <Text style={styles.sharedSub} numberOfLines={1}>
                  지도에 미리보기로 띄웠어요
                </Text>
              </View>
              <Pressable
                style={styles.sharedAddBtn}
                onPress={onAddSharedPins}
                accessibilityRole="button"
                accessibilityLabel="내 지도에 모두 추가"
              >
                <Text style={styles.sharedAddText}>내 지도에 모두 추가</Text>
              </Pressable>
              <Pressable
                style={styles.sharedClose}
                onPress={onDismissShared}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="공유받은 지도 닫기"
              >
                <Ionicons name="close" size={14} color="#C9D3E4" />
              </Pressable>
            </View>
          )}
          {nearbyToast && (
            <View style={styles.geofenceToastWrap} pointerEvents="box-none">
              <GeofenceToast message={nearbyToastMessage(nearbyToast.count)} onPress={openNearbyFromToast} />
            </View>
          )}
          {!!locationError && (
            <Pressable style={styles.errorChip} onPress={() => locateFromUser()} accessibilityRole="button">
              <Ionicons name="alert-circle" size={12} color={colors.white} />
              <Text style={styles.errorText} numberOfLines={2}>
                {locationError}
              </Text>
            </Pressable>
          )}
        </View>
        )}

        {/* 저장 개수 표시 — 상세 시트가 열리면 숨깁니다 */}
        {/* v2.17 — 메뉴 밖(지도)을 누르면 접힙니다. 왼쪽 하단 도구·오른쪽 버튼 스택보다 아래에 그려집니다. */}
        {view === 'map' && !selectedPin && toolsOpen && (
          <Pressable
            style={styles.toolsBackdrop}
            onPress={() => setToolsOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="지도 도구 접기"
            testID="map-tools-backdrop"
          />
        )}

        {/* v2.17 — 왼쪽 하단: `N / N 핀 표시 중` 요약 + [가본 곳만 보기 Y/N · 지도 공유하기] 펌찄 메뉴
            (세로 column 이라 알약·카드·버튼이 겹치지 않습니다 — MapToolsMenu) */}
        {view === 'map' && !selectedPin && (
          <MapToolsMenu
            open={toolsOpen}
            visitedOnly={visitedOnly}
            visitedCount={visitCounts[VISIT_DONE]}
            totalCount={pins.length}
            summary={toolsSummary({
              filteredCount: filtered.length,
              totalCount: pins.length,
              visitFilter,
            })}
            nearbyOpen={nearbyOpen}
            nearbyCount={nearbyList.length}
            nearbyRadius={NEARBY_RADIUS_M}
            hasMyCoords={Boolean(myCoords)}
            onToggleOpen={() => {
              // v2.17.1 — 카드와 반경 500m 패널이 동시에 떠 서로 가리지 않게,
              //             메뉴를 펼칠 때는 패널을 먼저 닫습니다(패널 → 메뉴도 반대).
              const next = !toolsOpen;
              setToolsOpen(next);
              if (next) setNearbyOpen(false);
            }}
            onToggleVisited={toggleVisitedOnly}
            onPressNearby={() => {
              // v2.17.1 — 카드를 접고 기존 반경 500m 패널을 그대로 열고/닫습니다.
              setToolsOpen(false);
              toggleNearby();
            }}
            onShare={() => {
              setToolsOpen(false);
              shareMyMap();
            }}
          />
        )}

        {/* 반경 500m 주변 목록 */}
        {view === 'map' && !selectedPin && nearbyOpen && (
          <View style={styles.nearbyPanel} testID="nearby-panel">
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>
                {'반경 ' + NEARBY_RADIUS_M + 'm · ' + nearbyList.length + '곳'}
              </Text>
              <Pressable
                style={[styles.alertToggle, alertsOn && styles.alertToggleOn]}
                onPress={toggleAlerts}
                accessibilityRole="button"
                accessibilityState={{ selected: alertsOn }}
                accessibilityLabel={alertsOn ? '근처 알림 끄기' : '근처 알림 켜기'}
              >
                <Ionicons
                  name={alertsOn ? 'notifications' : 'notifications-outline'}
                  size={12}
                  color={alertsOn ? colors.white : colors.brandDark}
                />
                <Text style={[styles.alertToggleText, alertsOn && styles.alertToggleTextOn]}>
                  {alertsOn ? '근처 알림 켜짐' : '🔔 근처 알림 켜기'}
                </Text>
              </Pressable>
              <Pressable onPress={() => setNearbyOpen(false)} hitSlop={8} accessibilityLabel="주변 목록 닫기">
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </Pressable>
            </View>

            {!myCoords ? (
              <View style={styles.panelEmptyWrap}>
                <Text style={styles.panelEmpty}>
                  {'내 위치를 켜면 반경 ' + NEARBY_RADIUS_M + 'm 안의 저장 장소를 가까운 순으로 보여드려요.'}
                </Text>
                <Pressable style={styles.panelLocateBtn} onPress={() => locateFromUser()} accessibilityRole="button">
                  {locating ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <Ionicons name="locate" size={14} color={colors.white} />
                  )}
                  <Text style={styles.panelLocateText}>내 위치 켜기</Text>
                </Pressable>
              </View>
            ) : nearbyList.length === 0 ? (
              <Text style={styles.panelEmpty}>
                {'반경 ' + NEARBY_RADIUS_M + 'm 안에는 저장한 곳이 없어요.' +
                  (closest ? ' 가장 가까운 곳은 ' + closest.pin.name + ' (' + formatDistance(closest.distanceMeters) + ')' : '')}
              </Text>
            ) : (
              <ScrollView style={styles.nearbyScroll} showsVerticalScrollIndicator={false}>
                {nearbyList.map((item, index) => (
                  <Pressable
                    key={item.pin.id}
                    style={styles.nearbyRow}
                    onPress={() => focusOnPin(item.pin)}
                    accessibilityRole="button"
                    accessibilityLabel={item.pin.name + ', ' + formatDistance(item.distanceMeters)}
                  >
                    <Text style={styles.nearbyRank}>{index + 1}</Text>
                    <View style={styles.nearbyTextWrap}>
                      <Text style={styles.nearbyName} numberOfLines={1}>
                        {item.pin.name}
                      </Text>
                      <Text style={styles.nearbySub} numberOfLines={1}>
                        {[item.pin.category, item.pin.area].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Text style={styles.nearbyDistance}>{formatDistance(item.distanceMeters)}</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {isNotificationSupported() && notifyPermission === 'denied' && (
              <Text style={styles.panelNote}>
                브라우저 알림이 꺼져 있어 앱 안 배너로만 알려드려요.
              </Text>
            )}
          </View>
        )}

        {/* 오른쪽 하단 — v2.18: `목록 보기` 는 **상단 분류 칩 줄 맨 앞 아이콘 버튼**으로
            올라가고, 여기에는 파란 `내 위치` FAB 하나만 남았습니다.
            (v2.17: `지도 공유` → 왼쪽 하단 메뉴, v2.17.1: `주변 500m` → 같은 메뉴)
            v2.19.2 — 상훈 님 요청대로 `+/−` 와 자리를 맞바꿔, **맨 아래 = 내 위치 FAB**,
            그 위 = `+/−` 확대·축소 박스입니다. */}
        {view === 'map' && !selectedPin && (
          <View style={styles.actionCol}>
            <Pressable
              style={[styles.fab, myCoords && styles.fabLive]}
              onPress={() => locateFromUser()}
              accessibilityRole="button"
              accessibilityLabel="내 위치 찾기"
            >
              {locating ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Ionicons name={myCoords ? 'locate' : 'locate-outline'} size={20} color={colors.white} />
              )}
            </Pressable>
          </View>
        )}

        {/* 핀 없음 안내 (공유받은 지도만 있으면 띄우지 않습니다) */}
        {view === 'map' && pins.length === 0 && previewPins.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>지도가 비어 있어요</Text>
            <Text style={styles.emptySub}>릴스 링크 하나면 3초 만에 핀이 꽂힙니다.</Text>
            <Pressable style={styles.emptyBtn} onPress={onGoPaste}>
              <Ionicons name="link-outline" size={15} color={colors.white} />
              <Text style={styles.emptyBtnText}>링크 붙여넣으러 가기</Text>
            </Pressable>
          </View>
        )}

        {/* v2.17.1 — 가본 곳만 보기 ON인데 체크한 곳이 없을 때: 빈 지도 대신 이유와 빠져나갈 길 */}
        {view === 'map' && !selectedPin && visitedOnly && filtered.length === 0 && pins.length > 0 && (
          <View style={styles.visitedEmptyCard} testID="visited-only-empty">
            <View style={styles.visitedEmptyHead}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.visit} />
              <Text style={styles.visitedEmptyTitle}>가본 곳만 보는 중</Text>
            </View>
            <Text style={styles.visitedEmptySub}>
              {'아직 [가봤어요]로 체크한 곳이 없어요.\n핀을 열어 체크하거나 아래 버튼으로 전체를 보세요.'}
            </Text>
            <Pressable
              style={styles.visitedEmptyBtn}
              onPress={toggleVisitedOnly}
              accessibilityRole="button"
              accessibilityLabel="전체 핀 보기"
              testID="visited-only-show-all"
            >
              <Text style={styles.visitedEmptyBtnText}>전체 핀 보기</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* v2.5 — 📋 목록 보기: v2.19.1 — 전체 화면을 갈아끼우지 않고 **내 정보·돋보기와 같은
          레이어 팝업**(LayerSheet · 높이 86% · 같은 딤)으로 열립니다. ✕ 또는 바깥 탭 = 지도로 복귀. */}
      {view === 'list' && (
        <LayerSheet
          visible
          onClose={toggleView}
          icon="list"
          title="목록 보기"
          closeLabel="목록 닫기"
          overlayTestID="pin-list-overlay"
          testID="pin-list-sheet"
          headerTestID="pin-list-sheet-header"
          closeTestID="pin-list-sheet-close"
          zIndex={40}
        >
          <PinListView
            embedded
            pins={filtered}
            query={query}
            onQueryChange={setQuery}
            onClearQuery={clearSearch}
            filter={filter}
            onChangeFilter={setFilter}
            counts={counts}
            visitFilter={visitFilter}
            onChangeVisitFilter={changeVisitFilter}
            visitCounts={visitCounts}
            categories={categories}
            myCoords={myCoords}
            onSelectPin={onSelectPin}
            onOpenPin={openPinFromList}
            onGoPaste={onGoPaste}
          />
        </LayerSheet>
      )}

      {/*
        v2.17.1 — 핀 상세는 **화면 최상위 레이어**로 띄웁니다 (상훈 님 요청:
        "빨간 동그라미 친 부분을 흐릿하게 표현할 수 있을까? 레이어 팝업이 떴다는 걸
         표현하고 싶어 · 짝대기 3개 눌렀을 때 처럼").
        · 지도 영역(mapArea) 안이 아니라 MapScreen 맨 위에 그려서 **Reelspin 헤더·카테고리 칩·
          배너까지** 한꺼번에 어둑해집니다(☰ 메뉴 시트와 같은 결).
        · 바깥 어두운 곳을 탭하면 닫힙니다. 시트 본체(주황 헤더·maxHeight 86%·✕)는 그대로.
      */}
      {selectedPin && (
        <View style={styles.detailLayer} testID="pin-detail-layer">
          <Pressable
            style={styles.detailBackdrop}
            onPress={() => onSelectPin(null)}
            accessibilityRole="button"
            accessibilityLabel="핀 상세 닫기"
            testID="pin-detail-backdrop"
          />
          <PinDetailSheet
            pin={selectedPin}
            categories={categories}
            onChangeCategory={onChangePinCategory}
            onAddCategory={onAddCategory}
            radiusMeters={radiusMeters}
            distanceMeters={myCoords ? distanceById[selectedPin.id] : null}
            onClose={() => onSelectPin(null)}
            onDelete={onDeletePin}
            onToggleVisited={onTogglePinVisited}
            onChangeMemo={onChangePinMemo}
            onShowOnMap={showPinOnMap}
            onToast={onToast}
            readOnly={selectedIsShared}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  // 헤더 아래 지도·오버레이 영역 (v2.15)
  mapArea: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  topOverlay: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
  },
  // v2.28.0 — 반경 500m 알림 토스트 자리: 분류 칩 줄 **바로 아래**, 가운데 정렬.
  //   좌하단 🎛(12,~724) · 우하단 `내 위치` FAB 와 멀어진 상단이라 지도 버튼과 겹치지 않습니다.
  geofenceToastWrap: {
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 10,
  },
  sharedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: radius.md,
    backgroundColor: 'rgba(20,31,53,0.95)',
    borderWidth: 1,
    borderColor: colors.navyLine,
  },
  sharedIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedTextWrap: { flex: 1, minWidth: 0 },
  sharedTitle: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
  sharedSub: {
    color: '#9FB0C8',
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 1,
  },
  sharedAddBtn: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedAddText: {
    color: colors.white,
    fontSize: 10.5,
    fontWeight: '800',
  },
  sharedClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipWrap: {
    // v2.16 — 헤더 바로 아래(오버레이 top:8)에 붙는 필터 칩 바
    marginTop: 0,
  },
  // v2.19 — 컬렉션만 보기 칩 (분류 칩 줄 바로 아래 · 다크 필) — × 로 해제
  collectionChipWrap: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  collectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingLeft: 11,
    paddingRight: 7,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.charcoal,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  collectionChipEmoji: {
    fontSize: 12,
  },
  collectionChipText: {
    maxWidth: 180,
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  collectionChipCount: {
    color: '#C9D3E4',
    fontSize: 11,
    fontWeight: '700',
  },
  collectionChipClose: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // v2.17 — 펌찄 메뉴가 열렸을 때 지도(메뉴 밖)를 누르면 접기 위한 투명 막.
  //          지도·네이버 로고를 덮지만, 이 막 위에 왼쪽 하단 도구·오른쪽 버튼 스택이 그려집니다.
  toolsBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // v2.18 — 핀 목록 보기는 상단 칩 줄의 흰 아이콘 버튼(FilterChips)이 맡습니다.
  //          남은 오른쪽 버튼(내 위치 FAB)만 플로팅 탭바 위로 올립니다.
  viewToggleBtn: {
    backgroundColor: colors.brand,
    borderColor: 'rgba(255,255,255,0.30)',
  },
  errorChip: {
    marginTop: 6,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    backgroundColor: 'rgba(15,118,110,0.92)',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  errorText: {
    flex: 1,
    color: colors.white,
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 14,
  },
  actionCol: {
    position: 'absolute',
    // '+ / −' · 주변 500m · 지도 공유와 같은 오른쪽 끝선 (theme.mapControls)
    right: mapControls.rightInset,
    // v2.19.2 — 스택의 **맨 아래** 자리 = 내 위치 FAB (그 위 9px 에 +/− 박스가 옵니다).
    bottom: mapControls.actionBottom,
    alignItems: 'flex-end',
    gap: mapControls.colGap,
  },
  nearbyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: mapControls.controlSize,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  nearbyBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  fab: {
    width: mapControls.fabSize,
    height: mapControls.fabSize,
    borderRadius: mapControls.fabSize / 2,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabLive: {
    backgroundColor: '#2563EB',
  },
  nearbyPanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    // 버튼 스택(+/- · 내 위치 · 지도 공유 · 주변 500m) 위로 올려 놓아 서로 가리지 않습니다.
    bottom: mapControls.panelBottom,
    maxHeight: 260,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 12,
    ...cardShadow,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelTitle: {
    flex: 1,
    ...typography.h3,
    fontSize: 13,
  },
  alertToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.brandSoft,
  },
  alertToggleOn: {
    backgroundColor: colors.brand,
  },
  alertToggleText: {
    color: colors.brandDark,
    fontSize: 10,
    fontWeight: '800',
  },
  alertToggleTextOn: {
    color: colors.white,
  },
  nearbyScroll: {
    marginTop: 6,
  },
  nearbyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  nearbyRank: {
    width: 18,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  nearbyTextWrap: {
    flex: 1,
  },
  nearbyName: {
    ...typography.body,
    fontSize: 13.5,
    fontWeight: '700',
  },
  nearbySub: {
    ...typography.tiny,
    fontSize: 10.5,
    marginTop: 1,
  },
  nearbyDistance: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '800',
  },
  panelEmptyWrap: {
    marginTop: 8,
    alignItems: 'flex-start',
    gap: 8,
  },
  panelEmpty: {
    ...typography.sub,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 8,
  },
  panelLocateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.brand,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  panelLocateText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  panelNote: {
    ...typography.tiny,
    fontSize: 10,
    marginTop: 6,
  },
  emptyCard: {
    position: 'absolute',
    left: 28,
    right: 28,
    top: '38%',
    backgroundColor: 'rgba(20,31,53,0.95)',
    borderRadius: radius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.navyLine,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.white,
  },
  emptySub: {
    ...typography.sub,
    color: '#9FB0C8',
    fontSize: 12,
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brand,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  emptyBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  // ── v2.17.1 — 핀 상세 레이어(딤) ─────────────────────────────
  // 히더·카테고리 칩·배너까지 한꺼번에 어둑해지도록 MapScreen 맨 위에 깔립니다.
  detailLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 40,
  },
  detailBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    // 웹(아이폰 사파리)에서는 은은한 블러까지 — 레이어 팝업이라는 걸 한눌에 알 수 있게
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(2px)' } : null),
  },
  // ── v2.17.1 — 가본 곳만 보기 ON + 가본 곳 0곳 안내 ─────────
  visitedEmptyCard: {
    position: 'absolute',
    left: 28,
    right: 28,
    top: '34%',
    backgroundColor: 'rgba(20,31,53,0.95)',
    borderRadius: radius.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.navyLine,
    alignItems: 'center',
    gap: 6,
  },
  visitedEmptyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  visitedEmptyTitle: {
    ...typography.h3,
    color: colors.white,
  },
  visitedEmptySub: {
    ...typography.sub,
    color: '#9FB0C8',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  visitedEmptyBtn: {
    marginTop: 6,
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitedEmptyBtnText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
});
