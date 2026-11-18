/**
 * src/screens/CollectionsScreen.js — v2.19.0 신규 「컬렉션」 탭
 * ─────────────────────────────────────────────────────────────
 * 상훈 님 요청: "컬렉션 메뉴는 너가 추천힌 1번 내용대로 구성"
 *   = 저장한 핀을 **테마·코스별로 묶어 보고, 그 묶음만 지도 보기 / 공유**하는 탭
 *
 *   · 목록 : `+ 새 컬렉션`(이름 + 한 줄 설명 + 테마 이모지 + 포인트 색)
 *            각 카드 = 이모지 · 이름 · 설명 · `N곳 · 가본 곳 M` · 담긴 곳 미리보기
 *            `[지도에서 보기]` `[공유]` `[열기]`
 *   · 상세 : 컬렉션 정보(수정·삭제) + 저장한 내 핀 목록에서 **체크박스로 담기/빼기**
 *            핀 줄의 [지도] 로 그 핀을 지도에서 열기
 *   · 공유 : `📂 컬렉션명 · N곳` + 장소 목록 + 지도 링크(그 핀들만 담은 `?share=` 주소)
 *            → 공유 시트, 없으면 클립보드 복사
 *
 * 데이터는 App 이 들고 있고(기기에 저장), 이 화면은 보여 주고 요청만 합니다.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../components/AppHeader';
// v2.31 — 기획전·공유 컬렉션 미리보기(다른 레이어 팝업과 같은 LayerSheet 틀)
import CollectionPreviewSheet from '../components/CollectionPreviewSheet';
import { shareCollectionSnapshot } from '../services/curation';
import { importSummary } from '../utils/curation';
import {
  COLLECTION_COLORS,
  COLLECTION_EMOJIS,
  COLLECTION_MAX_DESC,
  COLLECTION_MAX_NAME,
  collectionPreviewNames,
  collectionShareText,
  pinsOfCollection,
} from '../utils/collections';
import { buildShareUrl, canNativeShare, nativeShare } from '../utils/shareMap';
import { cardShadow, colors, radius, tabBar, typography } from '../theme';

/**
 * 목록 위쪽 요약 — `3개 컬렉션`
 * v2.31.1 — 상훈 님 요청: "내 컬렉션에서는 2곳 담김 이라는건 빼줘"
 *   → `· N곳 담김` 을 빼고 컬렉션 개수만 남깁니다. (pins 는 옛 호출부 호환용)
 */
export function collectionsHeadline(collections, pins) {
  const list = Array.isArray(collections) ? collections : [];
  return list.length + '개 컬렉션';
}

/** 이모지 + 색 고르는 줄 (새 컬렉션·수정에서 같이 씀) */
function StylePicker({ emoji, color, onChangeEmoji, onChangeColor }) {
  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.fieldLabel}>테마</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiRow}>
        {COLLECTION_EMOJIS.map((e) => {
          const on = emoji === e;
          return (
            <Pressable
              key={e}
              style={[styles.emojiChip, on && styles.emojiChipOn]}
              onPress={() => onChangeEmoji(e)}
              accessibilityRole="button"
              accessibilityLabel={'테마 ' + e}
              accessibilityState={{ selected: on }}
              testID={'collection-emoji-' + e}
            >
              <Text style={styles.emojiText}>{e}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.colorRow}>
        {COLLECTION_COLORS.map((c) => {
          const on = color === c;
          return (
            <Pressable
              key={c}
              style={[styles.colorDot, { backgroundColor: c }, on && styles.colorDotOn]}
              onPress={() => onChangeColor(c)}
              accessibilityRole="button"
              accessibilityLabel={'색 ' + c}
              accessibilityState={{ selected: on }}
              testID={'collection-color-' + c}
            >
              {on ? <Ionicons name="checkmark" size={12} color={colors.white} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function CollectionsScreen({
  pins = [],
  collections = [],
  // v2.31 — 운영자가 올린 배너·기획전 (App 이 불러 옵니다 · 없으면 조용히 숨김)
  banners = [],
  curated = [],
  onImportCurated,
  header,
  onCreateCollection,
  onUpdateCollection,
  onDeleteCollection,
  onToggleCollectionPin,
  onShowCollectionOnMap,
  onOpenPin,
  onGoPaste,
  onToast,
  // v2.28.0 — 새 컬렉션 시트가 열렸는지 App 에게 알려 줍니다(하단 탭바를 숨기기 위해).
  onCreateSheetChange,
  // v2.31.0 — 기획전 미리보기 시트도 같은 이유로 위에 알립니다(담기 버튼을 탭바가 덮지 않게).
  onPreviewSheetChange,
  // 검사·딥링크용 — 열자마자 이 컬렉션의 상세를 보여 줍니다(기본 null)
  initialCollectionId = null,
}) {
  // 'list' — 컬렉션 카드 목록 / 'detail' — 한 컬렉션의 핀 담기·빼기
  const [mode, setMode] = useState(initialCollectionId ? 'detail' : 'list');
  const [detailId, setDetailId] = useState(initialCollectionId || null);
  // 새 컬렉션 시트
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [draftEmoji, setDraftEmoji] = useState(COLLECTION_EMOJIS[0]);
  const [draftColor, setDraftColor] = useState(COLLECTION_COLORS[0]);
  const [draftError, setDraftError] = useState('');
  // 상세 — 이름·설명 수정 / 삭제 확인
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editEmoji, setEditEmoji] = useState(COLLECTION_EMOJIS[0]);
  const [editColor, setEditColor] = useState(COLLECTION_COLORS[0]);
  const [editError, setEditError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false);
  // v2.31 — 기획전 미리보기 + 담는 중
  const [curatedPreview, setCuratedPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  const bannerWidth = Math.max(220, (Number(windowWidth) || 390) - 40);

  /** v2.28.0 — 새 컬렉션 시트가 화면 아래를 덮는 동안 하단 탭바는 숨깁니다. */
  useEffect(() => {
    if (typeof onCreateSheetChange !== 'function') return undefined;
    onCreateSheetChange(creating);
    return () => onCreateSheetChange(false);
  }, [creating, onCreateSheetChange]);

  /** v2.31.0 — 기획전·공유 미리보기 시트가 열린 동안에도 하단 탭바를 숨깁니다. */
  useEffect(() => {
    if (typeof onPreviewSheetChange !== 'function') return undefined;
    onPreviewSheetChange(Boolean(curatedPreview));
    return () => onPreviewSheetChange(false);
  }, [curatedPreview, onPreviewSheetChange]);

  const list = Array.isArray(collections) ? collections : [];
  const detail = useMemo(() => list.find((c) => c.id === detailId) || null, [list, detailId]);

  // 컬렉션이 사라지면(다른 곳에서 삭제) 목록으로 돌아갑니다.
  useEffect(() => {
    if (mode === 'detail' && !detail) {
      setMode('list');
      setDetailId(null);
    }
  }, [mode, detail]);

  const openCreate = useCallback(() => {
    setDraftName('');
    setDraftDesc('');
    setDraftEmoji(COLLECTION_EMOJIS[0]);
    setDraftColor(COLLECTION_COLORS[0]);
    setDraftError('');
    setCreating(true);
  }, []);

  const submitCreate = useCallback(() => {
    if (typeof onCreateCollection !== 'function') return;
    const result = onCreateCollection({
      name: draftName,
      desc: draftDesc,
      emoji: draftEmoji,
      color: draftColor,
    });
    if (!result || !result.ok) {
      setDraftError((result && result.message) || '컬렉션을 만들지 못했어요');
      return;
    }
    setCreating(false);
    if (result.item) {
      setDetailId(result.item.id);
      setMode('detail');
    }
  }, [draftColor, draftDesc, draftEmoji, draftName, onCreateCollection]);

  const openDetail = useCallback((collection) => {
    if (!collection) return;
    setDetailId(collection.id);
    setMode('detail');
    setEditing(false);
    setConfirmDelete(false);
    setEditError('');
  }, []);

  const startEdit = useCallback(() => {
    if (!detail) return;
    setEditName(detail.name);
    setEditDesc(detail.desc || '');
    setEditEmoji(detail.emoji || COLLECTION_EMOJIS[0]);
    setEditColor(detail.color || COLLECTION_COLORS[0]);
    setEditError('');
    setConfirmDelete(false);
    setEditing(true);
  }, [detail]);

  const submitEdit = useCallback(() => {
    if (!detail || typeof onUpdateCollection !== 'function') return;
    const result = onUpdateCollection(detail.id, {
      name: editName,
      desc: editDesc,
      emoji: editEmoji,
      color: editColor,
    });
    if (!result || !result.ok) {
      setEditError((result && result.message) || '컬렉션을 수정하지 못했어요');
      return;
    }
    setEditing(false);
  }, [detail, editColor, editDesc, editEmoji, editName, onUpdateCollection]);

  const removeDetail = useCallback(() => {
    if (!detail || typeof onDeleteCollection !== 'function') return;
    const result = onDeleteCollection(detail.id);
    if (!result || !result.ok) {
      if (onToast) onToast((result && result.message) || '컬렉션을 지우지 못했어요');
      return;
    }
    setConfirmDelete(false);
    setMode('list');
    setDetailId(null);
  }, [detail, onDeleteCollection, onToast]);

  /**
   * 컬렉션 공유 — v2.31 부터는 **서버에 스냅샷을 저장한 링크**(`?col=<shareId>`)를 건넵니다.
   *   · 받는 사람은 링크만 열면 미리보기를 보고 [내 지도에 한 번에 담기] 를 누를 수 있습니다.
   *   · 서버 저장이 안 될 때(설정 전·오프라인)는 예전의 `?share=` 압축 링크로 조용히 대신합니다.
   */
  const shareCollection = useCallback(
    async (collection) => {
      if (!collection || sharing) return;
      const items = pinsOfCollection(collection, pins);
      if (!items.length) {
        if (onToast) onToast('이 컬렉션에 담긴 핀이 없어요 · 먼저 핀을 담아 주세요');
        return;
      }
      setSharing(true);
      try {
        const saved = await shareCollectionSnapshot(collection, items);
        const url = saved.ok ? saved.url : buildShareUrl(items);
        const text = collectionShareText(collection, pins) + '\n' + url;
        if (canNativeShare()) {
          const res = await nativeShare(url, {
            title: collection.emoji + ' ' + collection.name,
            text,
          });
          if (res.shared) {
            if (onToast) {
              onToast(
                saved.ok
                  ? '공유 링크를 보냈어요 · ' + collection.name
                  : '공유 시트를 열었어요 · ' + collection.name
              );
            }
            return;
          }
          if (res.cancelled) return;
        }
        await Clipboard.setStringAsync(text);
        if (onToast) {
          onToast(
            saved.ok
              ? '공유 링크를 복사했어요 · 붙여넣어 보내세요'
              : '컬렉션 ' + items.length + '곳을 복사했어요 · 붙여넣기 하세요'
          );
        }
      } catch (e) {
        if (onToast) onToast('공유하지 못했어요. 다시 시도해 주세요');
      } finally {
        setSharing(false);
      }
    },
    [onToast, pins, sharing]
  );

  /** 배너의 링크 열기 — http(s) 주소만 엽니다 */
  const openBannerLink = useCallback((url) => {
    const target = String(url || '').trim();
    if (!/^https?:\/\//i.test(target)) return;
    try {
      if (typeof Linking !== 'undefined' && Linking && typeof Linking.openURL === 'function') {
        Linking.openURL(target);
        return;
      }
    } catch (e) {
      /* 아래 폴백 */
    }
    try {
      if (typeof window !== 'undefined' && window && typeof window.open === 'function') {
        window.open(target, '_blank', 'noopener');
      }
    } catch (e) {
      if (onToast) onToast('링크를 열지 못했어요');
    }
  }, [onToast]);

  /** 기획전 [담기] — 미리보기 시트 안에서도, 카드에서도 같은 길로 갑니다. */
  const importCurated = useCallback(
    async (item) => {
      if (!item || typeof onImportCurated !== 'function' || importing) return;
      setImporting(true);
      try {
        const result = await onImportCurated(item);
        if (result && result.ok) {
          setCuratedPreview(null);
          if (onToast) onToast(importSummary(result));
        } else if (result && result.message) {
          if (onToast) onToast(result.message);
        }
      } finally {
        setImporting(false);
      }
    },
    [importing, onImportCurated, onToast]
  );

  const showOnMap = useCallback(
    (collection) => {
      if (!collection) return;
      if (typeof onShowCollectionOnMap === 'function') onShowCollectionOnMap(collection);
    },
    [onShowCollectionOnMap]
  );

  // ── 상세: 컬렉션에 담긴 핀 / 아직 안 담긴 핀 수 ──────────────────
  const detailPins = useMemo(() => (detail ? pinsOfCollection(detail, pins) : []), [detail, pins]);
  const detailIdSet = useMemo(() => new Set(detail ? detail.pinIds : []), [detail]);
  const myPinList = useMemo(() => (Array.isArray(pins) ? pins.filter(Boolean) : []), [pins]);

  return (
    <View style={styles.root}>
      <AppHeader badge="컬렉션" {...header} />

      {mode === 'list' ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          testID="collections-list"
        >
          {/* ── v2.31 📌 운영자·스폰서 배너 (켜 둔 배너가 없으면 아예 그리지 않음) ── */}
          {banners.length ? (
            <View style={styles.bannerSection} testID="collections-banners">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={bannerWidth + 10}
                decelerationRate="fast"
                contentContainerStyle={styles.bannerRow}
              >
                {banners.map((banner) => {
                  const hasLink = /^https?:\/\//i.test(String(banner.linkUrl || ''));
                  return (
                    <Pressable
                      key={banner.id}
                      style={[styles.bannerCard, { width: bannerWidth }]}
                      onPress={() => hasLink && openBannerLink(banner.linkUrl)}
                      accessibilityRole={hasLink ? 'link' : 'image'}
                      accessibilityLabel={banner.badge + ' · ' + banner.title}
                      testID={'collections-banner-' + banner.id}
                    >
                      <View style={styles.bannerTop}>
                        <View style={styles.bannerBadge}>
                          <Text style={styles.bannerBadgeText}>{banner.badge || '기획전'}</Text>
                        </View>
                        {hasLink ? (
                          <View style={styles.bannerLinkHint}>
                            <Text style={styles.bannerLinkText}>열기</Text>
                            <Ionicons name="open-outline" size={11} color={colors.charcoalSub} />
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.bannerTitle} numberOfLines={1}>
                        {banner.title}
                      </Text>
                      {!!banner.subtitle && (
                        <Text style={styles.bannerSub} numberOfLines={1}>
                          {banner.subtitle}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {/* ── v2.31 🗂️ 운영자 추천 · 기획전 — 누르면 장소 미리보기 + 한 번에 담기 ── */}
          {curated.length ? (
            <View testID="collections-curated">
              {/* v2.31.1 — 제목은 `내 컬렉션`과 같은 스타일(styles.title) · 오른쪽 `1개` 개수는 뺐습니다 */}
              <View style={styles.sectionRow}>
                <Text style={styles.title}>운영자 추천 · 기획전</Text>
              </View>
              {/* v2.31.1 — 카드가 여러 개면 좌우로 밀어서 봅니다(가로 스크롤 · 스크롤바 숨김) */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.curatedScroll}
                contentContainerStyle={styles.curatedRow}
                testID="collections-curated-row"
              >
                {curated.map((item) => (
                  <View key={item.id} style={styles.curatedCard} testID={'curated-card-' + item.id}>
                    <Pressable
                      style={styles.curatedMain}
                      onPress={() => setCuratedPreview(item)}
                      accessibilityRole="button"
                      accessibilityLabel={item.title + ' 장소 보기'}
                      testID={'curated-open-' + item.id}
                    >
                      <View style={styles.curatedTop}>
                        <View style={[styles.curatedEmoji, { backgroundColor: item.color + '1F' }]}>
                          <Text style={styles.curatedEmojiText}>{item.emoji}</Text>
                        </View>
                        <View style={styles.curatedBadges}>
                          <View style={styles.curatedBadge}>
                            <Text style={styles.curatedBadgeText}>{item.badge || '기획전'}</Text>
                          </View>
                          {!!item.sponsor && (
                            <Text style={styles.curatedSponsor} numberOfLines={1}>
                              {item.sponsor}
                            </Text>
                          )}
                        </View>
                      </View>
                      <Text style={styles.curatedTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.curatedDesc} numberOfLines={2}>
                        {item.description || '장소 ' + item.places.length + '곳을 모았어요'}
                      </Text>
                      <View style={styles.curatedFoot}>
                        <Text style={styles.curatedCount}>{item.places.length}곳</Text>
                        <Text style={styles.curatedNames} numberOfLines={1}>
                          {item.places.slice(0, 2).map((p) => p.name).join(' · ') || '장소 없음'}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      style={styles.curatedAddBtn}
                      onPress={() => importCurated(item)}
                      disabled={importing || !item.places.length}
                      accessibilityRole="button"
                      accessibilityLabel={item.title + ' 내 지도에 담기'}
                      testID={'curated-import-' + item.id}
                    >
                      <Ionicons name="add" size={13} color={colors.white} />
                      <Text style={styles.curatedAddText}>담기</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.headRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title}>내 컬렉션</Text>
              <Text style={styles.sub}>{collectionsHeadline(list, pins)}</Text>
            </View>
            <Pressable
              style={styles.newBtn}
              onPress={openCreate}
              accessibilityRole="button"
              accessibilityLabel="새 컬렉션"
              testID="collection-new"
            >
              <Ionicons name="add" size={15} color={colors.white} />
              <Text style={styles.newBtnText}>새 컬렉션</Text>
            </Pressable>
          </View>

          {!list.length ? (
            <View style={styles.emptyCard} testID="collections-empty">
              <View style={styles.emptyIcon}>
                <Ionicons name="folder-open-outline" size={26} color={colors.brand} />
              </View>
              <Text style={styles.emptyTitle}>아직 컬렉션이 없어요</Text>
              <Text style={styles.emptySub}>
                저장한 핀을 테마·코스별로 묶어 두면{'\n'}그 묶음만 지도에서 보고, 링크 하나로 건넬 수 있어요.
              </Text>
              <Pressable style={styles.emptyBtn} onPress={openCreate} accessibilityRole="button">
                <Ionicons name="add" size={14} color={colors.white} />
                <Text style={styles.emptyBtnText}>첫 컬렉션 만들기</Text>
              </Pressable>
            </View>
          ) : (
            list.map((collection) => {
              const items = pinsOfCollection(collection, pins);
              const preview = collectionPreviewNames(collection, pins, 3);
              const visited = items.filter((p) => p && p.visited === true).length;
              return (
                <View key={collection.id} style={styles.card} testID={'collection-card-' + collection.id}>
                  <Pressable
                    style={styles.cardHead}
                    onPress={() => openDetail(collection)}
                    accessibilityRole="button"
                    accessibilityLabel={collection.name + ' 열기'}
                  >
                    <View style={[styles.cardEmoji, { backgroundColor: collection.color + '1F' }]}>
                      <Text style={styles.cardEmojiText}>{collection.emoji}</Text>
                    </View>
                    <View style={styles.cardText}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {collection.name}
                      </Text>
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {(collection.desc || '설명 없음') +
                          ' · ' + items.length + '곳' + (visited ? ' · 가본 곳 ' + visited : '')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </Pressable>

                  {preview.length ? (
                    <View style={styles.previewRow}>
                      {preview.map((name, i) => (
                        <View key={name + i} style={styles.previewChip}>
                          <Text style={styles.previewText} numberOfLines={1}>
                            {name}
                          </Text>
                        </View>
                      ))}
                      {items.length > preview.length ? (
                        <Text style={styles.previewMore}>{'+' + (items.length - preview.length)}</Text>
                      ) : null}
                    </View>
                  ) : (
                    <Text style={styles.previewEmpty}>아직 담은 핀이 없어요</Text>
                  )}

                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.actionBtn, styles.actionPrimary, !items.length && styles.actionDisabled]}
                      onPress={() => showOnMap(collection)}
                      accessibilityRole="button"
                      accessibilityLabel={collection.name + ' 지도에서 보기'}
                      testID={'collection-map-' + collection.id}
                    >
                      <Ionicons name="map-outline" size={14} color={colors.white} />
                      <Text style={styles.actionPrimaryText}>지도에서 보기</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, !items.length && styles.actionDisabled]}
                      onPress={() => shareCollection(collection)}
                      accessibilityRole="button"
                      accessibilityLabel={collection.name + ' 공유'}
                      testID={'collection-share-' + collection.id}
                    >
                      <Ionicons name="share-social-outline" size={14} color={colors.text} />
                      <Text style={styles.actionText}>공유</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionBtn}
                      onPress={() => openDetail(collection)}
                      accessibilityRole="button"
                      accessibilityLabel={collection.name + ' 핀 담기 · 수정'}
                      testID={'collection-edit-' + collection.id}
                    >
                      <Ionicons name="create-outline" size={14} color={colors.text} />
                      <Text style={styles.actionText}>관리</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}

          <Text style={styles.footer}>컬렉션은 이 기기에 저장돼요 · 핀을 지우면 컬렉션에서도 빠져요</Text>
        </ScrollView>
      ) : null}

      {/* ── 상세 — 한 컬렉션의 핀 담기·빼기 ───────────────────────────── */}
      {mode === 'detail' && detail ? (
        <View style={styles.detailRoot} testID="collection-detail">
          <View style={styles.detailHead}>
            <Pressable
              style={styles.backBtn}
              onPress={() => setMode('list')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="컬렉션 목록으로"
              testID="collection-detail-back"
            >
              <Ionicons name="chevron-back" size={18} color={colors.text} />
              <Text style={styles.backText}>목록</Text>
            </Pressable>
            <Text style={styles.detailTitle} numberOfLines={1}>
              {detail.emoji} {detail.name}
            </Text>
            <View style={styles.detailRight} />
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={[styles.cardEmoji, { backgroundColor: detail.color + '1F' }]}>
                  <Text style={styles.cardEmojiText}>{detail.emoji}</Text>
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {detail.name}
                  </Text>
                  <Text style={styles.cardSub} numberOfLines={2}>
                    {detail.desc || '한 줄 설명이 없어요'} · 담긴 핀 {detailPins.length}곳
                  </Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionBtn, styles.actionPrimary, !detailPins.length && styles.actionDisabled]}
                  onPress={() => showOnMap(detail)}
                  accessibilityRole="button"
                  accessibilityLabel="이 컬렉션만 지도에서 보기"
                  testID="collection-detail-map"
                >
                  <Ionicons name="map-outline" size={14} color={colors.white} />
                  <Text style={styles.actionPrimaryText}>지도에서 보기</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, !detailPins.length && styles.actionDisabled]}
                  onPress={() => shareCollection(detail)}
                  accessibilityRole="button"
                  accessibilityLabel="이 컬렉션 공유"
                  testID="collection-detail-share"
                >
                  <Ionicons name="share-social-outline" size={14} color={colors.text} />
                  <Text style={styles.actionText}>공유</Text>
                </Pressable>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => (editing ? setEditing(false) : startEdit())}
                  accessibilityRole="button"
                  accessibilityLabel={editing ? '수정 취소' : '이름 · 설명 수정'}
                  testID="collection-detail-edit"
                >
                  <Ionicons name={editing ? 'close' : 'create-outline'} size={14} color={colors.text} />
                  <Text style={styles.actionText}>{editing ? '취소' : '수정'}</Text>
                </Pressable>
              </View>

              {editing ? (
                <View style={styles.editBox} testID="collection-edit-form">
                  <Text style={styles.fieldLabel}>이름</Text>
                  <TextInput
                    style={styles.input}
                    value={editName}
                    onChangeText={(t) => {
                      setEditName(t);
                      setEditError('');
                    }}
                    maxLength={COLLECTION_MAX_NAME}
                    autoCorrect={false}
                    returnKeyType="done"
                    accessibilityLabel="컬렉션 이름"
                  />
                  <Text style={styles.fieldLabel}>한 줄 설명</Text>
                  <TextInput
                    style={styles.input}
                    value={editDesc}
                    onChangeText={setEditDesc}
                    maxLength={COLLECTION_MAX_DESC}
                    autoCorrect={false}
                    placeholder="예: 회사 근처 점심 후보"
                    placeholderTextColor={colors.textMuted}
                    accessibilityLabel="컬렉션 설명"
                  />
                  <StylePicker
                    emoji={editEmoji}
                    color={editColor}
                    onChangeEmoji={setEditEmoji}
                    onChangeColor={setEditColor}
                  />
                  {!!editError && <Text style={styles.errorText}>{editError}</Text>}
                  <Pressable
                    style={styles.saveBtn}
                    onPress={submitEdit}
                    accessibilityRole="button"
                    accessibilityLabel="컬렉션 수정 저장"
                    testID="collection-edit-save"
                  >
                    <Text style={styles.saveBtnText}>저장</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.deleteRow}>
                {confirmDelete ? (
                  <>
                    <Text style={styles.deleteWarn}>이 컬렉션을 지울까요? 핀은 지도에 그대로 남아요</Text>
                    <Pressable
                      style={styles.deleteConfirmBtn}
                      onPress={removeDetail}
                      accessibilityRole="button"
                      accessibilityLabel="컬렉션 삭제 확인"
                      testID="collection-delete-confirm"
                    >
                      <Text style={styles.deleteConfirmText}>지우기</Text>
                    </Pressable>
                    <Pressable
                      style={styles.deleteCancelBtn}
                      onPress={() => setConfirmDelete(false)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.deleteCancelText}>취소</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => setConfirmDelete(true)}
                    accessibilityRole="button"
                    accessibilityLabel="컬렉션 삭제"
                    testID="collection-delete"
                  >
                    <Ionicons name="trash-outline" size={13} color={colors.brandDark} />
                    <Text style={styles.deleteBtnText}>컬렉션 지우기</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* 저장한 내 핀 — 체크해서 담기/빼기 */}
            <View style={styles.pinCard}>
              <View style={styles.pinCardHead}>
                <Text style={styles.pinCardTitle}>핀 담기 · 빼기</Text>
                <View style={styles.pinCountChip}>
                  <Text style={styles.pinCountText}>{detailPins.length + ' / ' + myPinList.length}</Text>
                </View>
              </View>
              <Text style={styles.pinHint}>체크하면 이 컬렉션에 담깁니다. 오른쪽 [지도]는 그 핀을 지도에서 열어요.</Text>

              {!myPinList.length ? (
                <View style={styles.pinEmpty}>
                  <Text style={styles.pinEmptyText}>아직 저장한 핀이 없어요.</Text>
                  <Pressable style={styles.pinEmptyBtn} onPress={onGoPaste} accessibilityRole="button">
                    <Text style={styles.pinEmptyBtnText}>핀 저장하러 가기</Text>
                  </Pressable>
                </View>
              ) : (
                myPinList.map((pin) => {
                  const checked = detailIdSet.has(pin.id);
                  return (
                    <View key={pin.id} style={styles.pinRow} testID={'collection-pin-row-' + pin.id}>
                      <Pressable
                        style={styles.pinCheckArea}
                        onPress={() => {
                          if (typeof onToggleCollectionPin === 'function') {
                            onToggleCollectionPin(detail.id, pin.id);
                          }
                        }}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                        // 웹(react-native-web)에서도 aria-checked 가 그대로 나가게 함께 넘깁니다
                        aria-checked={checked}
                        accessibilityLabel={pin.name + (checked ? ' 컬렉션에서 빼기' : ' 컬렉션에 담기')}
                        testID={'collection-pin-check-' + pin.id}
                      >
                        <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                          {checked ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}
                        </View>
                        <View style={styles.pinText}>
                          <Text style={styles.pinName} numberOfLines={1}>
                            {pin.name}
                          </Text>
                          <Text style={styles.pinSub} numberOfLines={1}>
                            {[pin.category, pin.area].filter(Boolean).join(' · ') || '분류 없음'}
                            {pin.visited === true ? ' · 가봤어요' : ''}
                          </Text>
                        </View>
                      </Pressable>
                      <Pressable
                        style={styles.pinMapBtn}
                        onPress={() => onOpenPin && onOpenPin(pin)}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={pin.name + ' 지도에서 열기'}
                        testID={'collection-pin-map-' + pin.id}
                      >
                        <Ionicons name="map-outline" size={14} color={colors.textSub} />
                        <Text style={styles.pinMapText}>지도</Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>

            {detailPins.length ? (
              <View style={styles.orderCard}>
                <Text style={styles.orderTitle}>담은 순서</Text>
                {detailPins.map((pin, index) => (
                  <Pressable
                    key={pin.id}
                    style={styles.orderRow}
                    onPress={() => onOpenPin && onOpenPin(pin)}
                    accessibilityRole="button"
                    accessibilityLabel={pin.name + ' 지도에서 열기'}
                  >
                    <Text style={styles.orderRank}>{index + 1}</Text>
                    <Text style={styles.orderName} numberOfLines={1}>
                      {pin.name}
                    </Text>
                    <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Text style={styles.footer}>컬렉션은 이 기기에 저장돼요 · 핀을 지우면 컬렉션에서도 빠져요</Text>
          </ScrollView>
        </View>
      ) : null}

      {/* ── 새 컬렉션 만들기 시트 ──────────────────────────────────── */}
      {creating ? (
        <View style={styles.sheetLayer} testID="collection-create-sheet">
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => setCreating(false)}
            accessibilityRole="button"
            accessibilityLabel="새 컬렉션 닫기"
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <View style={styles.sheetIcon}>
                <Ionicons name="folder-open" size={15} color={colors.white} />
              </View>
              <Text style={styles.sheetTitle}>새 컬렉션</Text>
              <Pressable
                style={styles.sheetClose}
                onPress={() => setCreating(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="새 컬렉션 닫기"
                testID="collection-create-close"
              >
                <Ionicons name="close" size={17} color={colors.white} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>이름</Text>
              <TextInput
                style={styles.input}
                value={draftName}
                onChangeText={(t) => {
                  setDraftName(t);
                  setDraftError('');
                }}
                placeholder="예: 검단 점심 코스"
                placeholderTextColor={colors.textMuted}
                maxLength={COLLECTION_MAX_NAME}
                autoCorrect={false}
                returnKeyType="done"
                accessibilityLabel="새 컬렉션 이름"
                testID="collection-name-input"
              />
              <Text style={styles.fieldLabel}>한 줄 설명</Text>
              <TextInput
                style={styles.input}
                value={draftDesc}
                onChangeText={setDraftDesc}
                placeholder="예: 회사 근처 12시~1시"
                placeholderTextColor={colors.textMuted}
                maxLength={COLLECTION_MAX_DESC}
                autoCorrect={false}
                accessibilityLabel="새 컬렉션 설명"
                testID="collection-desc-input"
              />
              <StylePicker
                emoji={draftEmoji}
                color={draftColor}
                onChangeEmoji={setDraftEmoji}
                onChangeColor={setDraftColor}
              />
              {!!draftError && <Text style={styles.errorText}>{draftError}</Text>}
              <Pressable
                style={styles.saveBtn}
                onPress={submitCreate}
                accessibilityRole="button"
                accessibilityLabel="컬렉션 만들기"
                testID="collection-create-submit"
              >
                <Text style={styles.saveBtnText}>만들기</Text>
              </Pressable>
              <Text style={styles.sheetHint}>만든 뒤 저장한 핀을 체크해서 담을 수 있어요.</Text>
            </ScrollView>
          </View>
        </View>
      ) : null}

      {/* ── v2.31 🗂️ 기획전 미리보기 — 장소 목록 + [내 지도에 한 번에 담기] ── */}
      <CollectionPreviewSheet
        visible={!!curatedPreview}
        item={curatedPreview}
        onClose={() => setCuratedPreview(null)}
        onImport={importCurated}
        busy={importing}
        extraSub="운영자 추천"
        testID="curated-preview"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    // 플로팅 하단바 아래로 마지막 카드가 가리지 않게
    paddingBottom: tabBar.floatTop + 28,
    gap: 12,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  title: {
    ...typography.h2,
    fontSize: 19,
  },
  sub: {
    ...typography.tiny,
    fontSize: 11.5,
    marginTop: 3,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.brand,
    ...cardShadow,
  },
  newBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  // ── v2.31 📌 배너 · 🗂️ 기획전
  bannerSection: { marginBottom: 2 },
  bannerRow: { gap: 10, paddingRight: 4 },
  bannerCard: {
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 14,
    borderRadius: radius.xl,
    backgroundColor: colors.charcoal,
    gap: 5,
    ...cardShadow,
  },
  bannerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bannerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.brand,
  },
  bannerBadgeText: { color: colors.white, fontSize: 10, fontWeight: '800', letterSpacing: -0.1 },
  bannerLinkHint: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  bannerLinkText: { color: colors.charcoalSub, fontSize: 10, fontWeight: '700' },
  bannerTitle: { color: colors.white, fontSize: 16, fontWeight: '800', letterSpacing: -0.4, marginTop: 2 },
  bannerSub: { color: colors.charcoalSub, fontSize: 11.5, fontWeight: '600' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
  },
  // v2.31.1 — 가로 카드 줄이 제 높이만 차지하게(flexGrow:0) 두고, 넘치는 카드는 잘리지 않고 옆으로 밀립니다.
  //   (웹에서는 `overflow-x:auto` 네이티브 가로 스크롤이 그대로 동작 — `touch-action:pan-x` 를 주면
  //    카드 위에서 세로로 밀 때 화면 스크롤이 막히므로 일부러 넣지 않았습니다)
  curatedScroll: { flexGrow: 0, flexShrink: 0 },
  curatedRow: { gap: 10, paddingRight: 4, paddingBottom: 2 },
  curatedCard: {
    width: 236,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...cardShadow,
  },
  curatedMain: { paddingHorizontal: 13, paddingTop: 12, paddingBottom: 8, gap: 4 },
  curatedTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  curatedEmoji: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  curatedEmojiText: { fontSize: 16 },
  curatedBadges: { flex: 1, minWidth: 0, gap: 2 },
  curatedBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.brandSoft,
  },
  curatedBadgeText: { fontSize: 9.5, fontWeight: '800', color: colors.brandDark },
  curatedSponsor: { fontSize: 9.5, fontWeight: '700', color: colors.textMuted },
  curatedTitle: { ...typography.body, fontSize: 13.5, fontWeight: '800', marginTop: 4 },
  curatedDesc: { ...typography.tiny, fontSize: 11, lineHeight: 16, minHeight: 32 },
  curatedFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  curatedCount: { fontSize: 10.5, fontWeight: '800', color: colors.brandDark },
  curatedNames: { flex: 1, minWidth: 0, fontSize: 10.5, fontWeight: '600', color: colors.textMuted },
  curatedAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 8,
    backgroundColor: colors.charcoal,
  },
  curatedAddText: { color: colors.white, fontSize: 11.5, fontWeight: '800' },
  emptyCard: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 8,
    ...cardShadow,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...typography.h3,
    marginTop: 2,
  },
  emptySub: {
    ...typography.sub,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: colors.textSub,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.charcoal,
  },
  emptyBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  card: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    ...cardShadow,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardEmoji: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEmojiText: {
    fontSize: 20,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    ...typography.body,
    fontSize: 14.5,
    fontWeight: '800',
  },
  cardSub: {
    ...typography.tiny,
    fontSize: 11,
    marginTop: 2,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 10,
  },
  previewChip: {
    maxWidth: 120,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  previewText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textSub,
  },
  previewMore: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.textMuted,
  },
  previewEmpty: {
    ...typography.tiny,
    fontSize: 11,
    marginTop: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  actionPrimary: {
    backgroundColor: colors.charcoal,
    borderColor: colors.charcoal,
    flex: 1.4,
  },
  actionPrimaryText: {
    color: colors.white,
    fontSize: 11.5,
    fontWeight: '800',
  },
  actionText: {
    color: colors.text,
    fontSize: 11.5,
    fontWeight: '800',
  },
  actionDisabled: {
    opacity: 0.55,
  },
  footer: {
    ...typography.tiny,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 6,
  },
  // ── 상세
  detailRoot: {
    flex: 1,
  },
  detailHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    minWidth: 62,
  },
  backText: {
    ...typography.sub,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  detailTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.body,
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 6,
  },
  detailRight: {
    minWidth: 62,
  },
  editBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    gap: 4,
  },
  fieldLabel: {
    ...typography.tiny,
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.textSub,
    marginTop: 6,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.text,
  },
  pickerWrap: {
    marginTop: 4,
  },
  emojiRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  emojiChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emojiChipOn: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  emojiText: {
    fontSize: 18,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  colorDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDotOn: {
    borderWidth: 2,
    borderColor: colors.charcoal,
  },
  saveBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center',
  },
  saveBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  errorText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.brandDark,
    marginTop: 6,
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    flexWrap: 'wrap',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  deleteBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.brandDark,
  },
  deleteWarn: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textSub,
  },
  deleteConfirmBtn: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.brandDark,
  },
  deleteConfirmText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  deleteCancelBtn: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  deleteCancelText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSub,
  },
  pinCard: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    ...cardShadow,
  },
  pinCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pinCardTitle: {
    ...typography.h3,
    fontSize: 14.5,
  },
  pinCountChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.brandSoft,
  },
  pinCountText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.brandDark,
  },
  pinHint: {
    ...typography.tiny,
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 4,
  },
  pinEmpty: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  pinEmptyText: {
    ...typography.sub,
    fontSize: 12,
  },
  pinEmptyBtn: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.charcoal,
  },
  pinEmptyBtnText: {
    color: colors.white,
    fontSize: 11.5,
    fontWeight: '800',
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  pinCheckArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  pinText: {
    flex: 1,
    minWidth: 0,
  },
  pinName: {
    ...typography.body,
    fontSize: 13,
    fontWeight: '700',
  },
  pinSub: {
    ...typography.tiny,
    fontSize: 10.5,
    marginTop: 1,
  },
  pinMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pinMapText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.textSub,
  },
  orderCard: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    ...cardShadow,
  },
  orderTitle: {
    ...typography.tiny,
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.textSub,
    marginBottom: 4,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  orderRank: {
    width: 18,
    fontSize: 11,
    fontWeight: '800',
    color: colors.brand,
  },
  orderName: {
    flex: 1,
    ...typography.body,
    fontSize: 12.5,
    fontWeight: '700',
  },
  // ── 새 컬렉션 시트
  sheetLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 30,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.5)',
  },
  sheet: {
    maxHeight: '82%',
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    overflow: 'hidden',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.charcoal,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 13,
  },
  sheetIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    flex: 1,
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  sheetClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.charcoalPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBody: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 24,
  },
  sheetHint: {
    ...typography.tiny,
    fontSize: 10.5,
    textAlign: 'center',
    marginTop: 10,
  },
});
