/**
 * src/components/LongPressPlaceSheet.js — v2.33.2
 * ─────────────────────────────────────────────────────────────
 * 지도에서 **꾹 누른 자리**에 장소를 등록하는 레이어 팝업.
 *
 * 상훈 님 요청(2026-11-18):
 *   "혹시 지도상에서 꾹 누르면 해당 위치의 장소를 등록 하는 기능은 못 만들까?"
 *   "꾹 누르면 해당장소의 장소명칭 나오면서 등록가능하게 부탁할게"
 *   v2.33.2 — "등록할 때 '가봤어요' 체크도 같이" → ✅ 가봤어요 토글(기본 미체크) 추가
 *
 *   · 위 … 꾹 누른 자리의 **도로명 주소 · 건물명**(카카오 coord2address)
 *   · 가운데 … 반경 60m 안의 **가까운 장소 이름들**(음식점·카페·관광명소·문화시설 · 거리 `12m`)
 *              — 한 줄을 누르면 그 이름·분류·전화·카카오 링크가 그대로 채워집니다
 *   · 아래 … **이름 직접 입력**(주변에 없거나 개인 장소일 때) · 분류 · ✅ 가봤어요 · 한줄 메모 · 컬렉션
 *   · 발끝 … **[내 지도에 저장]** — 앱의 기존 저장 흐름(App.handleSavedPlace)을 그대로 탑니다
 *            (중복은 새 핀을 만들지 않고 그 핀을 열어 줍니다 · 클라우드 동기화도 그대로)
 *
 * 틀은 다른 화면과 같은 `LayerSheet`(다크 차콜 헤더 · 제목 + ✕ · 바깥 탭 닫기)이고,
 * 헤더에 보조 텍스트를 두지 않는 v2.32.2 규칙을 그대로 지킵니다.
 * 높이는 70% — 시트 위로 꾹 누른 자리의 **떨어진 핀**이 보이도록 지도가 그만큼 남습니다.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LayerSheet from './LayerSheet';
import CategoryPicker from './CategoryPicker';
import { colors, radius, typography } from '../theme';
import { DEFAULT_CATEGORIES, getCategoryColor } from '../utils/categories';
import {
  NEARBY_PLACE_LIMIT,
  addressDetailOf,
  addressLabelOf,
  buildLongPressPin,
  nearbyPlaceRows,
  placeDistanceLabel,
  suggestedCategoryOf,
  suggestedNameOf,
  visitedToggleText,
} from '../utils/longPressPlace';

/** 이 시트의 높이 — 위쪽 지도에 떨어진 핀이 보이게 86% 보다 낮춥니다. */
export const PLACE_SHEET_HEIGHT = '70%';

/** 안내 문구 */
export const PLACE_LOOKUP_FAILED =
  '주변 장소를 확인하지 못했어요 · 이름을 직접 적어 저장할 수 있어요';

export default function LongPressPlaceSheet({
  visible = true,
  point = null,
  loading = false,
  result = null,
  error = '',
  categories = DEFAULT_CATEGORIES,
  collections = [],
  onClose,
  onSave,
  onRetry,
}) {
  const rows = useMemo(() => nearbyPlaceRows(result, NEARBY_PLACE_LIMIT), [result]);
  const address = result && result.address ? result.address : null;
  // 첫 렌더부터 제안 이름·분류로 채워 둡니다(결과가 이미 있으면 곧바로 보이고,
  // SSR 에서도 빈 칸이 아니라 제안이 그려집니다). 이후 결과가 바뀌면 아래 효과가 다시 채웁니다.
  const [selectedId, setSelectedId] = useState(() => (rows[0] ? String(rows[0].id || '') : ''));
  const [name, setName] = useState(() => suggestedNameOf(result));
  const [category, setCategory] = useState(() => suggestedCategoryOf(result));
  const [memo, setMemo] = useState('');
  const [collectionId, setCollectionId] = useState('');
  // v2.33.2 — ✅ 가봤어요. 기본은 미체크(`안 가봄`)이고, 새 자리를 꾹 누를 때마다 풀립니다.
  const [visited, setVisited] = useState(false);
  // 꾹 누른 뒤 결과가 늦게 와도 **사용자가 먼저 적은 이름·분류를 덮어쓰지 않습니다.**
  const touchedRef = useRef(false);

  // 새 자리를 꾹 누르면(result 가 새로 오면) 고른 값들을 그 자리 기준으로 다시 채웁니다.
  const resultKey = useMemo(() => {
    if (!result) return '';
    const first = rows[0];
    return [
      point ? Number(point.lat).toFixed(6) + ',' + Number(point.lng).toFixed(6) : '',
      first ? first.id : '',
      addressLabelOf(address),
    ].join('|');
  }, [result, rows, point, address]);

  useEffect(() => {
    const first = rows[0] || null;
    setSelectedId(first ? String(first.id || '') : '');
    if (!touchedRef.current) {
      setName(suggestedNameOf(result));
      setCategory(suggestedCategoryOf(result));
    }
    setMemo('');
    setCollectionId('');
    setVisited(false);
    touchedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);

  if (!visible || !point) return null;

  const canSave = Boolean(String(name || '').trim());
  const selectedPlace = rows.find((row) => String(row.id) === String(selectedId)) || null;
  const visitedText = visitedToggleText(visited);

  const choosePlace = (place) => {
    if (!place) return;
    setSelectedId(String(place.id || ''));
    setName(String(place.name || '').trim());
    setCategory(suggestedCategoryOf({ places: [place] }));
    touchedRef.current = true;
  };

  const changeName = (text) => {
    const value = String(text || '');
    setName(value);
    touchedRef.current = true;
    // 이름을 직접 고치면 목록 선택은 풀립니다(내가 적은 이름으로 저장).
    if (selectedPlace && value.trim() !== String(selectedPlace.name || '').trim()) setSelectedId('');
  };

  const submit = () => {
    if (!canSave || typeof onSave !== 'function') return;
    const pin = buildLongPressPin({
      name,
      category,
      memo,
      point,
      place: selectedPlace,
      address,
      visited,
    });
    if (!pin) return;
    onSave(pin, { collectionId: collectionId || '' });
  };

  const addressText = addressLabelOf(address);
  const addressDetail = addressDetailOf(address);
  // 주소를 못 찾았을 때는 좌표를 그대로 보여 줍니다 — "여기가 어디인지" 확인할 마지막 단서.
  const latText = Number(point && point.lat);
  const lngText = Number(point && point.lng);
  const pointText =
    Number.isFinite(latText) && Number.isFinite(lngText)
      ? '위도 ' + latText.toFixed(5) + ' · 경도 ' + lngText.toFixed(5)
      : '';

  return (
    <LayerSheet
      visible
      onClose={onClose}
      icon="pin"
      title="이 위치에 장소 등록"
      closeLabel="장소 등록 닫기"
      height={PLACE_SHEET_HEIGHT}
      overlayTestID="longpress-place-overlay"
      testID="longpress-place-sheet"
      headerTestID="longpress-place-header"
      closeTestID="longpress-place-close"
      zIndex={44}
      footer={
        <View style={styles.footer}>
          <Pressable
            style={[styles.saveBtn, !canSave && styles.saveBtnOff]}
            onPress={submit}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel="내 지도에 저장"
            accessibilityState={{ disabled: !canSave }}
            testID="longpress-place-save"
          >
            <Ionicons name="pin" size={16} color={colors.white} />
            <Text style={styles.saveText}>내 지도에 저장</Text>
          </Pressable>
        </View>
      }
    >
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ① 꾹 누른 자리의 주소 */}
        <View style={styles.addressCard} testID="longpress-address">
          <View style={styles.addressIcon}>
            <Ionicons name="location" size={15} color={colors.white} />
          </View>
          <View style={styles.addressTextWrap}>
            <Text style={styles.addressLabel} numberOfLines={2}>
              {loading ? '주소를 확인하고 있어요…' : addressText || '주소를 찾지 못했어요'}
            </Text>
            {!!addressDetail && (
              <Text style={styles.addressDetail} numberOfLines={1}>
                {addressDetail}
              </Text>
            )}
            {!loading && !addressText && !!pointText && (
              <Text style={styles.addressDetail} numberOfLines={1} testID="longpress-coords">
                {pointText}
              </Text>
            )}
          </View>
          <View style={styles.pointChip}>
            <Text style={styles.pointChipText}>꾹 누른 자리</Text>
          </View>
        </View>

        {loading && (
          <View style={styles.loadingRow} testID="longpress-loading">
            <ActivityIndicator color={colors.brand} size="small" />
            <Text style={styles.loadingText}>주변 장소 이름을 찾고 있어요</Text>
          </View>
        )}

        {!loading && !!error && (
          <View style={styles.noticeRow} testID="longpress-error">
            <Ionicons name="alert-circle" size={13} color={colors.brandDark} />
            <Text style={styles.noticeText}>{error}</Text>
            {typeof onRetry === 'function' && (
              <Pressable
                style={styles.retryBtn}
                onPress={onRetry}
                accessibilityRole="button"
                accessibilityLabel="주변 장소 다시 찾기"
              >
                <Text style={styles.retryText}>다시</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ② 반경 60m 안의 장소 — 누르면 이름·분류가 채워집니다 */}
        {!loading && rows.length > 0 && (
          <View style={styles.section} testID="longpress-nearby">
            <Text style={styles.sectionTitle}>
              {'주변 ' + NEARBY_PLACE_LIMIT + '곳 안 장소'}
            </Text>
            {rows.map((place) => {
              const on = String(place.id) === String(selectedId);
              const dot = getCategoryColor(suggestedCategoryOf({ places: [place] }), categories);
              return (
                <Pressable
                  key={String(place.id || place.name)}
                  style={[styles.placeRow, on && styles.placeRowOn]}
                  onPress={() => choosePlace(place)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  accessibilityLabel={
                    place.name + (place.categoryGroupName ? ' · ' + place.categoryGroupName : '')
                  }
                  testID={'longpress-place-row-' + String(place.id || place.name)}
                >
                  <View style={[styles.placeDot, { backgroundColor: dot }]} />
                  <View style={styles.placeTextWrap}>
                    <Text style={styles.placeName} numberOfLines={1}>
                      {place.name}
                    </Text>
                    <Text style={styles.placeMeta} numberOfLines={1}>
                      {[place.categoryGroupName, place.distance != null ? placeDistanceLabel(place.distance) : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  {on ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.brand} />
                  ) : (
                    <Text style={styles.placeDistance}>
                      {place.distance != null ? placeDistanceLabel(place.distance) : ''}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {!loading && !error && rows.length === 0 && (
          <Text style={styles.emptyText} testID="longpress-empty">
            주변에 등록된 장소가 없어요 · 아래에 이름을 적어 바로 저장할 수 있어요
          </Text>
        )}

        {/* ③ 이름 직접 입력 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>이름</Text>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={changeName}
            placeholder="장소 이름 (예: 단골 국밥집 · 우리집 앞 주차장)"
            placeholderTextColor={colors.textMuted}
            maxLength={40}
            autoCorrect={false}
            returnKeyType="done"
            accessibilityLabel="장소 이름"
            testID="longpress-name-input"
          />
          {!!selectedPlace && (
            <Text style={styles.selectedHint} numberOfLines={1}>
              {'목록에서 고른 장소 · ' + selectedPlace.name}
            </Text>
          )}
        </View>

        {/* ④ ✅ 가봤어요 — 이미 다녀온 곳이면 저장과 함께 방문 완료로 (상세 시트와 같은 결)
            · 기본은 미체크(`가봤어요` · 빈 체크박스) · 꾹 누른 자리가 바뀌면 다시 풀립니다. */}
        <Pressable
          style={[styles.visitBtn, visited && styles.visitBtnOn]}
          onPress={() => setVisited((prev) => prev !== true)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: visited }}
          aria-checked={visited}
          accessibilityLabel={visited ? '가봤어요 체크 해제' : '가봤어요로 체크'}
          testID="longpress-visited-toggle"
        >
          <View style={[styles.visitCheck, visited && styles.visitCheckOn]} testID="longpress-visited-box">
            {visited ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}
          </View>
          <View style={styles.visitTextWrap}>
            <Text style={[styles.visitText, visited && styles.visitTextOn]} testID="longpress-visited-label">
              {visitedText.label}
            </Text>
            <Text style={[styles.visitSub, visited && styles.visitSubOn]} numberOfLines={1}>
              {visitedText.sub}
            </Text>
          </View>
          <Text style={[styles.visitAction, visited && styles.visitActionOn]}>{visitedText.action}</Text>
        </Pressable>

        {/* ⑤ 분류 · 한줄 메모 · 컬렉션 */}
        <CategoryPicker
          value={category}
          onChange={setCategory}
          categories={categories}
          label="분류"
          compact
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>한줄 메모</Text>
          <TextInput
            style={styles.memoInput}
            value={memo}
            onChangeText={setMemo}
            placeholder="선택 · 예: 아기의자 있음, 웨이팅 20분"
            placeholderTextColor={colors.textMuted}
            maxLength={80}
            accessibilityLabel="한줄 메모"
            testID="longpress-memo-input"
          />
        </View>

        {Array.isArray(collections) && collections.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>컬렉션</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.collectionRow}>
              <Pressable
                style={[styles.collectionChip, !collectionId && styles.collectionChipOn]}
                onPress={() => setCollectionId('')}
                accessibilityRole="radio"
                accessibilityState={{ selected: !collectionId }}
                accessibilityLabel="컬렉션에 담지 않음"
              >
                <Text style={[styles.collectionText, !collectionId && styles.collectionTextOn]}>담지 않음</Text>
              </Pressable>
              {collections.map((collection) => {
                const on = String(collection.id) === String(collectionId);
                return (
                  <Pressable
                    key={collection.id}
                    style={[styles.collectionChip, on && styles.collectionChipOn]}
                    onPress={() => setCollectionId(String(collection.id))}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={'컬렉션 ' + collection.name}
                  >
                    <Text style={[styles.collectionText, on && styles.collectionTextOn]} numberOfLines={1}>
                      {(collection.emoji ? collection.emoji + ' ' : '') + collection.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </LayerSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 22,
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandSoft2,
  },
  addressIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  addressLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  addressDetail: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSub,
  },
  pointChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.brandSoft2,
  },
  pointChipText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.brandDark,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 2,
  },
  loadingText: {
    ...typography.sub,
    fontSize: 12,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  noticeText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.brandDark,
    lineHeight: 16,
  },
  retryBtn: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.brandDark,
  },
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    marginBottom: 7,
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.textSub,
    letterSpacing: -0.1,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    marginBottom: 6,
  },
  placeRowOn: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  placeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  placeTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  placeName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  placeMeta: {
    marginTop: 1,
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.textMuted,
  },
  placeDistance: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.brandDark,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textMuted,
    lineHeight: 16,
  },
  nameInput: {
    height: 46,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  selectedHint: {
    marginTop: 5,
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.textMuted,
  },
  // v2.33.2 — ✅ 가봤어요 토글 (PinDetailSheet 의 같은 카드와 같은 결)
  visitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 14,
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
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSub,
  },
  visitTextOn: {
    color: colors.visitDark,
  },
  visitSub: {
    marginTop: 1,
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.textMuted,
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
  memoInput: {
    height: 42,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.text,
  },
  collectionRow: {
    gap: 6,
    paddingRight: 6,
  },
  collectionChip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 180,
  },
  collectionChipOn: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  collectionText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSub,
  },
  collectionTextOn: {
    color: colors.white,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
  },
  saveBtnOff: {
    backgroundColor: '#C7CDD6',
  },
  saveText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.2,
  },
});
