/**
 * src/components/TabBar.js — v2.19 컴팩트 아이콘 전용 플로팅 하단바
 * ─────────────────────────────────────────────────────────────
 * 상훈 님 요청(2026-11-16):
 *   1. "하단바는 지도, 저장, 컬렉션 으로 구성"
 *   2. "내정보는 헤더 우측 상단의 짝대기 3개와 머지함."   → 내 정보 탭은 없어지고 ☰ 시트로
 *   3. "하단바는 한글명을 지우고 아이콘만 노출하되, 좌우 폭을 좀 줄임 (지금의 절반정도로)"
 *
 *   · 탭 구성 **`지도 · ＋(저장) · 컬렉션`** 3칸 (`map`, `paste`, `collections`)
 *   · **한글 라벨 없음** — 아이콘만. 화면 낭독기용 `accessibilityLabel`·`aria-label` 은 그대로
 *   · 폭은 `theme.tabBar.width`(190px) — 예전 358px 의 절반 남짓, 화면 가운데 정렬
 *     (`alignSelf:'center'`, `borderRadius:999`, `rgba(255,255,255,0.92)`, `blur(12px)`, 그림자)
 *   · 켜진 탭은 **연한 코랄 원형 하이라이트 + 코랄 아이콘**
 *   · 가운데 `＋` 저장은 코랄(켜지면 딥 네이비) 원형 버튼으로 균형을 잡습니다
 *
 * 높이·폭·여백은 모두 `theme.tabBar` 한 곳에서 옵니다 — 지도 왼쪽/오른쪽 하단 컨트롤도
 * 같은 값을 써서 알약 위로 올라갑니다(`theme.mapControls`).
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, tabBar } from '../theme';

export const TAB_ITEMS = [
  { key: 'map', label: '지도', icon: 'map-outline', iconOn: 'map', testID: 'tab-map' },
  { key: 'paste', label: '저장', icon: 'add', iconOn: 'add', testID: 'tab-paste' },
  { key: 'collections', label: '컬렉션', icon: 'folder-outline', iconOn: 'folder', testID: 'tab-collections' },
];

/** 탭 순서(검사용 단일 출처) */
export const TAB_KEYS = TAB_ITEMS.map((t) => t.key);

export default function TabBar({ active, onChange }) {
  return (
    <View style={styles.wrap} pointerEvents="box-none" testID="tab-bar">
      <View style={styles.bar}>
        {TAB_ITEMS.map((tab) => {
          const on = active === tab.key;
          const isCenter = tab.key === 'paste';
          if (isCenter) {
            return (
              <Pressable
                key={tab.key}
                onPress={() => onChange(tab.key)}
                style={styles.item}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: on }}
                testID={tab.testID}
              >
                <View style={[styles.centerIcon, on && styles.centerIconOn]}>
                  <Ionicons name="add" size={22} color={colors.white} />
                </View>
              </Pressable>
            );
          }
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              style={styles.item}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: on }}
              testID={tab.testID}
            >
              <View style={[styles.iconPill, on && styles.iconPillOn]}>
                <Ionicons
                  name={on ? tab.iconOn : tab.icon}
                  size={21}
                  color={on ? colors.coral : '#8A8F9C'}
                />
              </View>
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
    left: 0,
    right: 0,
    bottom: tabBar.bottom,
    alignItems: 'center',
    // 오버레이(검색 50 · 메뉴 · 알림 · 핀 상세 40) 아래에 깔리도록 낮은 값.
    zIndex: 20,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: tabBar.width,
    maxWidth: '92%',
    height: tabBar.height,
    paddingHorizontal: 8,
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
    width: 54,
    height: tabBar.height - 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 켜진 탭 — 연한 코랄 알약(원형) 하이라이트
  iconPill: {
    width: 44,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillOn: {
    backgroundColor: 'rgba(255, 90, 54, 0.12)',
  },
  // 가운데 ＋ 저장 — v2.18 과 같은 포인트 원형
  centerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.coral,
    shadowColor: '#FF5A36',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  centerIconOn: {
    backgroundColor: colors.navy,
    shadowOpacity: 0.2,
  },
});
