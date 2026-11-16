/**
 * src/components/TabBar.js — v2.18 플로팅 하단 탭바
 * ─────────────────────────────────────────────────────────────
 * 상훈 님 요청: "하단 바 형태를 첨부한 이미지처럼 플로팅 디자인으로 바꿀 수 있니?"
 *
 *   · 화면 바닥에 붙은 직사각형 바 → **바닥에서 살짝 떠 있는 둥근 알약**
 *     (반투명 흰색 rgba(255,255,255,0.92) + 은은한 그림자 + 웹 backdropFilter blur(12px),
 *      borderRadius 999)
 *   · 선택된 탭은 **연한 둥근 알약 하이라이트**(rgba(255,90,54,0.12)) + 코랄 아이콘·글씨
 *   · 탭 구성은 그대로 `지도 · 저장(+) · 내 정보`
 *   · 지도 위 왼쪽 하단 도구(🎛)·개수 알약, 오른쪽 하단 `내 위치`·`+ / -`·`NAVER` 로고를
 *     덮지 않도록 `theme.tabBar` 값만큼 띄웁니다. (지도 쪽 컨트롤은 MapScreen·theme.mapControls
 *     가 같은 값으로 함께 올라갑니다)
 *
 * 높이·여백은 모두 `theme.tabBar` 한 곳에서 옵니다 — 390×844 에서 아이콘 줄·글자 줄이
 * 세 탭 모두 같은 높이로 정렬됩니다.
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, tabBar } from '../theme';

const TABS = [
  { key: 'map', label: '지도', icon: 'map-outline', iconOn: 'map' },
  { key: 'paste', label: '저장', icon: 'add', iconOn: 'add' },
  { key: 'profile', label: '내 정보', icon: 'person-outline', iconOn: 'person' },
];

export default function TabBar({ active, onChange }) {
  return (
    <View style={styles.wrap} pointerEvents="box-none" testID="tab-bar">
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const on = active === tab.key;
          const isCenter = tab.key === 'paste';
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              style={[styles.item, on && styles.itemOn]}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: on }}
              testID={'tab-' + tab.key}
            >
              <View style={styles.iconRow}>
                {isCenter ? (
                  <View style={[styles.centerIcon, on && styles.centerIconOn]}>
                    <Ionicons name={on ? tab.iconOn : tab.icon} size={18} color={colors.white} />
                  </View>
                ) : (
                  <Ionicons
                    name={on ? tab.iconOn : tab.icon}
                    size={21}
                    color={on ? colors.coral : '#8A8F9C'}
                  />
                )}
              </View>
              <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 화면 바닥에서 뜬 알약 — 지도·목록 위에 그려집니다(App.js 가 화면 맨 위 레이어에 둡니다).
  wrap: {
    position: 'absolute',
    left: tabBar.side,
    right: tabBar.side,
    bottom: tabBar.bottom,
    alignItems: 'center',
    // 오버레이(검색 50 · 메뉴 · 알림 · 핀 상세 40) 아래에 깔리도록 낮은 값.
    zIndex: 20,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: tabBar.height,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    // 웹(아이폰 사파리)에서는 뒤 지도가 은은하게 비쳐 보이도록
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } : null),
  },
  item: {
    flex: 1,
    height: tabBar.height - 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 999,
  },
  // 선택된 탭 — 연한 코랄 알약 하이라이트
  itemOn: {
    backgroundColor: 'rgba(255, 90, 54, 0.12)',
  },
  // 아이콘 줄 높이를 고정해 세 탭의 아이콘·글자 기준선을 맞춥니다.
  iconRow: {
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text,
  },
  centerIconOn: {
    backgroundColor: colors.coral,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#8A8F9C',
    letterSpacing: -0.2,
  },
  labelOn: {
    color: colors.coral,
    fontWeight: '800',
  },
});
