/**
 * src/components/GeofenceToast.js — v2.28.0 반경 500m 알림 = **작고 잠깐 뜨는 한 줄 토스트**
 * ─────────────────────────────────────────────────────────────
 * 상훈 님 결정(2026-11-18):
 *   "지도 위에 큰 카드(배너)가 떠 있으면 지도가 가려진다. 반경 500m 안에 저장한 곳이 있으면
 *    `● 반경 500m 안에 N곳 있어요` 한 줄만 3초쯤 떠 있고, 계속 남는 표시는 헤더 🔔 뱃지 하나로
 *    충분하다. [보기]를 누르면 알림 모음이 열리면 된다."
 *
 * 이 컴포넌트가 하는 일 / 안 하는 일
 *   · 하는 일: 다크 알약 한 줄 + 점(●) + `보기` 버튼 **모양만** 그립니다.
 *   · 안 하는 일: 언제 띄울지·언제 닫을지는 지도 화면(MapScreen)이 정합니다
 *     (세션에 한 번·같은 가게 묶음은 다시 안 띄움·[내 위치]를 누르면 다시).
 *     그래서 시간 상수(GEOFENCE_TOAST_MS)와 문구 함수(nearbyToastMessage)만 같이 내보냅니다.
 *
 * 예전 `GeofenceBanner`(큰 카드 · 위로 스와이프 닫기 · 영업 상태 뱃지)는 v2.28.0 에서 지도에서 걷어냈습니다.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NEARBY_RADIUS_M } from '../services/location';
import { colors } from '../theme';

/** 떠 있는 시간 — 3.2초(요청: 3~3.5초). */
export const GEOFENCE_TOAST_MS = 3200;
/** 검사·딥링크용 이름 */
export const GEOFENCE_TOAST_TESTID = 'geofence-toast';
/** `보기` 버튼 이름 */
export const GEOFENCE_TOAST_ACTION = '보기';

/**
 * 토스트 문구 — `반경 500m 안에 N곳 있어요`
 *   · 개수가 0 이면 빈 문자열(그때는 토스트를 띄우지 않습니다).
 *   · 반경 값은 지도·알림 모음이 쓰는 NEARBY_RADIUS_M 한 곳에서 옵니다.
 */
export function nearbyToastMessage(count) {
  const n = Math.floor(Number(count));
  if (!Number.isFinite(n) || n <= 0) return '';
  return '반경 ' + NEARBY_RADIUS_M + 'm 안에 ' + n + '곳 있어요';
}

/** 반경 안에 저장한 곳이 있을 때만 알립니다(반경 밖 가장 가까운 곳은 🔔 뱃지가 안내). */
export function shouldToastNearby(count) {
  return Math.floor(Number(count)) > 0;
}

export default function GeofenceToast({ message, onPress, testID = GEOFENCE_TOAST_TESTID }) {
  const text = message || '';
  if (!text) return null;
  return (
    <View style={styles.toast} testID={testID} accessibilityLabel={text}>
      {/* ● — 반경 안에 들어왔다는 표시(지금 보고 있다는 점) */}
      <View style={styles.dot} />
      <Text style={styles.text} numberOfLines={1}>
        {text}
      </Text>
      <Pressable
        style={styles.action}
        onPress={onPress}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={'반경 500m 알림 보기'}
        testID={testID + '-open'}
      >
        <Text style={styles.actionText}>{GEOFENCE_TOAST_ACTION}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.brand,
  },
  text: {
    flexShrink: 1,
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  action: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  actionText: {
    color: colors.white,
    fontSize: 11.5,
    fontWeight: '800',
  },
});
