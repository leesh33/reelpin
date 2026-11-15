import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, typography } from '../theme';

/**
 * 지오펜스 알림 배너
 * · 기본(시뮬레이션): "반경 300m 앞, 저장한 맛집이 있어요" + 가게명·대표메뉴
 * · v1.5 실제 위치: title/sub 를 넘겨 "반경 500m 앞 …" + "가게명 · 320m" 로 표시
 * 탭하면 해당 핀으로 포커스(상세 시트) — 상위 화면이 onPress 로 처리합니다.
 *
 * v2.1.2 — 흰 지도·밝은 타일 위에서 묻히지 않도록 **다크 차콜 카드 + 흰 글씨**로 바꿨습니다.
 *   · 반경 안(진입, `지금`): 코랄 아이콘 + 진한 코랄 테두리 + 코랄 배지로 한 번 더 강조
 *   · 반경 밖(가장 가까운 곳, tone='muted'): 차콜 카드 + 회색 배지
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
        <Ionicons name="chevron-forward" size={18} color="#8B96AB" />
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
  const muted = tone === 'muted';

  return (
    <Pressable
      style={[styles.wrap, muted ? styles.wrapMuted : styles.wrapLive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={mainTitle + (mainSub ? ', ' + mainSub : '')}
    >
      <View style={[styles.iconWrap, muted ? styles.iconMuted : styles.iconLive]}>
        <Ionicons name={muted ? 'navigate-outline' : 'location'} size={22} color={colors.white} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {mainTitle}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {mainSub}
        </Text>
      </View>
      <View style={[styles.nowChip, muted ? styles.nowChipMuted : styles.nowChipLive]}>
        <Text style={[styles.nowText, muted ? styles.nowTextMuted : styles.nowTextLive]}>
          {badgeText}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    // 흰 지도·밝은 타일 위에서도 카드 경계가 보이도록 다크 차콜 + 밝은 테두리
    backgroundColor: colors.charcoal,
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.34,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  // 반경 500m 안(지금 근처) — 코랄 테두리로 한 번 더 눈에 띄게
  wrapLive: {
    borderColor: 'rgba(255,90,54,0.72)',
  },
  wrapMuted: {
    borderColor: 'rgba(255,255,255,0.18)',
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLive: {
    backgroundColor: colors.coral,
  },
  iconEmpty: {
    backgroundColor: '#3E4A63',
  },
  iconMuted: {
    backgroundColor: '#2C3546',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    ...typography.h3,
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  sub: {
    ...typography.sub,
    fontSize: 12,
    marginTop: 2,
    color: '#C7D0E0',
  },
  nowChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  nowChipLive: {
    backgroundColor: colors.coral,
  },
  nowChipMuted: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  nowText: {
    ...typography.tiny,
    fontSize: 10,
    fontWeight: '800',
  },
  nowTextLive: {
    color: colors.white,
  },
  nowTextMuted: {
    color: '#C7D0E0',
  },
});
