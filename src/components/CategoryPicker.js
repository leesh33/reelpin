import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import CategoryColorPicker from './CategoryColorPicker';
import {
  CATEGORY_MAX_LENGTH,
  DEFAULT_CATEGORIES,
  allCategories,
  getCategoryColor,
  normalizeHexColor,
  sameCategory,
  suggestCategoryColor,
} from '../utils/categories';

/**
 * v2.2 — 분류 직접 고르기 + 새 분류 만들기 (저장 화면 · 핀 상세가 함께 씁니다)
 *
 *   · 기본 3개(맛집·카페·가볼곳)와 내가 만든 분류가 한 줄로 이어집니다 (가로 스크롤)
 *   · 끝의 [+ 분류 추가] 를 누르면 그 자리에서 이름을 적어 바로 만들고, 만든 분류가 곧바로 선택됩니다
 *   · 이름 검사(빈 이름 · 10자 제한 · 중복 · 기본 분류와 같은 이름)는 utils/categories 가 맡고,
 *     이 컴포넌트는 돌려받은 안내 문구를 칩 아래에 그대로 보여 줍니다
 *   · v2.4 — 칩마다 그 분류의 **고유 색 점**을 붙이고, 선택되면 **그 분류 색 배경 + 흰 글씨**
 *     (지도 핀·상단 필터 칩과 같은 색 — getCategoryColor 하나를 씁니다)
 *
 * v2.36.2 — 상훈 님 요청: "분류 추가할 때 색상도 지정하게"
 *   → [+ 분류 추가] 를 열면 이름 입력 아래에 **색 팔레트 10색**(`CategoryColorPicker`)이 함께 나오고,
 *     처음 열 때는 예전 자동 배정 색이 미리 골라져 있습니다. 고른 색은 `onAddCategory(이름, 색)` 로
 *     그대로 넘겨, 저장·지도 칩·핀 마커·배지가 모두 같은 색을 씁니다.
 */
export default function CategoryPicker({
  value,
  onChange,
  categories = DEFAULT_CATEGORIES,
  onAddCategory,
  label = '분류',
  hint = '',
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftColor, setDraftColor] = useState('');
  const [error, setError] = useState('');
  const options = allCategories(categories);

  /** v2.36.2 — 열 때마다 예전 자동 배정 색을 미리 골라 둡니다(그냥 추가해도 예전과 똑같음) */
  const openAdd = () => {
    if (open) {
      close();
      return;
    }
    setDraftColor(suggestCategoryColor(categories));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setDraft('');
    setDraftColor('');
    setError('');
  };

  const submit = () => {
    if (typeof onAddCategory !== 'function') {
      close();
      return;
    }
    // 고른 색(없으면 자동 배정색)을 이름과 함께 넘깁니다
    const picked = normalizeHexColor(draftColor) || suggestCategoryColor(categories);
    const result = onAddCategory(draft, picked);
    if (!result || !result.ok) {
      setError((result && result.message) || '분류를 추가하지 못했어요');
      return;
    }
    close();
    if (typeof onChange === 'function') onChange(result.name);
  };

  return (
    <View style={compact ? styles.wrapCompact : styles.wrap}>
      {!!label && (
        <View style={styles.head}>
          <Text style={styles.label}>{label}</Text>
          {!!hint && (
            <Text style={styles.hint} numberOfLines={1}>
              {hint}
            </Text>
          )}
        </View>
      )}

      {/* 분류가 많아도 잘리지 않게 두 줄로 접어 보여 줍니다. [+ 분류 추가] 는 맨 끝에 이어집니다. */}
      <View style={styles.row}>
        {options.map((name) => {
          const on = sameCategory(value, name);
          const chipColor = getCategoryColor(name, categories);
          return (
            <Pressable
              key={name}
              style={[
                styles.chip,
                on && { backgroundColor: chipColor, borderColor: chipColor },
              ]}
              onPress={() => typeof onChange === 'function' && onChange(name)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              accessibilityLabel={'분류 ' + name}
              testID={'category-chip-' + name}
            >
              {on ? (
                <Ionicons name="checkmark" size={12} color={colors.white} />
              ) : (
                <View style={[styles.dot, { backgroundColor: chipColor }]} />
              )}
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{name}</Text>
            </Pressable>
          );
        })}

        <Pressable
          style={[styles.addChip, open && styles.addChipOn]}
          onPress={openAdd}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel="분류 추가"
        >
          <Ionicons name="add" size={13} color={colors.brandDark} />
          <Text style={styles.addChipText}>분류 추가</Text>
        </Pressable>
      </View>

      {open && (
        <View style={styles.addWrap}>
          <View style={styles.addBox}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={(t) => {
                setDraft(t);
                setError('');
              }}
              placeholder="새 분류 이름 (예: 아이랑)"
              placeholderTextColor={colors.textMuted}
              maxLength={CATEGORY_MAX_LENGTH}
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={submit}
              accessibilityLabel="새 분류 이름"
            />
            <Pressable
              style={styles.addBtn}
              onPress={submit}
              accessibilityRole="button"
              accessibilityLabel="새 분류 저장"
            >
              <Text style={styles.addBtnText}>추가</Text>
            </Pressable>
            <Pressable onPress={close} hitSlop={8} accessibilityLabel="분류 추가 취소">
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
          {/* v2.36.2 — 이름과 함께 고르는 분류 색 (10색 · 처음엔 자동 배정색이 골라져 있음) */}
          <CategoryColorPicker
            value={draftColor}
            onChange={setDraftColor}
            hint="지도 핀과 칩에 이 색이 쓰여요"
            testIDPrefix="category-add-color"
          />
        </View>
      )}

      {!!error && (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={12} color={colors.brandDark} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
  },
  wrapCompact: {
    marginTop: 0,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 7,
  },
  label: {
    fontSize: 12,
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
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.textSub,
  },
  chipTextOn: {
    color: colors.white,
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.brandSoft2,
    backgroundColor: colors.brandSoft,
  },
  addChipOn: {
    borderStyle: 'solid',
    borderColor: colors.brand,
  },
  addChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.brandDark,
  },
  addWrap: {
    marginTop: 9,
  },
  addBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.brandSoft2,
    borderRadius: radius.md,
    paddingLeft: 11,
    paddingRight: 8,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    paddingVertical: 0,
  },
  addBtn: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.white,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 7,
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: colors.brandDark,
  },
});
