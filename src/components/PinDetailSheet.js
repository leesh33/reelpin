import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, sheetShadow, typography } from '../theme';
import { openMap, openPhone, openSource, telUrlOf } from '../utils/links';
import { formatDistance } from '../services/location';
import InAppPlaceModal from './InAppPlaceModal';
import ProviderBadges from './ProviderBadge';

const PLATFORM_LABEL = {
  instagram: '인스타 릴스',
  youtube: '유튜브 쇼츠',
  tiktok: '틱톡',
  naver: '네이버 블로그',
  search: '가게명으로 찾기',
  unknown: '원본 링크',
};

export default function PinDetailSheet({ pin, radiusMeters, distanceMeters, onClose, onDelete, onToast, readOnly = false }) {
  // v1.7 — [매장 정보 보기] 는 브라우저 밖으로 나가지 않고 앱 안 모달을 엽니다.
  const [placeModalOpen, setPlaceModalOpen] = useState(false);

  if (!pin) return null;
  const radiusLabel = radiusMeters >= 1000 ? '1km' : radiusMeters + 'm';
  const hasDistance = distanceMeters !== null && distanceMeters !== undefined && Number.isFinite(distanceMeters) && distanceMeters >= 0;
  const distanceLabel = hasDistance ? formatDistance(distanceMeters) : '';
  const platform = PLATFORM_LABEL[pin.platform] || PLATFORM_LABEL.unknown;
  const phone = String(pin.phone || '');
  const address = String(pin.address || '');
  const hasAddress = Boolean(address) && address !== '주소 미확인';

  /** v2.0 — 전화번호 원탭 연결 (기기 기본 전화앱의 tel: 링크) */
  const handlePhone = async () => {
    const result = await openPhone(phone);
    if (onToast) {
      if (result.opened) onToast('전화 앱으로 연결했어요 · ' + phone);
      else onToast('이 기기에서는 전화를 걸 수 없어요 · ' + phone);
    }
  };

  /** v2.0 — 주소 원탭 복사 (지도 앱에 붙여넣기) */
  const handleCopyAddress = async () => {
    if (!hasAddress) return;
    try {
      await Clipboard.setStringAsync(address);
      if (onToast) onToast('주소를 복사했어요');
    } catch (e) {
      if (onToast) onToast('주소 복사에 실패했어요');
    }
  };

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

  const handlePlace = () => {
    setPlaceModalOpen(true);
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
            {hasDistance && !!distanceLabel && (
              <View style={styles.chipLive}>
                <Ionicons name="locate" size={11} color={colors.coralDark} />
                <Text style={styles.chipLiveText}>{'내 위치에서 ' + distanceLabel}</Text>
              </View>
            )}
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

      {/* v2.0 — 전화번호(tel: 원탭) · 주소(원탭 복사) */}
      {!!phone && !!telUrlOf(phone) && (
        <Pressable
          style={styles.infoRow}
          onPress={handlePhone}
          accessibilityRole="link"
          accessibilityLabel={'전화 걸기 ' + phone}
        >
          <Ionicons name="call-outline" size={14} color={colors.coralDark} />
          <Text style={styles.infoValue} numberOfLines={1}>
            {phone}
          </Text>
          <Text style={styles.infoAction}>전화</Text>
        </Pressable>
      )}

      <Pressable
        style={styles.infoRow}
        onPress={handleCopyAddress}
        disabled={!hasAddress}
        accessibilityRole="button"
        accessibilityLabel={hasAddress ? '주소 복사' : '주소 미확인'}
      >
        <Ionicons name="location-outline" size={14} color={colors.textMuted} />
        <Text style={styles.infoValue} numberOfLines={1}>
          {hasAddress ? address : '주소 미확인'}
        </Text>
        {hasAddress ? <Text style={styles.infoAction}>복사</Text> : null}
      </Pressable>

      {/* v1.7 — 저장된 매장 페이지가 없어도 가게 이름+동네로 네이버 플레이스를 앱 안에서 엽니다 */}
      <Pressable
        style={styles.placeBtn}
        onPress={handlePlace}
        accessibilityRole="button"
        accessibilityLabel="매장 정보 보기"
      >
        <Ionicons name="storefront-outline" size={15} color={colors.coralDark} />
        <Text style={styles.placeBtnText}>매장 정보 보기</Text>
        <Text style={styles.placeBtnMeta}>{pin.naverPlaceId ? '네이버 플레이스 상세' : '네이버 플레이스'}</Text>
        <Ionicons name="expand-outline" size={14} color={colors.coralDark} />
      </Pressable>

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

      {!readOnly && (
        <Pressable style={styles.deleteBtn} onPress={() => onDelete(pin.id)} hitSlop={8}>
          <Ionicons name="trash-outline" size={13} color={colors.textMuted} />
          <Text style={styles.deleteText}>핀 삭제</Text>
        </Pressable>
      )}

      {readOnly && (
        <Text style={styles.sharedNote}>공유받은 맛집이에요 · 내 지도에 추가하면 저장할 수 있어요</Text>
      )}

      {placeModalOpen && (
        <InAppPlaceModal
          pin={pin}
          onClose={() => setPlaceModalOpen(false)}
          onToast={onToast}
        />
      )}
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
  chipLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.coralSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipLiveText: {
    color: colors.coralDark,
    fontSize: 11,
    fontWeight: '800',
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  infoValue: {
    ...typography.sub,
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.text,
  },
  infoAction: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.coralDark,
  },
  sharedNote: {
    marginTop: 10,
    alignSelf: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
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
