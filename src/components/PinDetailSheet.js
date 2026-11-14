import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, sheetShadow, typography } from '../theme';
import { openMap, openPlace, openSource } from '../utils/links';
import ProviderBadges from './ProviderBadge';

const PLATFORM_LABEL = {
  instagram: '인스타 릴스',
  youtube: '유튜브 쇼츠',
  tiktok: '틱톡',
  naver: '네이버 블로그',
  search: '가게명으로 찾기',
  unknown: '원본 링크',
};

export default function PinDetailSheet({ pin, radiusMeters, onClose, onDelete, onToast }) {
  if (!pin) return null;
  const radiusLabel = radiusMeters >= 1000 ? '1km' : radiusMeters + 'm';
  const platform = PLATFORM_LABEL[pin.platform] || PLATFORM_LABEL.unknown;

  const handleMap = async (provider) => {
    const result = await openMap(pin, provider);
    if (onToast) {
      if (result.opened === 'web') {
        onToast(provider === 'naver' ? '네이버지도 웹으로 열었어요' : '카카오맵 웹으로 열었어요');
      } else if (result.opened === 'failed') {
        onToast('지도를 열 수 없어요. 잠시 후 다시 시도해 주세요');
      }
    }
  };

  const handlePlace = async () => {
    const result = await openPlace(pin.placeUrl);
    if (onToast) {
      onToast(
        result.opened
          ? (pin.placeUrlLabel ? pin.placeUrlLabel + '로 열었어요' : '매장 정보를 열었어요')
          : '매장 정보를 열 수 없어요. 잠시 후 다시 시도해 주세요'
      );
    }
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />

      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.name} numberOfLines={1}>
            {pin.name}
          </Text>
          <View style={styles.chipRow}>
            <View style={styles.chipCoral}>
              <Text style={styles.chipCoralText}>{pin.category || '맛집'}</Text>
            </View>
            {!!pin.area && (
              <View style={styles.chipGray}>
                <Text style={styles.chipGrayText}>{pin.area}</Text>
              </View>
            )}
            <View style={styles.chipGray}>
              <Ionicons name="navigate" size={11} color={colors.textSub} />
              <Text style={styles.chipGrayText}>{radiusLabel}</Text>
            </View>
          </View>
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityLabel="상세 닫기">
          <Ionicons name="close" size={18} color={colors.textSub} />
        </Pressable>
      </View>

      {/* 어느 지도에서 확인된 장소인지 — 두 곳 이상이면 배지가 나란히 붙습니다 */}
      <ProviderBadges item={pin} size="sm" style={styles.badgeRow} />

      {pin.menuTags && pin.menuTags.length > 0 && (
        <View style={styles.tagRow}>
          {pin.menuTags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>#{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {!!pin.note && (
        <Text style={styles.note} numberOfLines={2}>
          {pin.note}
        </Text>
      )}

      {!!pin.sourceUrl && (
        <Pressable
          style={styles.sourceRow}
          onPress={() => openSource(pin.sourceUrl)}
          accessibilityRole="link"
          accessibilityLabel="원본 릴스 열기"
        >
          <View style={styles.sourceIcon}>
            <Ionicons name="play" size={12} color={colors.coral} />
          </View>
          <View style={styles.sourceTextWrap}>
            <Text style={styles.sourceLabel}>{platform}</Text>
            <Text style={styles.sourceUrl} numberOfLines={1}>
              {pin.sourceUrl}
            </Text>
          </View>
          <Ionicons name="open-outline" size={16} color={colors.textMuted} />
        </Pressable>
      )}

      <View style={styles.addrRow}>
        <Ionicons name="location-outline" size={14} color={colors.textMuted} />
        <Text style={styles.addrText} numberOfLines={1}>
          {pin.address || '주소 미확인'}
        </Text>
      </View>

      {/* 지도 API가 준 매장 페이지가 있을 때만 — 없으면 지도 검색 버튼으로 안내 */}
      {!!pin.placeUrl && (
        <Pressable
          style={styles.placeBtn}
          onPress={handlePlace}
          accessibilityRole="link"
          accessibilityLabel="매장 정보 보기"
        >
          <Ionicons name="storefront-outline" size={15} color={colors.coralDark} />
          <Text style={styles.placeBtnText}>매장 정보 보기</Text>
          {!!pin.placeUrlLabel && <Text style={styles.placeBtnMeta}>{pin.placeUrlLabel}</Text>}
          <Ionicons name="open-outline" size={14} color={colors.coralDark} />
        </Pressable>
      )}

      <View style={styles.btnRow}>
        <Pressable
          style={[styles.mapBtn, { backgroundColor: colors.naver }]}
          onPress={() => handleMap('naver')}
          accessibilityRole="button"
          accessibilityLabel="네이버지도 열기"
        >
          <Text style={[styles.mapBtnText, { color: colors.white }]}>네이버지도 열기</Text>
        </Pressable>
        <Pressable
          style={[styles.mapBtn, { backgroundColor: colors.kakao }]}
          onPress={() => handleMap('kakao')}
          accessibilityRole="button"
          accessibilityLabel="카카오맵 열기"
        >
          <Text style={[styles.mapBtnText, { color: colors.kakaoText }]}>카카오맵 열기</Text>
        </Pressable>
      </View>

      <Pressable style={styles.deleteBtn} onPress={() => onDelete(pin.id)} hitSlop={8}>
        <Ionicons name="trash-outline" size={13} color={colors.textMuted} />
        <Text style={styles.deleteText}>핀 삭제</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    ...sheetShadow,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  titleWrap: { flex: 1 },
  name: {
    ...typography.h2,
    fontSize: 19,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  chipCoral: {
    backgroundColor: colors.coralSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipCoralText: {
    color: colors.coralDark,
    fontSize: 11,
    fontWeight: '800',
  },
  chipGray: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.lineSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipGrayText: {
    color: colors.textSub,
    fontSize: 11,
    fontWeight: '700',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    marginTop: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  tag: {
    backgroundColor: '#F1F1F6',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSub,
  },
  note: {
    ...typography.sub,
    fontSize: 12,
    marginTop: 10,
    lineHeight: 18,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 12,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  sourceIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceTextWrap: { flex: 1 },
  sourceLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.coralDark,
    marginBottom: 1,
  },
  sourceUrl: {
    fontSize: 11,
    color: colors.textSub,
  },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
  },
  addrText: {
    ...typography.sub,
    fontSize: 12,
    flex: 1,
  },
  placeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 12,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.coralSoft2,
    backgroundColor: colors.coralSoft,
    paddingHorizontal: 12,
  },
  placeBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.coralDark,
  },
  placeBtnMeta: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: colors.coralDark,
    opacity: 0.7,
    textAlign: 'right',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  mapBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  deleteBtn: {
    marginTop: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  deleteText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
