import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { FREE_PIN_LIMIT } from '../data/seedPins';
import { buildShareUrl, canNativeShare, nativeShare, shareMessage } from '../utils/shareMap';
import { cardShadow, colors, radius, typography } from '../theme';

const RADIUS_OPTIONS = [
  { value: 300, label: '300m', hint: '골목 단위' },
  { value: 500, label: '500m', hint: '동네 한 바퀴' },
  { value: 1000, label: '1km', hint: '여행지에서' },
];

const PRO_FEATURES = [
  '핀 저장 무제한 (무료는 월 10건)',
  '전 지역 · 반경 300m / 500m / 1km 알림',
  '친구와 함께 쓰는 공동 편집 지도',
];

export default function ProfileScreen({
  name,
  handle,
  pins,
  radiusMeters,
  onChangeRadius,
  isPro,
  onStartPro,
  onGoPaste,
  onToast,
}) {
  const [copied, setCopied] = useState(false);
  const count = pins.length;
  const limit = isPro ? 0 : FREE_PIN_LIMIT;
  const ratio = isPro ? 1 : Math.min(1, count / FREE_PIN_LIMIT);

  const shareMap = async () => {
    if (!pins.length) {
      onToast('공유할 핀이 아직 없어요');
      return;
    }
    // v2.0 — 핀을 압축·Base64URL 로 담은 `?share=` 링크 (서버 DB 없이 동작)
    const url = buildShareUrl(pins);
    const text = shareMessage(pins);
    if (canNativeShare()) {
      const result = await nativeShare(url, { title: text, text });
      if (result.shared) {
        onToast('공유 시트를 열었어요');
        return;
      }
      if (result.cancelled) return;
    }
    try {
      await Clipboard.setStringAsync(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      onToast('내 지도 공유 링크를 복사했어요 · ' + text);
    } catch (e) {
      onToast('복사에 실패했어요. 다시 시도해 주세요');
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>내 정보</Text>
        <Text style={styles.headerCount}>{count}개 저장됨</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 프로필 카드 */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{name ? name.slice(0, 1) : '나'}</Text>
          </View>
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{name || '사용자'}</Text>
            <Text style={styles.profileHandle}>@{handle} · {isPro ? '프로 플랜' : '무료 플랜'}</Text>
          </View>
          <View style={[styles.planChip, isPro && styles.planChipPro]}>
            <Ionicons
              name={isPro ? 'sparkles' : 'leaf-outline'}
              size={12}
              color={isPro ? colors.white : colors.textSub}
            />
            <Text style={[styles.planChipText, isPro && styles.planChipTextPro]}>
              {isPro ? 'PRO' : 'FREE'}
            </Text>
          </View>
        </View>

        {/* 저장한 핀 카운터 */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>저장한 핀</Text>
            <Pressable onPress={onGoPaste} hitSlop={8}>
              <Text style={styles.linkText}>+ 핀 추가</Text>
            </Pressable>
          </View>
          <View style={styles.counterRow}>
            <Text style={styles.counterValue}>{count}</Text>
            <Text style={styles.counterLimit}>{isPro ? '/ 무제한' : `/ ${FREE_PIN_LIMIT} 무료`}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: Math.round(ratio * 100) + '%' }]} />
          </View>
          <Text style={styles.cardHint}>
            {isPro
              ? '프로 플랜이라 저장 개수 제한이 없어요.'
              : count >= FREE_PIN_LIMIT
              ? '무료 한도를 다 채웠어요. 프로로 전환하면 계속 저장할 수 있어요.'
              : `무료로 ${FREE_PIN_LIMIT - count}건 더 저장할 수 있어요.`}
          </Text>
        </View>

        {/* 지도 공유 */}
        <Pressable style={styles.shareCard} onPress={shareMap} accessibilityRole="button">
          <View style={styles.shareIcon}>
            <Ionicons name={copied ? 'checkmark' : 'share-social'} size={18} color={colors.coral} />
          </View>
          <View style={styles.shareText}>
            <Text style={styles.shareTitle}>{copied ? '링크를 복사했어요!' : '내 지도 공유하기'}</Text>
            <Text style={styles.shareSub}>
              {count}곳을 담은 링크 하나로 건네줘요 · 받는 사람은 바로 지도로 열립니다
            </Text>
          </View>
          <Ionicons name="copy-outline" size={17} color={colors.textMuted} />
        </Pressable>

        {/* 지오펜스 반경 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>지오펜스 알림 반경</Text>
          <Text style={styles.cardHint}>
            저장한 곳 반경 {radiusMeters >= 1000 ? '1km' : radiusMeters + 'm'} 안에 들어가면 알려드려요.
          </Text>
          <View style={styles.segment}>
            {RADIUS_OPTIONS.map((opt) => {
              const on = radiusMeters === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.segmentItem, on && styles.segmentItemOn]}
                  onPress={() => onChangeRadius(opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.segmentLabel, on && styles.segmentLabelOn]}>{opt.label}</Text>
                  <Text style={[styles.segmentHint, on && styles.segmentHintOn]}>{opt.hint}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.noticeRow}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.noticeText}>
              iOS는 앱당 감시 가능한 구역이 20개라, 가까운 핀 20개만 등록하고 회전합니다.
            </Text>
          </View>
        </View>

        {/* 프로 안내 */}
        <View style={styles.proCard}>
          <View style={styles.proHead}>
            <View style={styles.proBadge}>
              <Ionicons name="sparkles" size={12} color={colors.navy} />
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
            <Text style={styles.proTitle}>릴스핀 프로</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.price}>월 2,900원</Text>
            <Text style={styles.priceSub}>연 24,900원 (28% 할인)</Text>
          </View>
          {PRO_FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Ionicons name="checkmark" size={15} color={colors.coral} />
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
          <Pressable
            style={[styles.proBtn, isPro && styles.proBtnOn]}
            onPress={onStartPro}
            accessibilityRole="button"
          >
            <Text style={styles.proBtnText}>{isPro ? '프로 플랜 사용 중' : '프로 시작하기'}</Text>
          </Pressable>
        </View>

        {/* 앱 정보 */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>앱 버전</Text>
            <Text style={styles.infoValue}>릴스핀 v2.0.0</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>번들 ID</Text>
            <Text style={styles.infoValue}>com.odol.reelpin</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>데이터 저장</Text>
            <Text style={styles.infoValue}>기기 내부 (AsyncStorage)</Text>
          </View>
        </View>

        <Text style={styles.footer}>기획 이상훈 · 개발 오돌</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
  },
  title: { ...typography.h1, fontSize: 24 },
  headerBadge: {
    backgroundColor: colors.coralSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  headerCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  headerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.coralDark,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 12,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    ...cardShadow,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
  },
  profileText: { flex: 1 },
  profileName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  profileHandle: {
    ...typography.sub,
    fontSize: 12,
    marginTop: 3,
  },
  planChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.lineSoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  planChipPro: {
    backgroundColor: colors.coral,
  },
  planChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSub,
  },
  planChipTextPro: {
    color: colors.white,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
    ...cardShadow,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: { ...typography.h3 },
  linkText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.coral,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  counterValue: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
  },
  counterLimit: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.lineSoft,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.coral,
  },
  cardHint: {
    fontSize: 12,
    color: colors.textSub,
    lineHeight: 17,
  },
  segment: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentItem: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  segmentItemOn: {
    borderColor: colors.coral,
    backgroundColor: colors.coralSoft,
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textSub,
  },
  segmentLabelOn: {
    color: colors.coralDark,
  },
  segmentHint: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  segmentHintOn: {
    color: colors.coralDark,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  noticeText: {
    flex: 1,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
  },
  proCard: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: 18,
    gap: 9,
    shadowColor: '#0F172A',
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  proHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.coral,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  proBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.white,
  },
  proTitle: {
    ...typography.h3,
    color: colors.white,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  price: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.5,
  },
  priceSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8FA0BC',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  featureText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D5DCEA',
    flex: 1,
  },
  proBtn: {
    marginTop: 4,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proBtnOn: {
    backgroundColor: '#2A3B5A',
  },
  proBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  shareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 14,
    ...cardShadow,
  },
  shareIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareText: { flex: 1 },
  shareTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  shareSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 6,
    ...cardShadow,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  infoKey: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSub,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  infoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
  },
});
