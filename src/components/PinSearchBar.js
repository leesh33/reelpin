/**
 * src/components/PinSearchBar.js — v2.5
 * ─────────────────────────────────────────────────────────────
 * 🔍 내 핀 검색창 — **목록 보기(PinListView) 상단**의 얇은 1줄 입력창.
 *   v2.16 — 지도 위 검색창은 상단 헤더 🔍(검색 레이어 팝업)로 옮겨, 이 컴포넌트는 목록 보기에서만 씁니다.
 *
 *   · 왼쪽 돋보기 + [가게명 · 지역 · 메뉴] 안내 + 입력하면 오른쪽에 ✕ 지우기 버튼
 *   · 흰 알약(반투명) 하나로 지도(딥 네이비) 위에서도 목록(밝은 배경)에서도 같은 모양
 *   · 지도 영역을 많이 가리지 않도록 높이 40px · 글자 13px
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';

export const SEARCH_PLACEHOLDER = '내 핀 검색 · 가게명 · 지역 · 메뉴';

export default function PinSearchBar({
  value = '',
  onChange,
  onClear,
  placeholder = SEARCH_PLACEHOLDER,
  onSubmit,
}) {
  const hasValue = String(value || '').length > 0;
  return (
    <View style={styles.wrap}>
      <Ionicons name="search" size={15} color={colors.textMuted} />
      <TextInput
        style={styles.input}
        value={String(value || '')}
        onChangeText={(text) => {
          if (typeof onChange === 'function') onChange(text);
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={() => {
          if (typeof onSubmit === 'function') onSubmit();
        }}
        accessibilityLabel="내 핀 검색"
        testID="pin-search-input"
      />
      {hasValue && (
        <Pressable
          onPress={() => {
            if (typeof onClear === 'function') onClear();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="검색어 지우기"
          testID="pin-search-clear"
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
    height: 40,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
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
