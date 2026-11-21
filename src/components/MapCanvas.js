import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { colors } from '../theme';
import { getCategoryColor, hexToRgba } from '../utils/categories';

// 지도 투영 범위 (서울 서부 ~ 인천 검단)
export const MAP_BOUNDS = {
  minLat: 37.42,
  maxLat: 37.64,
  minLng: 126.6,
  maxLng: 127.12,
};

function project(lat, lng, size) {
  const { minLat, maxLat, minLng, maxLng } = MAP_BOUNDS;
  const x = ((lng - minLng) / (maxLng - minLng)) * size.width;
  const y = ((maxLat - lat) / (maxLat - minLat)) * size.height;
  return { x, y };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// 배경 라벨 (동네 이름)
const DISTRICTS = [
  { name: '검단', lat: 37.6, lng: 126.7 },
  { name: '김포공항', lat: 37.558, lng: 126.8 },
  { name: '마곡', lat: 37.558, lng: 126.83 },
  { name: '망원동', lat: 37.556, lng: 126.902 },
  { name: '연남동', lat: 37.562, lng: 126.925 },
  { name: '여의도', lat: 37.527, lng: 126.924 },
  { name: '용산', lat: 37.532, lng: 126.99 },
  { name: '성수동', lat: 37.548, lng: 127.056 },
  { name: '잠실', lat: 37.513, lng: 127.1 },
  { name: '강남', lat: 37.498, lng: 127.028 },
];

// 도시 블록 (지도 질감용 사각형)
const BLOCKS = [
  { left: '6%', top: '26%', w: '9%', h: '7%' },
  { left: '17%', top: '14%', w: '11%', h: '6%' },
  { left: '30%', top: '34%', w: '7%', h: '9%' },
  { left: '41%', top: '22%', w: '9%', h: '6%' },
  { left: '52%', top: '44%', w: '10%', h: '7%' },
  { left: '66%', top: '28%', w: '8%', h: '8%' },
  { left: '78%', top: '46%', w: '10%', h: '6%' },
  { left: '88%', top: '22%', w: '8%', h: '9%' },
  { left: '24%', top: '62%', w: '9%', h: '7%' },
  { left: '44%', top: '70%', w: '11%', h: '6%' },
  { left: '63%', top: '64%', w: '8%', h: '9%' },
  { left: '14%', top: '78%', w: '10%', h: '6%' },
];

const PARKS = [
  { left: '10%', top: '46%', w: '13%', h: '10%' },
  { left: '70%', top: '76%', w: '11%', h: '8%' },
];

// v2.4 — 카테고리 색은 웹 지도·필터 칩·상세 배지와 같은 getCategoryColor 하나로 정합니다.
//   맛집 #0D9488 · 카페 #D97706 · 가볼곳 #3B82F6 · 커스텀은 팔레트에서 서로 다른 색
//   선택된 핀도 분류 색을 유지하고, 강조는 크기·라벨 색으로 합니다.
function pinColor(pin, selected, categories) {
  return getCategoryColor((pin && pin.category) || '', categories);
}

export default function MapCanvas({ pins, selectedId, onSelect, radius, categories }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });
  const startRef = useRef({ x: 0, y: 0 });

  const onLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 7 || Math.abs(g.dy) > 7,
        onPanResponderGrant: () => {
          startRef.current = offsetRef.current;
        },
        onPanResponderMove: (_, g) => {
          const next = {
            x: clamp(startRef.current.x + g.dx, -110, 110),
            y: clamp(startRef.current.y + g.dy, -110, 110),
          };
          offsetRef.current = next;
          setOffset(next);
        },
      }),
    []
  );

  const projected = pins.map((pin) => ({ pin, ...project(pin.lat, pin.lng, size) }));
  const selected = projected.find((p) => p.pin.id === selectedId);

  // 이름표가 화면 밖으로 나가지 않게 좌우를 잠그고, 꼬리는 핀 위치를 따라가게 합니다.
  const bubbleLeft = selected
    ? clamp(selected.x - 92, 8, Math.max(8, size.width - 192))
    : 0;
  const bubbleTailLeft = selected ? clamp(selected.x - bubbleLeft - 7, 8, 169) : 0;

  return (
    <View style={styles.root} onLayout={onLayout} {...panResponder.panHandlers}>
      <View
        style={[
          styles.layer,
          styles.backgroundLayer,
          { transform: [{ translateX: offset.x }, { translateY: offset.y }] },
        ]}
      >
        {/* 도시 블록 */}
        {BLOCKS.map((b, i) => (
          <View
            key={'block-' + i}
            style={[styles.block, { left: b.left, top: b.top, width: b.w, height: b.h }]}
          />
        ))}
        {PARKS.map((p, i) => (
          <View
            key={'park-' + i}
            style={[styles.park, { left: p.left, top: p.top, width: p.w, height: p.h }]}
          />
        ))}

        {/* 도로 그리드 */}
        {ROAD_V.map((v, i) => (
          <View key={'rv-' + i} style={[styles.roadV, { left: v }]} />
        ))}
        {ROAD_H.map((h, i) => (
          <View key={'rh-' + i} style={[styles.roadH, { top: h }]} />
        ))}

        {/* 한강 */}
        <View style={styles.river} />
        <View style={styles.riverShine} />

        {/* 동네 이름 */}
        {size.width > 0 &&
          DISTRICTS.map((d) => {
            const pos = project(d.lat, d.lng, size);
            return (
              <Text
                key={d.name}
                style={[
                  styles.district,
                  {
                    left: clamp(pos.x - 78, 4, Math.max(4, size.width - 74)),
                    top: pos.y + 14,
                  },
                ]}
                numberOfLines={1}
              >
                {d.name}
              </Text>
            );
          })}

        {/* 현재 위치 */}
        <View style={styles.myLocation}>
          <View style={styles.myLocationDot} />
        </View>

        {/* 핀 — 배경과 같은 레이어에 두어 드래그할 때 함께 움직입니다 */}
        {size.width > 0 &&
        projected.map(({ pin, x, y }) => {
          const isOn = pin.id === selectedId;
          const color = pinColor(pin, isOn, categories);
          const head = isOn ? 34 : 27;
          return (
            <React.Fragment key={pin.id}>
              <Pressable
                onPress={() => onSelect(pin.id)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={pin.name + ', ' + pin.category}
                style={{
                  position: 'absolute',
                  left: x - 22,
                  top: y - (isOn ? 40 : 32),
                  width: 44,
                  height: 52,
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                }}
              >
                <View
                  style={[
                    styles.pinHead,
                    {
                      width: head,
                      height: head,
                      borderRadius: head / 2,
                      backgroundColor: color,
                      borderWidth: isOn ? 3 : 2,
                    },
                    isOn && styles.pinHeadOn,
                  ]}
                >
                  <View
                    style={[
                      styles.pinDot,
                      { width: isOn ? 11 : 9, height: isOn ? 11 : 9, borderRadius: isOn ? 6 : 5 },
                    ]}
                  />
                </View>
                {/* v2.20.1 — 핀 머리 위 초록 원형 체크 배지 없음. 가봤어요 표시는 아래 라벨의 `✓ ` 글씨로만. */}
                <View style={[styles.pinTail, { borderTopColor: color, borderTopWidth: isOn ? 10 : 8 }]} />
              </Pressable>

              {/* v2.3 — 핀 아래 가게 이름 라벨 (웹 지도와 같은 결: 흰 알약 + 진한 글씨) */}
              <View
                pointerEvents="none"
                style={[styles.pinLabelWrap, { left: clamp(x - 52, 4, Math.max(4, size.width - 108)), top: y + 6 }]}
              >
                <View
                  style={[
                    styles.pinLabel,
                    { borderColor: isOn ? hexToRgba(color, 0.9) : hexToRgba(color, 0.55) },
                    isOn && { backgroundColor: color },
                  ]}
                >
                  <Text
                    style={[styles.pinLabelText, isOn && styles.pinLabelTextOn]}
                    numberOfLines={1}
                  >
                    {(pin.visited === true ? '✓ ' : '') + pin.name}
                  </Text>
                </View>
              </View>
            </React.Fragment>
          );
        })}

        {/* 선택 핀 이름표 */}
        {selected && (
          <View
            style={[styles.bubble, { left: bubbleLeft, top: selected.y - 92 }]}
            pointerEvents="none"
          >
            <View style={styles.bubbleInner}>
              <Text style={styles.bubbleName} numberOfLines={1}>
                {selected.pin.name}
              </Text>
              <View style={styles.bubbleChip}>
                <Text style={styles.bubbleChipText}>{radius >= 1000 ? '1km' : radius + 'm'}</Text>
              </View>
            </View>
            <View style={[styles.bubbleTail, { left: bubbleTailLeft }]} />
          </View>
        )}
      </View>
    </View>
  );
}

const ROAD_V = ['11%', '22%', '33%', '44%', '55%', '66%', '77%', '88%'];
const ROAD_H = ['12%', '24%', '36%', '48%', '60%', '72%', '84%'];

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.navy,
    overflow: 'hidden',
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundLayer: {
    backgroundColor: colors.navy,
  },
  block: {
    position: 'absolute',
    backgroundColor: '#131E33',
    borderRadius: 6,
  },
  park: {
    position: 'absolute',
    backgroundColor: colors.park,
    borderRadius: 14,
    opacity: 0.85,
  },
  roadV: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    width: 2,
    backgroundColor: colors.navyLine,
    transform: [{ rotate: '-4deg' }],
  },
  roadH: {
    position: 'absolute',
    left: -60,
    right: -60,
    height: 2,
    backgroundColor: colors.navyLine,
    transform: [{ rotate: '-2deg' }],
  },
  river: {
    position: 'absolute',
    left: '-30%',
    right: '-30%',
    top: '50%',
    height: 62,
    backgroundColor: colors.river,
    borderRadius: 30,
    transform: [{ rotate: '-7deg' }],
    opacity: 0.95,
  },
  riverShine: {
    position: 'absolute',
    left: '-30%',
    right: '-30%',
    top: '52%',
    height: 10,
    backgroundColor: '#24507A',
    borderRadius: 8,
    transform: [{ rotate: '-7deg' }],
    opacity: 0.5,
  },
  district: {
    position: 'absolute',
    color: '#5E7194',
    fontSize: 11,
    fontWeight: '700',
    width: 70,
    textAlign: 'right',
  },
  myLocation: {
    position: 'absolute',
    left: '46%',
    top: '46%',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(78,205,180,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  myLocationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.mint,
    borderWidth: 2,
    borderColor: colors.white,
  },
  pinHead: {
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinHeadOn: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pinDot: {
    backgroundColor: colors.white,
  },
  pinTail: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  // v2.3 — 핀 아래 가게 이름 라벨 (가운데 정렬 · 좌우는 화면 안으로 잠금)
  pinLabelWrap: {
    position: 'absolute',
    width: 104,
    alignItems: 'center',
  },
  pinLabel: {
    maxWidth: 104,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
  },
  pinLabelText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: colors.charcoal,
    includeFontPadding: false,
  },
  pinLabelTextOn: {
    color: colors.white,
  },
  bubble: {
    position: 'absolute',
    width: 184,
    alignItems: 'center',
  },
  bubbleInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4EFE9',
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  bubbleName: {
    color: '#1B2233',
    fontSize: 13,
    fontWeight: '800',
    maxWidth: 112,
  },
  bubbleChip: {
    backgroundColor: '#3B2F2A',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  bubbleChipText: {
    color: '#F7E9DC',
    fontSize: 10,
    fontWeight: '700',
  },
  bubbleTail: {
    position: 'absolute',
    bottom: -7,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#F4EFE9',
  },
});
