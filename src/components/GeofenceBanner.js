import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, typography } from '../theme';

/**
 * 지오펜스 알림 배너
 * · v1.5 실제 위치: title/sub 를 넘겨 "반경 500m 앞 …" + "가게명 · 320m" 로 표시
 * · 위치를 아직 모를 때(needsLocation): 데모 문구 대신 **솔직한 안내 + [내 위치] 버튼**
 * 탭하면 해당 핀으로 포커스(상세 시트) — 상위 화면이 onPress 로 처리합니다.
 *
 * v2.1.2 — 흰 지도·밝은 타일 위에서 묻히지 않도록 **다크 차콜 카드 + 흰 글씨**로 바꿨습니다.
 *   · 반경 안(진입, `지금`): 코랄 아이콘 + 진한 코랄 테두리 + 코랄 배지로 한 번 더 강조
 *   · 반경 밖(가장 가까운 곳, tone='muted'): 차콜 카드 + 회색 배지
 *
 * v2.1.3 — '반경 300m 앞, 저장한 맛집이 있어요 / 뚝섬 카페 · 크루아상' 처럼 **없는 사실을
 *   지어내지 않습니다.** 상위 화면이 넘긴 title 이 없으면 아무것도 그리지 않고(return null),
 *   위치를 모를 때는 needsLocation 안내 배너만 보여 줍니다.
 */

/** 위치를 아직 모를 때의 기본 안내 문구 (상위 화면이 hintTitle 로 바꿀 수 있음) */
export const NEEDS_LOCATION_TITLE = '내 위치를 켜면 가까운 맛집과 500m 알림이 보여요';
export const NEEDS_LOCATION_SUB = '지금 있는 곳 기준으로 알려드려요';
export const NEEDS_LOCATION_ACTION = '내 위치';

export default function GeofenceBanner({
  pin,
  radiusMeters,
  onPress,
  onLocate,
  locating,
  empty,
  needsLocation,
  hintTitle,
  hintSub,
  title,
  sub,
  badge,
  tone,
}) {
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

  // 위치를 아직 모를 때 — 가짜 거리·가게명 대신, 무엇을 켜면 무엇이 보이는지 솔직하게.
  if (needsLocation) {
    return (
      <View style={styles.wrap} accessibilityLabel={hintTitle || NEEDS_LOCATION_TITLE}>
        <Pressable
          style={styles.hintBody}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="지금 있는 곳 기준으로 보기"
        >
          <View style={[styles.iconWrap, styles.iconNeeds]}>
            <Ionicons name="locate-outline" size={22} color={colors.coral} />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.title} numberOfLines={2}>
              {hintTitle || NEEDS_LOCATION_TITLE}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {hintSub || NEEDS_LOCATION_SUB}
            </Text>
          </View>
        </Pressable>
        <Pressable
          style={styles.locateBtn}
          onPress={onLocate}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="내 위치 켜기"
        >
          {locating ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.locateText}>{NEEDS_LOCATION_ACTION}</Text>
          )}
        </Pressable>
      </View>
    );
  }

  // 실시간 배너는 상위 화면이 넘긴 사실만 그립니다. 넘긴 값이 없으면 아무것도 그리지 않습니다.
  const mainTitle = title || '';
  const mainSub = sub || '';
  if (!mainTitle && !mainSub) return null;

  const mainBadge = badge || '지금';
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
        {!!mainTitle && (
          <Text style={styles.title} numberOfLines={1}>
            {mainTitle}
          </Text>
        )}
        {!!mainSub && (
          <Text style={styles.sub} numberOfLines={1}>
            {mainSub}
          </Text>
        )}
      </View>
      <View style={[styles.nowChip, muted ? styles.nowChipMuted : styles.nowChipLive]}>
        <Text style={[styles.nowText, muted ? styles.nowTextMuted : styles.nowTextLive]}>
          {mainBadge}
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
  hintBody: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  // 위치를 아직 모를 때 — 채우지 않고 테두리만(아직 '켜짐'이 아니라는 표시)
  iconNeeds: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  iconEmpty: {
    backgroundColor: '#3E4A63',
  },
  iconMuted: {
    backgroundColor: '#2C3546',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
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
  locateBtn: {
    height: 34,
    minWidth: 62,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locateText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
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
