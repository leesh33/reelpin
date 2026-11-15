import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cardShadow, colors, radius, typography } from '../theme';

/**
 * 지오펜스 알림 배너
 * · 기본(시뮬레이션): "반경 300m 앞, 저장한 맛집이 있어요" + 가게명·대표메뉴
 * · v1.5 실제 위치: title/sub 를 넘겨 "반경 500m 앞 …" + "가게명 · 320m" 로 표시
 * 탭하면 해당 핀으로 포커스(상세 시트) — 상위 화면이 onPress 로 처리합니다.
 */
export default function GeofenceBanner({
  pin,
  radiusMeters,
  onPress,
  empty,
  title,
  sub,
  badge,
  tone,
}) {
  const radiusLabel = radiusMeters >= 1000 ? '1km' : radiusMeters + 'm';

  if (empty) {
    return (
      <Pressable style={styles.wrap} onPress={onPress} accessibilityRole="button">
        <View style={[styles.iconWrap, styles.iconEmpty]}>
          <Ionicons name="add" size={22} color={colors.white} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>아직 저장한 핀이 없어요</Text>
          <Text style={styles.sub} numberOfLines={1}>
            릴스 링크를 붙여넣어 첫 핀을 꽂아 보세요
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
    );
  }

  const mainTitle = title || '반경 ' + radiusLabel + ' 앞, 저장한 맛집이 있어요';
  const mainSub = sub !== undefined
    ? sub
    : pin
    ? pin.name + (pin.menuTags && pin.menuTags[0] ? ' · ' + pin.menuTags[0] : '')
    : '';
  const badgeText = badge || '지금';

  return (
    <Pressable
      style={styles.wrap}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={mainTitle + (mainSub ? ', ' + mainSub : '')}
    >
      <View style={[styles.iconWrap, tone === 'muted' && styles.iconMuted]}>
        <Ionicons name={tone === 'muted' ? 'navigate-outline' : 'location'} size={22} color={colors.white} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {mainTitle}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {mainSub}
        </Text>
      </View>
      <View style={[styles.nowChip, tone === 'muted' && styles.nowChipMuted]}>
        <Text style={[styles.nowText, tone === 'muted' && styles.nowTextMuted]}>{badgeText}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    ...cardShadow,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmpty: {
    backgroundColor: colors.text,
  },
  iconMuted: {
    backgroundColor: '#3E4A63',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    ...typography.h3,
    fontSize: 14,
  },
  sub: {
    ...typography.sub,
    fontSize: 12,
    marginTop: 2,
  },
  nowChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.lineSoft,
  },
  nowChipMuted: {
    backgroundColor: '#E7E9EF',
  },
  nowText: {
    ...typography.tiny,
    color: colors.textSub,
    fontSize: 10,
  },
  nowTextMuted: {
    color: colors.textMuted,
  },
});
