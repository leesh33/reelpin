/**
 * src/components/VisitFilterChips.js — v2.10
 * ─────────────────────────────────────────────────────────────
 * ✅ 방문 상태 필터 — 지도·목록 상단의 '전체 / 미방문 / 가봤어요' 세그먼트.
 *
 *   · 분류 칩(코랄·분류 색)과 헷갈리지 않게 **초록 계열** 하나로 켜집니다
 *   · '가봤어요' 칩에는 ✓ 표시 — 지도 핀의 초록 체크와 같은 결
 *   · 지도 위(다크)에서는 `onDark`, 목록(흰 화면)에서는 기본(라이트)
 *   · 규칙 자체(무엇이 미방문인가)는 utils/searchPins.js 가 갖고, 여기서는 그리기만 합니다
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { VISIT_ALL, VISIT_DONE, VISIT_FILTERS, VISIT_TODO } from '../utils/searchPins';

export default function VisitFilterChips({
  value = VISIT_ALL,
  onChange,
  counts = null,
  onDark = false,
}) {
  return (
    <View style={[styles.row, onDark ? styles.rowDark : styles.rowLight]} testID="visit-filter">
      {VISIT_FILTERS.map((label) => {
        const on = value === label;
        const count = counts ? counts[label] : null;
        return (
          <Pressable
            key={label}
            onPress={() => {
              if (typeof onChange === 'function') onChange(label);
            }}
            style={[styles.chip, onDark ? styles.chipDark : styles.chipLight, on && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label + ' 방문 상태 필터'}
            testID={'visit-chip-' + label}
          >
            {label === VISIT_DONE ? (
              <Text style={[styles.mark, on ? styles.markOn : onDark ? styles.markDark : styles.markLight]}>✓</Text>
            ) : label === VISIT_TODO ? (
              <View
                style={[
                  styles.hollow,
                  on ? styles.hollowOn : onDark ? styles.hollowDark : styles.hollowLight,
                ]}
              />
            ) : null}
            <Text
              style={[styles.text, on ? styles.textOn : onDark ? styles.textDark : styles.textLight]}
              numberOfLines={1}
            >
              {count != null ? label + ' ' + count : label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
  },
  rowDark: {},
  rowLight: {},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipDark: {
    backgroundColor: 'rgba(20,31,53,0.86)',
    borderColor: colors.navyLine,
  },
  chipLight: {
    backgroundColor: colors.card,
    borderColor: colors.line,
  },
  chipOn: {
    backgroundColor: colors.visit,
    borderColor: colors.visit,
  },
  text: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  textDark: {
    color: '#B9C2D4',
  },
  textLight: {
    color: colors.textSub,
  },
  textOn: {
    color: colors.white,
  },
  mark: {
    fontSize: 11,
    fontWeight: '900',
  },
  markDark: {
    color: colors.visit,
  },
  markLight: {
    color: colors.visit,
  },
  markOn: {
    color: colors.white,
  },
  hollow: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  hollowDark: {
    borderColor: '#B9C2D4',
  },
  hollowLight: {
    borderColor: colors.textMuted,
  },
  hollowOn: {
    borderColor: colors.white,
  },
});
