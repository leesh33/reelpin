/**
 * src/components/PinSearchResults.js — v2.6
 * ─────────────────────────────────────────────────────────────
 * 🔍 지도 화면에서 검색어와 맞는 핀이 **2곳 이상**일 때, 검색창 바로 아래에 뜨는
 *    **콤팩트 결과 목록**입니다.
 *
 *   · 입력창은 그대로 살아 있어요 (목록으로 화면을 바꾸지 않으므로 타이핑이 끊기지 않습니다)
 *   · 한 번에 최대 SEARCH_RESULT_MAX(4)행 — 분류 색 점 · 가게 이름 · 거리/지역
 *   · 행을 누르면 지도로 그 핀을 보여 주고 상세 시트가 열립니다 (MapScreen.openPinFromList)
 *   · [전체 N곳] 을 누르면 목록 보기(PinListView)로 전환 — 거리순/최신순 전체 목록
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, cardShadow, radius, typography } from '../theme';
import { getCategoryColor, mapLegacyCategory } from '../utils/categories';
import { pinDistanceMeters } from '../utils/pins';
import { pinMapCoords, SEARCH_RESULT_MAX } from '../utils/searchNav';
import { formatDistance } from '../services/location';

export default function PinSearchResults({
  pins = [],
  query = '',
  categories,
  myCoords = null,
  onOpenPin,
  onShowAll,
  max = SEARCH_RESULT_MAX,
}) {
  const rows = (Array.isArray(pins) ? pins : []).filter(Boolean);
  const keyword = String(query || '').trim();
  const origin = pinMapCoords(myCoords);
  const shown = rows.slice(0, Math.max(1, max));
  const total = rows.length;

  return (
    <View style={styles.wrap} testID="pin-search-results">
      <View style={styles.head}>
        <Text style={styles.headText} numberOfLines={1}>
          {'‘' + keyword + '’ 검색 · ' + total + '곳'}
        </Text>
        <Pressable
          style={styles.allBtn}
          onPress={() => {
            if (typeof onShowAll === 'function') onShowAll();
          }}
          accessibilityRole="button"
          accessibilityLabel={'검색 결과 ' + total + '곳 목록으로 보기'}
          testID="pin-results-show-all"
        >
          <Ionicons name="list-outline" size={12} color={colors.white} />
          <Text style={styles.allText}>{'전체 ' + total + '곳'}</Text>
        </Pressable>
      </View>

      {shown.map((pin, index) => {
        const color = getCategoryColor(pin.category, categories);
        const category = mapLegacyCategory(pin.category) || '맛집';
        const place = [pin.area, pin.address].filter(Boolean).join(' · ');
        const distance = origin ? pinDistanceMeters(origin, pin) : null;
        const right = distance != null && Number.isFinite(distance) ? formatDistance(distance) : place;
        return (
          <Pressable
            key={pin.id}
            style={[styles.row, index > 0 && styles.rowLine]}
            onPress={() => {
              if (typeof onOpenPin === 'function') onOpenPin(pin);
            }}
            accessibilityRole="button"
            accessibilityLabel={pin.name + ', ' + category + (place ? ', ' + place : '')}
            testID={'pin-result-row-' + pin.id}
          >
            <View style={[styles.dot, { backgroundColor: color }]} />
            <View style={styles.rowBody}>
              <Text style={styles.name} numberOfLines={1}>
                {pin.name}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {category}
                {place ? ' · ' + place : ''}
              </Text>
            </View>
            {!!right && (
              <Text style={styles.right} numberOfLines={1}>
                {right}
              </Text>
            )}
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </Pressable>
        );
      })}

      {total > shown.length && (
        <Text style={styles.more}>{'외 ' + (total - shown.length) + '곳 더 있어요 · [전체 ' + total + '곳]'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    marginHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 10,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    ...cardShadow,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 6,
    paddingHorizontal: 2,
  },
  headText: {
    flex: 1,
    minWidth: 0,
    color: colors.textSub,
    fontSize: 11.5,
    fontWeight: '800',
  },
  allBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 26,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
  },
  allText: {
    color: colors.white,
    fontSize: 10.5,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  rowLine: {
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  name: {
    color: colors.text,
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sub: {
    ...typography.tiny,
    fontSize: 10,
  },
  right: {
    maxWidth: 96,
    color: colors.coralDark,
    fontSize: 11,
    fontWeight: '800',
  },
  more: {
    ...typography.tiny,
    fontSize: 10,
    paddingTop: 4,
    paddingBottom: 6,
    paddingHorizontal: 2,
  },
});
