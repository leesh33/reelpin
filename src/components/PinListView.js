/**
 * src/components/PinListView.js — v2.5
 * ─────────────────────────────────────────────────────────────
 * 📋 목록 보기 — 지도 ↔ 목록 전환의 '목록' 쪽 화면.
 *
 *   · 위에서부터 검색창 · 분류 칩 · ✅ 방문 상태 필터 · (몇 곳 · 가까운 순/최신순) 요약
 *   · 현재 분류 필터 **AND** 검색어 **AND** 방문 상태에 맞는 핀만, **내 위치가 있으면 가까운 순,
 *     없으면 최신순** 카드 목록으로 (정렬 규칙은 utils/searchPins.js)
 *   · 각 행 = 분류 색 점 + 분류 배지 + 가게 이름 + 지역/주소 + 내 위치와의 거리
 *   · v2.10 — 가봤어요 핀은 `✓ 방문완료` 배지, 메모가 있으면 한 줄 미리보기
 *   · 행을 누르면 그 핀의 상세 시트가 열립니다 (지도로 돌아가지 않아도 됨)
 *   · 검색 결과가 없으면 빈 상태 안내 ([검색어 지우기])
 */
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FilterChips from './FilterChips';
import VisitFilterChips from './VisitFilterChips';
import PinSearchBar from './PinSearchBar';
import { colors, cardShadow, radius, tabBar, typography } from '../theme';
import {
  categoryTextColor,
  categoryTint,
  getCategoryColor,
  mapLegacyCategory,
} from '../utils/categories';
import { pinDistanceMeters } from '../utils/pins';
import { listSortLabel, sortPinsForList, usableOrigin } from '../utils/searchPins';
import { formatDistance } from '../services/location';

export default function PinListView({
  pins = [],
  query = '',
  onQueryChange,
  onClearQuery,
  filter,
  onChangeFilter,
  counts,
  visitFilter = '전체',
  onChangeVisitFilter,
  visitCounts = null,
  categories,
  myCoords = null,
  onSelectPin,
  onOpenPin,
  onToggleView,
  onGoPaste,
}) {
  const origin = usableOrigin(myCoords);
  const rows = useMemo(() => sortPinsForList(pins, myCoords), [pins, myCoords]);
  const sortLabel = listSortLabel(myCoords);
  const keyword = String(query || '').trim();
  const total = Array.isArray(pins) ? pins.length : 0;

  const summary = keyword
    ? "'" + keyword + "' 검색 · " + rows.length + '곳'
    : rows.length + '곳 · ' + sortLabel;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <PinSearchBar value={query} onChange={onQueryChange} onClear={onClearQuery} />
        <View style={styles.chipWrap}>
          <FilterChips
            value={filter}
            onChange={onChangeFilter}
            counts={counts}
            categories={categories}
          />
        </View>
        {/* v2.10 — ✅ 방문 상태 필터 (전체 · 미방문 · 가봤어요) */}
        <View style={styles.visitWrap}>
          <VisitFilterChips
            value={visitFilter}
            onChange={onChangeVisitFilter}
            counts={visitCounts}
            onDark={false}
          />
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaText} numberOfLines={1}>
            {summary}
          </Text>
          <Pressable
            style={styles.mapBtn}
            onPress={onToggleView}
            accessibilityRole="button"
            accessibilityLabel="지도 보기로 전환"
            testID="view-toggle-list"
          >
            <Ionicons name="map-outline" size={13} color={colors.white} />
            <Text style={styles.mapBtnText}>지도 보기</Text>
          </Pressable>
        </View>
      </View>

      {rows.length > 0 ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollBody}
          showsVerticalScrollIndicator={false}
        >
          {rows.map((pin) => {
            const color = getCategoryColor(pin.category, categories);
            const category = mapLegacyCategory(pin.category) || '맛집';
            const distance = origin ? pinDistanceMeters(origin, pin) : null;
            const place = [pin.area, pin.address].filter(Boolean).join(' · ');
            const tags = Array.isArray(pin.menuTags) ? pin.menuTags.slice(0, 3) : [];
            const visited = pin.visited === true;
            const memo = String(pin.memo || '').trim();
            return (
              <Pressable
                key={pin.id}
                style={styles.row}
                onPress={() => {
                  // v2.6 — 지도로 돌아가 그 핀을 확대하고 상세 시트를 엽니다 (onOpenPin)
                  if (typeof onOpenPin === 'function') onOpenPin(pin);
                  else if (typeof onSelectPin === 'function') onSelectPin(pin.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={pin.name + ', ' + category + (place ? ', ' + place : '')}
                testID={'pin-row-' + pin.id}
              >
                <View style={[styles.dot, { backgroundColor: color }]} testID={'pin-dot-' + pin.id} />
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>
                      {pin.name}
                    </Text>
                    {distance != null && Number.isFinite(distance) ? (
                      <Text style={styles.distance}>{formatDistance(distance)}</Text>
                    ) : null}
                  </View>
                  <View style={styles.rowBottom}>
                    <View
                      style={[styles.badge, { backgroundColor: categoryTint(pin.category, categories, 0.14) }]}
                    >
                      <Text
                        style={[styles.badgeText, { color: categoryTextColor(pin.category, categories) }]}
                        numberOfLines={1}
                      >
                        {category}
                      </Text>
                    </View>
                    {/* v2.10 — ✅ 가봤어요 핀은 초록 배지로 한눈에 */}
                    {visited && (
                      <View style={styles.visitBadge} testID={'pin-visited-badge-' + pin.id}>
                        <Text style={styles.visitBadgeText}>✓ 방문완료</Text>
                      </View>
                    )}
                    <Text style={styles.place} numberOfLines={1}>
                      {place || '위치 정보 없음'}
                    </Text>
                  </View>
                  {tags.length > 0 && (
                    <Text style={styles.tags} numberOfLines={1}>
                      {tags.join(' · ')}
                    </Text>
                  )}
                  {/* v2.10 — 📝 한줄 메모 미리보기 */}
                  {!!memo && (
                    <Text style={styles.memo} numberOfLines={1} testID={'pin-memo-preview-' + pin.id}>
                      {'📝 ' + memo}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name={keyword ? 'search' : 'document-text-outline'} size={20} color={colors.coral} />
            </View>
            <Text style={styles.emptyTitle}>
              {keyword
                ? '검색 결과가 없어요'
                : total === 0
                ? '아직 저장한 핀이 없어요'
                : visitFilter === '가봤어요'
                ? '아직 가본 곳이 없어요'
                : visitFilter === '미방문'
                ? '안 가본 곳이 남아 있지 않아요'
                : '조건에 맞는 핀이 없어요'}
            </Text>
            <Text style={styles.emptySub}>
              {keyword
                ? "'" + keyword + "' 와 맞는 핀이 없어요. 다른 낱말로 찾아보세요."
                : total === 0
                ? '릴스 링크 하나면 3초 만에 핀이 꽂힙니다.'
                : visitFilter === '가봤어요'
                ? '가본 곳은 상세 시트에서 [가봤어요]를 누르면 여기 모입니다.'
                : visitFilter === '미방문'
                ? '저장한 곳을 모두 다녀오셨네요. 전체로 보면 한눈에 볼 수 있어요.'
                : '다른 분류를 골라 보세요.'}
            </Text>
            {keyword ? (
              <Pressable
                style={styles.emptyBtn}
                onPress={() => {
                  if (typeof onClearQuery === 'function') onClearQuery();
                }}
                accessibilityRole="button"
                accessibilityLabel="검색어 지우기"
              >
                <Ionicons name="close" size={14} color={colors.white} />
                <Text style={styles.emptyBtnText}>검색어 지우기</Text>
              </Pressable>
            ) : total === 0 && typeof onGoPaste === 'function' ? (
              <Pressable style={styles.emptyBtn} onPress={onGoPaste} accessibilityRole="button">
                <Ionicons name="link-outline" size={14} color={colors.white} />
                <Text style={styles.emptyBtnText}>링크 붙여넣으러 가기</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  chipWrap: {
    marginTop: 8,
  },
  visitWrap: {
    marginTop: 6,
  },
  visitBadge: {
    backgroundColor: colors.visitSoft,
    borderWidth: 1,
    borderColor: colors.visitLine,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  visitBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.visitDark,
  },
  memo: {
    ...typography.tiny,
    fontSize: 10.5,
    color: colors.textSub,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  metaText: {
    flex: 1,
    color: colors.textSub,
    fontSize: 11.5,
    fontWeight: '700',
  },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
  },
  mapBtnText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  scrollBody: {
    paddingHorizontal: 12,
    paddingTop: 10,
    // v2.18 — 플로팅 탭바(floatTop 70px) 아래로 마지막 카드가 가리지 않게 여유를 둡니다.
    paddingBottom: 28 + tabBar.floatTop,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 11,
    ...cardShadow,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  distance: {
    color: colors.coralDark,
    fontSize: 11.5,
    fontWeight: '800',
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  place: {
    flex: 1,
    minWidth: 0,
    ...typography.tiny,
    fontSize: 10.5,
  },
  tags: {
    ...typography.tiny,
    fontSize: 10,
    color: colors.textMuted,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 22,
    paddingHorizontal: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    maxWidth: 320,
  },
  emptyIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyTitle: {
    ...typography.h3,
    fontSize: 15,
  },
  emptySub: {
    ...typography.sub,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.coral,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: radius.md,
  },
  emptyBtnText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
});
