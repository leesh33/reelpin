/**
 * src/components/FeedbackBoardModal.js — v2.23 💬 제안 · 버그 제보 게시판
 * ─────────────────────────────────────────────────────────────
 * 상훈 님 요청(2026-11-17): "제안/버그 제보 게시판 있으면 좋겠다"
 *
 * 어디서 열리나
 *   내 정보(☰ 시트) → 💬 제안 · 버그 제보  (ProfileScreen 의 `profile-row-feedback`)
 *
 * 생김새 — 다른 레이어 팝업(내 정보 · 돋보기 · 알림 모음 · 목록 보기)과 **같은 틀**입니다.
 *   · `LayerSheet`(높이 86% · 딤 · 둥근 위 모서리 · 다크 차콜 헤더 · 바깥 탭 닫기)
 *   · 머리 : 💬 제안 · 버그 제보 / 기능 아이디어 · 버그 신고 · 공감
 *            글쓰기로 들어가면 같은 자리가 `‹` + `글쓰기` 로 바뀝니다
 *   · 본문 : 💡 기능 제안 | 🐛 버그 제보 2탭 · `최신순 | 공감순` · ✍️ 글쓰기
 *            카드마다 상태 배지(접수됨/반영됨/수정됨) · 작성자 · 상대 시각 · 앱 버전 · 👍 공감
 *   · 글쓰기 : 제목 2~80자 · 내용 5~1200자 · 닉네임(로그인하면 이름이 미리 채워짐 · 비우면 익명)
 *              30초 쿨다운 · 빈 글/너무 긴 글 차단 (DB RLS 가 한 번 더 확인)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import LayerSheet from './LayerSheet';
import {
  APP_VERSION_NAME,
  FEEDBACK_KINDS,
  FEEDBACK_LIMITS,
  FEEDBACK_SORTS,
  FEEDBACK_STATUS,
  countByKind,
  cooldownLabel,
  cooldownRemaining,
  fetchFeedback,
  kindInfo,
  likeFeedback,
  loadLastPostAt,
  loadLikedIds,
  normalizeAuthor,
  relativeTime,
  saveLastPostAt,
  saveLikedId,
  statusInfo,
  submitFeedback,
  validateFeedback,
} from '../services/feedback';

/** 상태 배지 색 — 접수됨(회색) · 반영됨(코랄) · 수정됨(초록) */
const STATUS_STYLE = {
  open: { bg: colors.lineSoft, fg: colors.mutedBadgeText },
  applied: { bg: colors.coralSoft, fg: colors.coralDark },
  fixed: { bg: colors.visitSoft, fg: colors.visitDark },
};

function StatusBadge({ status }) {
  const info = statusInfo(status);
  const tone = STATUS_STYLE[info.id] || STATUS_STYLE.open;
  return (
    <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.statusText, { color: tone.fg }]}>{info.label}</Text>
    </View>
  );
}

function FeedbackCard({ item, liked, onLike, busy }) {
  const kind = kindInfo(item.kind);
  return (
    <View style={styles.card} testID={'feedback-card-' + item.id}>
      <View style={styles.cardHead}>
        <Text style={styles.cardKind} numberOfLines={1}>
          {kind.emoji} {kind.label}
        </Text>
        <StatusBadge status={item.status} />
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.cardContent} numberOfLines={4}>
        {item.content}
      </Text>

      <View style={styles.cardFoot}>
        <View style={styles.cardMeta}>
          <Text style={styles.cardAuthor} numberOfLines={1}>
            {item.author}
          </Text>
          <Text style={styles.cardMetaText}>
            {relativeTime(item.createdAt)}
            {item.appVersion ? ' · v' + item.appVersion.replace(/^v/i, '') : ''}
          </Text>
        </View>
        <Pressable
          style={[styles.likeBtn, liked && styles.likeBtnOn]}
          onPress={() => onLike(item)}
          disabled={busy || liked}
          accessibilityRole="button"
          accessibilityLabel={liked ? '공감했어요' : '공감하기'}
          testID={'feedback-like-' + item.id}
        >
          <Text style={[styles.likeText, liked && styles.likeTextOn]}>👍 공감</Text>
          <Text style={[styles.likeCount, liked && styles.likeTextOn]}>{item.likes}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function FeedbackBoardModal({
  visible = false,
  onClose,
  userEmail = '',
  userName = '',
  onToast = null,
  zIndex = 48,
}) {
  const [kind, setKind] = useState('idea');
  const [sort, setSort] = useState('latest');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [author, setAuthor] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [likedIds, setLikedIds] = useState([]);
  const [likeBusy, setLikeBusy] = useState(false);
  const [cooldownMs, setCooldownMs] = useState(0);

  const requestRef = useRef(0);
  const toast = useCallback(
    (message) => {
      if (typeof onToast === 'function') onToast(message);
    },
    [onToast]
  );

  const load = useCallback(async () => {
    requestRef.current += 1;
    const ticket = requestRef.current;
    setLoading(true);
    setError('');
    const res = await fetchFeedback({ kind, sort });
    if (ticket !== requestRef.current) return;
    setLoading(false);
    if (!res.ok) {
      setItems([]);
      setError(res.message || '글을 불러오지 못했어요.');
      return;
    }
    setItems(res.items);
  }, [kind, sort]);

  // 열 때마다 · 탭/정렬을 바꿀 때마다 새로 읽습니다.
  useEffect(() => {
    if (!visible) return;
    load();
  }, [visible, load]);

  // 시트를 닫으면 글쓰기·입력은 다음에 열 때 비워 둡니다.
  useEffect(() => {
    if (visible) return;
    setComposing(false);
    setTitle('');
    setContent('');
    setAuthor('');
    setFormError('');
  }, [visible]);

  // 이 기기에서 이미 공감한 글 + 마지막 작성 시각
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    (async () => {
      const [ids, lastAt] = await Promise.all([loadLikedIds(), loadLastPostAt()]);
      if (!alive) return;
      setLikedIds(ids);
      setCooldownMs(cooldownRemaining(lastAt));
    })();
    return () => {
      alive = false;
    };
  }, [visible]);

  // 쿨다운 남은 시간을 1초씩 줄여 안내합니다.
  useEffect(() => {
    if (!cooldownMs) return undefined;
    const timer = setInterval(() => {
      setCooldownMs((ms) => (ms > 1000 ? ms - 1000 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownMs]);

  const counts = useMemo(() => countByKind(items), [items]);
  const current = useMemo(() => kindInfo(kind), [kind]);
  const titleLength = title.trim().length;
  const contentLength = content.trim().length;

  const openCompose = useCallback(() => {
    setFormError('');
    setTitle('');
    setContent('');
    setAuthor(normalizeAuthor(userName) === '익명' ? '' : String(userName || '').trim().slice(0, FEEDBACK_LIMITS.authorMax));
    setComposing(true);
  }, [userName]);

  const closeCompose = useCallback(() => {
    setComposing(false);
    setFormError('');
  }, []);

  const doLike = useCallback(
    async (item) => {
      if (!item || likedIds.indexOf(item.id) >= 0 || likeBusy) return;
      setLikeBusy(true);
      const res = await likeFeedback(item.id);
      setLikeBusy(false);
      if (!res.ok) {
        toast(res.message || '공감하지 못했어요');
        return;
      }
      const stored = await saveLikedId(item.id);
      setLikedIds(stored);
      setItems((list) =>
        list.map((row) => (row.id === item.id ? { ...row, likes: res.likes || row.likes + 1 } : row))
      );
    },
    [likedIds, likeBusy, toast]
  );

  const send = useCallback(async () => {
    if (submitting) return;
    const checked = validateFeedback({ kind, title, content, author });
    if (!checked.ok) {
      setFormError(checked.message);
      return;
    }
    const remaining = cooldownRemaining(await loadLastPostAt());
    if (remaining > 0) {
      setCooldownMs(remaining);
      setFormError('조금 전에 올렸어요. ' + cooldownLabel(remaining) + ' 뒤에 다시 남겨 주세요.');
      return;
    }
    setFormError('');
    setSubmitting(true);
    const res = await submitFeedback(
      { kind: checked.values.kind, title: checked.values.title, content: checked.values.content, author: checked.values.author },
      { email: userEmail, appVersion: APP_VERSION_NAME }
    );
    setSubmitting(false);
    if (!res.ok) {
      setFormError(res.message || '글을 올리지 못했어요.');
      return;
    }
    const at = Date.now();
    await saveLastPostAt(at);
    setCooldownMs(cooldownRemaining(at));
    setComposing(false);
    setTitle('');
    setContent('');
    setAuthor('');
    if (res.item && res.item.kind === kind) {
      setItems((list) => [res.item, ...list]);
    }
    toast(res.message || '제보를 남겼어요. 고맙습니다!');
    load();
  }, [submitting, kind, title, content, author, userEmail, toast, load]);

  const renderCompose = () => (
    <ScrollView
      style={styles.body}
      contentContainerStyle={styles.composeBody}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      testID="feedback-compose"
    >
      <View style={styles.composeKindRow}>
        <Text style={styles.composeKind}>
          {current.emoji} {current.label}
        </Text>
        {cooldownMs > 0 ? (
          <Text style={styles.composeCooldown}>연속 작성 {cooldownLabel(cooldownMs)} 대기</Text>
        ) : null}
      </View>

      <View style={styles.fieldHead}>
        <Text style={styles.fieldLabel}>제목</Text>
        <Text style={styles.fieldCount}>
          {titleLength}/{FEEDBACK_LIMITS.titleMax}
        </Text>
      </View>
      <TextInput
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          setFormError('');
        }}
        placeholder={current.placeholderTitle}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        maxLength={FEEDBACK_LIMITS.titleMax}
        returnKeyType="next"
        accessibilityLabel="제목"
        testID="feedback-title-input"
      />

      <View style={styles.fieldHead}>
        <Text style={styles.fieldLabel}>내용</Text>
        <Text style={styles.fieldCount}>
          {contentLength}/{FEEDBACK_LIMITS.contentMax}
        </Text>
      </View>
      <TextInput
        value={content}
        onChangeText={(text) => {
          setContent(text);
          setFormError('');
        }}
        placeholder={current.placeholderContent}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, styles.inputMultiline]}
        multiline
        textAlignVertical="top"
        maxLength={FEEDBACK_LIMITS.contentMax}
        accessibilityLabel="내용"
        testID="feedback-content-input"
      />

      <View style={styles.fieldHead}>
        <Text style={styles.fieldLabel}>닉네임</Text>
        <Text style={styles.fieldCount}>비우면 익명</Text>
      </View>
      <TextInput
        value={author}
        onChangeText={(text) => {
          setAuthor(text);
          setFormError('');
        }}
        placeholder="익명"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        maxLength={FEEDBACK_LIMITS.authorMax}
        accessibilityLabel="닉네임"
        testID="feedback-author-input"
      />

      {!!formError && (
        <View style={styles.formError} testID="feedback-form-error">
          <Ionicons name="alert-circle" size={13} color="#B42318" />
          <Text style={styles.formErrorText}>{formError}</Text>
        </View>
      )}

      <Pressable
        style={[styles.submitBtn, submitting && styles.submitBtnBusy]}
        onPress={send}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel="등록"
        testID="feedback-submit"
      >
        {submitting ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <Text style={styles.submitText}>등록</Text>
        )}
      </Pressable>

      <View style={styles.composeNotice}>
        <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
        <Text style={styles.composeNoticeText}>
          남겨 주신 글은 게시판에 공개돼요. 연락처·주소 같은 개인정보는 적지 말아 주세요.
        </Text>
      </View>
    </ScrollView>
  );

  const renderList = () => (
    <>
      <View style={styles.toolbar}>
        <View style={styles.tabs}>
          {FEEDBACK_KINDS.map((k) => {
            const on = kind === k.id;
            const count = k.id === 'idea' ? counts.idea : counts.bug;
            return (
              <Pressable
                key={k.id}
                style={[styles.tab, on && styles.tabOn]}
                onPress={() => {
                  setKind(k.id);
                  setFormError('');
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={k.label}
                testID={'feedback-tab-' + k.id}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>
                  {k.emoji} {k.label}
                </Text>
                <View style={[styles.tabCount, on && styles.tabCountOn]}>
                  <Text style={[styles.tabCountText, on && styles.tabCountTextOn]}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.sortRow}>
        <View style={styles.sortGroup}>
          {FEEDBACK_SORTS.map((s) => {
            const on = sort === s.id;
            return (
              <Pressable
                key={s.id}
                style={[styles.sortBtn, on && styles.sortBtnOn]}
                onPress={() => setSort(s.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={s.label}
                testID={'feedback-sort-' + s.id}
              >
                <Text style={[styles.sortText, on && styles.sortTextOn]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          style={styles.writeBtn}
          onPress={openCompose}
          accessibilityRole="button"
          accessibilityLabel="글쓰기"
          testID="feedback-write"
        >
          <Ionicons name="create-outline" size={14} color={colors.white} />
          <Text style={styles.writeText}>글쓰기</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.listBody}
        showsVerticalScrollIndicator={false}
        testID="feedback-list"
      >
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={colors.coral} />
            <Text style={styles.centerText}>글을 불러오는 중…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerBox}>
            <Ionicons name="cloud-offline-outline" size={22} color={colors.textMuted} />
            <Text style={styles.centerText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={load} accessibilityRole="button">
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.centerBox} testID="feedback-empty">
            <Text style={styles.emptyEmoji}>{current.emoji}</Text>
            <Text style={styles.emptyTitle}>{current.empty}</Text>
            <Text style={styles.centerText}>
              {kind === 'idea'
                ? '있으면 좋겠는 기능을 첫 번째로 남겨 주세요.'
                : '불편했던 순간을 첫 번째로 알려 주세요.'}
            </Text>
            <Pressable style={styles.emptyBtn} onPress={openCompose} accessibilityRole="button" testID="feedback-empty-write">
              <Text style={styles.emptyBtnText}>첫 글 남기기</Text>
            </Pressable>
          </View>
        ) : (
          items.map((item) => (
            <FeedbackCard
              key={item.id}
              item={item}
              liked={likedIds.indexOf(item.id) >= 0}
              onLike={doLike}
              busy={likeBusy}
            />
          ))
        )}

        <View style={styles.footNote}>
          <Ionicons name="lock-closed-outline" size={11} color={colors.textMuted} />
          <Text style={styles.footNoteText}>
            공감은 기기마다 한 번 · 반영되면 상태 배지가 바뀝니다
          </Text>
        </View>
      </ScrollView>
    </>
  );

  return (
    <LayerSheet
      visible={visible}
      onClose={onClose}
      icon="chatbubble-ellipses"
      title={composing ? '글쓰기' : '제안 · 버그 제보'}
      sub={composing ? current.emoji + ' ' + current.label + ' 작성' : '기능 아이디어 · 버그 신고 · 공감'}
      onBack={composing ? closeCompose : null}
      closeLabel="제보 게시판 닫기"
      overlayTestID="feedback-overlay"
      testID="feedback-board"
      headerTestID="feedback-header"
      titleTestID="feedback-title"
      closeTestID="feedback-close"
      backTestID="feedback-back"
      zIndex={zIndex}
    >
      <View style={styles.sheetBody} testID="feedback-body">
        {composing ? renderCompose() : renderList()}
      </View>
    </LayerSheet>
  );
}

const styles = StyleSheet.create({
  sheetBody: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },

  toolbar: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  tabOn: { backgroundColor: colors.charcoal, borderColor: colors.charcoal },
  tabText: { fontSize: 12.5, fontWeight: '800', color: colors.textSub },
  tabTextOn: { color: colors.white },
  tabCount: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.lineSoft,
    alignItems: 'center',
  },
  tabCountOn: { backgroundColor: colors.charcoalPill },
  tabCountText: { fontSize: 10, fontWeight: '800', color: colors.textSub },
  tabCountTextOn: { color: colors.white },

  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  sortGroup: {
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sortBtn: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: radius.pill },
  sortBtnOn: { backgroundColor: colors.coralSoft },
  sortText: { fontSize: 11.5, fontWeight: '700', color: colors.textMuted },
  sortTextOn: { color: colors.coralDark },
  writeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.charcoal,
  },
  writeText: { fontSize: 12, fontWeight: '800', color: colors.white },

  listBody: { paddingHorizontal: 14, paddingBottom: 26, gap: 10 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardKind: { fontSize: 11, fontWeight: '800', color: colors.textMuted, flexShrink: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: radius.pill },
  statusText: { fontSize: 10, fontWeight: '800' },
  cardTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text, marginTop: 7, letterSpacing: -0.2 },
  cardContent: { fontSize: 12, color: colors.textSub, lineHeight: 18, marginTop: 4 },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
  },
  cardMeta: { flex: 1, minWidth: 0 },
  cardAuthor: { fontSize: 11.5, fontWeight: '700', color: colors.text },
  cardMetaText: { fontSize: 10.5, color: colors.textMuted, marginTop: 1 },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  likeBtnOn: { backgroundColor: colors.coralSoft, borderColor: colors.coralSoft2 },
  likeText: { fontSize: 11, fontWeight: '800', color: colors.textSub },
  likeTextOn: { color: colors.coralDark },
  likeCount: { fontSize: 11, fontWeight: '800', color: colors.textMuted },

  centerBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 44, gap: 8 },
  centerText: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  emptyEmoji: { fontSize: 30 },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  emptyBtn: {
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.charcoal,
  },
  emptyBtnText: { fontSize: 12.5, fontWeight: '800', color: colors.white },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  retryText: { fontSize: 12, fontWeight: '800', color: colors.textSub },

  footNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 6,
  },
  footNoteText: { fontSize: 10, color: colors.textMuted },

  composeBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 28 },
  composeKindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  composeKind: { fontSize: 12.5, fontWeight: '800', color: colors.coralDark },
  composeCooldown: { fontSize: 10.5, color: colors.textMuted },
  fieldHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 6,
  },
  fieldLabel: { fontSize: 11.5, fontWeight: '800', color: colors.textSub },
  fieldCount: { fontSize: 10, color: colors.textMuted },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
    color: colors.text,
    outlineStyle: 'none',
  },
  inputMultiline: { minHeight: 132, lineHeight: 20 },
  formError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: '#FEF3F2',
  },
  formErrorText: { flex: 1, fontSize: 11.5, color: '#B42318', lineHeight: 17 },
  submitBtn: {
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: radius.md,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnBusy: { opacity: 0.7 },
  submitText: { fontSize: 13.5, fontWeight: '800', color: colors.white },
  composeNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 12 },
  composeNoticeText: { flex: 1, fontSize: 10.5, color: colors.textMuted, lineHeight: 16 },
});
