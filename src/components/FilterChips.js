import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors } from '../theme';

export const FILTERS = ['전체', '맛집', '카페', '가볼곳'];

// 카테고리 → 필터 매핑 (베이커리·디저트는 '맛집'에 포함)
export function matchesFilter(pin, filter) {
  if (filter === '전체') return true;
  if (filter === '맛집') return ['맛집', '베이커리', '디저트'].includes(pin.category);
  if (filter === '카페') return pin.category === '카페';
  if (filter === '가볼곳') return pin.category === '가볼곳';
  return true;
}

export default function FilterChips({ value, onChange, counts, onDark = true }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {FILTERS.map((f) => {
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
              {f}
              {count != null ? ' ' + count : ''}
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
