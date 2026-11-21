/**
 * InAppPlaceModal.js — v1.8 (iOS·Android)
 * ─────────────────────────────────────────────────────────────
 * [매장 정보 보기] 를 누르면 앱 안 모달이 열립니다.
 * 아이폰·안드로이드에는 iframe 이 없어서 네이버 플레이스 화면 자체를 그릴 수는 없습니다.
 * 대신 같은 헤더(다크 차콜 바탕 · 가게 이름 · [새 창으로 열기] · [닫기]) 를 두고, 본문에서
 * 네이버 지도 앱 / 네이버 플레이스 웹으로 한 번에 넘어갈 수 있게 했습니다.
 * 헤더 색은 웹 모달과 같은 `colors.charcoal`(#1C1C1E) — 흰 본문과 확실히 갈립니다.
 * (웹 버전 `InAppPlaceModal.web.js` 는 m.place.naver.com 을 iframe 으로 직접 띄웁니다.)
 */
import React, { useCallback } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, sheetShadow, typography } from '../theme';
import { naverMapWebUrl, naverPlaceSearchUrl, openExternalUrl, openMap, openSource } from '../utils/links';

export const NATIVE_PREVIEW_NOTICE = '매장 정보 화면은 웹에서 앱 안으로 바로 열려요.';
export const NATIVE_PREVIEW_HINT = '여기서는 네이버 지도로 한 번에 넘어갈 수 있어요.';

export default function InAppPlaceModal({ pin, onClose, onToast }) {
  const openNaverMap = useCallback(async () => {
    const result = await openMap(pin, 'naver');
    if (onToast) {
      onToast(result.opened === 'failed' ? '지도를 열 수 없어요. 잠시 후 다시 시도해 주세요' : '네이버 지도로 열었어요');
    }
  }, [pin, onToast]);

  const openPlaceWeb = useCallback(async () => {
    const result = await openExternalUrl(naverPlaceSearchUrl(pin));
    if (onToast) {
      onToast(result.opened ? '네이버 플레이스로 열었어요' : '매장 정보를 열 수 없어요. 잠시 후 다시 시도해 주세요');
    }
  }, [pin, onToast]);

  const openSavedPlace = useCallback(async () => {
    const result = await openExternalUrl(pin && pin.placeUrl);
    if (onToast) {
      onToast(
        result.opened
          ? (pin && pin.placeUrlLabel ? pin.placeUrlLabel + '로 열었어요' : '매장 정보를 열었어요')
          : '매장 정보를 열 수 없어요. 잠시 후 다시 시도해 주세요'
      );
    }
  }, [pin, onToast]);

  if (!pin) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} accessibilityLabel="매장 정보 닫기" />
        <View style={styles.sheet}>
          {/* 다크 차콜 헤더 — 네이버 플레이스(흰 화면)와 헷갈리지 않게 위아래를 확실히 나눕니다. */}
          <View style={styles.headerBlock}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <View style={styles.titleWrap}>
                <Text style={styles.title} numberOfLines={1}>
                  {pin.name}
                </Text>
              </View>
              <Pressable
                style={styles.externalBtn}
                onPress={openPlaceWeb}
                accessibilityRole="link"
                accessibilityLabel="새 창으로 열기"
              >
                <Ionicons name="open-outline" size={13} color={colors.white} />
                <Text style={styles.externalText}>새 창으로 열기</Text>
              </Pressable>
              <Pressable
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="닫기"
              >
                <Ionicons name="close" size={17} color={colors.white} />
              </Pressable>
            </View>
          </View>

          <View style={styles.body}>
            <View style={styles.noticeCard}>
              <Ionicons name="phone-portrait-outline" size={16} color={colors.brandDark} />
              <View style={styles.noticeTextWrap}>
                <Text style={styles.noticeTitle}>{NATIVE_PREVIEW_NOTICE}</Text>
                <Text style={styles.noticeHint}>{NATIVE_PREVIEW_HINT}</Text>
              </View>
            </View>

            <Pressable
              style={[styles.primaryBtn, { backgroundColor: colors.naver }]}
              onPress={openNaverMap}
              accessibilityRole="button"
              accessibilityLabel="네이버 지도로 열기"
            >
              <Ionicons name="map-outline" size={16} color={colors.white} />
              <Text style={styles.primaryBtnText}>네이버 지도로 열기</Text>
            </Pressable>

            <Pressable style={styles.secondaryBtn} onPress={openPlaceWeb} accessibilityRole="link">
              <Ionicons name="storefront-outline" size={15} color={colors.brandDark} />
              <Text style={styles.secondaryBtnText}>네이버 플레이스 웹으로 열기</Text>
              <Text style={styles.secondaryMeta}>m.place.naver.com</Text>
            </Pressable>

            {!!pin.placeUrl && (
              <Pressable style={styles.secondaryBtn} onPress={openSavedPlace} accessibilityRole="link">
                <Ionicons name="bookmark-outline" size={15} color={colors.textSub} />
                <Text style={[styles.secondaryBtnText, { color: colors.textSub }]}>저장된 매장 페이지 열기</Text>
                {!!pin.placeUrlLabel && <Text style={styles.secondaryMeta}>{pin.placeUrlLabel}</Text>}
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
  },
  backdropFill: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingBottom: 26,
    ...sheetShadow,
  },
  headerBlock: {
    backgroundColor: colors.charcoal,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleWrap: { flex: 1, minWidth: 0 },
  title: {
    ...typography.h2,
    fontSize: 17,
    color: colors.white,
  },
  externalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.charcoalPill,
  },
  externalText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.charcoalPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    marginTop: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 8,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeTextWrap: { flex: 1 },
  noticeTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  noticeHint: {
    ...typography.tiny,
    fontSize: 10.5,
    marginTop: 2,
    lineHeight: 15,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 46,
    borderRadius: radius.md,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
  },
  secondaryBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.brandDark,
  },
  secondaryMeta: {
    marginLeft: 'auto',
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
});
