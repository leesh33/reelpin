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
import MapScreen from './src/screens/MapScreen';
import PasteScreen from './src/screens/PasteScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import TabBar from './src/components/TabBar';
import Toast from './src/components/Toast';
import {
  loadCategories,
  loadPins,
  loadPro,
  loadRadius,
  saveCategories,
  savePins,
  savePro,
  saveRadius,
} from './src/storage';
import { findExistingPin, normalizePins, planPinAddition } from './src/utils/pins';
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
import { clearShareFromLocation, readShareFromLocation } from './src/utils/shareMap';
import { isSupabaseConfigured, loadSupabaseConfig } from './src/services/supabase';
import {
  OAUTH_PROVIDERS,
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
import { colors, typography } from './src/theme';

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
  // v2.0 — `?share=…` 링크로 들어온 '공유받은 맛집 지도' (아직 내 지도에 넣기 전 미리보기)
  const [sharedPins, setSharedPins] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

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
      const [storedPins, storedRadius, storedPro, storedCategories] = await Promise.all([
        loadPins(),
        loadRadius(),
        loadPro(),
        loadCategories(),
      ]);
      if (cancelled) return;
      // v1.0에서 저장된 핀에 없던 필드(placeUrl·providers)를 채워 넣습니다.
      setPins(normalizePins(storedPins));
      setRadius(storedRadius);
      setIsPro(storedPro);
      setCustomCategories(normalizeCustomCategories(storedCategories));
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

  useEffect(() => {
    if (ready) saveCategories(customCategories);
  }, [customCategories, ready]);

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
      setCloudUser({ id: user.id, email: user.email || '' });
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

  const handleStartPro = useCallback(() => {
    if (isPro) {
      showToast('이미 프로 플랜을 쓰고 있어요');
      return;
    }
    showToast('결제는 앱스토어 등록 후 연결됩니다 (지금은 무료 MVP)');
  }, [isPro, showToast]);

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
      <ExpoStatusBar style={tab === 'map' ? 'light' : 'dark'} />
      <View style={[styles.container, { paddingTop: TOP_INSET }]}>
        <View style={styles.screenStack}>
          <View style={[styles.screen, tab !== 'map' && styles.hidden]}>
            <MapScreen
              pins={pins}
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
              onToast={showToast}
              sharedPins={sharedPins}
              onAddSharedPins={handleAddSharedPins}
              onDismissShared={handleDismissShared}
            />
          </View>
          <View style={[styles.screen, tab !== 'paste' && styles.hidden]}>
            <PasteScreen
              pinCount={pins.length}
              categories={categories}
              onAddCategory={handleAddCategory}
              onSaved={handleSaved}
              onSavedMany={handleSavedMany}
              onClose={() => setTab('map')}
              onToast={showToast}
            />
          </View>
          <View style={[styles.screen, tab !== 'profile' && styles.hidden]}>
            <ProfileScreen
              name="이상훈"
              handle="odol"
              pins={pins}
              categories={categories}
              onAddCategory={handleAddCategory}
              onRenameCategory={handleRenameCategory}
              onRemoveCategory={handleRemoveCategory}
              radiusMeters={radius}
              onChangeRadius={handleChangeRadius}
              isPro={isPro}
              onStartPro={handleStartPro}
              onGoPaste={() => setTab('paste')}
              onToast={showToast}
              cloudConfigured={cloudConfigured}
              cloudUser={cloudUser}
              cloudPinCount={cloudPinCount}
              cloudBusy={cloudBusy}
              cloudSyncing={cloudSyncing}
              cloudMessage={cloudMessage}
              onSignIn={handleSignIn}
              onSignUp={handleSignUp}
              onMagicLink={handleMagicLink}
              onOAuth={handleOAuth}
              onSignOut={handleSignOut}
              onSyncNow={handleSyncNow}
            />
          </View>
        </View>

        <TabBar active={tab} onChange={setTab} />
        <Toast
          message={toast ? toast.message : null}
          tone={toast ? toast.tone : 'dark'}
          bottomOffset={tab === 'map' && selectedPinId ? 440 : 96}
          placement={tab === 'map' && selectedPinId ? 'top' : 'bottom'}
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
