/**
 * src/components/VisitFilterChips.js — v2.10
 * ─────────────────────────────────────────────────────────────
 * ✅ 방문 상태 필터 — 지도·목록 상단의 '전체 / 안 가본 곳 / 가본 곳' 세그먼트.
 *
 *   · 분류 칩(딥 틸·분류 색)과 헷갈리지 않게 **초록 계열** 하나로 켜집니다
 *   · '가본 곳' 칩에는 ✓ 표시 — 지도 핀의 초록 체크와 같은 결
 *   · 지도 위(다크)에서는 `onDark`, 목록(흰 화면)에서는 기본(라이트)
 *   · 규칙 자체(무엇이 미방문인가)는 utils/searchPins.js 가 갖고, 여기서는 그리기만 합니다
 *
 * v2.37.0 — 목록 보기에서 `전체 N` 이 분류 줄과 방문 줄에 **두 번** 보이던 문제:
 *   · `showAll={false}` 로 부르면 '전체' 칩을 빼고 방문 상태 두 칩만 그립니다.
 *   · 줄 맨 앞 `rowLabel`('방문')로 분류 줄과 확실히 구분합니다.
 *   · 켜진 칩을 한 번 더 누르면 전체로 돌아간다는 안내(`다시 누르면 전체`)를 옆에 둡니다.
 *   표시 문구만 '안 가본 곳 / 가본 곳' 으로 쉽게 바꾸고, 저장되는 값(전체·미방문·가봤어요)은
 *   그대로라 지도·목록·빈 상태 규칙은 예전과 같습니다.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { VISIT_ALL, VISIT_DONE, VISIT_FILTERS, VISIT_TODO } from '../utils/searchPins';

/** 칩에 보이는 이름 (값은 그대로 — 화면 문구만 쉬운 말로) */
export const VISIT_CHIP_LABELS = {
  [VISIT_ALL]: '전체',
  [VISIT_TODO]: '안 가본 곳',
  [VISIT_DONE]: '가본 곳',
};

export default function VisitFilterChips({
  value = VISIT_ALL,
  onChange,
  counts = null,
  onDark = false,
  // v2.37.0 — 목록 보기: '전체' 칩을 빼고 방문 상태만 (분류 줄의 '전체 N' 과 겹치지 않게)
  showAll = true,
  rowLabel = '',
}) {
  const items = VISIT_FILTERS.filter((raw) => showAll || raw !== VISIT_ALL);
  const filtered = value !== VISIT_ALL;
  return (
    <View style={[styles.row, onDark ? styles.rowDark : styles.rowLight]} testID="visit-filter">
      {!!rowLabel && (
        <Text style={[styles.rowLabel, onDark ? styles.rowLabelDark : styles.rowLabelLight]} numberOfLines={1}>
          {rowLabel}
        </Text>
      )}
      {items.map((raw) => {
        const on = value === raw;
        const count = counts ? counts[raw] : null;
        const label = VISIT_CHIP_LABELS[raw] || raw;
        return (
          <Pressable
            key={raw}
            onPress={() => {
              if (typeof onChange === 'function') onChange(raw);
            }}
            style={[styles.chip, onDark ? styles.chipDark : styles.chipLight, on && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label + ' 방문 상태 필터'}
            accessibilityHint={on && !showAll ? '다시 누르면 전체 장소를 봐요' : undefined}
            testID={'visit-chip-' + raw}
          >
            {raw === VISIT_DONE ? (
              <Text style={[styles.mark, on ? styles.markOn : onDark ? styles.markDark : styles.markLight]}>✓</Text>
            ) : raw === VISIT_TODO ? (
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
      {!showAll && filtered ? (
        <Text
          style={[styles.resetHint, onDark ? styles.resetHintDark : styles.resetHintLight]}
          numberOfLines={1}
          testID="visit-filter-reset-hint"
        >
          다시 누르면 전체
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  rowDark: {},
  rowLight: {},
  // v2.37.0 — 분류 줄과 구분해 주는 작은 머리말 ('방문')
  rowLabel: {
    fontSize: 11,
    fontWeight: '800',
    marginRight: 1,
  },
  rowLabelDark: {
    color: '#9FB0C8',
  },
  rowLabelLight: {
    color: colors.textMuted,
  },
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
  // v2.37.0 — 켜진 칩을 다시 누르면 전체로 돌아간다는 작은 안내
  resetHint: {
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 2,
  },
  resetHintDark: {
    color: '#9FB0C8',
  },
  resetHintLight: {
    color: colors.textMuted,
  },
});
