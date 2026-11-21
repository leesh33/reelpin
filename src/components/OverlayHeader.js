/**
 * src/components/OverlayHeader.js — v2.18
 * ─────────────────────────────────────────────────────────────
 * 전체 레이어 팝업(`저장` 화면 · 🔍 `장소 검색`)이 **똑같이 쓰는 다크 차콜 헤더**.
 *
 * 상훈 님 요청: "저장 화면 … 상단 헤더를 돋보기(검색) 화면과 동일하게 해줘"
 *
 *   · 왼쪽 : 딥 틸 원 안의 아이콘 (`search` / `link`)
 *   · 가운데: 제목 한 줄 (v2.32.2 — 상훈 님 요청으로 보조 줄은 없앴습니다. 제목 + ✕ 뿐)
 *   · 오른쪽: 반투명 흰 원 안의 `✕` 닫기 버튼
 *   · 배경 `#1C1C1E` · 아래 테두리 `#33333A` · 좌우 16 / 위아래 13 여백
 *
 * 두 화면이 **같은 컴포넌트**를 쓰므로 색·높이·여백이 어긋날 수 없습니다.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

export default function OverlayHeader({
  icon = 'search',
  title = '',
  onClose,
  closeLabel = '닫기',
  testID = 'overlay-header',
  closeTestID = '',
}) {
  return (
    <View style={styles.header} testID={testID}>
      <View style={styles.headIcon}>
        <Ionicons name={icon} size={16} color={colors.white} />
      </View>
      <View style={styles.headText}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {typeof onClose === 'function' ? (
        <Pressable
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          testID={closeTestID || testID + '-close'}
        >
          <Ionicons name="close" size={18} color={colors.white} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.charcoal,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.charcoalLine,
  },
  headIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.charcoalPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
