/**
 * src/components/VisitedToggleCard.js — v2.33.4
 * ─────────────────────────────────────────────────────────────
 * ✅ `가봤어요` 토글 카드 — **저장 화면**(`릴스·쇼츠로 찾기` · `사진으로 찾기` · `가게명 찾기`
 * 결과)에서 저장하기 전에 "이미 다녀온 곳"을 체크합니다.
 *
 *   · 상훈 님 요청(2026-11-18): "저장 화면(링크·사진·가게명)에도 가봤어요 추가"
 *   · 꾹 눌러 등록 시트(LongPressPlaceSheet)·상세 시트(PinDetailSheet)의 같은 카드와 **같은 결**:
 *     기본 미체크(`가봤어요` · `다녀왔으면 눌러서 체크해 두세요` · `체크`)
 *     → 누르면 초록 박스(`가봤어요 (방문 완료)` · `저장하면 방문 완료로 표시돼요` · `해제`)
 *   · 글은 `utils/longPressPlace.visitedToggleText` 한 곳에서 가져와 세 화면의 문구가 갈라지지 않습니다.
 *   · 카드 **위·아래 14px** 여백을 카드가 스스로 갖습니다(아래 `분류` 카드처럼 위 여백이 0 인
 *     요소와 붙어 보이던 v2.33.3 회귀를 되풀이하지 않기 위해).
 *     붙는 자리의 위 요소에 이미 아래 여백이 있으면 그만큼 더 벌어질 뿐, 0px 로 붙지는 않습니다.
 *
 * props
 *   visited   … 체크 여부 (기본 false)
 *   onToggle  … 다음 값(boolean)을 받는 콜백
 *   style     … 자리별 여백 보정 (예: 아래 카드의 marginTop 을 0 으로 둔 경우)
 *   testID / boxTestID / labelTestID … 화면별 자동 검사용 이름
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { visitedToggleText } from '../utils/longPressPlace';
import { colors, radius } from '../theme';

export default function VisitedToggleCard({
  visited = false,
  onToggle,
  style,
  testID = 'visited-toggle',
  boxTestID = 'visited-box',
  labelTestID = 'visited-label',
}) {
  const on = visited === true;
  const text = visitedToggleText(on);
  return (
    <Pressable
      style={[styles.card, on && styles.cardOn, style]}
      onPress={() => {
        if (typeof onToggle === 'function') onToggle(!on);
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      accessibilityLabel={on ? '가봤어요 체크 해제' : '가봤어요로 체크'}
      testID={testID}
    >
      <View style={[styles.check, on && styles.checkOn]} testID={boxTestID}>
        {on ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.text, on && styles.textOn]} testID={labelTestID}>
          {text.label}
        </Text>
        <Text style={[styles.sub, on && styles.subOn]} numberOfLines={1}>
          {text.sub}
        </Text>
      </View>
      <Text style={[styles.action, on && styles.actionOn]}>{text.action}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 14,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  cardOn: {
    borderColor: colors.visitLine,
    backgroundColor: colors.visitSoft,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#C4CAD6',
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    borderColor: colors.visit,
    backgroundColor: colors.visit,
  },
  textWrap: { flex: 1, minWidth: 0 },
  text: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSub,
  },
  textOn: {
    color: colors.visitDark,
  },
  sub: {
    marginTop: 1,
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.textMuted,
  },
  subOn: {
    color: colors.visitDark,
    opacity: 0.75,
  },
  action: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.textSub,
  },
  actionOn: {
    color: colors.visitDark,
  },
});
