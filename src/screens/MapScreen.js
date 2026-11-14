import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapCanvas from '../components/MapCanvas';
import FilterChips, { FILTERS, matchesFilter } from '../components/FilterChips';
import GeofenceBanner from '../components/GeofenceBanner';
import PinDetailSheet from '../components/PinDetailSheet';
import { colors, radius, typography } from '../theme';

export default function MapScreen({
  pins,
  selectedPinId,
  onSelectPin,
  radiusMeters,
  onGoPaste,
  onDeletePin,
  onToast,
}) {
  const [filter, setFilter] = useState('전체');
  const [recenterKey, setRecenterKey] = useState(0);

  const filtered = useMemo(() => pins.filter((p) => matchesFilter(p, filter)), [pins, filter]);

  const counts = useMemo(() => {
    const out = {};
    FILTERS.forEach((f) => {
      out[f] = pins.filter((p) => matchesFilter(p, f)).length;
    });
    return out;
  }, [pins]);

  const selectedPin = useMemo(
    () => pins.find((p) => p.id === selectedPinId) || null,
    [pins, selectedPinId]
  );

  // 배너에 띄울 장소: 선택한 핀 → 없으면 첫 핀
  const bannerPin = selectedPin || (filtered.length ? filtered[0] : null);

  const focusBannerPin = () => {
    if (!bannerPin) {
      onGoPaste();
      return;
    }
    onSelectPin(bannerPin.id);
    setRecenterKey((k) => k + 1);
  };

  const recenter = () => {
    setRecenterKey((k) => k + 1);
    if (pins.length) {
      const nearest = pins[0];
      onSelectPin(nearest.id);
      onToast(nearest.name + ' 근처로 이동했어요');
    }
  };

  return (
    <View style={styles.root}>
      <MapCanvas
        key={'map-' + recenterKey}
        pins={filtered}
        selectedId={selectedPinId}
        onSelect={onSelectPin}
        radius={radiusMeters}
      />

      {/* 상단 오버레이: 지오펜스 배너 + 카테고리 필터 */}
      <View style={styles.topOverlay} pointerEvents="box-none">
        <GeofenceBanner
          pin={bannerPin}
          radiusMeters={radiusMeters}
          onPress={focusBannerPin}
          empty={pins.length === 0}
        />
        <View style={styles.chipWrap}>
          <FilterChips value={filter} onChange={setFilter} counts={counts} />
        </View>
      </View>

      {/* 저장 개수 표시 */}
      <View style={[styles.countPill, { bottom: selectedPin ? 372 : 26 }]} pointerEvents="none">
        <View style={styles.countDot} />
        <Text style={styles.countText}>
          {filtered.length} / {pins.length} 핀 표시 중
        </Text>
      </View>

      {/* 현재 위치 / 최근접 핀으로 */}
      <Pressable
        style={[styles.fab, { bottom: selectedPin ? 316 : 26 }]}
        onPress={recenter}
        accessibilityRole="button"
        accessibilityLabel="가장 가까운 저장 장소로 이동"
      >
        <Ionicons name="locate" size={22} color={colors.white} />
      </Pressable>

      {/* 핀 없음 안내 */}
      {pins.length === 0 && (
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
          onClose={() => onSelectPin(null)}
          onDelete={onDeletePin}
          onToast={onToast}
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
  chipWrap: {
    marginTop: 10,
  },
  countPill: {
    position: 'absolute',
    left: 16,
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
  fab: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
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
