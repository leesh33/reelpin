import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cardShadow, colors, radius, typography } from '../theme';

/**
 * 지오펜스 알림 시뮬레이션 배너
 * 반경 안에 들어왔을 때 뜨는 푸시의 앱 내 미리보기입니다. 탭하면 해당 핀으로 포커스.
 */
export default function GeofenceBanner({ pin, radiusMeters, onPress, empty }) {
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

  return (
    <Pressable style={styles.wrap} onPress={onPress} accessibilityRole="button" accessibilityLabel="근처 저장 장소 알림">
      <View style={styles.iconWrap}>
        <Ionicons name="location" size={22} color={colors.white} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>
          반경 {radiusLabel} 앞, 저장한 맛집이 있어요
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {pin ? pin.name + (pin.menuTags && pin.menuTags[0] ? ' · ' + pin.menuTags[0] : '') : ''}
        </Text>
      </View>
      <View style={styles.nowChip}>
        <Text style={styles.nowText}>지금</Text>
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
  nowText: {
    ...typography.tiny,
    color: colors.textSub,
    fontSize: 10,
  },
});
