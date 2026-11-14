import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { loadPins, loadPro, loadRadius, savePins, savePro, saveRadius } from './src/storage';
import { findExistingPin, normalizePins } from './src/utils/pins';
import { colors, typography } from './src/theme';

const TOP_INSET = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0;

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('map');
  const [pins, setPins] = useState([]);
  const [radius, setRadius] = useState(300);
  const [isPro, setIsPro] = useState(false);
  const [selectedPinId, setSelectedPinId] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // 최초 1회: 저장된 핀·반경·플랜 불러오기
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedPins, storedRadius, storedPro] = await Promise.all([
        loadPins(),
        loadRadius(),
        loadPro(),
      ]);
      if (cancelled) return;
      // v1.0에서 저장된 핀에 없던 필드(placeUrl·providers)를 채워 넣습니다.
      setPins(normalizePins(storedPins));
      setRadius(storedRadius);
      setIsPro(storedPro);
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
    },
    [pins, showToast]
  );

  const handleDeletePin = useCallback(
    (pinId) => {
      setPins((prev) => prev.filter((p) => p.id !== pinId));
      setSelectedPinId((current) => (current === pinId ? null : current));
      showToast('핀을 삭제했어요');
    },
    [showToast]
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
        <Text style={styles.splashTitle}>ReelPin</Text>
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
              selectedPinId={selectedPinId}
              onSelectPin={setSelectedPinId}
              radiusMeters={radius}
              onGoPaste={() => setTab('paste')}
              onDeletePin={handleDeletePin}
              onToast={showToast}
            />
          </View>
          <View style={[styles.screen, tab !== 'paste' && styles.hidden]}>
            <PasteScreen
              active={tab === 'paste'}
              pinCount={pins.length}
              isPro={isPro}
              onSaved={handleSaved}
              onClose={() => setTab('map')}
              onGoProfile={() => setTab('profile')}
              onToast={showToast}
            />
          </View>
          <View style={[styles.screen, tab !== 'profile' && styles.hidden]}>
            <ProfileScreen
              name="이상훈"
              handle="odol"
              pins={pins}
              radiusMeters={radius}
              onChangeRadius={handleChangeRadius}
              isPro={isPro}
              onStartPro={handleStartPro}
              onGoPaste={() => setTab('paste')}
              onToast={showToast}
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
