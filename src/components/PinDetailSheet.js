import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, sheetShadow, typography } from '../theme';
import { openMap, openPhone, openSource, telUrlOf } from '../utils/links';
import { formatDistance } from '../services/location';
import InAppPlaceModal from './InAppPlaceModal';
import ProviderBadges from './ProviderBadge';
import CategoryPicker from './CategoryPicker';
import { DEFAULT_CATEGORIES, categoryTextColor, categoryTint, getCategoryColor } from '../utils/categories';

const PLATFORM_LABEL = {
  instagram: '인스타 릴스',
  youtube: '유튜브 쇼츠',
  tiktok: '틱톡',
  naver: '네이버 블로그',
  search: '가게명으로 찾기',
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
  // v2.10 — ✅ 가봤어요 · 📝 한줄 메모
  const visited = pin.visited === true;
  const savedMemo = String(pin.memo || '');
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
      <View style={styles.handle} />

      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.name} numberOfLines={1}>
            {pin.name}
          </Text>
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
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityLabel="상세 닫기">
          <Ionicons name="close" size={18} color={colors.textSub} />
        </Pressable>
      </View>

      {/* 어느 지도에서 확인된 장소인지 — 두 곳 이상이면 배지가 나란히 붙습니다 */}
      <ProviderBadges item={pin} size="sm" style={styles.badgeRow} />

      {/* v2.10 — ✅ 가봤어요: 탭 한 번으로 방문 완료 체크/해제 */}
      {!readOnly && (
        <Pressable
          style={[styles.visitBtn, visited && styles.visitBtnOn]}
          onPress={handleToggleVisited}
          accessibilityRole="button"
          accessibilityState={{ selected: visited }}
          accessibilityLabel={visited ? '가봤어요 체크 해제' : '가봤어요로 체크'}
          testID="pin-visited-toggle"
        >
          <View style={[styles.visitCheck, visited && styles.visitCheckOn]}>
            {visited ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}
          </View>
          <View style={styles.visitTextWrap}>
            <Text style={[styles.visitText, visited && styles.visitTextOn]} testID="pin-visited-label">
              {visited ? '가봤어요' : '아직 안 가봤어요'}
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
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    ...sheetShadow,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  titleWrap: { flex: 1 },
  name: {
    ...typography.h2,
    fontSize: 19,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
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
    backgroundColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    marginTop: 8,
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
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.line,
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
