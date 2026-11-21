/**
 * src/components/CollectionPreviewSheet.js — v2.31 🗂️ 기획전·공유 컬렉션 미리보기
 * ─────────────────────────────────────────────────────────────
 * 한 컴포넌트를 두 곳이 같이 씁니다.
 *   · 컬렉션 탭 → `운영자 추천 · 기획전` 카드를 누르면 그 기획전의 장소 미리보기
 *   · `?col=<shareId>` 링크로 들어오면 공유받은 컬렉션 미리보기
 *
 * 틀은 다른 레이어 팝업과 **같은 LayerSheet**(높이 86% · 딤 · 다크 차콜 헤더)입니다.
 * 바닥 버튼은 **`내 지도에 한 번에 담기`** 하나 — 중복 핀은 만들지 않습니다.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import LayerSheet from './LayerSheet';
import { useSheetBodyScroll } from './useSheetSwipeDismiss';
import { colors, radius, typography } from '../theme';

export default function CollectionPreviewSheet({
  visible = false,
  item = null,
  onClose,
  onImport,
  importLabel = '내 지도에 한 번에 담기',
  busy = false,
  testID = 'collection-preview',
}) {
  // v2.36.0 — 본문 스크롤이 맨 위일 때도 헤더처럼 아래로 당겨 닫기
  const sheetScroll = useSheetBodyScroll();
  if (!visible || !item) return null;
  const places = Array.isArray(item.places) ? item.places : [];

  return (
    <LayerSheet
      visible
      onClose={onClose}
      icon="albums"
      title={(item.emoji ? item.emoji + ' ' : '') + (item.title || '컬렉션')}
      testID={testID}
      overlayTestID={testID + '-overlay'}
      titleTestID={testID + '-title'}
      closeTestID={testID + '-close'}
      zIndex={47}
      footer={
        <View style={styles.footer}>
          <Pressable
            style={[styles.importBtn, (busy || !places.length) && styles.importBtnOff]}
            onPress={() => {
              if (typeof onImport === 'function') onImport(item);
            }}
            disabled={busy || !places.length}
            accessibilityRole="button"
            accessibilityLabel={importLabel}
            testID={testID + '-import'}
          >
            <Ionicons name="add-circle-outline" size={17} color={colors.white} />
            <Text style={styles.importText}>{busy ? '담는 중…' : importLabel}</Text>
          </Pressable>
          <Text style={styles.footerHint}>이미 저장한 곳은 빼고 담아요 · 컬렉션으로도 묶어 둘게요</Text>
        </View>
      }
    >
      <ScrollView {...sheetScroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {!!item.description && <Text style={styles.desc}>{item.description}</Text>}

        <View style={styles.headRow}>
          <Text style={styles.sectionTitle}>담긴 장소</Text>
          <Text style={styles.sectionCount}>{places.length}곳</Text>
        </View>

        {!places.length ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>아직 담긴 장소가 없어요.</Text>
          </View>
        ) : (
          <View style={styles.list} testID={testID + '-places'}>
            {places.map((place, index) => {
              const hasCoord =
                place.lat !== null &&
                place.lat !== undefined &&
                place.lat !== '' &&
                place.lng !== null &&
                place.lng !== undefined &&
                place.lng !== '' &&
                Number.isFinite(Number(place.lat)) &&
                Number.isFinite(Number(place.lng));
              const meta2 = [place.category, place.area].filter(Boolean).join(' · ');
              return (
                <View key={(place.name || '') + index} style={styles.row}>
                  <View style={styles.rank}>
                    <Text style={styles.rankText}>{index + 1}</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.name} numberOfLines={1}>
                      {place.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[meta2, place.address].filter(Boolean).join(' · ') || '주소 미확인'}
                    </Text>
                    {!hasCoord ? <Text style={styles.noCoord}>좌표 없음 · 지도에는 찍히지 않아요</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.note}>
          공유된 목록에는 이름·분류·동네·주소·좌표만 담겨 있어요. 한줄 메모와 전화번호는 함께 가지 않습니다.
        </Text>
      </ScrollView>
    </LayerSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 24, gap: 10 },
  desc: { ...typography.sub, fontSize: 12.5, lineHeight: 19, color: colors.textSub },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { ...typography.body, fontSize: 13.5, fontWeight: '800' },
  sectionCount: { ...typography.tiny, fontSize: 11.5 },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rank: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: 11.5, fontWeight: '800', color: colors.brandDark },
  rowBody: { flex: 1, minWidth: 0 },
  name: { ...typography.body, fontSize: 13.5, fontWeight: '800' },
  meta: { ...typography.tiny, fontSize: 11, marginTop: 2 },
  noCoord: { fontSize: 10.5, fontWeight: '700', color: '#B45309', marginTop: 3 },
  emptyBox: {
    paddingVertical: 26,
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyText: { ...typography.tiny, fontSize: 11.5 },
  note: { ...typography.tiny, fontSize: 10.5, lineHeight: 16, marginTop: 6, color: colors.textMuted },
  footer: { gap: 6, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 16 },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.charcoal,
  },
  importBtnOff: { opacity: 0.5 },
  importText: { color: colors.white, fontSize: 13.5, fontWeight: '800' },
  footerHint: { ...typography.tiny, fontSize: 10.5, textAlign: 'center' },
});
