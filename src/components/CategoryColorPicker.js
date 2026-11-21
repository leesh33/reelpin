/**
 * src/components/CategoryColorPicker.js — v2.36.2
 * ─────────────────────────────────────────────────────────────
 * **분류 색 고르기** — 상훈 님 요청(2026-11-21):
 *   "혹시 분류 추가할 때 색상도 지정하게 할 수 있을까?"
 *
 *   · 분류를 만드는 자리(저장 화면 · 핀 상세 · 내 정보 → 분류 관리)에서 이름 입력과 함께
 *     팔레트 10색(`CATEGORY_COLOR_PALETTE`) 중 하나를 고릅니다.
 *   · 고른 색은 **테두리 링 + 흰 체크**로 표시하고, 읽어 주는 이름도 색 이름('보라')으로 붙입니다.
 *   · 처음 열 때는 그 분류가 예전 자동 배정으로 받았을 색이 미리 골라져 있습니다
 *     (`suggestCategoryColor`) → 색을 고르지 않고 [추가]만 눌러도 예전과 똑같습니다.
 *   · 색은 `utils/categories` 의 '분류 이름 → 색' 표에 저장되고, 지도 핀·상단 칩·배지가
 *     모두 같은 `getCategoryColor` 를 쓰므로 어디서나 같은 색으로 보입니다.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import {
  CATEGORY_COLOR_PALETTE,
  categoryColorName,
  normalizeHexColor,
} from '../utils/categories';

export default function CategoryColorPicker({
  value,
  onChange,
  palette = CATEGORY_COLOR_PALETTE,
  label = '분류 색',
  hint = '',
  testIDPrefix = 'category-color',
}) {
  const selected = normalizeHexColor(value);
  const list = Array.isArray(palette) && palette.length ? palette : CATEGORY_COLOR_PALETTE;

  return (
    <View style={styles.wrap} testID={testIDPrefix + '-row'}>
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint} numberOfLines={1}>
          {hint || (selected ? categoryColorName(selected) : '색을 고르세요')}
        </Text>
      </View>
      <View style={styles.row}>
        {list.map((hex) => {
          const color = normalizeHexColor(hex) || hex;
          const on = !!selected && selected === color;
          return (
            <Pressable
              key={color}
              onPress={() => typeof onChange === 'function' && onChange(color)}
              style={[styles.swatch, on && styles.swatchOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              aria-checked={on}
              accessibilityLabel={'분류 색 ' + categoryColorName(color)}
              testID={testIDPrefix + '-' + color.replace('#', '').toLowerCase()}
            >
              <View style={[styles.dot, { backgroundColor: color }]}>
                {on ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 9,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 6,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.textSub,
  },
  hint: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
  },
  // 고른 색은 바깥 링으로 표시 — 흰 배경 위에서도 어느 색을 골랐는지 한눈에 보입니다.
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchOn: {
    borderColor: colors.textSub,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
