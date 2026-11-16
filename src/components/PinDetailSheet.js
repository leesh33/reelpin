import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, sheetShadow, tabBar, typography } from '../theme';
import { openMap, openPhone, openSource, telUrlOf } from '../utils/links';
import { formatDistance } from '../services/location';
import InAppPlaceModal from './InAppPlaceModal';
import ProviderBadges from './ProviderBadge';
import CategoryPicker from './CategoryPicker';
import { DEFAULT_CATEGORIES, categoryTextColor, categoryTint, getCategoryColor } from '../utils/categories';
// v2.20 — 지금 영업 중 / 브레이크타임 / 휴무일 배지 (한국 시간 기준 · 확인된 값만)
import { evaluateOpening, hasConfirmedHours, todaySummary } from '../utils/openingStatus';

const PLATFORM_LABEL = {
  instagram: '인스타 릴스',
  youtube: '유튜브 쇼츠',
  tiktok: '틱톡',
  naver: '네이버 블로그',
  search: '가게명으로 찾기',
  // v2.13 — 📸 사진에서 저장 (원본 링크가 없습니다)
  photo: '사진에서 저장',
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
}) {
  // v1.7 — [매장 정보 보기] 는 브라우저 밖으로 나가지 않고 앱 안 모달을 엽니다.
  const [placeModalOpen, setPlaceModalOpen] = useState(false);
  // v2.10 — 📝 한줄 메모는 입력 중인 글자를 따로 들고 있다가 저장할 때 핀에 반영합니다.
  const [memoDraft, setMemoDraft] = useState(String((pin && pin.memo) || ''));

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
  const categoryName = pin.category || '맛집';
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
    <View style={styles.sheet}>
      {/* 헤더 바 — v2.19.2: 상훈 님 요청으로 헤더 배경을 **그 핀의 분류 색**으로 맞췄습니다.
          (맛집 = 코랄 #FF5A36 · 카페 = 민트 #14B8A6 · 가볼곳 = 블루 #3B82F6 · 커스텀 분류 = 각 분류 색)
          분류를 바꾸면 헤더 색도 즉시 따라 바뀌고, 흰 가게 이름·반투명 흰 원 ✕ 는 그대로라
          어떤 분류 색 위에서도 또렷합니다. 시트 위쪽 둥근 모서리도 그대로 이어집니다. */}
      <View style={[styles.headerBar, { backgroundColor: headerColor }]} testID="pin-sheet-header">
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
        style={styles.bodyScroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        testID="pin-sheet-scroll"
      >
        <View style={styles.chipRow}>
          <View
            style={[
              styles.chipCoral,
              { backgroundColor: categoryBadgeBg, borderColor: categoryBadgeBorder },
            ]}
            testID="pin-category-badge"
          >
            <View style={[styles.chipDot, { backgroundColor: categoryDot }]} />
            <Text style={[styles.chipCoralText, { color: categoryBadgeText }]}>
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
              <Ionicons name="locate" size={11} color={colors.coralDark} />
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

        {/* 어느 지도에서 확인된 장소인지 — 두 곳 이상이면 배지가 나란히 붙습니다 */}
        <ProviderBadges item={pin} size="sm" style={styles.badgeRow} />

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
              <Ionicons name="create-outline" size={13} color={colors.coralDark} />
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
              value={pin.category || '맛집'}
              onChange={(name) => {
                if (typeof onChangeCategory === 'function') onChangeCategory(pin.id, name);
              }}
              categories={categories}
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
              <Ionicons name="image" size={12} color={colors.coral} />
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
              <Ionicons name="play" size={12} color={colors.coral} />
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
            <Ionicons name="call-outline" size={14} color={colors.coralDark} />
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
          <Ionicons name="storefront-outline" size={15} color={colors.coralDark} />
          <Text style={styles.placeBtnText}>매장 정보 보기</Text>
          <Text style={styles.placeBtnMeta}>{pin.naverPlaceId ? '네이버 플레이스 상세' : '네이버 플레이스'}</Text>
          <Ionicons name="expand-outline" size={14} color={colors.coralDark} />
        </Pressable>

        <View style={styles.btnRow}>
          <Pressable
            style={[styles.mapBtn, { backgroundColor: colors.naver }]}
            onPress={() => handleMap('naver')}
            accessibilityRole="button"
            accessibilityLabel="네이버지도 열기"
          >
            <Text style={[styles.mapBtnText, { color: colors.white }]}>네이버지도 열기</Text>
          </Pressable>
          <Pressable
            style={[styles.mapBtn, { backgroundColor: colors.kakao }]}
            onPress={() => handleMap('kakao')}
            accessibilityRole="button"
            accessibilityLabel="카카오맵 열기"
          >
            <Text style={[styles.mapBtnText, { color: colors.kakaoText }]}>카카오맵 열기</Text>
          </Pressable>
        </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // v2.13 — 화면 높이의 86% 를 넘지 않게 (아이폰 사파리 상태바·주소창 위로 헤더가 밀려나 ✕ 를 못 누르던 문제)
    maxHeight: '86%',
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
    paddingTop: 10,
    paddingBottom: 14,
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
    // v2.19.2 — 민트(카페)처럼 밝은 분류 색 위에서도 흰 이름이 또렷하게 (얇은 그림자)
    textShadowColor: 'rgba(15,23,42,0.30)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // 헤더(고정) 아래에서 본문만 스크롤 — maxHeight 안에서 줄어들 수 있게 flexShrink
  bodyScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 12,
    // v2.19.2 — 시트가 화면 바닥까지 내려오는데 플로팅 하단바(알약)가 그 위에 떠 있어,
    //   맨 아래 `네이버지도 / 카카오맵 열기` 버튼이 알약에 살짝 가렸습니다.
    //   본문 끝 여백을 알약 높이 + 뜬 간격(tabBar.floatTop) + 10px 만큼 확보합니다.
    paddingBottom: tabBar.floatTop + 10,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  chipCoral: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.coralSoft,
    borderWidth: 1,
    borderColor: colors.coralSoft2,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipCoralText: {
    color: colors.coralDark,
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
    backgroundColor: colors.coralSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipLiveText: {
    color: colors.coralDark,
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
  badgeRow: {
    marginTop: 8,
  },
  // v2.20 — 영업 상태 줄 (배지 + 오늘 영업시간 요약)
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
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
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    marginTop: 10,
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
    color: colors.coralDark,
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
    backgroundColor: colors.coral,
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
    marginTop: 10,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 9,
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
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceTextWrap: { flex: 1 },
  sourceLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.coralDark,
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
    color: colors.coralDark,
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
    marginTop: 12,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.coralSoft2,
    backgroundColor: colors.coralSoft,
    paddingHorizontal: 12,
  },
  placeBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.coralDark,
  },
  placeBtnMeta: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: colors.coralDark,
    opacity: 0.7,
    textAlign: 'right',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  mapBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  deleteBtn: {
    marginTop: 8,
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
