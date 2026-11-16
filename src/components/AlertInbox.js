import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, sheetShadow, typography } from '../theme';
import { formatDistance } from '../services/location';
import { buildAlertFeed } from '../utils/alertFeed';

/**
 * 🔔 알림 모음 (v2.15)
 *
 * 상훈 님 요청: "헤더 우측에는 로그인+알림 모음 아이콘을 넣고 … 반경 500m 이내 저장 장소를
 *               모아 보여주고, 장소를 누르면 지도 탭에서 그 핀을 열어 줘"
 *
 *   · 지금 내 위치 기준 반경 500m 안의 저장 장소를 가까운 순으로 (전부)
 *   · 자리가 남으면 반경 밖에서 가장 가까운 저장 장소로 최대 5곳까지 채웁니다
 *   · 위치를 아직 모르면 모달 안에서 바로 [내 위치 켜기]를 눌러 잡을 수 있습니다
 *   · 위쪽 배너를 스와이프로 닫아 버렸어도 여기서는 언제든 다시 볼 수 있습니다
 *
 * 화면(앱)은 이 컴포넌트를 열려 있을 때만 그립니다 — 닫혀 있으면 아무 것도 렌더하지 않습니다.
 */
export default function AlertInbox({
  visible,
  onClose,
  pins,
  myCoords,
  locating,
  error,
  onLocate,
  onOpenPin,
  onGoMap,
  radiusMeters,
}) {
  if (!visible) return null;

  const feed = buildAlertFeed(pins, myCoords, { radiusMeters });
  const distanceText = Math.round(feed.radiusMeters);

  const summary = !feed.hasLocation
    ? '위치를 켜면 지금 가까운 저장 장소를 모아 보여드려요'
    : feed.inRadiusCount > 0
    ? '내 위치 반경 ' + distanceText + 'm 안 ' + feed.inRadiusCount + '곳'
    : feed.items.length > 0
    ? '반경 ' + distanceText + 'm 안 0곳 · 가까운 곳부터 보여드려요'
    : '반경 ' + distanceText + 'm 안에는 저장한 곳이 없어요';

  return (
    <View style={styles.overlay} testID="alert-inbox-overlay">
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="알림 모음 닫기"
      />
      <View style={styles.sheet} testID="alert-inbox">
        <View style={styles.sheetHead}>
          <View style={styles.headIcon}>
            <Ionicons name="notifications" size={16} color={colors.white} />
          </View>
          <View style={styles.headText}>
            <Text style={styles.title}>🔔 알림 모음</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {summary}
            </Text>
          </View>
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="알림 모음 닫기"
            testID="alert-inbox-close"
          >
            <Ionicons name="close" size={18} color={colors.white} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          testID="alert-inbox-scroll"
        >
          {!feed.hasLocation ? (
            <View style={styles.needsLocation}>
              <Ionicons name="locate-outline" size={20} color={colors.coral} />
              <Text style={styles.needsTitle}>내 위치를 켜면 가까운 저장 장소가 모여요</Text>
              <Text style={styles.needsSub}>
                {'지금 있는 곳 기준 반경 ' + distanceText + 'm 안의 저장 장소를 가까운 순으로 보여드려요.'}
              </Text>
              {!!error && <Text style={styles.errorText}>{error}</Text>}
              <Pressable
                style={styles.locateBtn}
                onPress={onLocate}
                accessibilityRole="button"
                accessibilityLabel="내 위치 켜기"
                testID="alert-inbox-locate"
              >
                {locating ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Ionicons name="locate" size={14} color={colors.white} />
                )}
                <Text style={styles.locateText}>내 위치 켜기</Text>
              </Pressable>
            </View>
          ) : feed.items.length === 0 ? (
            <View style={styles.needsLocation}>
              <Ionicons name="map-outline" size={20} color={colors.textMuted} />
              <Text style={styles.needsTitle}>
                {feed.empty ? '아직 저장한 장소가 없어요' : '모아 보여드릴 장소가 없어요'}
              </Text>
              <Text style={styles.needsSub}>
                {feed.empty
                  ? '릴스 링크 하나면 3초 만에 핀이 꽂힙니다.'
                  : '저장한 장소에 좌표가 없으면 거리를 잴 수 없어요.'}
              </Text>
            </View>
          ) : (
            feed.items.map((item, index) => {
              const inRadius = item.distanceMeters <= feed.radiusMeters;
              return (
                <Pressable
                  key={item.pin.id || 'alert-' + index}
                  style={styles.row}
                  onPress={() => onOpenPin && onOpenPin(item.pin)}
                  accessibilityRole="button"
                  accessibilityLabel={item.pin.name + ', ' + formatDistance(item.distanceMeters)}
                  testID={'alert-item-' + (item.pin.id || index)}
                >
                  <View style={[styles.dot, inRadius ? styles.dotIn : styles.dotOut]} />
                  <View style={styles.rowText}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.pin.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[item.pin.category, item.pin.area].filter(Boolean).join(' · ') || '내 지도'}
                    </Text>
                  </View>
                  <Text style={[styles.distance, inRadius ? styles.distanceIn : styles.distanceOut]}>
                    {formatDistance(item.distanceMeters)}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </Pressable>
              );
            })
          )}
        </ScrollView>

        <Text style={styles.footNote}>
          배너를 위로 스와이프해 닫아도 여기서는 언제든 다시 볼 수 있어요.
        </Text>
        {feed.items.length > 0 && onGoMap ? (
          <Pressable
            style={styles.mapBtn}
            onPress={onGoMap}
            accessibilityRole="button"
            accessibilityLabel="지도에서 보기"
            testID="alert-inbox-map"
          >
            <Ionicons name="map-outline" size={14} color={colors.white} />
            <Text style={styles.mapText}>지도에서 보기</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 40,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    maxHeight: '78%',
    paddingBottom: 18,
    ...sheetShadow,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.charcoal,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 13,
  },
  headIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.coral,
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
  sub: {
    color: colors.charcoalSub,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.charcoalPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  needsLocation: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 22,
    paddingHorizontal: 8,
  },
  needsTitle: {
    ...typography.h3,
    fontSize: 14,
    textAlign: 'center',
  },
  needsSub: {
    ...typography.sub,
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
  },
  errorText: {
    color: colors.coralDark,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  locateBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.coral,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  locateText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotIn: {
    backgroundColor: colors.coral,
  },
  dotOut: {
    backgroundColor: colors.textMuted,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...typography.body,
    fontSize: 13.5,
    fontWeight: '700',
  },
  meta: {
    ...typography.tiny,
    fontSize: 10.5,
    marginTop: 1,
  },
  distance: {
    fontSize: 12,
    fontWeight: '800',
  },
  distanceIn: {
    color: colors.coralDark,
  },
  distanceOut: {
    color: colors.textMuted,
  },
  footNote: {
    ...typography.tiny,
    fontSize: 10,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  mapBtn: {
    marginTop: 8,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.charcoal,
    borderRadius: radius.md,
    paddingVertical: 11,
  },
  mapText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
});
