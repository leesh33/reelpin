import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { colors } from '../theme';

/**
 * components/ProviderBadge.js
 * ─────────────────────────────────────────────────────────────
 * 후보·핀이 **어느 지도에서 확인된 장소인지** 카드에 작게 표시하는 출처 배지.
 *   카카오(노랑) · 네이버(초록) · 구글(파랑) · 오프라인(회색) · AI(회색)
 * extractor 의 providers 배열(['kakao'] / ['kakao','naver'])을 그대로 받아
 * 두 곳 이상에서 확인된 장소는 배지를 나란히 보여 줍니다.
 */

export const PROVIDER_META = {
  kakao: { label: '카카오', bg: colors.kakao, fg: colors.kakaoText },
  naver: { label: '네이버', bg: colors.naver, fg: colors.naverText },
  google: { label: '구글', bg: colors.google, fg: colors.googleText },
  offline: { label: '오프라인', bg: colors.mutedBadge, fg: colors.mutedBadgeText },
  llm: { label: 'AI', bg: colors.mutedBadge, fg: colors.mutedBadgeText },
  search: { label: '직접 검색', bg: colors.mutedBadge, fg: colors.mutedBadgeText },
};

/** 배지 표시 순서 (카카오 → 네이버 → 구글 → 그 외) */
const ORDER = ['kakao', 'naver', 'google'];

/** 후보/핀 객체에서 출처 id 배열을 뽑습니다. (providers 우선, 없으면 provider 하나) */
export function providerIds(item) {
  if (!item) return [];
  const list = Array.isArray(item.providers) && item.providers.length ? item.providers : item.provider ? [item.provider] : [];
  const known = list.filter((id) => PROVIDER_META[id]);
  const sorted = ORDER.filter((id) => known.includes(id)).concat(known.filter((id) => !ORDER.includes(id)));
  return Array.from(new Set(sorted));
}

export function providerLabel(id) {
  return PROVIDER_META[id] ? PROVIDER_META[id].label : '';
}

export default function ProviderBadges({ item, providers, size = 'md', style }) {
  const ids = providers && providers.length ? providerIds({ providers }) : providerIds(item);
  if (!ids.length) return null;
  const small = size === 'sm';
  return (
    <View style={[styles.row, style]}>
      {ids.map((id) => {
        const meta = PROVIDER_META[id];
        return (
          <View
            key={id}
            style={[styles.badge, small && styles.badgeSm, { backgroundColor: meta.bg }]}
            accessibilityLabel={'출처 ' + meta.label}
          >
            <Text style={[styles.text, small && styles.textSm, { color: meta.fg }]}>{meta.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeSm: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  text: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  textSm: {
    fontSize: 9,
    fontWeight: '800',
  },
});
