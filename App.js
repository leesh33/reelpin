import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import MapScreen from './src/screens/MapScreen';
import PasteScreen from './src/screens/PasteScreen';
import CollectionsScreen from './src/screens/CollectionsScreen';
import TabBar from './src/components/TabBar';
import Toast from './src/components/Toast';
// v2.15 — 전 탭 공통 상단 다크 헤더 · 🔔 알림 모음
// v2.16 — 호갱노노처럼 헤더(🔍 · 🔔 · ☰) + 🔍 검색 레이어 팝업 · ☰ 메뉴 시트
import AlertInbox from './src/components/AlertInbox';
import SearchOverlayModal from './src/components/SearchOverlayModal';
import MenuDrawerModal from './src/components/MenuDrawerModal';
import { buildAlertFeed } from './src/utils/alertFeed';
// v2.20.1 — 프로필 이름의 출처는 **로그인한 계정 하나** (로그아웃 = 게스트)
import { profileIdentity } from './src/utils/profileIdentity';
import { notificationPermission, requestNotificationPermission } from './src/services/notifications';
import { requestCurrentPosition, writeLocationGrantedFlag } from './src/services/location';
import {
  loadCategories,
  loadCollections,
  loadPins,
  loadPro,
  loadRadius,
  loadAlerts,
  saveCategories,
  saveCollections,
  savePins,
  savePro,
  saveRadius,
  saveAlerts,
} from './src/storage';
import { findExistingPin, normalizePins, planPinAddition, withPlaceHours } from './src/utils/pins';
import {
  addCategory,
  allCategories,
  applyCategoryRemoval,
  applyCategoryRename,
  mapLegacyCategory,
  mergeCategoryNames,
  normalizeCategoryName,
  normalizeCustomCategories,
  removeCategory,
  renameCategory,
  sameCategory,
} from './src/utils/categories';
import { clearShareFromLocation, readShareFromLocation, buildShareUrl, canNativeShare, nativeShare, shareMessage } from './src/utils/shareMap';
import {
  createCollection,
  normalizeCollections,
  pruneCollections,
  removeCollection,
  toggleCollectionPin,
  updateCollection,
} from './src/utils/collections';
import { isSupabaseConfigured, loadSupabaseConfig } from './src/services/supabase';
import {
  OAUTH_PENDING_MESSAGE,
  OAUTH_PROVIDERS,
  oauthProviderReady,
  deleteCloudPin,
  fetchCloudPins,
  getSession,
  onAuthStateChange,
  planCloudSync,
  signInWithEmail,
  signInWithMagicLink,
  signInWithOAuth,
  signOut as signOutCloud,
  signUpWithEmail,
  upsertCloudPins,
} from './src/services/cloudSync';
import { colors, tabBar, typography } from './src/theme';

const TOP_INSET = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0;

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('map');
  const [pins, setPins] = useState([]);
  const [radius, setRadius] = useState(300);
  const [isPro, setIsPro] = useState(false);
  const [selectedPinId, setSelectedPinId] = useState(null);
  // v2.2 — 내가 만든 분류 (기본 3개는 여기 저장하지 않습니다) + 마지막 분류 변경(지도 필터 되돌림용)
  const [customCategories, setCustomCategories] = useState([]);
  const [categoryChange, setCategoryChange] = useState(null);
  const categoryChangeId = useRef(0);
  const categories = useMemo(() => allCategories(customCategories), [customCategories]);
  // v2.19 — 테마·코스별 핀 묶음 '컬렉션' · 지도에 이 컬렉션만 보여 주는 필터
  //   collectionFilterId … 지금 지도에 걸려 있는 컬렉션 id (null 이면 전체)
  //   collectionFilter   … 지도가 쓰는 { id, name, emoji, pinIds } — 핀이 지워지면 자동으로 바뀝니다
  const [collections, setCollections] = useState([]);
  const [collectionFilterId, setCollectionFilterId] = useState(null);
  const collectionsRef = useRef([]);
  // v2.0 — `?share=…` 링크로 들어온 '공유받은 맛집 지도' (아직 내 지도에 넣기 전 미리보기)
  const [sharedPins, setSharedPins] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // ── v2.15 · 공통 헤더(🔔 알림 모음 · 👤 계정) ──────────────────
  //   myCoords … 지도 탭이 잡은 현재 위치를 그대로 받아 둡니다(헤더 뱃지·알림 모음이 같은 위치를 씀)
  //   pinFocus … 알림 모음에서 장소를 누르면 지도 탭이 그 핀으로 이동해 상세를 열라는 요청
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertCoords, setAlertCoords] = useState(null);
  const [alertLocating, setAlertLocating] = useState(false);
  const [alertError, setAlertError] = useState('');
  const [pinFocus, setPinFocus] = useState(null);
  const pinFocusId = useRef(0);

  // ── v2.16 · 헤더 🔍 검색 레이어 팝업 · ☰ 메뉴 시트 ──────────────────
  //   searchOpen … 🔍 팝업이 열려 있는가 (전체 레이어)
  //   menuOpen   … ☰ 메뉴 시트가 열려 있는가
  //   pasteRequest … 검색 팝업에서 [저장 탭에서 가게명으로 찾기] 로 넘길 때의 요청
  //                  ({ id, mode:'search', query }) — PasteScreen 이 id 가 바뀔 때만 적용
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pasteRequest, setPasteRequest] = useState(null);
  const pasteRequestId = useRef(0);

  // ── v2.19.1 · 🔔 알림 설정 (내 정보 › 알림 설정) ──────────────────
  //   alertsEnabled … 반경 내 알림 ON/OFF — 지도 탭의 위치 추적 감시가 이 값을 그대로 따릅니다
  //                   (지도 왼쪽 하단 메뉴의 `근처 알림` 스위치와 같은 스위치)
  //   notifyPermission … 'granted' | 'denied' | 'default' | 'unsupported'
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [notifyPermission, setNotifyPermission] = useState(() => notificationPermission());

  // v2.1 — 계정 · 클라우드 동기화 상태
  const [cloudConfigured, setCloudConfigured] = useState(isSupabaseConfigured());
  const [cloudUser, setCloudUser] = useState(null);
  const [cloudPinCount, setCloudPinCount] = useState(0);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudMessage, setCloudMessage] = useState('');
  const sessionRef = useRef(null);
  const pinsRef = useRef([]);
  const syncWarnedRef = useRef(false);
  const authUnsubRef = useRef(null);

  // 최초 1회: 저장된 핀·반경·플랜 불러오기
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedPins, storedRadius, storedPro, storedCategories, storedCollections, storedAlerts] = await Promise.all([
        loadPins(),
        loadRadius(),
        loadPro(),
        loadCategories(),
        loadCollections(),
        loadAlerts(),
      ]);
      if (cancelled) return;
      // v1.0에서 저장된 핀에 없던 필드(placeUrl·providers)를 채워 넣습니다.
      setPins(normalizePins(storedPins));
      setRadius(storedRadius);
      setIsPro(storedPro);
      setCustomCategories(normalizeCustomCategories(storedCategories));
      setCollections(normalizeCollections(storedCollections));
      setAlertsEnabled(storedAlerts === true);
      setNotifyPermission(notificationPermission());
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 상태가 바뀔 때마다 기기에 저장 (AsyncStorage)
  useEffect(() => {
    if (ready) savePins(pins);
  }, [pins, ready]);

  useEffect(() => {
    if (ready) saveRadius(radius);
  }, [radius, ready]);

  useEffect(() => {
    if (ready) savePro(isPro);
  }, [isPro, ready]);

  // v2.19.1 — 반경 내 알림 설정도 기기에 저장합니다.
  useEffect(() => {
    if (ready) saveAlerts(alertsEnabled);
  }, [alertsEnabled, ready]);

  useEffect(() => {
    if (ready) saveCategories(customCategories);
  }, [customCategories, ready]);

  // v2.19 — 컬렉션을 기기에 저장하고, 핀이 지워지면 컬렉션에서도 그 id 를 정리합니다.
  useEffect(() => {
    if (ready) saveCollections(collections);
  }, [collections, ready]);

  useEffect(() => {
    if (ready) collectionsRef.current = collections;
  }, [collections, ready]);

  useEffect(() => {
    if (!ready) return;
    setCollections((prev) => {
      const result = pruneCollections(prev, pins);
      return result.changed ? result.collections : prev;
    });
  }, [pins, ready]);

  /**
   * v2.2 — 핀이 쓰고 있는 분류 이름은 목록에 반드시 있어야 지도 필터 칩이 사라지지 않습니다.
   * (다른 기기·클라우드에서 온 핀, 공유받은 지도에서 가져온 핀)
   */
  useEffect(() => {
    if (!ready) return;
    const merged = mergeCategoryNames(customCategories, pins.map((p) => p && p.category));
    const same =
      merged.length === customCategories.length &&
      merged.every((name, i) => name === customCategories[i]);
    if (!same) setCustomCategories(merged);
  }, [pins, customCategories, ready]);

  // v2.0 — 주소창에 `?share=…` 가 있으면 공유받은 지도를 미리보기로 띄웁니다. (웹 전용, SSR 안전)
  useEffect(() => {
    if (!ready) return;
    const shared = readShareFromLocation();
    if (shared && shared.pins.length) setSharedPins(shared.pins);
  }, [ready]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const showToast = useCallback((message, tone = 'dark') => {
    setToast({ message, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  // ── v2.1 · 클라우드 동기화 ────────────────────────────────
  // 화면 상태(pins)를 비동기 콜백에서도 최신으로 읽기 위한 거울
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  const currentUserId = () =>
    sessionRef.current && sessionRef.current.user ? sessionRef.current.user.id : null;

  /**
   * 클라우드에서 내 핀을 읽어 로컬과 병합합니다.
   *   · 로컬 → 화면은 **먼저** 그대로 두고, 병합 결과만 반영 (낙관적 업데이트 유지)
   *   · 실패하면 로컬 핀을 한 개도 지우지 않고 안내만 합니다.
   */
  const syncWithCloud = useCallback(
    async ({ silent = false } = {}) => {
      const userId = currentUserId();
      if (!userId) return;
      setCloudSyncing(true);
      try {
        const fetched = await fetchCloudPins(userId);
        if (!fetched.ok) {
          setCloudMessage(fetched.message || '클라우드 핀을 읽지 못했어요 · 기기 저장은 그대로예요');
          if (!silent) showToast('클라우드 핀을 읽지 못했어요 · 기기 저장은 그대로예요');
          return;
        }
        const plan = planCloudSync(pinsRef.current, fetched.pins);
        pinsRef.current = plan.merged;
        setPins(plan.merged);
        setCloudPinCount(plan.merged.length);
        let uploadFailed = null;
        if (plan.toUpload.length) {
          const pushed = await upsertCloudPins(userId, plan.toUpload);
          if (!pushed.ok) uploadFailed = pushed.message || '클라우드에 올리지 못했어요';
        }
        if (uploadFailed) {
          setCloudMessage(uploadFailed + ' · 기기에는 저장돼 있어요');
          if (!syncWarnedRef.current) {
            syncWarnedRef.current = true;
            showToast('클라우드에 올리지 못했어요 · 기기에 저장했어요');
          }
          return;
        }
        syncWarnedRef.current = false;
        setCloudMessage('');
        if (!silent) {
          const added = Math.max(0, plan.merged.length - plan.toUpload.length);
          showToast(
            '클라우드와 맞췄어요 · ' + plan.merged.length + '개 저장됨' + (added ? ' (클라우드에서 ' + added + '개 가져옴)' : ''),
            'pro'
          );
        }
      } finally {
        setCloudSyncing(false);
      }
    },
    [showToast]
  );

  /**
   * 핀을 클라우드에 올립니다 (백그라운드).
   *   · 화면은 이미 바뀐 상태 — 실패해도 로컬 데이터는 그대로이고 토스트로만 알립니다.
   */
  const pushPinsToCloud = useCallback(
    async (list) => {
      const userId = currentUserId();
      const items = (Array.isArray(list) ? list : [list]).filter(Boolean);
      if (!userId || !items.length) return;
      try {
        const res = await upsertCloudPins(userId, items);
        if (res.ok) {
          syncWarnedRef.current = false;
          setCloudPinCount(pinsRef.current.length);
          setCloudMessage('');
          return;
        }
        setCloudMessage((res.message || '클라우드 저장 실패') + ' · 기기에는 저장했어요');
        if (!syncWarnedRef.current) {
          syncWarnedRef.current = true;
          showToast('클라우드 동기화는 잠시 실패했어요 · 기기에는 저장됐어요');
        }
      } catch (e) {
        setCloudMessage('클라우드 저장 실패 · 기기에는 저장했어요');
      }
    },
    [showToast]
  );

  const removePinFromCloud = useCallback(async (pinId) => {
    const userId = currentUserId();
    if (!userId || !pinId) return;
    try {
      const res = await deleteCloudPin(userId, pinId);
      if (res.ok) {
        setCloudPinCount(pinsRef.current.length);
        return;
      }
      setCloudMessage((res.message || '클라우드에서 지우지 못했어요') + ' · 기기에서는 지웠어요');
    } catch (e) {
      setCloudMessage('클라우드에서 지우지 못했어요 · 기기에서는 지웠어요');
    }
  }, []);

  /** 로그인 세션을 앱 상태로 받아들이고, 첫 동기화를 걸어 둡니다. */
  const adoptCloudSession = useCallback(
    (session, options = {}) => {
      const user = session && session.user;
      if (!user) return;
      const known =
        sessionRef.current && sessionRef.current.user && sessionRef.current.user.id === user.id;
      sessionRef.current = session;
      setCloudUser({ id: user.id, email: user.email || '', user_metadata: user.user_metadata || {} });
      if (known && options.fromEvent) return;
      syncWithCloud({ silent: !!options.silent });
    },
    [syncWithCloud]
  );

  const clearCloudSession = useCallback(() => {
    sessionRef.current = null;
    setCloudUser(null);
    setCloudPinCount(0);
    setCloudMessage('');
  }, []);

  // 앱이 준비된 뒤: 설정 조회(웹은 /api/auth-config) → 세션 복원 → 로그인 변화 구독
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      await loadSupabaseConfig();
      if (cancelled) return;
      const configured = isSupabaseConfigured();
      setCloudConfigured(configured);
      if (!configured) return;
      const res = await getSession();
      if (cancelled) return;
      if (res.ok && res.session) adoptCloudSession(res.session, { silent: true });
      const unsubscribe = onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          clearCloudSession();
          return;
        }
        if (session) adoptCloudSession(session, { fromEvent: true, silent: true });
      });
      authUnsubRef.current = unsubscribe;
    })();
    return () => {
      cancelled = true;
      if (authUnsubRef.current) {
        authUnsubRef.current();
        authUnsubRef.current = null;
      }
    };
  }, [ready, adoptCloudSession, clearCloudSession]);

  // ── 로그인 · 회원가입 · 매직링크 · 소셜 ───────────────────
  const handleSignIn = useCallback(
    async (email, password) => {
      setCloudBusy(true);
      setCloudMessage('');
      const res = await signInWithEmail(email, password);
      setCloudBusy(false);
      if (!res.ok) {
        setCloudMessage(res.message || '로그인에 실패했어요');
        showToast(res.message || '로그인에 실패했어요');
        return;
      }
      if (res.session) {
        showToast('로그인했어요');
        adoptCloudSession(res.session);
      } else {
        setCloudMessage('메일함에서 인증 링크를 먼저 눌러 주세요');
      }
    },
    [adoptCloudSession, showToast]
  );

  const handleSignUp = useCallback(
    async (email, password) => {
      setCloudBusy(true);
      setCloudMessage('');
      const res = await signUpWithEmail(email, password);
      setCloudBusy(false);
      if (!res.ok) {
        setCloudMessage(res.message || '가입에 실패했어요');
        showToast(res.message || '가입에 실패했어요');
        return;
      }
      if (res.session) {
        showToast('가입하고 로그인했어요');
        adoptCloudSession(res.session);
        return;
      }
      setCloudMessage('인증 메일을 보냈어요 · 메일함에서 링크를 눌러 주세요');
      showToast('메일함을 확인해 주세요');
    },
    [adoptCloudSession, showToast]
  );

  const handleMagicLink = useCallback(
    async (email) => {
      setCloudBusy(true);
      setCloudMessage('');
      const res = await signInWithMagicLink(email);
      setCloudBusy(false);
      if (!res.ok) {
        setCloudMessage(res.message || '매직링크를 보내지 못했어요');
        showToast(res.message || '매직링크를 보내지 못했어요');
        return;
      }
      setCloudMessage('매직링크를 보냈어요 · 메일함에서 링크를 눌러 주세요');
      showToast('매직링크를 보냈어요 · 메일함 확인');
    },
    [showToast]
  );

  const handleOAuth = useCallback(
    async (provider) => {
      // v2.20.1 — 준비 중인 Apple 은 Supabase 로 넘기지 않습니다(오류 페이지 방지)
      if (!oauthProviderReady(provider)) {
        setCloudMessage(OAUTH_PENDING_MESSAGE);
        showToast(OAUTH_PENDING_MESSAGE);
        return;
      }
      setCloudBusy(true);
      setCloudMessage('');
      const res = await signInWithOAuth(provider);
      setCloudBusy(false);
      if (!res.ok) {
        setCloudMessage(res.message || '로그인 창을 열지 못했어요');
        showToast(res.message || '로그인 창을 열지 못했어요');
        return;
      }
      const label = (OAUTH_PROVIDERS.find((p) => p.id === provider) || {}).label || provider;
      showToast(label + ' 로그인 창을 열었어요');
    },
    [showToast]
  );

  const handleSignOut = useCallback(async () => {
    setCloudBusy(true);
    const res = await signOutCloud();
    setCloudBusy(false);
    if (!res.ok) {
      showToast(res.message || '로그아웃하지 못했어요');
      return;
    }
    clearCloudSession();
    showToast('로그아웃했어요 · 핀은 기기에 그대로 있어요');
  }, [clearCloudSession, showToast]);

  const handleSyncNow = useCallback(() => {
    if (cloudSyncing) return;
    syncWithCloud({ silent: false });
  }, [cloudSyncing, syncWithCloud]);


  // ── v2.2 · 분류 만들기 · 이름 바꾸기 · 지우기 ────────────────
  /** 새 분류 만들기 — 저장 화면·핀 상세·내 정보가 함께 씁니다. 실패하면 안내 문구를 돌려줍니다. */
  const handleAddCategory = useCallback(
    (raw) => {
      const result = addCategory(customCategories, raw);
      if (!result.ok) return result;
      setCustomCategories(result.custom);
      showToast('분류를 추가했어요 · ' + result.name, 'pro');
      return result;
    },
    [customCategories, showToast]
  );

  /**
   * 분류 이름 바꾸기 — 그 분류를 쓰던 핀의 category 도 한꺼번에 바꾸고,
   * 로그인 상태면 바뀐 핀만 클라우드에 다시 올립니다.
   */
  const handleRenameCategory = useCallback(
    (oldName, newName) => {
      const result = renameCategory(customCategories, oldName, newName);
      if (!result.ok || !result.changed) return result;
      setCustomCategories(result.custom);
      const { pins: nextPins, changed } = applyCategoryRename(pinsRef.current, result.previous, result.name);
      if (changed.length) {
        pinsRef.current = nextPins;
        setPins(nextPins);
        pushPinsToCloud(changed);
      }
      setCategoryChange({
        id: (categoryChangeId.current += 1),
        type: 'rename',
        from: result.previous,
        to: result.name,
      });
      showToast(
        '분류 이름을 바꿨어요 · ' + result.previous + ' → ' + result.name +
          (changed.length ? ' (핀 ' + changed.length + '개)' : ''),
        'pro'
      );
      return result;
    },
    [customCategories, pushPinsToCloud, showToast]
  );

  /**
   * 분류 지우기 — 그 분류를 쓰던 핀은 **사라지지 않고** 기본 분류(맛집)로 옮겨 갑니다.
   * 지도 필터는 MapScreen 이 '전체'로 되돌립니다(categoryChange).
   */
  const handleRemoveCategory = useCallback(
    (name) => {
      const result = removeCategory(customCategories, name);
      if (!result.ok) return result;
      setCustomCategories(result.custom);
      const { pins: nextPins, changed, fallback } = applyCategoryRemoval(pinsRef.current, result.name);
      if (changed.length) {
        pinsRef.current = nextPins;
        setPins(nextPins);
        pushPinsToCloud(changed);
      }
      setCategoryChange({
        id: (categoryChangeId.current += 1),
        type: 'remove',
        name: result.name,
        fallback,
      });
      showToast(
        '분류를 지웠어요 · ' + result.name +
          (changed.length ? ' · 핀 ' + changed.length + '개는 ' + fallback + '으로 옮겼어요' : ''),
        changed.length ? 'pro' : 'dark'
      );
      return { ...result, moved: changed.length, fallback };
    },
    [customCategories, pushPinsToCloud, showToast]
  );

  /** 저장된 핀 하나의 분류만 바꾸기 (핀 상세 시트) */
  const handleChangePinCategory = useCallback(
    (pinId, raw) => {
      const name = normalizeCategoryName(raw);
      if (!pinId || !name) return { ok: false, reason: 'empty', message: '분류 이름이 비어 있어요' };
      const target = (pinsRef.current || []).find((p) => p && p.id === pinId);
      if (!target) return { ok: false, reason: 'missing', message: '핀을 찾지 못했어요' };
      if (sameCategory(mapLegacyCategory(target.category), name)) return { ok: true, name, changed: false };
      const changedPin = { ...target, category: name, updatedAt: new Date().toISOString() };
      const next = pinsRef.current.map((p) => (p && p.id === pinId ? changedPin : p));
      pinsRef.current = next;
      setPins(next);
      pushPinsToCloud([changedPin]);
      showToast('분류를 바꿨어요 · ' + name);
      return { ok: true, name, changed: true };
    },
    [pushPinsToCloud, showToast]
  );

  /**
   * v2.10 — ✅ 가봤어요 체크/해제. 상세 시트의 버튼 한 번으로 바뀌고, 기기·클라우드에 바로 저장됩니다.
   */
  const handleTogglePinVisited = useCallback(
    (pinId, next) => {
      if (!pinId) return;
      const target = (pinsRef.current || []).find((p) => p && p.id === pinId);
      if (!target) return;
      const now = new Date().toISOString();
      const toggled = {
        ...target,
        visited: next === true,
        visitedAt: next === true ? now : '',
        updatedAt: now,
      };
      const updated = normalizePins([toggled])[0];
      if (!updated) return;
      const updatedList = pinsRef.current.map((p) => (p && p.id === pinId ? updated : p));
      pinsRef.current = updatedList;
      setPins(updatedList);
      pushPinsToCloud([updated]);
    },
    [pushPinsToCloud]
  );

  /** v2.10 — 📝 한줄 메모 저장 (상세 시트 · 저장 화면) */
  const handleSavePinMemo = useCallback(
    (pinId, memo) => {
      if (!pinId) return;
      const target = (pinsRef.current || []).find((p) => p && p.id === pinId);
      if (!target) return;
      const updated = normalizePins([{ ...target, memo, updatedAt: new Date().toISOString() }])[0];
      if (!updated) return;
      const updatedList = pinsRef.current.map((p) => (p && p.id === pinId ? updated : p));
      pinsRef.current = updatedList;
      setPins(updatedList);
      pushPinsToCloud([updated]);
    },
    [pushPinsToCloud]
  );

  /**
   * v2.20 — 매장 상세에서 확인한 영업시간을 핀에 저장합니다. (기기 로컬 전용)
   *   · 클라우드 스키마에 hours 컬럼이 없으므로 push 하지 않습니다. (updatedAt 도 그대로)
   *   · 화면(상세 시트 배지·500m 배너)이 곧바로 다시 그려집니다.
   */
  const handleSavePinHours = useCallback(
    (pinId, patch) => {
      if (!pinId || !patch) return;
      const target = (pinsRef.current || []).find((p) => p && p.id === pinId);
      if (!target) return;
      const updated = withPlaceHours(target, patch);
      if (!updated) return;
      const updatedList = pinsRef.current.map((p) => (p && p.id === pinId ? updated : p));
      pinsRef.current = updatedList;
      setPins(updatedList);
    },
    []
  );

  const handleSaved = useCallback(
    (pin) => {
      // 매장 정보 URL 또는 이름+동네가 같으면 같은 장소 — 중복 핀을 만들지 않습니다.
      const existing = findExistingPin(pins, pin);
      if (existing) {
        setSelectedPinId(existing.id);
        setTab('map');
        showToast('이미 지도에 있는 장소예요 · ' + existing.name);
        return;
      }
      setPins((prev) => [pin, ...prev]);
      setSelectedPinId(pin.id);
      setTab('map');
      showToast('지도에 핀을 꽂았어요 · ' + pin.name, 'pro');
      // v2.1 — 로그인 상태면 클라우드에도 백그라운드로 (실패해도 로컬은 그대로)
      pushPinsToCloud([pin]);
    },
    [pins, pushPinsToCloud, showToast]
  );

  /**
   * v2.0 — 여러 곳 한 번에 저장.
   *   · 이미 저장한 핀과 이름+좌표(200m)·placeId·매장 URL 이 겹치면 건너뜁니다.
   *   · v2.10 — 무료 플랜 10개 한도를 없앴습니다. 몇 개든 저장됩니다 (중복만 걸러 냄).
   */
  const handleSavedMany = useCallback(
    (incoming) => {
      const list = (Array.isArray(incoming) ? incoming : [incoming]).filter(Boolean);
      if (!list.length) return;
      const { fresh, duplicates } = planPinAddition(pins, list);
      if (!fresh.length) {
        setTab('map');
        if (duplicates.length) {
          const first = duplicates[0].existing;
          if (first) setSelectedPinId(first.id);
          showToast('이미 지도에 있는 장소예요 · ' + first.name);
        }
        return;
      }
      setPins((prev) => fresh.concat(prev));
      setSelectedPinId(fresh[0].id);
      setTab('map');
      const parts = [];
      parts.push(fresh.length > 1 ? fresh.length + '곳을 지도에 꽂았어요' : '지도에 핀을 꽂았어요 · ' + fresh[0].name);
      if (duplicates.length) parts.push(duplicates.length + '곳은 이미 있어요');
      showToast(parts.join(' · '), 'pro');
      pushPinsToCloud(fresh);
    },
    [pins, pushPinsToCloud, showToast]
  );

  /** 공유받은 지도를 내 지도에 합칩니다. (중복은 건너뛰고, 주소창의 share 는 지움 — 개수 한도 없음) */
  const handleAddSharedPins = useCallback(() => {
    if (!sharedPins.length) return;
    const incoming = sharedPins.map((p) => ({ ...p, id: 'pin-shared-' + p.id + '-' + Date.now(), shared: false }));
    const { fresh, duplicates } = planPinAddition(pins, incoming);
    if (fresh.length) setPins((prev) => fresh.concat(prev));
    setSharedPins([]);
    setTab('map');
    clearShareFromLocation();
    const parts = [];
    if (fresh.length) parts.push('공유받은 ' + fresh.length + '곳을 내 지도에 넣었어요');
    if (duplicates.length) parts.push(duplicates.length + '곳은 이미 있어요');
    showToast(parts.join(' · ') || '추가할 곳이 없어요', fresh.length ? 'pro' : 'dark');
    if (fresh.length) pushPinsToCloud(fresh);
  }, [pins, pushPinsToCloud, sharedPins, showToast]);

  const handleDismissShared = useCallback(() => {
    setSharedPins([]);
    clearShareFromLocation();
  }, []);

  const handleDeletePin = useCallback(
    (pinId) => {
      setPins((prev) => prev.filter((p) => p.id !== pinId));
      setSelectedPinId((current) => (current === pinId ? null : current));
      showToast('핀을 삭제했어요');
      removePinFromCloud(pinId);
    },
    [removePinFromCloud, showToast]
  );

  const handleChangeRadius = useCallback(
    (value) => {
      setRadius(value);
      showToast(
        '알림 반경을 ' + (value >= 1000 ? '1km' : value + 'm') + '로 바꿨어요'
      );
    },
    [showToast]
  );

  /**
   * v2.19.1 — 🔔 반경 내 알림 ON/OFF.
   *
   * 상훈 님 요청: "4. 내정보 화면 안에 알림 설정 추가"
   *
   *   · 내 정보 › 알림 설정 스위치와 지도 왼쪽 하단 `근처 알림` 이 **같은 상태**를 씁니다
   *   · 켜면 브라우저/기기 알림 권한을 **누른 그 자리에서** 한 번 묻고, 결과를 문구로 알립니다
   *   · 권한이 없으면 앱 안 배너로 알려드린다는 사실을 그대로 말합니다(알림이 온 척하지 않음)
   */
  const handleToggleAlerts = useCallback(
    async (next) => {
      if (!next) {
        setAlertsEnabled(false);
        showToast('반경 내 알림을 껐어요');
        return { ok: true, enabled: false };
      }
      const permission = await requestNotificationPermission();
      setNotifyPermission(permission);
      setAlertsEnabled(true);
      const radiusLabel = radius >= 1000 ? '1km' : radius + 'm';
      if (permission === 'granted') {
        showToast('반경 내 알림을 켰어요 · 반경 ' + radiusLabel + ' 안에서 알려드려요', 'pro');
      } else if (permission === 'unsupported') {
        showToast('이 브라우저에는 알림창이 없어 앱 안에서 알려드릴게요');
      } else {
        showToast('알림 권한이 꺼져 있어 앱 안 배너로 알려드릴게요');
      }
      return { ok: true, enabled: true, permission };
    },
    [radius, showToast]
  );

  // ── v2.19 · 컬렉션 (테마·코스별로 묶고, 그 묶음만 지도에서 보기·공유) ─────────
  /** 새 컬렉션 — 성공하면 { ok, item } 을 돌려줘 화면이 상세로 들어갈 수 있게 합니다. */
  const handleCreateCollection = useCallback(
    (draft) => {
      const result = createCollection(collectionsRef.current, draft);
      if (!result.ok) return result;
      collectionsRef.current = result.collections;
      setCollections(result.collections);
      showToast('컬렉션을 만들었어요 · ' + result.item.name, 'pro');
      return result;
    },
    [showToast]
  );

  const handleUpdateCollection = useCallback(
    (id, patch) => {
      const result = updateCollection(collectionsRef.current, id, patch);
      if (!result.ok) return result;
      collectionsRef.current = result.collections;
      setCollections(result.collections);
      showToast('컬렉션을 수정했어요 · ' + result.item.name);
      return result;
    },
    [showToast]
  );

  const handleDeleteCollection = useCallback(
    (id) => {
      const target = (collectionsRef.current || []).find((c) => c.id === id);
      const result = removeCollection(collectionsRef.current, id);
      if (!result.ok) return result;
      collectionsRef.current = result.collections;
      setCollections(result.collections);
      if (collectionFilterId === id) setCollectionFilterId(null);
      showToast('컬렉션을 지웠어요' + (target ? ' · ' + target.name : '') + ' · 핀은 지도에 그대로 있어요');
      return result;
    },
    [collectionFilterId, showToast]
  );

  const handleToggleCollectionPin = useCallback(
    (collectionId, pinId) => {
      const result = toggleCollectionPin(collectionsRef.current, collectionId, pinId);
      if (!result.ok) return result;
      collectionsRef.current = result.collections;
      setCollections(result.collections);
      const target = result.collections.find((c) => c.id === collectionId);
      showToast(
        (result.added ? '컬렉션에 담았어요' : '컬렉션에서 뺐어요') +
          (target ? ' · ' + target.name + ' ' + target.pinIds.length + '곳' : '')
      );
      return result;
    },
    [showToast]
  );

  /** 컬렉션 [지도에서 보기] — 지도 탭으로 옮기고 그 컬렉션의 핀만 보입니다. */
  const showCollectionOnMap = useCallback(
    (collection) => {
      if (!collection || !collection.id) return;
      setSelectedPinId(null);
      setCollectionFilterId(collection.id);
      setMenuOpen(false);
      setAlertOpen(false);
      setSearchOpen(false);
      setTab('map');
      const count = (collection.pinIds || []).length;
      showToast(
        count
          ? collection.emoji + ' ' + collection.name + '만 보는 중 · ' + count + '곳'
          : collection.name + '에는 아직 담긴 핀이 없어요'
      );
    },
    [showToast]
  );

  const clearCollectionFilter = useCallback(() => {
    setCollectionFilterId(null);
  }, []);

  /** 지도가 쓰는 컬렉션 필터 — 컬렉션이 지워지거나 핀이 빠지면 바로 반영됩니다. */
  const collectionFilter = useMemo(() => {
    if (!collectionFilterId) return null;
    const target = (collections || []).find((c) => c.id === collectionFilterId);
    if (!target) return null;
    return {
      id: target.id,
      name: target.name,
      emoji: target.emoji,
      pinIds: Array.isArray(target.pinIds) ? target.pinIds : [],
    };
  }, [collectionFilterId, collections]);

  const handleStartPro = useCallback(() => {
    if (isPro) {
      showToast('이미 프로 플랜을 쓰고 있어요');
      return;
    }
    showToast('결제는 앱스토어 등록 후 연결됩니다 (지금은 무료 MVP)');
  }, [isPro, showToast]);

  // ── v2.15 · 공통 헤더의 🔔 알림 모음 · 👤 계정 ─────────────────
  // 반경 500m 안 저장 장소 수 = 헤더 🔔 뱃지, 목록 = 알림 모음(최대 5곳)
  const alertFeed = useMemo(() => buildAlertFeed(pins, alertCoords), [pins, alertCoords]);

  /** 지도 탭이 위치를 잡을 때마다 알려 주는 현재 위치 (없으면 null) */
  const handleMyCoords = useCallback((position) => {
    if (!position) return;
    const lat = Number(position.lat);
    const lng = Number(position.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setAlertCoords((prev) =>
      prev && prev.lat === lat && prev.lng === lng ? prev : { lat, lng }
    );
  }, []);

  /** 알림 모음 안의 [내 위치 켜기] — 사용자가 **직접 누를 때만** 위치를 요청합니다. */
  const handleLocateForAlerts = useCallback(async () => {
    setAlertLocating(true);
    setAlertError('');
    try {
      const position = await requestCurrentPosition();
      handleMyCoords(position);
      writeLocationGrantedFlag(true);
      return position;
    } catch (err) {
      setAlertError((err && err.message) || '위치를 확인하지 못했어요');
      return null;
    } finally {
      setAlertLocating(false);
    }
  }, [handleMyCoords]);

  const openAlerts = useCallback(() => {
    setAlertError('');
    setSearchOpen(false);
    setMenuOpen(false);
    setAlertOpen(true);
  }, []);

  const closeAlerts = useCallback(() => setAlertOpen(false), []);

  /** 핀 하나를 지도에서 열기 (알림 모음 · 🔍 검색 · 컬렉션 공통) */
  const openPinOnMap = useCallback((pin) => {
    if (!pin || !pin.id) return;
    setAlertOpen(false);
    setSearchOpen(false);
    setMenuOpen(false);
    setTab('map');
    pinFocusId.current += 1;
    setPinFocus({ id: pin.id, key: pinFocusId.current });
  }, []);

  /** 알림 모음에서 장소 선택 → 지도 탭으로 이동 + 그 핀으로 지도 이동 + 상세 시트 */
  const openPinFromAlerts = useCallback((pin) => {
    if (!pin || !pin.id) return;
    setAlertOpen(false);
    setTab('map');
    pinFocusId.current += 1;
    setPinFocus({ id: pin.id, key: pinFocusId.current });
  }, []);

  const goMapFromAlerts = useCallback(() => {
    setAlertOpen(false);
    setTab('map');
  }, []);

  // ── v2.16 · 🔍 검색 레이어 팝업 · ☰ 메뉴 ─────────────────────
  const openSearch = useCallback(() => {
    setAlertOpen(false);
    setMenuOpen(false);
    setSearchOpen(true);
  }, []);

  const closeSearch = useCallback(() => setSearchOpen(false), []);

  const openMenu = useCallback(() => {
    setAlertOpen(false);
    setSearchOpen(false);
    setMenuOpen(true);
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  /** 🔍 팝업에서 핀을 고르면 팝업을 닫고 지도 탭에서 그 핀 상세를 엽니다(🔔 와 같은 규칙) */
  const openPinFromSearch = useCallback(
    (pin) => {
      if (!pin || !pin.id) return;
      setSearchOpen(false);
      setTab('map');
      pinFocusId.current += 1;
      setPinFocus({ id: pin.id, key: pinFocusId.current });
    },
    []
  );

  /** 🔍 팝업의 ‘내 핀에 없음’ → 저장 탭 [가게명으로 찾기] 에 검색어를 채워 열기 */
  const goPasteSearch = useCallback((query) => {
    setSearchOpen(false);
    setMenuOpen(false);
    pasteRequestId.current += 1;
    setPasteRequest({
      id: pasteRequestId.current,
      mode: 'search',
      query: String(query == null ? '' : query),
    });
    setTab('paste');
  }, []);

  /** ☰ 메뉴의 [내 지도 공유] — 시트 안 통합 계정 카드 바로 아래 공유 카드가 부릅니다. */
  const shareMyMapFromMenu = useCallback(async () => {
    setMenuOpen(false);
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

  const signedIn = Boolean(cloudUser && (cloudUser.email || cloudUser.id));
  // v2.20.1 — 로그아웃 상태에서는 이름 · 핸들을 넘기지 않습니다(예전 기본값 '이상훈'/'odol' 제거)
  const profile = useMemo(() => profileIdentity(cloudUser), [cloudUser]);
  /** 세 탭이 같이 쓰는 헤더 오른쪽 아이콘 설정 — v2.16 `🔍 · 🔔 · ☰` */
  const headerProps = useMemo(
    () => ({
      alertCount: alertFeed.badgeCount,
      onPressSearch: openSearch,
      onPressAlerts: openAlerts,
      onPressMenu: openMenu,
      signedIn,
    }),
    [alertFeed.badgeCount, openSearch, openAlerts, openMenu, signedIn]
  );

  if (!ready) {
    return (
      <View style={styles.splash}>
        <ExpoStatusBar style="light" />
        <View style={styles.splashPin}>
          <Text style={styles.splashPinText}>📍</Text>
        </View>
        <Text style={styles.splashTitle}>Reelspin</Text>
        <Text style={styles.splashSub}>저장한 릴스 맛집을 지도에 꽂는 중…</Text>
        <ActivityIndicator color={colors.coral} style={{ marginTop: 18 }} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ExpoStatusBar style="light" />
      <View style={[styles.container, { paddingTop: TOP_INSET }]}>
        <View style={styles.screenStack}>
          <View style={[styles.screen, tab !== 'map' && styles.hidden]}>
            <MapScreen
              pins={pins}
              header={headerProps}
              onMyCoords={handleMyCoords}
              alertCoords={alertCoords}
              focusPin={pinFocus}
              categories={categories}
              lastCategoryChange={categoryChange}
              onChangePinCategory={handleChangePinCategory}
              onAddCategory={handleAddCategory}
              selectedPinId={selectedPinId}
              onSelectPin={setSelectedPinId}
              radiusMeters={radius}
              onGoPaste={() => setTab('paste')}
              onDeletePin={handleDeletePin}
              onTogglePinVisited={handleTogglePinVisited}
              onChangePinMemo={handleSavePinMemo}
              onSavePinHours={handleSavePinHours}
              onToast={showToast}
              sharedPins={sharedPins}
              onAddSharedPins={handleAddSharedPins}
              onDismissShared={handleDismissShared}
              collectionFilter={collectionFilter}
              onClearCollectionFilter={clearCollectionFilter}
              alertsEnabled={alertsEnabled}
              onToggleAlerts={handleToggleAlerts}
            />
          </View>
          <View style={[styles.screen, tab !== 'paste' && styles.hidden]}>
            <PasteScreen
              pinCount={pins.length}
              header={headerProps}
              request={pasteRequest}
              categories={categories}
              onAddCategory={handleAddCategory}
              onSaved={handleSaved}
              onSavedMany={handleSavedMany}
              onClose={() => setTab('map')}
              onToast={showToast}
            />
          </View>
          <View style={[styles.screen, tab !== 'collections' && styles.hidden]}>
            <CollectionsScreen
              pins={pins}
              collections={collections}
              header={headerProps}
              onCreateCollection={handleCreateCollection}
              onUpdateCollection={handleUpdateCollection}
              onDeleteCollection={handleDeleteCollection}
              onToggleCollectionPin={handleToggleCollectionPin}
              onShowCollectionOnMap={showCollectionOnMap}
              onOpenPin={openPinOnMap}
              onGoPaste={() => setTab('paste')}
              onToast={showToast}
            />
          </View>
        </View>

        {/* v2.18 — 플로팅 알약 탭바: 화면 바닥에 붙지 않고 살짝 떠서 지도·목록 위에 그려집니다.
            (그래서 화면 높이를 차지하지 않고, 지도 오른쪽·왼쪽 하단 컨트롤은 theme.tabBar 만큼 위로 올라갑니다) */}
        <TabBar active={tab} onChange={setTab} />
        <Toast
          message={toast ? toast.message : null}
          tone={toast ? toast.tone : 'dark'}
          bottomOffset={tab === 'map' && selectedPinId ? 440 : tabBar.controlsBottom + 16}
          placement={tab === 'map' && selectedPinId ? 'top' : 'bottom'}
        />
        {/* v2.15 — 🔔 알림 모음 (헤더 오른쪽 아이콘) · 열려 있을 때만 그립니다 */}
        <AlertInbox
          visible={alertOpen}
          onClose={closeAlerts}
          pins={pins}
          myCoords={alertCoords}
          locating={alertLocating}
          error={alertError}
          onLocate={handleLocateForAlerts}
          onOpenPin={openPinFromAlerts}
          onGoMap={goMapFromAlerts}
        />
        {/* v2.16 — 🔍 검색 레이어 팝업 (저장 화면과 같은 형태 · 인풋 + 추천 + 인기 장소) */}
        <SearchOverlayModal
          visible={searchOpen}
          onClose={closeSearch}
          pins={pins}
          myCoords={alertCoords}
          locating={alertLocating}
          onLocate={handleLocateForAlerts}
          onOpenPin={openPinFromSearch}
          onGoPasteSearch={goPasteSearch}
        />
        {/* v2.16 — ☰ 메뉴 시트 = v2.19 에서 「내 정보」와 머지 (계정·동기화 · 설정 3행 · 저장 요약 · 지도 공유 · 버전) */}
        <MenuDrawerModal
          visible={menuOpen}
          onClose={closeMenu}
          pins={pins}
          name={profile.name}
          handle={profile.handle}
          categories={categories}
          cloudConfigured={cloudConfigured}
          cloudUser={cloudUser}
          cloudPinCount={cloudPinCount}
          cloudBusy={cloudBusy}
          cloudSyncing={cloudSyncing}
          cloudMessage={cloudMessage}
          radiusMeters={radius}
          alertsOn={alertsEnabled}
          notifyPermission={notifyPermission}
          onToggleAlerts={handleToggleAlerts}
          isPro={isPro}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
          onMagicLink={handleMagicLink}
          onOAuth={handleOAuth}
          onSignOut={handleSignOut}
          onSyncNow={handleSyncNow}
          onAddCategory={handleAddCategory}
          onRenameCategory={handleRenameCategory}
          onRemoveCategory={handleRemoveCategory}
          onChangeRadius={handleChangeRadius}
          onStartPro={handleStartPro}
          onGoPaste={() => {
            setMenuOpen(false);
            setTab('paste');
          }}
          onToast={showToast}
          onShareMap={shareMyMapFromMenu}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screenStack: {
    flex: 1,
  },
  screen: {
    ...StyleSheet.absoluteFillObject,
  },
  hidden: {
    display: 'none',
  },
  splash: {
    flex: 1,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  splashPin: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashPinText: {
    fontSize: 30,
  },
  splashTitle: {
    ...typography.h1,
    color: colors.white,
    marginTop: 6,
  },
  splashSub: {
    ...typography.sub,
    color: '#93A2BC',
    fontSize: 12,
  },
});
