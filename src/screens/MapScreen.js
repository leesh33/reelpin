import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import RealMapView from '../components/RealMapView';
import FilterChips, { FILTERS, matchesFilter } from '../components/FilterChips';
import GeofenceBanner from '../components/GeofenceBanner';
import PinDetailSheet from '../components/PinDetailSheet';
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

export default function MapScreen({
  pins,
  selectedPinId,
  onSelectPin,
  radiusMeters,
  onGoPaste,
  onDeletePin,
  onToast,
  sharedPins = [],
  onAddSharedPins,
  onDismissShared,
}) {
  const [filter, setFilter] = useState('전체');

  // ── v1.5 실제 위치 ────────────────────────────────────────
  const [myCoords, setMyCoords] = useState(null);
  const [focus, setFocus] = useState(null);
  const [focusKey, setFocusKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [alertsOn, setAlertsOn] = useState(false);
  const [notifyPermission, setNotifyPermission] = useState(() => notificationPermission());

  const notifiedRef = useRef(new Set());
  const pinsRef = useRef(pins);
  const toastRef = useRef(onToast);
  const autoLocateRef = useRef(false);

  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  useEffect(() => {
    toastRef.current = onToast;
  }, [onToast]);

  const showToast = useCallback((message) => {
    if (typeof toastRef.current === 'function') toastRef.current(message);
  }, []);

  const filtered = useMemo(() => pins.filter((p) => matchesFilter(p, filter)), [pins, filter]);
  // v2.0 — 공유받은 지도는 '미리보기'로 지도에 함께 띄우고, 상세 시트는 읽기 전용으로 엽니다.
  const previewPins = useMemo(() => (Array.isArray(sharedPins) ? sharedPins.filter(Boolean) : []), [sharedPins]);
  const mapPins = useMemo(
    () => (previewPins.length ? previewPins.concat(filtered) : filtered),
    [previewPins, filtered]
  );

  const counts = useMemo(() => {
    const out = {};
    FILTERS.forEach((f) => {
      out[f] = pins.filter((p) => matchesFilter(p, f)).length;
    });
    return out;
  }, [pins]);

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
          if (near.length) {
            setNearbyOpen(true);
            showToast('현재 위치 확인 · 반경 ' + NEARBY_RADIUS_M + 'm 안에 ' + near.length + '곳이 있어요');
          } else {
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

  const toggleNearby = useCallback(async () => {
    if (nearbyOpen) {
      setNearbyOpen(false);
      return;
    }
    setNearbyOpen(true);
    if (!myCoords) await locate({ announce: true });
  }, [nearbyOpen, myCoords, locate]);

  const toggleAlerts = useCallback(async () => {
    if (alertsOn) {
      setAlertsOn(false);
      notifiedRef.current = new Set();
      showToast('근처 알림을 껐어요');
      return;
    }
    const permission = await requestNotificationPermission();
    setNotifyPermission(permission);
    setAlertsOn(true);
    if (permission === 'granted') {
      showToast('근처 알림을 켰어요 · 반경 ' + NEARBY_RADIUS_M + 'm 안에 들어오면 알려드려요');
    } else if (permission === 'unsupported') {
      showToast('이 브라우저에는 알림창이 없어 앱 안에서 알려드릴게요');
    } else {
      showToast('알림 권한이 꺼져 있어 앱 안 배너로 알려드릴게요');
    }
    if (!myCoords) await locate({ announce: false });
  }, [alertsOn, myCoords, locate, showToast]);

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
        setAlertsOn(false);
        showToast((err && err.message) || '위치 추적을 멈췄어요');
      }
    );
    return () => {
      if (typeof stop === 'function') stop();
    };
  }, [alertsOn, applyPosition, showToast]);

  // ── 배너 문구 (v2.1.3: 사실만 — 위치를 모를 때 가짜 거리·가게명을 지어내지 않음) ──
  const banner = useMemo(() => {
    if (pins.length === 0) {
      return { pin: null, empty: true, needsLocation: false, target: null };
    }

    if (!myCoords) {
      return { pin: null, empty: false, needsLocation: true, target: null };
    }

    if (nearby.length) {
      const top = nearby[0];
      return {
        pin: top.pin,
        empty: false,
        needsLocation: false,
        title: '반경 ' + NEARBY_RADIUS_M + 'm 앞, 저장한 맛집이 있어요',
        sub: top.pin.name + ' · ' + formatDistance(top.distanceMeters),
        badge: '지금',
        tone: undefined,
        target: top.pin,
      };
    }

    if (closest && closest.pin) {
      return {
        pin: closest.pin,
        empty: false,
        needsLocation: false,
        title: '가장 가까운 저장 장소: ' + closest.pin.name,
        sub: formatDistance(closest.distanceMeters) + ' · 반경 ' + NEARBY_RADIUS_M + 'm 밖',
        badge: '내 위치',
        tone: 'muted',
        target: closest.pin,
      };
    }

    // 위치는 있지만 좌표 있는 핀이 하나도 없을 때 — 지어내지 않고 아무 배너도 그리지 않습니다.
    return { pin: null, empty: false, needsLocation: false, target: null };
  }, [myCoords, nearby, closest, pins.length]);

  const focusBannerPin = () => {
    if (banner.needsLocation) {
      locate();
      return;
    }
    if (!banner.target) {
      if (typeof onGoPaste === 'function') onGoPaste();
      return;
    }
    focusOnPin(banner.target);
  };

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

  return (
    <View style={styles.root}>
      <RealMapView
        pins={mapPins}
        selectedId={selectedPinId}
        onSelect={onSelectPin}
        myCoords={myCoords}
        focus={focus}
        focusKey={focusKey}
        radiusMeters={NEARBY_RADIUS_M}
      />

      {/* 상단 오버레이: 공유받은 지도 배너 + 실시간 배너 + 카테고리 필터 */}
      <View style={styles.topOverlay} pointerEvents="box-none">
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
        <GeofenceBanner
          pin={banner.pin}
          radiusMeters={radiusMeters}
          onPress={focusBannerPin}
          onLocate={() => locate()}
          locating={locating && !myCoords}
          empty={banner.empty}
          needsLocation={banner.needsLocation}
          hintTitle={'내 위치를 켜면 가까운 맛집과 ' + NEARBY_RADIUS_M + 'm 알림이 보여요'}
          title={banner.title}
          sub={banner.sub}
          badge={banner.badge}
          tone={banner.tone}
        />
        <View style={styles.chipWrap}>
          <FilterChips value={filter} onChange={setFilter} counts={counts} />
        </View>
        {!!locationError && (
          <Pressable style={styles.errorChip} onPress={() => locate()} accessibilityRole="button">
            <Ionicons name="alert-circle" size={12} color={colors.white} />
            <Text style={styles.errorText} numberOfLines={2}>
              {locationError}
            </Text>
          </Pressable>
        )}
      </View>

      {/* 저장 개수 표시 — 상세 시트가 열리면 숨깁니다 */}
      {!selectedPin && (
        <View style={styles.countPill} pointerEvents="none">
          <View style={styles.countDot} />
          <Text style={styles.countText}>
            {filtered.length} / {pins.length} 핀 표시 중
          </Text>
        </View>
      )}

      {/* 반경 500m 주변 목록 */}
      {!selectedPin && nearbyOpen && (
        <View style={styles.nearbyPanel}>
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
                color={alertsOn ? colors.white : colors.coralDark}
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
              <Pressable style={styles.panelLocateBtn} onPress={() => locate()} accessibilityRole="button">
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

      {/* 내 위치 · 주변 500m · 공유 버튼 */}
      {!selectedPin && (
        <View style={styles.actionCol}>
          <Pressable
            style={styles.nearbyBtn}
            onPress={toggleNearby}
            accessibilityRole="button"
            accessibilityState={{ expanded: nearbyOpen }}
            accessibilityLabel="반경 500m 주변 보기"
          >
            <Ionicons name="storefront-outline" size={14} color={colors.white} />
            <Text style={styles.nearbyBtnText}>{'주변 ' + NEARBY_RADIUS_M + 'm'}</Text>
          </Pressable>
          <Pressable
            style={styles.nearbyBtn}
            onPress={shareMyMap}
            accessibilityRole="button"
            accessibilityLabel="내 지도 공유하기"
          >
            <Ionicons name="share-social-outline" size={14} color={colors.white} />
            <Text style={styles.nearbyBtnText}>지도 공유</Text>
          </Pressable>
          <Pressable
            style={[styles.fab, myCoords && styles.fabLive]}
            onPress={() => locate()}
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
      {pins.length === 0 && previewPins.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>지도가 비어 있어요</Text>
          <Text style={styles.emptySub}>릴스 링크 하나면 3초 만에 핀이 꽂힙니다.</Text>
          <Pressable style={styles.emptyBtn} onPress={onGoPaste}>
            <Ionicons name="link-outline" size={15} color={colors.white} />
            <Text style={styles.emptyBtnText}>링크 붙여넣으러 가기</Text>
          </Pressable>
        </View>
      )}

      {selectedPin && (
        <PinDetailSheet
          pin={selectedPin}
          radiusMeters={radiusMeters}
          distanceMeters={myCoords ? distanceById[selectedPin.id] : null}
          onClose={() => onSelectPin(null)}
          onDelete={onDeletePin}
          onToast={onToast}
          readOnly={selectedIsShared}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  topOverlay: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
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
    backgroundColor: colors.coral,
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
    backgroundColor: colors.coral,
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
    marginTop: 10,
  },
  errorChip: {
    marginTop: 6,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    backgroundColor: 'rgba(232,70,31,0.92)',
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
  countPill: {
    position: 'absolute',
    left: 16,
    bottom: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,23,42,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.navyLine,
  },
  countDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.coral,
  },
  countText: {
    color: '#AEB9CC',
    fontSize: 11,
    fontWeight: '700',
  },
  actionCol: {
    position: 'absolute',
    // '+ / −' · 주변 500m · 지도 공유와 같은 오른쪽 끝선 (theme.mapControls)
    right: mapControls.rightInset,
    // +/− 박스 위에 9px 간격을 두고 스택이 쌓입니다.
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
    backgroundColor: colors.coral,
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
    backgroundColor: colors.coralSoft,
  },
  alertToggleOn: {
    backgroundColor: colors.coral,
  },
  alertToggleText: {
    color: colors.coralDark,
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
    color: colors.coralDark,
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
    backgroundColor: colors.coral,
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
    backgroundColor: colors.coral,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  emptyBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
});
