import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';

/**
 * components/ExtractedTitleNote.js
 * ─────────────────────────────────────────────────────────────
 * 추출 결과 위에 붙는 '읽어온 제목' 안내 (v1.2).
 *
 *   · title  … 유튜브 oEmbed / og:title 에서 실제로 읽어 온 제목
 *              → `읽어온 제목: "..."` 로 매칭 근거를 바로 보여 줍니다.
 *   · notice … 인스타처럼 외부에서 제목을 못 읽는 링크의 안내 문구
 *              → [가게명으로 찾기] 원탭 버튼을 함께 띄웁니다.
 */
export default function ExtractedTitleNote({
  title,
  notice,
  onSearchByName,
  searchLabel = '가게명으로 찾기',
}) {
  const hasTitle = Boolean(title && String(title).trim());
  const hasNotice = Boolean(notice && String(notice).trim());
  if (!hasTitle && !hasNotice) return null;

  return (
    <View style={styles.wrap}>
      {hasTitle ? (
        <View style={styles.row}>
          <Ionicons name="document-text-outline" size={13} color={colors.textSub} />
          <Text style={styles.title} numberOfLines={2}>
            {'읽어온 제목: "' + String(title).trim() + '"'}
          </Text>
        </View>
      ) : null}

      {hasNotice ? (
        <View style={styles.row}>
          <Ionicons name="lock-closed-outline" size={13} color={colors.coralDark} />
          <Text style={styles.notice} numberOfLines={2}>
            {notice}
          </Text>
        </View>
      ) : null}

      {hasNotice && onSearchByName ? (
        <Pressable
          style={styles.btn}
          onPress={onSearchByName}
          accessibilityRole="button"
          accessibilityLabel={searchLabel}
        >
          <Ionicons name="search" size={13} color={colors.white} />
          <Text style={styles.btnText}>{searchLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginBottom: 10,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
  },
  title: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSub,
    lineHeight: 16,
  },
  notice: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: colors.coralDark,
    lineHeight: 16,
  },
  btn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.coral,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    marginTop: 1,
  },
  btnText: {
    color: colors.white,
    fontSize: 11.5,
    fontWeight: '800',
  },
});
