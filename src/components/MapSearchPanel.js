/**
 * src/components/MapSearchPanel.js — v2.35.0
 * ─────────────────────────────────────────────────────────────
 * 🔍 지도 상단 통합 검색창(MapSearchBar) 바로 아래에 뜨는 **검색 결과 드롭다운**.
 *
 *   ① 내가 저장한 핀 결과 … 기존 `PinSearchResults` 를 그대로 재사용
 *      (분류 색 점 · 가게 이름 · 거리/지역 · [전체 N곳] · 행을 누르면 지도 이동 + 상세 시트)
 *   ② 그 아래 **항상** `‘검색어’ 가게명으로 찾아 등록하기` 버튼
 *      … 내 핀 결과가 있을 때도, 0곳일 때도 함께 보여서
 *        "저장한 곳에서 못 찾았으면 바로 새로 찾기"로 이어집니다.
 *
 * 검색어가 비어 있으면 아무것도 그리지 않습니다(지도만 보임).
 */
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { AppText as Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import PinSearchResults from './PinSearchResults';
import {
  MAP_SEARCH_EMPTY_HINT,
  mapSearchQuery,
  newPlaceSearchLabel,
} from '../utils/mapSearch';

export default function MapSearchPanel({
  pins = [],
  query = '',
  categories,
  myCoords = null,
  onOpenPin,
  onShowAll,
  onSearchNewPlace,
}) {
  const keyword = mapSearchQuery(query);
  if (!keyword) return null;
  const label = newPlaceSearchLabel(keyword);
  return (
    <PinSearchResults
      pins={pins}
      query={keyword}
      categories={categories}
      myCoords={myCoords}
      onOpenPin={onOpenPin}
      onShowAll={onShowAll}
      emptyHint={MAP_SEARCH_EMPTY_HINT + ' · 아래에서 새로 찾아보세요'}
      footer={
        <Pressable
          style={styles.newPlaceBtn}
          onPress={() => {
            if (typeof onSearchNewPlace === 'function') onSearchNewPlace(keyword);
          }}
          accessibilityRole="button"
          accessibilityLabel={label}
          testID="map-search-new-place"
        >
          <Ionicons name="navigate" size={13} color={colors.white} />
          <Text style={styles.newPlaceText} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  // 결과 목록 맨 아래 — 내 핀 결과와 한 덩어리로 읽히도록 같은 카드 안에 놓고,
  //   누를 수 있는 유일한 "바깥으로 나가는" 동작이라 딥 틸로 또렷하게 둡니다.
  newPlaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 36,
    marginTop: 2,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  newPlaceText: {
    flexShrink: 1,
    color: colors.white,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
