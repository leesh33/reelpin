import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, sheetShadow, typography } from '../theme';
import { openMap, openPhone, openSource, telUrlOf } from '../utils/links';
import { formatDistance } from '../services/location';
import InAppPlaceModal from './InAppPlaceModal';
import ProviderBadges from './ProviderBadge';
import CategoryPicker from './CategoryPicker';
import {
  DEFAULT_CATEGORIES,
  allCategories,
  categoryTextColor,
  categoryTint,
  getCategoryColor,
  mapLegacyCategory,
  sameCategory,
} from '../utils/categories';
// v2.20 — 지금 영업 중 / 브레이크타임 / 휴무일 배지 (한국 시간 기준 · 확인된 값만)
import { evaluateOpening, hasConfirmedHours, todaySummary } from '../utils/openingStatus';
// v2.34.0 — 헤더 부근을 아래로 쓸어내려 닫기 (상훈 님 요청 IMG_9274)
import {
  SHEET_SPRING_BACK,
  clampedDragOffset,
  shouldDismissSheet,
  sheetCloseDuration,
} from '../utils/sheetDismiss';

const PLATFORM_LABEL = {
  instagram: '인스타 릴스',
  youtube: '유튜브 쇼츠',
  tiktok: '틱톡',
  naver: '네이버 블로그',
  search: '가게명으로 찾기',
  // v2.13 — 📸 사진에서 저장 (원본 링크가 없습니다)
  photo: '사진에서 저장',
  // v2.33.0 — 지도에서 꾹 눌러 등록 (지도 위에서 만든 핀)
  map: '지도에서 저장',
  unknown: '원본 링크',
};

export default function PinDetailSheet({
  pin,
  radiusMeters,
  distanceMeters,
  onClose,
  onDelete,
  onToast,
  readOnly = false,
  categories = DEFAULT_CATEGORIES,
  onChangeCategory,
  onAddCategory,
  onToggleVisited,
  onChangeMemo,
  // v2.25.0 — 🗺️ 지도에서 보기: 시트를 닫고 지도 탭에서 이 핀 위치로 이동(실제 이동은 지도 화면이 함)
  onShowOnMap,
}) {
  // v1.7 — [매장 정보 보기] 는 브라우저 밖으로 나가지 않고 앱 안 모달을 엽니다.
  const [placeModalOpen, setPlaceModalOpen] = useState(false);
  // v2.10 — 📝 한줄 메모는 입력 중인 글자를 따로 들고 있다가 저장할 때 핀에 반영합니다.
  const [memoDraft, setMemoDraft] = useState(String((pin && pin.memo) || ''));

  // ── v2.34.0 · 아래로 쓸어내려 닫기 ─────────────────────────────
  //   · 손가락이 내려간 만큼 시트가 따라 내려오고(translateY), 손을 뗐을 때
  //     충분히 내렸거나(96px) 빠르게 튕겼으면 닫힙니다. 모자라면 스프링으로 제자리로.
  //   · X 버튼 탭(움직임 없음)과 본문 스크롤(맨 위가 아닐 때)은 건드리지 않습니다.
  const translateY = useRef(new Animated.Value(0)).current;
  const draggedRef = useRef(0);
  const sheetHeightRef = useRef(0);
  const scrollYRef = useRef(0);
  // v2.37.0 — 다른 핀으로 바뀌면 본문 스크롤을 **실제로** 맨 위로 되돌립니다.
  //   (예전에는 scrollYRef 값만 0 으로 바꿔서, 앞 핀에서 내려 둔 스크롤 위치가 그대로 남아
  //    새 핀의 첫 줄(분류·영업시간 줄)이 헤더 아래로 가려졌습니다)
  const scrollRef = useRef(null);
  const closingRef = useRef(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  /** 끄는 동안 시트를 손가락 위치로 (위로는 올라가지 않음) */
  const dragTo = (dy) => {
    draggedRef.current = clampedDragOffset(dy);
    translateY.setValue(draggedRef.current);
  };
  /** 모자라면 제자리로 — 부드러운 스프링 */
  const springBack = () => {
    draggedRef.current = 0;
    Animated.spring(translateY, { ...SHEET_SPRING_BACK, useNativeDriver: false }).start();
  };
  /** 충분히 내렸으면 시트를 화면 아래로 내리고 닫기 */
  const closeWithAnimation = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const height = sheetHeightRef.current || 500;
    Animated.timing(translateY, {
      toValue: height,
      duration: sheetCloseDuration(draggedRef.current, height),
      useNativeDriver: false,
    }).start(() => {
      if (typeof closeRef.current === 'function') closeRef.current();
    });
  };
  const releaseDrag = (gesture) => {
    const dismiss = shouldDismissSheet({
      dy: gesture.dy,
      vy: gesture.vy,
      height: sheetHeightRef.current,
    });
    if (dismiss) closeWithAnimation();
    else springBack();
  };

  /** 헤더(핸들·가게 이름·✕ 줄) — 항상 잡힙니다. X 탭은 움직임이 없어 그대로 눌립니다. */
  const sheetPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (event, gesture) =>
          !closingRef.current && gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (event, gesture) => dragTo(gesture.dy),
        onPanResponderRelease: (event, gesture) => releaseDrag(gesture),
        onPanResponderTerminate: () => springBack(),
      }),
    []
  );

  /** 본문 — 스크롤이 맨 위(scrollTop 0)일 때만 아래로 당기기를 받습니다. */
  const bodyPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (event, gesture) =>
          !closingRef.current &&
          scrollYRef.current <= 0 &&
          gesture.dy > 12 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (event, gesture) => dragTo(gesture.dy),
        onPanResponderRelease: (event, gesture) => releaseDrag(gesture),
        onPanResponderTerminate: () => springBack(),
      }),
    []
  );

  // 다른 핀으로 바뀌면(닫히지 않고 내용만 교체) 시트 위치·스크롤을 처음 상태로
  useEffect(() => {
    closingRef.current = false;
    draggedRef.current = 0;
    scrollYRef.current = 0;
    translateY.setValue(0);
    // v2.37.0 — 실제 스크롤 위치도 맨 위로 (웹 ScrollView 는 scrollTo, 앱은 같은 API)
    const node = scrollRef.current;
    if (node && typeof node.scrollTo === 'function') {
      try {
        node.scrollTo({ y: 0, animated: false });
      } catch (e) {}
    }
  }, [pin && pin.id]);

  useEffect(() => {
    setMemoDraft(String((pin && pin.memo) || ''));
  }, [pin && pin.id, pin && pin.memo]);

  if (!pin) return null;
  const radiusLabel = radiusMeters >= 1000 ? '1km' : radiusMeters + 'm';
  const hasDistance = distanceMeters !== null && distanceMeters !== undefined && Number.isFinite(distanceMeters) && distanceMeters >= 0;
  const distanceLabel = hasDistance ? formatDistance(distanceMeters) : '';
  const platform = PLATFORM_LABEL[pin.platform] || PLATFORM_LABEL.unknown;
  const phone = String(pin.phone || '');
  const address = String(pin.address || '');
  const hasAddress = Boolean(address) && address !== '주소 미확인';
  // v2.4 — 상단 분류 배지도 그 분류의 고유 색 (연한 틴트 + 진한 같은 색 글씨)
  // v2.37.0 — 옛 업종 이름(베이커리·디저트)은 지도·목록과 똑같이 '맛집'으로 보여 주고,
  //   분류 칩도 '맛집'이 선택된 상태로 보이게 합니다. (예전에는 '베이커리'라 어느 칩도 켜지지 않았음)
  const categoryName = mapLegacyCategory(pin.category) || '맛집';
  // 내 분류 목록에 없는 이름(공유·다른 기기에서 온 핀)도 칩이 사라지지 않게 뒤에 붙입니다.
  //  (훅 규칙 때문에 useMemo 대신 매 렌더 계산 — 목록이 짧아 비용이 없습니다)
  const pickerCategories = allCategories(categories).some((name) => sameCategory(name, categoryName))
    ? categories
    : (Array.isArray(categories) ? categories : []).concat([categoryName]);
  const categoryBadgeBg = categoryTint(categoryName, categories, 0.13);
  const categoryBadgeBorder = categoryTint(categoryName, categories, 0.3);
  const categoryBadgeText = categoryTextColor(categoryName, categories);
  const categoryDot = getCategoryColor(categoryName, categories);
  // v2.19.2 — 상훈 님 요청 "탭 색상과 동일하게 헤더색상을 바꿔줘"
  //   헤더 배경 = 그 핀의 분류 색(getCategoryColor) — 지도 핀·필터 칩·분류 배지와 같은 색
  //   분류를 바꾸면 이 값이 다시 계산되어 헤더 색도 그 자리에서 바뀝니다.
  const headerColor = categoryDot;
  // v2.10 — ✅ 가봤어요 · 📝 한줄 메모
  const visited = pin.visited === true;
  const savedMemo = String(pin.memo || '');
  // v2.20 — 매장 영업 상태. hours 가 없으면 **추측하지 않고** '영업시간 미확인' 으로만 둡니다.
  const opening = evaluateOpening(pin.hours || null);
  const openingKnown = hasConfirmedHours(pin.hours || null);
  // 휴무일에는 요약이 배지와 같은 말('오늘 휴무')이 되므로, 대신 **다음 영업**을 보여 줍니다.
  const openingSummary = !openingKnown
    ? ''
    : opening.state === 'closedToday'
    ? String(opening.sub || '')
    : todaySummary(pin.hours);
  const memoDirty = memoDraft !== savedMemo;
  // v2.30.0 — 상단의 작은 [카카오]·[네이버] 배지가 곧 외부 지도 링크입니다.
  //   영업시간 확인 여부와 상관없이 **항상 두 배지가 보이고 눌립니다** (예전 하단 보조 칩을 위로 올림).
  //   카카오·네이버 외의 출처(구글·오프라인)는 뒤에 작은 회색 배지로만 덧붙입니다.
  const otherProviders = (Array.isArray(pin.providers) && pin.providers.length
    ? pin.providers
    : pin.provider
    ? [pin.provider]
    : []
  ).filter((id) => id !== 'kakao' && id !== 'naver');
  const visitedAtLabel = (() => {
    if (!visited || !pin.visitedAt) return '';
    const date = new Date(pin.visitedAt);
    if (Number.isNaN(date.getTime())) return '';
    return date.getFullYear() + '.' + (date.getMonth() + 1) + '.' + date.getDate();
  })();

  /** v2.0 — 전화번호 원탭 연결 (기기 기본 전화앱의 tel: 링크) */
  const handlePhone = async () => {
    const result = await openPhone(phone);
    if (onToast) {
      if (result.opened) onToast('전화 앱으로 연결했어요 · ' + phone);
      else onToast('이 기기에서는 전화를 걸 수 없어요 · ' + phone);
    }
  };

  /** v2.0 — 주소 원탭 복사 (지도 앱에 붙여넣기) */
  const handleCopyAddress = async () => {
    if (!hasAddress) return;
    try {
      await Clipboard.setStringAsync(address);
      if (onToast) onToast('주소를 복사했어요');
    } catch (e) {
      if (onToast) onToast('주소 복사에 실패했어요');
    }
  };

  const handleMap = async (provider) => {
    const result = await openMap(pin, provider);
    if (onToast) {
      if (result.opened === 'web') {
        onToast(provider === 'naver' ? '네이버지도 웹으로 열었어요' : '카카오맵 웹으로 열었어요');
      } else if (result.opened === 'failed') {
        onToast('지도를 열 수 없어요. 잠시 후 다시 시도해 주세요');
      }
    }
  };

  const handlePlace = () => {
    setPlaceModalOpen(true);
  };

  /**
   * v2.25.0 — 🗺️ 지도에서 보기 (인앱 이동).
   *   · 입력 중이던 한줄 메모는 시트가 닫히기 전에 조용히 저장합니다(쓴 글이 사라지지 않게).
   *   · 열려 있던 레이어를 닫고 지도를 이 핀으로 옮기는 일은 지도 화면(MapScreen)이 맡습니다.
   */
  const handleShowOnMap = () => {
    if (memoDirty && typeof onChangeMemo === 'function') onChangeMemo(pin.id, memoDraft);
    setPlaceModalOpen(false);
    if (typeof onShowOnMap === 'function') onShowOnMap(pin);
  };

  /** v2.10 — ✅ 탭 한 번으로 가봤어요 체크/해제 */
  const handleToggleVisited = () => {
    if (!onToggleVisited) return;
    const next = !visited;
    onToggleVisited(pin.id, next);
    if (onToast) onToast(next ? '가봤어요로 체크했어요 · ' + pin.name : '가봤어요 체크를 해제했어요');
  };

  /** v2.10 — 📝 한줄 메모 저장 (저장 버튼 · 키보드 완료 · 다른 곳을 누를 때) */
  const saveMemo = () => {
    if (!memoDirty) return;
    if (typeof onChangeMemo === 'function') onChangeMemo(pin.id, memoDraft);
    if (onToast) onToast(memoDraft.trim() ? '메모를 저장했어요' : '메모를 지웠어요');
  };

  return (
    <Animated.View
      style={[styles.sheet, { transform: [{ translateY }] }]}
      testID="pin-detail-sheet"
      onLayout={(event) => {
        const height = event && event.nativeEvent && event.nativeEvent.layout
          ? event.nativeEvent.layout.height
          : 0;
        if (Number.isFinite(height) && height > 0) sheetHeightRef.current = height;
      }}
    >
      {/* 헤더 바 — v2.19.2: 상훈 님 요청으로 헤더 배경을 **그 핀의 분류 색**으로 맞췄습니다.
          (맛집 = 딥 틸 #0D9488 · 카페 = 앰버 #D97706 · 가볼곳 = 블루 #3B82F6 · 커스텀 분류 = 각 분류 색)
          분류를 바꾸면 헤더 색도 즉시 따라 바뀌고, 흰 가게 이름·반투명 흰 원 ✕ 는 그대로라
          어떤 분류 색 위에서도 또렷합니다. 시트 위쪽 둥근 모서리도 그대로 이어집니다. */}
      <View
        style={[styles.headerBar, { backgroundColor: headerColor }]}
        testID="pin-sheet-header"
        accessibilityHint="아래로 쓸어내리면 닫혀요"
        {...sheetPan.panHandlers}
      >
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={1}>
            {pin.name}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityLabel="상세 닫기">
            <Ionicons name="close" size={18} color={colors.white} />
          </Pressable>
        </View>
      </View>

      {/* v2.13 — 높아진 시트(가봤어요·한줄 메모·분류·버튼들)가 화면 위로 넘치면
          다크 헤더의 ✕ 닫기 버튼이 아이폰 사파리 상태바 밖으로 잘려 나갔습니다.
          → 헤더는 시트 **상단에 고정**하고, 본문만 스크롤되게 감쌉니다. (sheet maxHeight 86%) */}
      <ScrollView
        {...bodyPan.panHandlers}
        ref={scrollRef}
        style={styles.bodyScroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        testID="pin-sheet-scroll"
        scrollEventThrottle={16}
        onScroll={(event) => {
          const y =
            event && event.nativeEvent && event.nativeEvent.contentOffset
              ? event.nativeEvent.contentOffset.y
              : 0;
          scrollYRef.current = Number.isFinite(y) ? y : 0;
        }}
      >
        <View style={styles.chipRow}>
          <View
            style={[
              styles.chipBrand,
              { backgroundColor: categoryBadgeBg, borderColor: categoryBadgeBorder },
            ]}
            testID="pin-category-badge"
          >
            <View style={[styles.chipDot, { backgroundColor: categoryDot }]} />
            <Text style={[styles.chipBrandText, { color: categoryBadgeText }]}>
              {categoryName}
            </Text>
          </View>
          {!!pin.area && (
            <View style={styles.chipGray}>
              <Text style={styles.chipGrayText}>{pin.area}</Text>
            </View>
          )}
          <View style={styles.chipGray}>
            <Ionicons name="navigate" size={11} color={colors.textSub} />
            <Text style={styles.chipGrayText}>{radiusLabel}</Text>
          </View>
          {hasDistance && !!distanceLabel && (
            <View style={styles.chipLive}>
              <Ionicons name="locate" size={11} color={colors.brandDark} />
              <Text style={styles.chipLiveText}>{'내 위치에서 ' + distanceLabel}</Text>
            </View>
          )}
        </View>

        {/* v2.20 — 🟢 영업 중 / 🟠 브레이크타임 (17:00까지) / 🔴 오늘 휴무 / ⚪ 영업 종료
            + 오늘 영업시간·브레이크타임 요약. 영업시간이 확인되지 않은 매장은 지어내지 않고
              회색 '영업시간 미확인' 한 줄만 둡니다. */}
        <View style={styles.openRow} testID="pin-opening-row">
          {openingKnown ? (
            <View
              style={[
                styles.openBadge,
                opening.state === 'open'
                  ? styles.openBadgeOpen
                  : opening.state === 'break'
                  ? styles.openBadgeBreak
                  : styles.openBadgeClosed,
              ]}
              testID="pin-opening-badge"
            >
              <Text
                style={[
                  styles.openBadgeText,
                  opening.state === 'open'
                    ? styles.openBadgeTextOpen
                    : opening.state === 'break'
                    ? styles.openBadgeTextBreak
                    : styles.openBadgeTextClosed,
                ]}
                numberOfLines={1}
              >
                {opening.text}
              </Text>
            </View>
          ) : (
            <Text style={styles.openUnknown} testID="pin-opening-unknown">
              ⚪ 영업시간 미확인
            </Text>
          )}
          {!!openingSummary && (
            <Text style={styles.openSummary} numberOfLines={1} testID="pin-opening-summary">
              {openingSummary}
            </Text>
          )}
        </View>

        {/* v2.30.0 — 상훈 님 요청: 상단의 작은 [카카오]·[네이버] 배지를 그대로 눌러
            카카오맵·네이버지도로 나갈 수 있게 했습니다. (예전 하단 `네이버지도 / 카카오맵` 칩은 삭제)
            · 영업시간이 확인되지 않은 매장(⚪ 영업시간 미확인)에서도 두 배지는 늘 보입니다.
            · 브랜드 색은 그대로 두되 글자 9px · 아이콘 9px 로 작게 유지해, 아래 주 동작(🗺️ 지도에서 보기)
              보다 눈에 덜 띄게 했습니다. 옆의 ↗ 는 "앱 밖으로 나간다"는 표시입니다. */}
        <View style={styles.mapBadgeRow} testID="pin-map-badges">
          <Pressable
            style={({ pressed }) => [
              styles.mapBadge,
              { backgroundColor: colors.kakao },
              pressed && styles.mapBadgePressed,
            ]}
            onPress={() => handleMap('kakao')}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="카카오맵 열기"
            testID="pin-open-kakao"
          >
            <Text style={[styles.mapBadgeText, { color: colors.kakaoText }]}>카카오</Text>
            <Ionicons name="open-outline" size={9} color={colors.kakaoText} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.mapBadge,
              { backgroundColor: colors.naver },
              pressed && styles.mapBadgePressed,
            ]}
            onPress={() => handleMap('naver')}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="네이버지도 열기"
            testID="pin-open-naver"
          >
            <Text style={[styles.mapBadgeText, { color: colors.naverText }]}>네이버</Text>
            <Ionicons name="open-outline" size={9} color={colors.naverText} />
          </Pressable>
          {otherProviders.length > 0 && <ProviderBadges providers={otherProviders} size="sm" />}
        </View>

        {/* v2.10 — ✅ 가봤어요: 탭 한 번으로 방문 완료 체크/해제
            v2.19.1 — 상훈 님 요청 "장소 상세 화면은 ‘가봤어요’ 체크로 변경 (지금과 반대로)"
            → 미방문일 때도 **빈 체크박스 + `가봤어요`** 로 보이고(라벨이 '아직 안 가봤어요' 로
              뒤집혀 보이지 않게), 체크하면 초록 박스 + `가봤어요 (방문 완료)`. 저장값은 그대로
              `visited` true/false → 지도·목록의 ✓ 표시와 항상 같습니다. */}
        {!readOnly && (
          <Pressable
            style={[styles.visitBtn, visited && styles.visitBtnOn]}
            onPress={handleToggleVisited}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: visited }}
            aria-checked={visited}
            accessibilityLabel={visited ? '가봤어요 체크 해제' : '가봤어요로 체크'}
            testID="pin-visited-toggle"
          >
            <View style={[styles.visitCheck, visited && styles.visitCheckOn]} testID="pin-visited-box">
              {visited ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}
            </View>
            <View style={styles.visitTextWrap}>
              <Text style={[styles.visitText, visited && styles.visitTextOn]} testID="pin-visited-label">
                {visited ? '가봤어요 (방문 완료)' : '가봤어요'}
              </Text>
              <Text style={[styles.visitSub, visited && styles.visitSubOn]} numberOfLines={1}>
                {visited
                  ? (visitedAtLabel ? visitedAtLabel + ' 체크 · 다시 누르면 해제' : '다시 누르면 해제돼요')
                  : '다녀왔으면 눌러서 체크해 두세요'}
              </Text>
            </View>
            <Text style={[styles.visitAction, visited && styles.visitActionOn]}>{visited ? '해제' : '체크'}</Text>
          </Pressable>
        )}

        {/* v2.10 — 📝 한줄 메모 (추천 메뉴·아기의자·웨이팅 팁) */}
        {!readOnly && (
          <View style={styles.memoBox} testID="pin-memo-box">
            <View style={styles.memoHead}>
              <Ionicons name="create-outline" size={13} color={colors.brandDark} />
              <Text style={styles.memoLabel}>한줄 메모</Text>
              <Text style={styles.memoHint}>{memoDirty ? '저장을 누르면 반영돼요' : savedMemo ? '저장됨' : '선택 입력'}</Text>
            </View>
            <TextInput
              style={styles.memoInput}
              value={memoDraft}
              onChangeText={setMemoDraft}
              onBlur={saveMemo}
              onSubmitEditing={saveMemo}
              placeholder="추천 메뉴, 아기의자, 웨이팅 팁 등을 적어두세요"
              placeholderTextColor={colors.textMuted}
              maxLength={120}
              returnKeyType="done"
              accessibilityLabel="한줄 메모"
              testID="pin-memo-input"
            />
            <View style={styles.memoFoot}>
              <Text style={styles.memoCount}>{memoDraft.length}/120 · 검색에도 함께 걸려요</Text>
              <Pressable
                style={[styles.memoSave, !memoDirty && styles.memoSaveOff]}
                onPress={saveMemo}
                disabled={!memoDirty}
                accessibilityRole="button"
                accessibilityLabel="메모 저장"
                testID="pin-memo-save"
              >
                <Text style={[styles.memoSaveText, !memoDirty && styles.memoSaveTextOff]}>저장</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* v2.2 — 저장된 핀의 분류를 바로 바꾸거나 새 분류를 만듭니다 (읽기 전용 핀은 제외) */}
        {!readOnly && (
          <View style={styles.categoryBox}>
            <CategoryPicker
              value={categoryName}
              onChange={(name) => {
                if (typeof onChangeCategory === 'function') onChangeCategory(pin.id, name);
              }}
              categories={pickerCategories}
              onAddCategory={onAddCategory}
              label={'분류'}
              hint={'누르면 바로 바뀌어요'}
              compact
            />
          </View>
        )}

        {pin.menuTags && pin.menuTags.length > 0 && (
          <View style={styles.tagRow}>
            {pin.menuTags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {!!pin.note && (
          <Text style={styles.note} numberOfLines={2}>
            {pin.note}
          </Text>
        )}

        {/* v2.13 — 📸 사진으로 저장한 핀은 원본 링크가 없습니다. 빈 링크 행 대신 출처만 밝힙니다. */}
        {!pin.sourceUrl && pin.platform === 'photo' && (
          <View style={styles.sourceRow} testID="pin-photo-source">
            <View style={styles.sourceIcon}>
              <Ionicons name="image" size={12} color={colors.brand} />
            </View>
            <View style={styles.sourceTextWrap}>
              <Text style={styles.sourceLabel}>{platform}</Text>
              <Text style={styles.sourceUrl}>캡처·사진에서 읽은 가게예요</Text>
            </View>
          </View>
        )}

        {!!pin.sourceUrl && (
          <Pressable
            style={styles.sourceRow}
            onPress={() => openSource(pin.sourceUrl)}
            accessibilityRole="link"
            accessibilityLabel="원본 릴스 열기"
          >
            <View style={styles.sourceIcon}>
              <Ionicons name="play" size={12} color={colors.brand} />
            </View>
            <View style={styles.sourceTextWrap}>
              <Text style={styles.sourceLabel}>{platform}</Text>
              <Text style={styles.sourceUrl} numberOfLines={1}>
                {pin.sourceUrl}
              </Text>
            </View>
            <Ionicons name="open-outline" size={16} color={colors.textMuted} />
          </Pressable>
        )}

        {/* v2.0 — 전화번호(tel: 원탭) · 주소(원탭 복사) */}
        {!!phone && !!telUrlOf(phone) && (
          <Pressable
            style={styles.infoRow}
            onPress={handlePhone}
            accessibilityRole="link"
            accessibilityLabel={'전화 걸기 ' + phone}
          >
            <Ionicons name="call-outline" size={14} color={colors.brandDark} />
            <Text style={styles.infoValue} numberOfLines={1}>
              {phone}
            </Text>
            <Text style={styles.infoAction}>전화</Text>
          </Pressable>
        )}

        <Pressable
          style={styles.infoRow}
          onPress={handleCopyAddress}
          disabled={!hasAddress}
          accessibilityRole="button"
          accessibilityLabel={hasAddress ? '주소 복사' : '주소 미확인'}
        >
          <Ionicons name="location-outline" size={14} color={colors.textMuted} />
          <Text style={styles.infoValue} numberOfLines={1}>
            {hasAddress ? address : '주소 미확인'}
          </Text>
          {hasAddress ? <Text style={styles.infoAction}>복사</Text> : null}
        </Pressable>

        {/* v1.7 — 저장된 매장 페이지가 없어도 가게 이름+동네로 네이버 플레이스를 앱 안에서 엽니다 */}
        <Pressable
          style={styles.placeBtn}
          onPress={handlePlace}
          accessibilityRole="button"
          accessibilityLabel="매장 정보 보기"
        >
          <Ionicons name="storefront-outline" size={15} color={colors.brandDark} />
          <Text style={styles.placeBtnText}>매장 정보 보기</Text>
          <Text style={styles.placeBtnMeta}>{pin.naverPlaceId ? '네이버 플레이스 상세' : '네이버 플레이스'}</Text>
          <Ionicons name="expand-outline" size={14} color={colors.brandDark} />
        </Pressable>

        {/* v2.25.0 — 🗺️ 지도에서 보기: 앱 안에서 이 장소로 지도를 옮깁니다.
            (위쪽의 작은 [카카오]·[네이버] 배지는 지도 **앱**을 밖에서 여는 것이라 역할이 다릅니다) */}
        <Pressable
          style={styles.showOnMapBtn}
          onPress={handleShowOnMap}
          accessibilityRole="button"
          accessibilityLabel="지도에서 보기"
          testID="pin-show-on-map"
        >
          <Text style={styles.showOnMapEmoji}>🗺️</Text>
          <View style={styles.showOnMapTextWrap}>
            <Text style={styles.showOnMapText}>지도에서 보기</Text>
            <Text style={styles.showOnMapSub} numberOfLines={1}>
              상세를 닫고 이 위치로 지도를 옮겨요
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.65)" />
        </Pressable>

        {/* v2.30.0 — 하단 보조 칩(`네이버지도 / 카카오맵`)은 **완전히 삭제**했습니다.
            외부 지도로 나가는 길은 시트 맨 위의 작은 [카카오]·[네이버] 배지 하나뿐이고,
            바닥에는 주 동작 `🗺️ 지도에서 보기` 와 `핀 삭제` 만 남습니다. */}
        {!readOnly && (
          <Pressable style={styles.deleteBtn} onPress={() => onDelete(pin.id)} hitSlop={8}>
            <Ionicons name="trash-outline" size={13} color={colors.textMuted} />
            <Text style={styles.deleteText}>핀 삭제</Text>
          </Pressable>
        )}

        {readOnly && (visited || savedMemo) && (
          <View style={styles.readOnlyInfo}>
            {visited ? (
              <View style={styles.readOnlyVisit}>
                <Ionicons name="checkmark-circle" size={13} color={colors.visit} />
                <Text style={styles.readOnlyVisitText}>가봤어요</Text>
              </View>
            ) : null}
            {savedMemo ? (
              <Text style={styles.readOnlyMemo} numberOfLines={2}>
                {'📝 ' + savedMemo}
              </Text>
            ) : null}
          </View>
        )}

        {readOnly && (
          <Text style={styles.sharedNote}>공유받은 맛집이에요 · 내 지도에 추가하면 저장할 수 있어요</Text>
        )}
      </ScrollView>

      {placeModalOpen && (
        <InAppPlaceModal
          pin={pin}
          onClose={() => setPlaceModalOpen(false)}
          onToast={onToast}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // v2.13 — 화면 높이의 86% 를 넘지 않게 (아이폰 사파리 상태바·주소창 위로 헤더가 밀려나 ✕ 를 못 누르던 문제)
    // v2.37.0 — 92% 로 조금 더 키워, 390×844 에서 흔한 장소 상세 내용(약 760px)이
    //   스크롤 없이 첫 줄부터 끝까지 한 화면에 들어오게 했습니다. (위 8% 는 바깥을 눌러 닫는 자리)
    maxHeight: '92%',
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    ...sheetShadow,
  },
  // 분류 색 헤더 바 — 시트 위쪽 둥근 모서리를 그대로 물려받습니다.
  // 배경색은 분류마다 달라서 인라인으로 받습니다({ backgroundColor: headerColor }).
  headerBar: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    // v2.34.0 — 헤더를 잡고 아래로 끌 때 브라우저 스크롤·줌이 먼저 가로채지 않게 (웹 아이폰 사파리)
    ...(Platform.OS === 'web' ? { cursor: 'grab', touchAction: 'none' } : null),
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    // 주황 헤더 위에서도 보이도록 조금 더 밝은 반투명 흰색
    backgroundColor: 'rgba(255,255,255,0.45)',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    flex: 1,
    ...typography.h2,
    fontSize: 19,
    color: colors.white,
    // v2.19.2 — 앰버(카페)처럼 밝은 분류 색 위에서도 흰 이름이 또렷하게 (얇은 그림자)
    textShadowColor: 'rgba(15,23,42,0.30)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // 헤더(고정) 아래에서 본문만 스크롤 — maxHeight 안에서 줄어들 수 있게 flexShrink
  // v2.37.0 — 웹(react-native-web)에서도 헤더 아래 남은 높이만 차지하고 그 안에서 스크롤되도록
  //   basis·minHeight 를 명시합니다. (본문이 시트 위로 넘쳐 첫 줄이 헤더에 걸리던 원인)
  bodyScroll: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
    minHeight: 0,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 10,
    // v2.28.0 — 상세 시트가 열려 있는 동안 하단 탭바(알약)는 숨겨지므로(App), 예전처럼
    //   `tabBar.floatTop + 10`(76px) 만큼 비워 둘 필요가 없습니다. 손끝 여백만 남깁니다.
    paddingBottom: 24,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  chipBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandSoft2,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipBrandText: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: '800',
  },
  chipGray: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.lineSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipGrayText: {
    color: colors.textSub,
    fontSize: 11,
    fontWeight: '700',
  },
  chipLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipLiveText: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: '800',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    // 주황 배경 위 반투명 흰 원 — 눌러야 할 곳이 한눈에 보입니다.
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // v2.30.0 — 상단 출처 겸 외부 지도 배지 (카카오 · 네이버)
  mapBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  mapBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  mapBadgePressed: {
    opacity: 0.62,
  },
  mapBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  // v2.20 — 영업 상태 줄 (배지 + 오늘 영업시간 요약)
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  openBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  openBadgeOpen: {
    backgroundColor: '#E8F8EE',
    borderColor: '#BBE9CB',
  },
  openBadgeBreak: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FFD9A8',
  },
  openBadgeClosed: {
    backgroundColor: '#F1F3F6',
    borderColor: '#E1E5EC',
  },
  openBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  openBadgeTextOpen: {
    color: '#12833B',
  },
  openBadgeTextBreak: {
    color: '#B45309',
  },
  openBadgeTextClosed: {
    color: '#64748B',
  },
  openUnknown: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  openSummary: {
    flex: 1,
    fontSize: 11,
    color: colors.textSub,
  },

  // v2.10 — ✅ 가봤어요 토글
  visitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  visitBtnOn: {
    borderColor: colors.visitLine,
    backgroundColor: colors.visitSoft,
  },
  visitCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#C4CAD6',
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitCheckOn: {
    borderColor: colors.visit,
    backgroundColor: colors.visit,
  },
  visitTextWrap: { flex: 1, minWidth: 0 },
  visitText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.textSub,
  },
  visitTextOn: {
    color: colors.visitDark,
  },
  visitSub: {
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 1,
  },
  visitSubOn: {
    color: colors.visitDark,
    opacity: 0.75,
  },
  visitAction: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.textSub,
  },
  visitActionOn: {
    color: colors.visitDark,
  },
  // v2.10 — 📝 한줄 메모
  memoBox: {
    marginTop: 9,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    paddingHorizontal: 11,
    paddingTop: 9,
    paddingBottom: 8,
  },
  memoHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  memoLabel: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.brandDark,
  },
  memoHint: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  memoInput: {
    marginTop: 6,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.text,
  },
  memoFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  memoCount: {
    flex: 1,
    fontSize: 9.5,
    fontWeight: '600',
    color: colors.textMuted,
  },
  memoSave: {
    height: 26,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoSaveOff: {
    backgroundColor: colors.lineSoft,
  },
  memoSaveText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
  },
  memoSaveTextOff: {
    color: colors.textMuted,
  },
  readOnlyInfo: {
    marginTop: 10,
    gap: 5,
  },
  readOnlyVisit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.visitSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  readOnlyVisitText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.visitDark,
  },
  readOnlyMemo: {
    ...typography.sub,
    fontSize: 12,
    lineHeight: 17,
  },
  categoryBox: {
    marginTop: 9,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  tag: {
    backgroundColor: '#F1F1F6',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSub,
  },
  note: {
    ...typography.sub,
    fontSize: 12,
    marginTop: 10,
    lineHeight: 18,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 12,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  sourceIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceTextWrap: { flex: 1 },
  sourceLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.brandDark,
    marginBottom: 1,
  },
  sourceUrl: {
    fontSize: 11,
    color: colors.textSub,
  },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
  },
  addrText: {
    ...typography.sub,
    fontSize: 12,
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  infoValue: {
    ...typography.sub,
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.text,
  },
  infoAction: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.brandDark,
  },
  sharedNote: {
    marginTop: 10,
    alignSelf: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  placeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brandSoft2,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 12,
  },
  placeBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.brandDark,
  },
  placeBtnMeta: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: colors.brandDark,
    opacity: 0.7,
    textAlign: 'right',
  },
  // v2.25.0 — 🗺️ 지도에서 보기 (다크 차콜 · 인앱 이동) — 위의 분류 색 헤더와 이어지는 결
  showOnMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.charcoal,
    paddingHorizontal: 12,
  },
  showOnMapEmoji: {
    fontSize: 15,
  },
  showOnMapTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  showOnMapText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  showOnMapSub: {
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.charcoalSub,
    marginTop: 1,
  },
  deleteBtn: {
    marginTop: 6,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  deleteText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
