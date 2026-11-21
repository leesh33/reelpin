/**
 * src/components/MapSearchBar.js — v2.35.0
 * ─────────────────────────────────────────────────────────────
 * 🔍 지도 화면 **카테고리 칩 바로 위**에 상시 놓이는 얇은 알약형 통합 검색창.
 *
 * 상훈 님 요청(2026-11-21): "써보다보니 바로 검색하고 싶으면 몇 단계 찾아 들어가는 게
 * 좀 불편하긴 하네" · "지도상단에 통합검색창"
 *   · v2.16 에서 지도 위 검색창을 헤더 🔍(검색 레이어 팝업)로 올렸는데,
 *     v2.35.0 에서는 반대로 **헤더 🔍 를 없애고** 지도 위에 이 입력창 하나만 둡니다
 *     (같은 검색이 두 곳에 있으면 헷갈립니다).
 *
 * 모양
 *   · 흰색 반투명 알약(`rgba(255,255,255,0.96)` + 얇은 테두리 + 은은한 그림자) —
 *     바로 아래 분류 칩(FilterChips)과 같은 결이라 한 덩어리로 읽힙니다.
 *   · 높이 42px (요구 40~44px) · 좌우 16px 여백 · 글자 13px · 딥 네이비 지도 위에서도 또렷합니다.
 *   · 왼쪽 돋보기, 오른쪽은 입력이 있을 때만 `✕`(한 번에 지우기 · 검색 닫기).
 *
 * 동작은 화면(MapScreen)이 맡습니다 — 입력값 `value` · `onChange` · `onClear` · `onSubmit`.
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { MAP_SEARCH_BAR_HEIGHT, MAP_SEARCH_PLACEHOLDER } from '../utils/mapSearch';

export { MAP_SEARCH_PLACEHOLDER, MAP_SEARCH_BAR_HEIGHT };

export default function MapSearchBar({
  value = '',
  onChange,
  onClear,
  onSubmit,
  placeholder = MAP_SEARCH_PLACEHOLDER,
}) {
  const text = String(value == null ? '' : value);
  const hasValue = text.length > 0;
  return (
    <View style={styles.wrap} testID="map-search-bar">
      <Ionicons name="search" size={15} color={colors.textSub} />
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(next) => {
          if (typeof onChange === 'function') onChange(next);
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={() => {
          if (typeof onSubmit === 'function') onSubmit();
        }}
        accessibilityLabel="내 핀·새 장소 검색"
        testID="map-search-input"
      />
      {hasValue && (
        <Pressable
          onPress={() => {
            if (typeof onClear === 'function') onClear();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="검색어 지우기"
          testID="map-search-clear"
          style={styles.clearBtn}
        >
          <Ionicons name="close-circle" size={16} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: MAP_SEARCH_BAR_HEIGHT,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    // 바로 아래 분류 칩과 같은 유리결 (웹 아이폰 사파리에서 뒤 지도가 은은히 비침)
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)' } : null),
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    // 웹에서 input 기본 테두리·파란 포커스 링을 없앱니다.
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  clearBtn: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
