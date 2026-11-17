/**
 * src/components/SearchOverlayModal.js — v2.19.1
 * ─────────────────────────────────────────────────────────────
 * 🔍 헤더 돋보기 → **내 정보 시트와 같은 레이어 팝업**.
 *
 * 상훈 님 요청:
 *   "돋보기 버튼은 검색 역할을 하는 거고, 누르면 검색 텍스트 인풋 박스와 추천장소.
 *    그리고 검색 인기 장소 이게 저장 형태의 레이어 팝업으로 나오면 될 거 같아."
 *   "1. 돋보기 버튼 클릭 시 & 알림모음 버튼 클릭 시 화면은 내정보 화면의 레이어팝업 형태와
 *       동일하게 구현 (높이 및 배경 딤처리도 동일하게)"
 *
 *   · v2.19.1 부터 **내 정보·알림 모음·목록 보기와 같은 `LayerSheet` 틀**을 씁니다 —
 *     높이 86% · 같은 딤 · 같은 둥근 모서리 · 다크 차콜 헤더(딥 틸 원 아이콘 + `내 장소 검색` + ✕) ·
 *     바깥을 누르면 닫힘
 *   · v2.20.2 — 상훈 님 요청: "돋보기 버튼의 타이틀은 내장소 검색 으로 해줘" → 헤더 타이틀 `내 장소 검색`
 *   · ① 검색 인풋 … 내 핀(가게명·지역·주소·분류·메뉴·한줄 메모) 실시간 검색 + ✕ 지우기
 *   · ② 추천 장소 … 내 위치 기준 **가까운 저장 장소**, 위치를 모르면 **아직 안 가본(!visited)** 곳
 *                 (지역은 `인천 서구 당하동` 처럼 **시·군·구·동까지** 표기 — utils/areaLabel)
 *   · ③ 검색 인기 장소 … `data/popularPlaces.js` 큐레이션 목록
 *
 * 화면(앱)은 이 컴포넌트를 **열려 있을 때만** 그립니다 — 닫혀 있으면 아무 것도 렌더하지 않습니다.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, typography } from '../theme';
import { formatDistance } from '../services/location';
import { getCategoryColor } from '../utils/categories';
import {
  POPULAR_PLACES,
  POPULAR_PLACES_SUB,
  POPULAR_PLACES_TITLE,
  popularPlaceLabel,
  popularPlaceQuery,
} from '../data/popularPlaces';
import { overlaySearchResults, popularPlaceRows, recommendPlaces } from '../utils/searchOverlay';
import { placeMetaLabel } from '../utils/areaLabel';
import LayerSheet from './LayerSheet';

export const SEARCH_PLACEHOLDER = '가게명 · 동네 · 메뉴 · 메모';

export default function SearchOverlayModal({
  visible,
  onClose,
  pins = [],
  myCoords = null,
  onOpenPin,
  onGoPasteSearch,
  onLocate,
  locating = false,
  closeLabel = '닫기',
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  // 열 때마다 빈 검색어로 시작합니다(지난번 검색어가 남아 있으면 처음 화면이 달라짐).
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const savedCount = useMemo(
    () => (Array.isArray(pins) ? pins.filter((pin) => pin && pin.id).length : 0),
    [pins]
  );
  const results = useMemo(() => overlaySearchResults(pins, query), [pins, query]);
  const recommend = useMemo(() => recommendPlaces(pins, myCoords), [pins, myCoords]);
  const popular = useMemo(() => popularPlaceRows(pins, POPULAR_PLACES), [pins]);

  if (!visible) return null;

  const openPin = (pin) => {
    if (!pin || typeof onOpenPin !== 'function') return;
    onOpenPin(pin);
  };
  /** 인기 검색 장소 — 내 핀에 있으면 그 핀으로, 없으면 검색어로 채워 결과(0곳) + 저장 탭 CTA */
  const tapPopular = (row) => {
    if (row.pin) {
      openPin(row.pin);
      return;
    }
    setQuery(popularPlaceQuery(row.place));
  };
  const goPaste = () => {
    if (typeof onGoPasteSearch === 'function') onGoPasteSearch(results.query);
  };

  return (
    <LayerSheet
      visible={visible}
      onClose={onClose}
      icon="search"
      title="내 장소 검색"
      sub={
        savedCount
          ? '내 핀 ' + savedCount + '곳에서 찾기 · ' + SEARCH_PLACEHOLDER
          : '아직 저장한 핀이 없어요'
      }
      closeLabel={closeLabel}
      overlayTestID="search-overlay"
      testID="search-overlay-sheet"
      headerTestID="search-overlay-header"
      closeTestID="search-overlay-close"
      zIndex={50}
    >
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        testID="search-overlay-scroll"
      >
        {/* ① 검색 텍스트 인풋 박스 */}
        <View style={styles.inputCard}>
          <Ionicons name="search" size={16} color={colors.textSub} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder={SEARCH_PLACEHOLDER}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="내 장소 검색"
            testID="search-overlay-input"
          />
          {query ? (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="검색어 지우기"
              testID="search-overlay-clear"
              style={styles.clearBtn}
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {results.query ? (
          <>
            {/* 검색 결과 */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>
                {'‘' + results.query + '’ ' + results.total + '곳'}
              </Text>
              {results.truncated ? (
                <Text style={styles.sectionSub}>{'상위 ' + results.limit + '곳만 보여드려요'}</Text>
              ) : (
                <Text style={styles.sectionSub}>내 핀에서 찾았어요</Text>
              )}
            </View>

            {results.total === 0 ? (
              <View style={styles.emptyCard} testID="search-overlay-empty">
                <Ionicons name="search-outline" size={22} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>{'‘' + results.query + '’ 은(는) 내 핀에 없어요'}</Text>
                <Text style={styles.emptySub}>
                  저장 탭에서 가게명으로 찾아 지도에 꽂아 둘 수 있어요.
                </Text>
                {typeof onGoPasteSearch === 'function' ? (
                  <Pressable
                    style={styles.emptyBtn}
                    onPress={goPaste}
                    accessibilityRole="button"
                    accessibilityLabel="저장 탭에서 가게명으로 찾기"
                    testID="search-overlay-go-paste"
                  >
                    <Ionicons name="add-circle-outline" size={15} color={colors.white} />
                    <Text style={styles.emptyBtnText} numberOfLines={1}>
                      {'저장 탭에서 ‘' + results.query + '’ 찾기'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              results.items.map((item) => (
                <Pressable
                  key={item.pin.id}
                  style={styles.row}
                  onPress={() => openPin(item.pin)}
                  accessibilityRole="button"
                  accessibilityLabel={item.pin.name}
                  testID={'search-result-' + item.pin.id}
                >
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: getCategoryColor(item.pin.category) || colors.brand },
                    ]}
                  />
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.pin.name}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {placeMetaLabel(item.pin)}
                      {item.pin.visited === true ? ' · 가봤어요' : ''}
                    </Text>
                  </View>
                  {Number.isFinite(item.distanceMeters) ? (
                    <Text style={styles.rowDistance}>{formatDistance(item.distanceMeters)}</Text>
                  ) : null}
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </Pressable>
              ))
            )}
          </>
        ) : (
          <>
            {/* ② 추천 장소 */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>추천 장소</Text>
              {!recommend.hasLocation && typeof onLocate === 'function' ? (
                <Pressable
                  style={styles.locateChip}
                  onPress={onLocate}
                  accessibilityRole="button"
                  accessibilityLabel="내 위치 켜기"
                  testID="search-overlay-locate"
                >
                  {locating ? (
                    <ActivityIndicator color={colors.brandDark} size="small" />
                  ) : (
                    <Ionicons name="locate" size={11} color={colors.brandDark} />
                  )}
                  <Text style={styles.locateText}>내 위치</Text>
                </Pressable>
              ) : (
                <Text style={styles.sectionSub}>{recommend.label}</Text>
              )}
            </View>
            <Text style={styles.sectionNote}>{recommend.sub}</Text>

            {recommend.items.length ? (
              recommend.items.map((item) => (
                <Pressable
                  key={'rec-' + item.pin.id}
                  style={styles.row}
                  onPress={() => openPin(item.pin)}
                  accessibilityRole="button"
                  accessibilityLabel={item.pin.name}
                  testID={'search-recommend-' + item.pin.id}
                >
                  <View style={styles.recIcon}>
                    <Ionicons
                      name={recommend.kind === 'near' ? 'navigate' : 'bookmark-outline'}
                      size={12}
                      color={colors.brandDark}
                    />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.pin.name}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {placeMetaLabel(item.pin)}
                    </Text>
                  </View>
                  {Number.isFinite(item.distanceMeters) ? (
                    <Text style={styles.rowDistance}>{formatDistance(item.distanceMeters)}</Text>
                  ) : recommend.kind === 'todo' ? (
                    <Text style={styles.todoTag}>안 가봄</Text>
                  ) : null}
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyCard} testID="search-overlay-recommend-empty">
                <Ionicons name="map-outline" size={22} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>
                  {recommend.hasLocation ? '추천할 저장 장소가 없어요' : '아직 저장한 장소가 없어요'}
                </Text>
                <Text style={styles.emptySub}>릴스 링크 하나면 3초 만에 핀이 꽂힙니다.</Text>
              </View>
            )}

            {/* ③ 검색 인기 장소 */}
            <View style={[styles.sectionHead, styles.sectionHeadGap]}>
              <Text style={styles.sectionTitle}>{POPULAR_PLACES_TITLE}</Text>
            </View>
            <Text style={styles.sectionNote}>{POPULAR_PLACES_SUB}</Text>
            <View style={styles.chipWrap}>
              {popular.map((row) => (
                <Pressable
                  key={'pop-' + row.place.id}
                  style={[styles.chip, row.pin && styles.chipSaved]}
                  onPress={() => tapPopular(row)}
                  accessibilityRole="button"
                  accessibilityLabel={popularPlaceLabel(row.place)}
                  testID={'search-popular-' + row.place.id}
                >
                  <Text style={[styles.chipText, row.pin && styles.chipTextSaved]} numberOfLines={1}>
                    {popularPlaceLabel(row.place)}
                  </Text>
                  {row.pin ? (
                    <View style={styles.chipBadge}>
                      <Ionicons name="checkmark" size={9} color={colors.visitDark} />
                      <Text style={styles.chipBadgeText}>내 지도</Text>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Text style={styles.footNote}>핀을 누르면 지도 탭에서 그 장소가 열려요.</Text>
      </ScrollView>
    </LayerSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 13,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    // 웹에서 input 기본 테두리·파란 포커스 링을 없앱니다.
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  clearBtn: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHead: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeadGap: {
    marginTop: 24,
  },
  sectionTitle: {
    ...typography.h3,
    fontSize: 14.5,
  },
  sectionSub: {
    flex: 1,
    ...typography.tiny,
    fontSize: 10.5,
    textAlign: 'right',
  },
  sectionNote: {
    ...typography.tiny,
    fontSize: 10.5,
    marginTop: 3,
  },
  locateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.brandSoft,
  },
  locateText: {
    color: colors.brandDark,
    fontSize: 10,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.lineSoft,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recIcon: {
    width: 20,
    height: 20,
    borderRadius: 7,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    ...typography.body,
    fontSize: 13.5,
    fontWeight: '700',
  },
  rowMeta: {
    ...typography.tiny,
    fontSize: 10.5,
    marginTop: 1,
  },
  rowDistance: {
    color: colors.brandDark,
    fontSize: 11.5,
    fontWeight: '800',
  },
  todoTag: {
    color: colors.visitDark,
    fontSize: 10,
    fontWeight: '800',
  },
  emptyCard: {
    marginTop: 10,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 20,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.lineSoft,
  },
  emptyTitle: {
    ...typography.h3,
    fontSize: 13.5,
    textAlign: 'center',
  },
  emptySub: {
    ...typography.sub,
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    maxWidth: '100%',
    backgroundColor: colors.charcoal,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyBtnText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 9,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipSaved: {
    backgroundColor: colors.visitSoft,
    borderColor: colors.visitLine,
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextSaved: {
    color: colors.visitDark,
  },
  chipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  chipBadgeText: {
    color: colors.visitDark,
    fontSize: 9.5,
    fontWeight: '800',
  },
  footNote: {
    ...typography.tiny,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 22,
  },
});
