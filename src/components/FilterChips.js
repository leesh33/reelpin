import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors } from '../theme';
import {
  CATEGORY_ALL,
  DEFAULT_CATEGORIES,
  filterOptions,
  matchesFilter,
} from '../utils/categories';

// v2.2 — 기본 3개. 실제 칩 목록은 화면이 넘긴 categories(기본 + 커스텀)로 그립니다.
export const FILTERS = [CATEGORY_ALL].concat(DEFAULT_CATEGORIES);

// 기존 화면·테스트가 FilterChips 에서 matchesFilter 를 가져다 써 왔습니다.
export { matchesFilter };

export default function FilterChips({
  value,
  onChange,
  counts,
  categories = DEFAULT_CATEGORIES,
  onDark = true,
}) {
  const options = filterOptions(categories);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map((f) => {
        const on = value === f;
        const count = counts ? counts[f] : null;
        return (
          <Pressable
            key={f}
            onPress={() => onChange(f)}
            style={[
              styles.chip,
              onDark ? styles.chipDark : styles.chipLight,
              on && styles.chipOn,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={f + ' 필터'}
          >
            <Text style={[styles.text, onDark ? styles.textDark : styles.textLight, on && styles.textOn]}>
              {count != null ? f + ' ' + count : f}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
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
    backgroundColor: colors.coral,
    borderColor: colors.coral,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
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
});
