/**
 * src/screens/AdminScreen.js — v2.21 🛡️ 어드민(`/admin`)
 * ─────────────────────────────────────────────────────────────
 * 상훈 님 요청(2026-11-17):
 *   "릴스핀말이야 어드민도 필요하지 않을까?? 회원관리도 해야하고 장소관리(?)도 필요하지 않을까"
 *
 * 화면 구성
 *   · 로그인 전 … 관리자 계정으로 로그인 안내 (구글 로그인)
 *   · 로그인 후 … ① 📊 대시보드 ② 👥 회원 관리 ③ 📍 장소(핀) 관리 ④ 💬 제보 (v2.23)
 *     - 데스크톱: 왼쪽 내비 + 넓은 표 / 모바일(390px): 상단 탭 + 카드형 목록
 *   · 권한은 **서버(`/api/admin`)와 DB 함수**가 최종 판단합니다.
 *     이 화면은 안내만 하고, 401·403 이 오면 그대로 잠금 화면으로 돌아갑니다.
 *
 * 미리보기: 주소에 `?preview=1` 을 붙이면 **모의 데이터**로 화면만 보여 줍니다.
 *   (저장·삭제 요청은 보내지 않습니다 — 디자인 확인·스크린샷용)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { getSession, signInWithOAuth, signOut as signOutCloud } from '../services/cloudSync';
import { loadSupabaseConfig, isSupabaseConfigured } from '../services/supabase';

const API = '/api/admin';
const DESKTOP_BREAKPOINT = 860;

const TABS = [
  { id: 'dashboard', label: '대시보드', icon: 'stats-chart' },
  { id: 'members', label: '회원 관리', icon: 'people' },
  { id: 'pins', label: '장소 관리', icon: 'location' },
  // v2.23 — 💬 제안 · 버그 제보
  { id: 'feedback', label: '제보', icon: 'chatbubble-ellipses' },
];

/** v2.23 — 제보 상태·유형 라벨 (DB check 제약과 같은 값) */
const FEEDBACK_STATUS_OPTIONS = [
  { id: '', label: '전체' },
  { id: 'open', label: '접수됨' },
  { id: 'applied', label: '반영됨' },
  { id: 'fixed', label: '수정됨' },
];
const FEEDBACK_KIND_OPTIONS = [
  { id: '', label: '전체' },
  { id: 'idea', label: '제안' },
  { id: 'bug', label: '버그' },
];
const FEEDBACK_STATUS_LABEL = { open: '접수됨', applied: '반영됨', fixed: '수정됨' };
const FEEDBACK_KIND_LABEL = { idea: '제안', bug: '버그' };
const FEEDBACK_STATUS_TONE = { open: 'muted', applied: 'coral', fixed: 'visit' };

/** 미리보기용 모의 데이터 — 실제 회원·핀이 아닙니다. */
const PREVIEW_DATA = {
  overview: {
    totalUsers: 128,
    newUsers7d: 9,
    totalPins: 417,
    pinsToday: 6,
    topPlaces: [
      { name: '베통 성수', category: '베이커리', area: '성수동', address: '서울 성동구 연무장길 18', saves: 12, users: 9 },
      { name: '솥뚜껑닭볶음탕', category: '맛집', area: '가평', address: '경기 가평군 설악면 어비산길 130-18', saves: 9, users: 7 },
      { name: '디오디아', category: '카페', area: '연남동', address: '서울 마포구 동교로 00', saves: 8, users: 6 },
      { name: '런던베이글 연남', category: '베이커리', area: '연남동', address: '서울 마포구 성미산로 00', saves: 7, users: 7 },
      { name: '엄마손횟집', category: '맛집', area: '소래포구', address: '인천 남동구 소래역로 00', saves: 6, users: 4 },
      { name: '카페 온도', category: '카페', area: '망원동', address: '서울 마포구 포은로 00', saves: 5, users: 5 },
      { name: '꿉당 성수', category: '맛집', area: '성수동', address: '서울 성동구 성수이로 00', saves: 5, users: 3 },
      { name: '뚜레쥬르 연남', category: '베이커리', area: '연남동', address: '서울 마포구 양화로 00', saves: 4, users: 4 },
      { name: '읍천리382', category: '카페', area: '삼청동', address: '서울 종로구 북촌로 00', saves: 4, users: 3 },
      { name: '금돼지식당', category: '맛집', area: '신당동', address: '서울 중구 다산로 00', saves: 3, users: 3 },
    ],
    categories: [
      { name: '맛집', count: 236 },
      { name: '카페', count: 121 },
      { name: '베이커리', count: 42 },
      { name: '술집', count: 18 },
    ],
  },
  members: [
    { userId: 'u-1', email: 'andy.leesh33@gmail.com', nickname: '이상훈', provider: 'google', createdAt: '2026-11-14T10:12:00+09:00', lastSignInAt: '2026-11-17T06:40:00+09:00', pinCount: 42, plan: 'pro' },
    { userId: 'u-2', email: 'hyeyeon.kim@gmail.com', nickname: '희연', provider: 'google', createdAt: '2026-11-15T21:04:00+09:00', lastSignInAt: '2026-11-16T22:18:00+09:00', pinCount: 17, plan: 'free' },
    { userId: 'u-3', email: 'shhy@kakao.com', nickname: '상훈', provider: 'kakao', createdAt: '2026-11-15T23:31:00+09:00', lastSignInAt: '2026-11-16T09:02:00+09:00', pinCount: 8, plan: 'free' },
    { userId: 'u-4', email: 'tester01@gmail.com', nickname: '맛집탐험가', provider: 'google', createdAt: '2026-11-16T08:20:00+09:00', lastSignInAt: '2026-11-16T08:44:00+09:00', pinCount: 3, plan: 'free' },
    { userId: 'u-5', email: 'guest@kakao.com', nickname: '꼬야네', provider: 'kakao', createdAt: '2026-11-16T19:10:00+09:00', lastSignInAt: null, pinCount: 0, plan: 'free' },
  ],
  pins: [
    { pinId: 'p-1', userId: 'u-1', email: 'andy.leesh33@gmail.com', nickname: '이상훈', name: '베통 성수', category: '베이커리', area: '성수동', address: '서울 성동구 연무장길 18', visited: true, createdAt: '2026-11-17T06:12:00+09:00' },
    { pinId: 'p-2', userId: 'u-1', email: 'andy.leesh33@gmail.com', nickname: '이상훈', name: '솥뚜껑닭볶음탕', category: '맛집', area: '가평', address: '경기 가평군 설악면 어비산길 130-18', visited: false, createdAt: '2026-11-16T22:31:00+09:00' },
    { pinId: 'p-3', userId: 'u-2', email: 'hyeyeon.kim@gmail.com', nickname: '희연', name: '디오디아', category: '카페', area: '연남동', address: '서울 마포구 동교로 00', visited: true, createdAt: '2026-11-16T21:12:00+09:00' },
    { pinId: 'p-4', userId: 'u-3', email: 'shhy@kakao.com', nickname: '상훈', name: '런던베이글 연남', category: '베이커리', area: '연남동', address: '서울 마포구 성미산로 00', visited: false, createdAt: '2026-11-16T09:05:00+09:00' },
    { pinId: 'p-5', userId: 'u-4', email: 'tester01@gmail.com', nickname: '맛집탐험가', name: '광어1마리15000원', category: '맛집', area: '', address: '부산 해운대구 00', visited: false, createdAt: '2026-11-16T08:44:00+09:00' },
  ],
  // v2.23 — 💬 제보 탭 미리보기 (실제 글이 아닙니다)
  feedback: [
    { id: 'f-1', kind: 'bug', title: '지도가 가끔 흰 화면이 돼요', content: '아이폰 사파리에서 앱을 다시 열면 지도가 잠깐 흰 화면으로 보이다가 돌아와요. 2~3초 정도 걸립니다.', author: '꼬야네', userEmail: 'guest@kakao.com', appVersion: '2.23.0', likes: 7, status: 'open', createdAt: '2026-11-17T09:12:00+09:00' },
    { id: 'f-2', kind: 'idea', title: '컬렉션을 친구에게 같이 보여 주기', content: '만든 컬렉션을 링크로 보낼 때 제목과 설명이 같이 보이면 좋겠어요. 지금은 핀만 보입니다.', author: '맛집탐험가', userEmail: 'tester01@gmail.com', appVersion: '2.23.0', likes: 5, status: 'applied', createdAt: '2026-11-16T22:40:00+09:00' },
    { id: 'f-3', kind: 'bug', title: '알림이 두 번 와요', content: '500m 안에 들어갔을 때 같은 가게 알림이 두 번 뜬 적이 있어요.', author: '익명', userEmail: '', appVersion: '2.22.0', likes: 2, status: 'fixed', createdAt: '2026-11-16T18:05:00+09:00' },
    { id: 'f-4', kind: 'idea', title: '영업시간 지금 열었는지 핀에 바로 표시', content: '목록에서도 영업 중인지 한눈에 보이면 좋을 것 같아요.', author: '희연', userEmail: 'hyeyeon.kim@gmail.com', appVersion: '2.23.0', likes: 3, status: 'open', createdAt: '2026-11-16T12:20:00+09:00' },
  ],
};

const PREVIEW_EMAIL = 'andy.leesh33@gmail.com';

// ── 작은 도우미 ─────────────────────────────────────────────
function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/** 'M월 D일' — 날짜가 없으면 '—' */
function dateLabel(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.getMonth() + 1 + '월 ' + d.getDate() + '일';
}

/** '방금' · '3시간 전' · '2일 전' · '—' */
function sinceLabel(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  if (diff < 0) return dateLabel(value);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return min + '분 전';
  const hour = Math.floor(min / 60);
  if (hour < 24) return hour + '시간 전';
  const day = Math.floor(hour / 24);
  if (day < 31) return day + '일 전';
  return dateLabel(value);
}

/** 가입 경로 라벨 */
function providerLabel(provider) {
  const id = String(provider || '').toLowerCase();
  if (id === 'google') return 'Google';
  if (id === 'kakao') return 'Kakao';
  if (id === 'apple') return 'Apple';
  return '이메일';
}

function providerColor(provider) {
  const id = String(provider || '').toLowerCase();
  if (id === 'google') return { bg: '#EAF1FF', fg: '#1A56DB' };
  if (id === 'kakao') return { bg: '#FFF7CC', fg: '#7A5B00' };
  if (id === 'apple') return { bg: '#F1F1F4', fg: '#33333A' };
  return { bg: '#F1F1F4', fg: '#5B6170' };
}

/** 서버 호출 — 토큰과 JSON 을 함께 다룹니다. */
async function callAdmin({ view, query, method = 'GET', body, token }) {
  const params = new URLSearchParams();
  if (view) params.set('view', view);
  Object.keys(query || {}).forEach((key) => {
    const value = query[key];
    if (value != null && String(value) !== '') params.set(key, String(value));
  });
  const url = API + (params.toString() ? '?' + params.toString() : '');
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const init = { method, headers };
  if (body) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res = null;
  try {
    res = await fetch(url, init);
  } catch (e) {
    return { ok: false, status: 0, error: 'network', message: '네트워크에 연결하지 못했어요.' };
  }
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: (data && data.error) || 'error',
      message: (data && data.message) || '요청을 처리하지 못했어요.',
    };
  }
  return { ok: true, status: res.status, data: (data && data.data) != null ? data.data : data, email: data && data.email };
}

// ── 작은 조각들 ─────────────────────────────────────────────
function Pill({ text, tone = 'muted' }) {
  const tones = {
    muted: { bg: colors.lineSoft, fg: colors.mutedBadgeText },
    coral: { bg: colors.coralSoft, fg: colors.coralDark },
    pro: { bg: '#EEF2FF', fg: '#3B4CCA' },
    visit: { bg: colors.visitSoft, fg: colors.visitDark },
  };
  const t = tones[tone] || tones.muted;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.pillText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function SearchBox({ value, onChange, onSubmit, placeholder }) {
  return (
    <View style={styles.searchBox}>
      <Ionicons name="search" size={16} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={styles.searchInput}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />
      {value ? (
        <Pressable
          onPress={() => {
            onChange('');
            onSubmit && onSubmit('');
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="검색어 지우기"
        >
          <Ionicons name="close-circle" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ConfirmModal({ open, title, message, confirmLabel, danger, onConfirm, onCancel, busy }) {
  return (
    <Modal visible={!!open} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalDim}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalMessage}>{message}</Text>
          <View style={styles.modalRow}>
            <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={onCancel} disabled={busy}>
              <Text style={styles.modalCancelText}>취소</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, danger ? styles.modalDanger : styles.modalConfirm]}
              onPress={onConfirm}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.modalConfirmText}>{confirmLabel || '확인'}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PinEditModal({ target, onCancel, onSave, busy, categories }) {
  const [name, setName] = useState(target ? target.name : '');
  const [category, setCategory] = useState(target ? target.category : '');
  useEffect(() => {
    setName(target ? target.name : '');
    setCategory(target ? target.category : '');
  }, [target]);
  if (!target) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalDim}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>핀 수정</Text>
          <Text style={styles.modalMessage}>
            {target.owner || target.email || ''} · {target.area || '동네 미확인'}
          </Text>
          <Text style={styles.fieldLabel}>상호명</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            style={styles.fieldInput}
            placeholder="상호명"
            placeholderTextColor={colors.textMuted}
            maxLength={60}
            accessibilityLabel="상호명"
          />
          <Text style={styles.fieldLabel}>분류</Text>
          <View style={styles.chipWrap}>
            {(categories && categories.length ? categories : ['맛집', '카페', '베이커리', '술집']).map((c) => (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={[styles.chip, category === c && styles.chipOn]}
              >
                <Text style={[styles.chipText, category === c && styles.chipTextOn]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={category}
            onChangeText={setCategory}
            style={styles.fieldInput}
            placeholder="직접 입력"
            placeholderTextColor={colors.textMuted}
            maxLength={20}
            accessibilityLabel="분류"
          />
          <View style={styles.modalRow}>
            <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={onCancel} disabled={busy}>
              <Text style={styles.modalCancelText}>취소</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalConfirm]}
              onPress={() => onSave({ name: name.trim(), category: category.trim() })}
              disabled={busy || !name.trim()}
            >
              {busy ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.modalConfirmText}>저장</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── 화면 ───────────────────────────────────────────────────
export default function AdminScreen({ preview = false }) {
  const { width } = useWindowDimensions();
  const wide = width >= DESKTOP_BREAKPOINT;

  const [gate, setGate] = useState(preview ? 'ready' : 'checking'); // checking | anon | denied | ready | error
  const [email, setEmail] = useState(preview ? PREVIEW_EMAIL : '');
  const [gateMessage, setGateMessage] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const [overview, setOverview] = useState(preview ? PREVIEW_DATA.overview : null);
  const [members, setMembers] = useState(preview ? PREVIEW_DATA.members : []);
  const [pins, setPins] = useState(preview ? PREVIEW_DATA.pins : []);
  const [memberQuery, setMemberQuery] = useState('');
  const [pinQuery, setPinQuery] = useState('');
  const [pinCategory, setPinCategory] = useState('');
  // v2.23 — 💬 제보 탭 (유형·상태 필터)
  const [feedback, setFeedback] = useState(preview ? PREVIEW_DATA.feedback : []);
  const [feedbackKind, setFeedbackKind] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState('');

  const [schemaMissing, setSchemaMissing] = useState('');
  const [confirm, setConfirm] = useState(null); // { kind, target }
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const tokenRef = useRef('');

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const currentToken = useCallback(async () => {
    if (preview) return '';
    if (tokenRef.current) return tokenRef.current;
    const res = await getSession();
    tokenRef.current = res && res.ok && res.session ? res.session.access_token || '' : '';
    return tokenRef.current;
  }, [preview]);

  /** 로그인 상태 확인 → 어드민 여부 확인 */
  const checkAccess = useCallback(async () => {
    if (preview) {
      setGate('ready');
      return;
    }
    setGate('checking');
    await loadSupabaseConfig();
    if (!isSupabaseConfigured()) {
      setGate('error');
      setGateMessage('Supabase 설정이 없어 어드민을 켤 수 없어요.');
      return;
    }
    const token = await currentToken();
    if (!token) {
      setGate('anon');
      return;
    }
    const res = await callAdmin({ view: 'session', token });
    if (res.ok) {
      setEmail(res.email || '');
      setGate('ready');
      return;
    }
    if (res.status === 401) {
      tokenRef.current = '';
      setGate('anon');
      return;
    }
    if (res.status === 403) {
      setGate('denied');
      setGateMessage(res.message || '');
      return;
    }
    setGate('error');
    setGateMessage(res.message || '어드민을 불러오지 못했어요.');
  }, [preview, currentToken]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  // ── 데이터 불러오기 ──────────────────────────────
  const loadTab =useCallback(
    async (which) => {
      if (preview) return;
      const token = await currentToken();
      if (!token) {
        setGate('anon');
        return;
      }
      setLoading(true);
      try {
        if (which === 'dashboard') {
          const res = await callAdmin({ view: 'overview', token });
          if (!res.ok) throw res;
          setSchemaMissing('');
          setOverview(res.data || null);
        } else if (which === 'members') {
          const res = await callAdmin({ view: 'members', query: { q: memberQuery }, token });
          if (!res.ok) throw res;
          setSchemaMissing('');
          setMembers(Array.isArray(res.data) ? res.data : []);
        } else if (which === 'pins') {
          const res = await callAdmin({ view: 'pins', query: { q: pinQuery, category: pinCategory }, token });
          if (!res.ok) throw res;
          setSchemaMissing('');
          setPins(Array.isArray(res.data) ? res.data : []);
        } else if (which === 'feedback') {
          const res = await callAdmin({
            view: 'feedback',
            query: { kind: feedbackKind, status: feedbackStatus },
            token,
          });
          if (!res.ok) throw res;
          setSchemaMissing('');
          setFeedback(Array.isArray(res.data) ? res.data : []);
        }
      } catch (e) {
        if (e && e.error === 'admin-schema-missing') {
          setSchemaMissing(e.message || '어드민 DB 함수가 아직 없어요.');
          setLoading(false);
          return;
        }
        if (e && e.status === 401) {
          tokenRef.current = '';
          setGate('anon');
        } else if (e && e.status === 403) {
          setGate('denied');
          setGateMessage((e && e.message) || '');
        } else {
          showToast((e && e.message) || '데이터를 불러오지 못했어요');
        }
      } finally {
        setLoading(false);
      }
    },
    [preview, currentToken, memberQuery, pinQuery, pinCategory, feedbackKind, feedbackStatus, showToast]
  );

  useEffect(() => {
    if (gate !== 'ready') return;
    loadTab(tab);
    // 탭이 바뀔 때만 자동으로 불러옵니다. (검색은 [검색] 버튼·엔터)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, tab]);

  // ── 동작 ────────────────────────────────────────
  const signIn = useCallback(async () => {
    if (preview) return;
    setSigningIn(true);
    const redirectTo =
      typeof window !== 'undefined' && window.location && window.location.origin
        ? window.location.origin + '/admin'
        : undefined;
    const res = await signInWithOAuth('google', { redirectTo });
    setSigningIn(false);
    if (!res.ok) showToast(res.message || '구글 로그인을 열지 못했어요');
  }, [preview, showToast]);

  const doSignOut = useCallback(async () => {
    if (preview) return;
    await signOutCloud();
    tokenRef.current = '';
    setGate('anon');
    setEmail('');
  }, [preview]);

  const changePlan = useCallback(
    async (member, plan) => {
      if (preview) {
        showToast('미리보기에서는 저장되지 않아요');
        return;
      }
      setBusy(true);
      const token = await currentToken();
      const res = await callAdmin({
        view: '',
        method: 'POST',
        token,
        body: { action: 'set-plan', userId: member.userId, plan },
      });
      setBusy(false);
      if (!res.ok) {
        showToast(res.message || '플랜을 바꾸지 못했어요');
        return;
      }
      showToast(member.nickname + ' 님을 ' + (plan === 'pro' ? '프로' : '무료') + ' 로 바꿨어요');
      loadTab('members');
    },
    [preview, currentToken, showToast, loadTab]
  );

  const removeMember = useCallback(
    async (member) => {
      setBusy(true);
      if (preview) {
        setBusy(false);
        setConfirm(null);
        showToast('미리보기에서는 저장되지 않아요');
        return;
      }
      const token = await currentToken();
      const res = await callAdmin({ method: 'POST', token, body: { action: 'delete-user', userId: member.userId } });
      setBusy(false);
      setConfirm(null);
      if (!res.ok) {
        showToast(res.message || '회원을 지우지 못했어요');
        return;
      }
      showToast(member.nickname + ' 님을 지웠어요');
      loadTab('members');
      loadTab('dashboard');
    },
    [preview, currentToken, showToast, loadTab]
  );

  const savePin = useCallback(
    async (values) => {
      const target = editing;
      if (!target) return;
      if (preview) {
        setEditing(null);
        showToast('미리보기에서는 저장되지 않아요');
        return;
      }
      setBusy(true);
      const token = await currentToken();
      const res = await callAdmin({
        method: 'POST',
        token,
        body: { action: 'update-pin', userId: target.userId, pinId: target.pinId, name: values.name, category: values.category },
      });
      setBusy(false);
      if (!res.ok) {
        showToast(res.message || '핀을 고치지 못했어요');
        return;
      }
      setEditing(null);
      showToast('핀을 고쳤어요');
      loadTab('pins');
    },
    [editing, preview, currentToken, showToast, loadTab]
  );

  const removePin = useCallback(
    async (pin) => {
      setBusy(true);
      if (preview) {
        setBusy(false);
        setConfirm(null);
        showToast('미리보기에서는 저장되지 않아요');
        return;
      }
      const token = await currentToken();
      const res = await callAdmin({
        method: 'POST',
        token,
        body: { action: 'delete-pin', userId: pin.userId, pinId: pin.pinId },
      });
      setBusy(false);
      setConfirm(null);
      if (!res.ok) {
        showToast(res.message || '핀을 지우지 못했어요');
        return;
      }
      showToast(pin.name + ' 핀을 지웠어요');
      loadTab('pins');
      loadTab('dashboard');
    },
    [preview, currentToken, showToast, loadTab]
  );

  const categories = useMemo(() => {
    const list = (overview && overview.categories) || [];
    return list.map((c) => c.name).filter(Boolean);
  }, [overview]);

  // ── v2.23 💬 제보 상태 변경 · 삭제 ────────────────────────
  const changeFeedbackStatus = useCallback(
    async (item, status) => {
      if (!item || !status || item.status === status) return;
      if (preview) {
        showToast('미리보기에서는 저장되지 않아요');
        return;
      }
      setBusy(true);
      const token = await currentToken();
      const res = await callAdmin({
        method: 'POST',
        token,
        body: { action: 'update-feedback-status', id: item.id, status },
      });
      setBusy(false);
      if (!res.ok) {
        showToast(res.message || '상태를 바꾸지 못했어요');
        return;
      }
      setFeedback((list) => list.map((row) => (row.id === item.id ? { ...row, status } : row)));
      showToast('“' + item.title + '” 상태를 ' + (FEEDBACK_STATUS_LABEL[status] || status) + ' 으로 바꿨어요');
      loadTab('feedback');
    },
    [preview, currentToken, showToast, loadTab]
  );

  const removeFeedback = useCallback(
    async (item) => {
      setBusy(true);
      if (preview) {
        setBusy(false);
        setConfirm(null);
        showToast('미리보기에서는 저장되지 않아요');
        return;
      }
      const token = await currentToken();
      const res = await callAdmin({ method: 'POST', token, body: { action: 'delete-feedback', id: item.id } });
      setBusy(false);
      setConfirm(null);
      if (!res.ok) {
        showToast(res.message || '제보를 지우지 못했어요');
        return;
      }
      showToast('“' + item.title + '” 제보를 지웠어요');
      loadTab('feedback');
    },
    [preview, currentToken, showToast, loadTab]
  );

  // ── 잠금 화면들 ──────────────────────────────────
  const renderGate = () => {
    if (gate === 'checking') {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.coral} />
          <Text style={styles.centerText}>어드민 권한을 확인하는 중…</Text>
        </View>
      );
    }
    if (gate === 'anon') {
      return (
        <View style={styles.centerBox}>
          <View style={styles.lockIcon}>
            <Ionicons name="shield-checkmark" size={26} color={colors.coral} />
          </View>
          <Text style={styles.gateTitle}>관리자 로그인이 필요해요</Text>
          <Text style={styles.gateText}>
            이 화면은 릴스핀 관리자만 쓸 수 있어요.{'\n'}관리자 구글 계정으로 로그인해 주세요.
          </Text>
          <Pressable style={styles.googleBtn} onPress={signIn} disabled={signingIn} accessibilityRole="button">
            {signingIn ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <>
                <Ionicons name="logo-google" size={16} color={colors.text} />
                <Text style={styles.googleBtnText}>구글로 로그인</Text>
              </>
            )}
          </Pressable>
          <Pressable onPress={() => (typeof window !== 'undefined' ? (window.location.href = '/') : null)}>
            <Text style={styles.linkText}>앱으로 돌아가기</Text>
          </Pressable>
        </View>
      );
    }
    if (gate === 'denied') {
      return (
        <View style={styles.centerBox}>
          <View style={[styles.lockIcon, styles.lockIconDenied]}>
            <Ionicons name="lock-closed" size={24} color="#B42318" />
          </View>
          <Text style={styles.gateTitle}>관리자 권한이 없어요</Text>
          <Text style={styles.gateText}>
            {email ? email + ' 계정은' : '지금 계정은'} 릴스핀 관리자가 아니에요.{'\n'}관리자 계정으로 다시 로그인해 주세요.
          </Text>
          <Pressable style={styles.ghostBtn} onPress={doSignOut} accessibilityRole="button">
            <Text style={styles.ghostBtnText}>다른 계정으로 로그인</Text>
          </Pressable>
          <Pressable onPress={() => (typeof window !== 'undefined' ? (window.location.href = '/') : null)}>
            <Text style={styles.linkText}>앱으로 돌아가기</Text>
          </Pressable>
        </View>
      );
    }
    if (gate === 'error') {
      return (
        <View style={styles.centerBox}>
          <View style={[styles.lockIcon, styles.lockIconDenied]}>
            <Ionicons name="alert-circle" size={24} color="#B42318" />
          </View>
          <Text style={styles.gateTitle}>어드민을 열지 못했어요</Text>
          <Text style={styles.gateText}>{gateMessage || '잠시 후 다시 시도해 주세요.'}</Text>
          <Pressable style={styles.ghostBtn} onPress={checkAccess} accessibilityRole="button">
            <Text style={styles.ghostBtnText}>다시 시도</Text>
          </Pressable>
        </View>
      );
    }
    return null;
  };

  // ── 탭 본문 ─────────────────────────────────────
  const renderDashboard = () => {
    const data = overview || {};
    const top = Array.isArray(data.topPlaces) ? data.topPlaces : [];
    return (
      <>
        <Text style={styles.sectionTitle}>요약</Text>
        <View style={styles.statGrid}>
          <StatCard label="전체 회원" value={data.totalUsers != null ? data.totalUsers : '—'} sub="가입한 모든 계정" />
          <StatCard
            label="최근 7일 신규"
            value={data.newUsers7d != null ? data.newUsers7d : '—'}
            sub="지난 일주일 가입"
            accent={colors.coralDark}
          />
          <StatCard label="전체 핀" value={data.totalPins != null ? data.totalPins : '—'} sub="저장된 장소 전체" />
          <StatCard
            label="오늘 추가된 핀"
            value={data.pinsToday != null ? data.pinsToday : '—'}
            sub="한국 시간 기준"
            accent={colors.visitDark}
          />
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>인기 장소 TOP 10</Text>
          <Text style={styles.sectionHint}>같은 상호·좌표로 묶어 저장 수를 셉니다</Text>
        </View>
        <View style={styles.card}>
          {top.length === 0 ? (
            <Text style={styles.emptyText}>아직 저장된 장소가 없어요.</Text>
          ) : (
            top.map((place, i) => (
              <View key={(place.name || '') + i} style={[styles.rankRow, i === top.length - 1 && styles.rowLast]}>
                <View style={[styles.rankBadge, i < 3 && styles.rankBadgeTop]}>
                  <Text style={[styles.rankNumber, i < 3 && styles.rankNumberTop]}>{i + 1}</Text>
                </View>
                <View style={styles.rankBody}>
                  <Text style={styles.rankName} numberOfLines={1}>
                    {place.name}
                  </Text>
                  <Text style={styles.rankMeta} numberOfLines={1}>
                    {[place.category, place.area, place.address].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={styles.rankCount}>
                  <Text style={styles.rankSaves}>{place.saves}</Text>
                  <Text style={styles.rankUsers}>{place.users}명</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </>
    );
  };

  const renderMembers = () => (
    <>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>회원 {members.length}명</Text>
        <Text style={styles.sectionHint}>이메일·이름으로 찾을 수 있어요</Text>
      </View>
      <View style={styles.toolbar}>
        <SearchBox
          value={memberQuery}
          onChange={setMemberQuery}
          onSubmit={() => loadTab('members')}
          placeholder="이메일 또는 이름 검색"
        />
        <Pressable style={styles.searchBtn} onPress={() => loadTab('members')} accessibilityRole="button">
          <Text style={styles.searchBtnText}>검색</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        {members.length === 0 ? (
          <Text style={styles.emptyText}>{loading ? '불러오는 중…' : '조건에 맞는 회원이 없어요.'}</Text>
        ) : (
          members.map((m, i) => {
            const p = providerColor(m.provider);
            return (
              <View key={m.userId || i} style={[styles.memberRow, wide && styles.memberRowWide, i === members.length - 1 && styles.rowLast]}>
                <View style={styles.memberMain}>
                  <View style={styles.memberTitleRow}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {m.nickname || '이름 없음'}
                    </Text>
                    <Pill text={providerLabel(m.provider)} tone={m.provider === 'kakao' ? 'muted' : 'muted'} />
                    <Pill text={m.plan === 'pro' ? '프로' : '무료'} tone={m.plan === 'pro' ? 'pro' : 'muted'} />
                  </View>
                  <Text style={styles.memberEmail} numberOfLines={1}>
                    {m.email}
                  </Text>
                  <Text style={styles.memberMeta}>
                    가입 {dateLabel(m.createdAt)} · 최근 로그인 {sinceLabel(m.lastSignInAt)} · 핀 {m.pinCount != null ? m.pinCount : 0}개
                  </Text>
                </View>
                <View style={styles.memberActions}>
                  <Pressable
                    style={styles.planBtn}
                    onPress={() => changePlan(m, m.plan === 'pro' ? 'free' : 'pro')}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={m.plan === 'pro' ? '무료로 바꾸기' : '프로로 바꾸기'}
                  >
                    <Text style={styles.planBtnText}>{m.plan === 'pro' ? '무료로' : '프로로'}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => setConfirm({ kind: 'member', target: m })}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="회원 삭제"
                  >
                    <Ionicons name="trash-outline" size={15} color="#B42318" />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>
    </>
  );

  const renderPins = () => (
    <>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>저장된 장소 {pins.length}곳</Text>
        <Text style={styles.sectionHint}>최근 저장 순 · 최대 300개</Text>
      </View>
      <View style={styles.toolbar}>
        <SearchBox
          value={pinQuery}
          onChange={setPinQuery}
          onSubmit={() => loadTab('pins')}
          placeholder="장소명·주소·회원 검색"
        />
        <Pressable style={styles.searchBtn} onPress={() => loadTab('pins')} accessibilityRole="button">
          <Text style={styles.searchBtnText}>검색</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipScrollInner}>
        <Pressable
          onPress={() => {
            setPinCategory('');
            setTimeout(() => loadTab('pins'), 0);
          }}
          style={[styles.chip, pinCategory === '' && styles.chipOn]}
        >
          <Text style={[styles.chipText, pinCategory === '' && styles.chipTextOn]}>전체</Text>
        </Pressable>
        {categories.map((c) => (
          <Pressable
            key={c}
            onPress={() => {
              setPinCategory(c);
              setTimeout(() => loadTab('pins'), 0);
            }}
            style={[styles.chip, pinCategory === c && styles.chipOn]}
          >
            <Text style={[styles.chipText, pinCategory === c && styles.chipTextOn]}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.card}>
        {pins.length === 0 ? (
          <Text style={styles.emptyText}>{loading ? '불러오는 중…' : '조건에 맞는 장소가 없어요.'}</Text>
        ) : (
          pins.map((pin, i) => (
            <View key={(pin.userId || '') + (pin.pinId || i)} style={[styles.pinRow, i === pins.length - 1 && styles.rowLast]}>
              <View style={styles.pinBody}>
                <View style={styles.pinTitleRow}>
                  <Text style={styles.pinName} numberOfLines={1}>
                    {pin.name}
                  </Text>
                  {pin.category ? <Pill text={pin.category} tone="coral" /> : null}
                  {pin.visited ? <Pill text="가봤어요" tone="visit" /> : null}
                </View>
                <Text style={styles.pinAddress} numberOfLines={1}>
                  {[pin.area, pin.address].filter(Boolean).join(' · ') || '주소 미확인'}
                </Text>
                <Text style={styles.pinMeta} numberOfLines={1}>
                  {pin.nickname || '이름 없음'} ({pin.email}) · {dateLabel(pin.createdAt)} 저장
                </Text>
              </View>
              <View style={styles.pinActions}>
                <Pressable
                  style={styles.editBtn}
                  onPress={() => setEditing({ ...pin, owner: pin.nickname })}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="핀 수정"
                >
                  <Ionicons name="create-outline" size={15} color={colors.textSub} />
                </Pressable>
                <Pressable
                  style={styles.deleteBtn}
                  onPress={() => setConfirm({ kind: 'pin', target: pin })}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="핀 삭제"
                >
                  <Ionicons name="trash-outline" size={15} color="#B42318" />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>
    </>
  );

  /** v2.23 — 💬 제보 관리 (유형·상태 필터 · 상태 변경 · 삭제) */
  const renderFeedback = () => {
    const rows = feedback;
    return (
      <>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>제보 {rows.length}건</Text>
          <Text style={styles.sectionHint}>최근 글 순 · 최대 500건</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipScrollInner}>
          {FEEDBACK_KIND_OPTIONS.map((opt) => {
            const on = feedbackKind === opt.id;
            return (
              <Pressable
                key={'kind-' + (opt.id || 'all')}
                onPress={() => {
                  setFeedbackKind(opt.id);
                  setTimeout(() => loadTab('feedback'), 0);
                }}
                style={[styles.chip, on && styles.chipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                testID={'admin-feedback-kind-' + (opt.id || 'all')}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipScrollInner}>
          {FEEDBACK_STATUS_OPTIONS.map((opt) => {
            const on = feedbackStatus === opt.id;
            return (
              <Pressable
                key={'status-' + (opt.id || 'all')}
                onPress={() => {
                  setFeedbackStatus(opt.id);
                  setTimeout(() => loadTab('feedback'), 0);
                }}
                style={[styles.chip, on && styles.chipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                testID={'admin-feedback-status-' + (opt.id || 'all')}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.card}>
          {rows.length === 0 ? (
            <Text style={styles.emptyText}>{loading ? '불러오는 중…' : '조건에 맞는 제보가 없어요.'}</Text>
          ) : (
            rows.map((item, i) => (
              <View key={item.id || i} style={[styles.feedbackRow, i === rows.length - 1 && styles.rowLast]} testID={'admin-feedback-' + item.id}>
                <View style={styles.feedbackBody}>
                  <View style={styles.pinTitleRow}>
                    <Pill text={FEEDBACK_KIND_LABEL[item.kind] || '제안'} tone={item.kind === 'bug' ? 'coral' : 'muted'} />
                    <Pill text={FEEDBACK_STATUS_LABEL[item.status] || '접수됨'} tone={FEEDBACK_STATUS_TONE[item.status] || 'muted'} />
                    <Text style={styles.feedbackLikes}>👍 {item.likes != null ? item.likes : 0}</Text>
                  </View>
                  <Text style={styles.feedbackTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.feedbackContent} numberOfLines={2}>
                    {item.content}
                  </Text>
                  <Text style={styles.pinMeta} numberOfLines={1}>
                    {item.author || '익명'}
                    {item.userEmail ? ' (' + item.userEmail + ')' : ''}
                    {' · '}v{String(item.appVersion || '—').replace(/^v/i, '')}
                    {' · '}{sinceLabel(item.createdAt)}
                  </Text>

                  <View style={styles.feedbackStatusRow}>
                    {['open', 'applied', 'fixed'].map((status) => {
                      const on = item.status === status;
                      return (
                        <Pressable
                          key={status}
                          style={[styles.statusBtn, on && styles.statusBtnOn]}
                          onPress={() => changeFeedbackStatus(item, status)}
                          disabled={busy || on}
                          accessibilityRole="button"
                          accessibilityLabel={FEEDBACK_STATUS_LABEL[status] + ' 으로 바꾸기'}
                          testID={'admin-feedback-' + item.id + '-' + status}
                        >
                          <Text style={[styles.statusBtnText, on && styles.statusBtnTextOn]}>
                            {FEEDBACK_STATUS_LABEL[status]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <Pressable
                  style={styles.deleteBtn}
                  onPress={() => setConfirm({ kind: 'feedback', target: item })}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="제보 삭제"
                >
                  <Ionicons name="trash-outline" size={15} color="#B42318" />
                </Pressable>
              </View>
            ))
          )}
        </View>
      </>
    );
  };

  /** DB 함수가 아직 없을 때 — SQL 한 번만 실행하면 된다는 안내 */
  const renderSchemaSetup = () => (
    <View style={styles.setupCard}>
      <View style={styles.setupHead}>
        <Ionicons name="construct" size={18} color={colors.coralDark} />
        <Text style={styles.setupTitle}>어드민 DB 준비가 한 단계 남았어요</Text>
      </View>
      <Text style={styles.setupText}>
        Supabase 대시보드 → SQL Editor 에서 저장소의 <Text style={styles.setupCode}>supabase/admin.sql</Text> 을
        한 번 실행해 주세요. 실행하면 회원·장소 목록과 플랜 변경·삭제가 켜집니다.
      </Text>
      <Text style={styles.setupSub}>{schemaMissing}</Text>
    </View>
  );

  // ── 틀 ─────────────────────────────────────────
  const body =
    gate === 'ready' ? (
      schemaMissing ? (
        renderSchemaSetup()
      ) : tab === 'dashboard' ? (
        renderDashboard()
      ) : tab === 'members' ? (
        renderMembers()
      ) : tab === 'pins' ? (
        renderPins()
      ) : (
        renderFeedback()
      )
    ) : (
      renderGate()
    );

  const navItems = TABS.map((t) => {
    const on = tab === t.id;
    return (
      <Pressable
        key={t.id}
        onPress={() => setTab(t.id)}
        style={[wide ? styles.sideItem : styles.tabItem, on && (wide ? styles.sideItemOn : styles.tabItemOn)]}
        accessibilityRole="button"
        accessibilityLabel={t.label}
      >
        <Ionicons name={t.icon} size={wide ? 16 : 15} color={on ? (wide ? colors.white : colors.coralDark) : colors.textSub} />
        <Text style={[wide ? styles.sideText : styles.tabText, on && (wide ? styles.sideTextOn : styles.tabTextOn)]}>
          {t.label}
        </Text>
      </Pressable>
    );
  });

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.shieldBadge}>
            <Ionicons name="shield-checkmark" size={15} color={colors.white} />
          </View>
          <View>
            <Text style={styles.headerTitle}>릴스핀 어드민</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {gate === 'ready' ? email || PREVIEW_EMAIL : '관리자 전용'}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {gate === 'ready' ? (
            <>
              <Pressable
                style={styles.headerBtn}
                onPress={() => loadTab(tab)}
                accessibilityRole="button"
                accessibilityLabel="새로고침"
              >
                <Ionicons name="refresh" size={15} color={colors.white} />
                {wide ? <Text style={styles.headerBtnText}>새로고침</Text> : null}
              </Pressable>
              <Pressable style={styles.headerBtn} onPress={doSignOut} accessibilityRole="button" accessibilityLabel="로그아웃">
                <Ionicons name="log-out-outline" size={15} color={colors.white} />
                {wide ? <Text style={styles.headerBtnText}>로그아웃</Text> : null}
              </Pressable>
            </>
          ) : null}
        </View>
      </View>

      {preview ? (
        <View style={styles.previewBar}>
          <Ionicons name="eye-outline" size={13} color="#7A5B00" />
          <Text style={styles.previewText}>미리보기 — 실제 회원·장소 데이터가 아니에요 (저장되지 않음)</Text>
        </View>
      ) : null}

      <View style={[styles.body, wide && styles.bodyWide]}>
        {wide ? <View style={styles.sidebar}>{navItems}</View> : null}
        <ScrollView style={styles.content} contentContainerStyle={[styles.contentInner, wide && styles.contentInnerWide]}>
          {!wide && gate === 'ready' ? <View style={styles.tabsRow}>{navItems}</View> : null}
          {body}
          <Text style={styles.footNote}>릴스핀 v2.23 · 관리자 화면은 서버에서 권한을 다시 확인합니다</Text>
        </ScrollView>
      </View>

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <ConfirmModal
        open={!!confirm}
        danger
        busy={busy}
        title={
          confirm && confirm.kind === 'member'
            ? '회원을 삭제할까요?'
            : confirm && confirm.kind === 'feedback'
            ? '제보를 삭제할까요?'
            : '핀을 삭제할까요?'
        }
        message={
          confirm && confirm.kind === 'member'
            ? (confirm.target.nickname || '') + ' (' + (confirm.target.email || '') + ') 님과 저장한 핀 ' + (confirm.target.pinCount || 0) + '개가 함께 지워집니다. 되돌릴 수 없어요.'
            : confirm && confirm.kind === 'feedback'
            ? '“' + (confirm.target.title || '') + '” 제보가 게시판에서 지워집니다. 되돌릴 수 없어요.'
            : confirm
            ? '“' + (confirm.target.name || '') + '” 핀이 ' + (confirm.target.nickname || confirm.target.email || '') + ' 님의 지도에서 지워집니다. 되돌릴 수 없어요.'
            : ''
        }
        confirmLabel="삭제"
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === 'member') return removeMember(confirm.target);
          if (confirm.kind === 'feedback') return removeFeedback(confirm.target);
          return removePin(confirm.target);
        }}
        onCancel={() => setConfirm(null)}
      />

      <PinEditModal
        target={editing}
        categories={categories}
        busy={busy}
        onCancel={() => setEditing(null)}
        onSave={savePin}
      />
    </View>
  );
}

export const ADMIN_PATH_PATTERN = /^\/admin(\/|\?|$)/;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.charcoal,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shieldBadge: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: colors.white, fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  headerSub: { color: colors.charcoalSub, fontSize: 11, marginTop: 1, maxWidth: 210 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.charcoalPill,
  },
  headerBtnText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  previewBar: {
    backgroundColor: '#FFF7CC',
    paddingVertical: 7,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewText: { color: '#7A5B00', fontSize: 11, fontWeight: '700' },

  body: { flex: 1 },
  bodyWide: { flexDirection: 'row' },
  sidebar: { width: 210, padding: 14, gap: 6, borderRightWidth: 1, borderRightColor: colors.line, backgroundColor: colors.white },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  sideItemOn: { backgroundColor: colors.charcoal },
  sideText: { fontSize: 13, fontWeight: '700', color: colors.textSub },
  sideTextOn: { color: colors.white },

  content: { flex: 1 },
  contentInner: { padding: 14, paddingBottom: 40 },
  contentInnerWide: { padding: 24, maxWidth: 1060, width: '100%', alignSelf: 'center' },

  tabsRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabItemOn: { backgroundColor: colors.coralSoft, borderColor: colors.coralSoft2 },
  tabText: { fontSize: 12, fontWeight: '700', color: colors.textSub },
  tabTextOn: { color: colors.coralDark },

  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  sectionHint: { fontSize: 11, color: colors.textMuted },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 8,
    gap: 8,
  },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  statCard: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 140,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  statLabel: { fontSize: 11, color: colors.textSub, fontWeight: '700' },
  statValue: { fontSize: 26, fontWeight: '800', color: colors.text, marginTop: 6, letterSpacing: -0.5 },
  statSub: { fontSize: 10, color: colors.textMuted, marginTop: 2 },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  rowLast: { borderBottomWidth: 0 },

  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  rankBadge: { width: 22, height: 22, borderRadius: 7, backgroundColor: colors.lineSoft, alignItems: 'center', justifyContent: 'center' },
  rankBadgeTop: { backgroundColor: colors.coral },
  rankNumber: { fontSize: 11, fontWeight: '800', color: colors.textSub },
  rankNumberTop: { color: colors.white },
  rankBody: { flex: 1 },
  rankName: { fontSize: 13, fontWeight: '700', color: colors.text },
  rankMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rankCount: { alignItems: 'flex-end' },
  rankSaves: { fontSize: 14, fontWeight: '800', color: colors.coralDark },
  rankUsers: { fontSize: 10, color: colors.textMuted },

  toolbar: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.text, padding: 0, outlineStyle: 'none' },
  searchBtn: { backgroundColor: colors.charcoal, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  searchBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  memberRowWide: { paddingVertical: 13 },
  memberMain: { flex: 1 },
  memberTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  memberName: { fontSize: 13.5, fontWeight: '800', color: colors.text, maxWidth: 180 },
  memberEmail: { fontSize: 11.5, color: colors.textSub, marginTop: 3 },
  memberMeta: { fontSize: 10.5, color: colors.textMuted, marginTop: 3 },
  memberActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.white,
  },
  planBtnText: { fontSize: 11, fontWeight: '700', color: colors.textSub },
  deleteBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3F2',
  },
  editBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lineSoft,
  },

  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  pinBody: { flex: 1 },
  pinTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  pinName: { fontSize: 13.5, fontWeight: '800', color: colors.text, maxWidth: 200 },
  pinAddress: { fontSize: 11.5, color: colors.textSub, marginTop: 3 },
  pinMeta: { fontSize: 10.5, color: colors.textMuted, marginTop: 3 },
  pinActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // v2.23 — 💬 제보 탭
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  feedbackBody: { flex: 1 },
  feedbackLikes: { fontSize: 10.5, fontWeight: '800', color: colors.coralDark },
  feedbackTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text, marginTop: 5 },
  feedbackContent: { fontSize: 11.5, color: colors.textSub, lineHeight: 17, marginTop: 3 },
  feedbackStatusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  statusBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  statusBtnOn: { backgroundColor: colors.charcoal, borderColor: colors.charcoal },
  statusBtnText: { fontSize: 10.5, fontWeight: '800', color: colors.textSub },
  statusBtnTextOn: { color: colors.white },

  chipScroll: { maxHeight: 40, marginBottom: 10 },
  chipScrollInner: { gap: 6, alignItems: 'center', paddingRight: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.charcoal, borderColor: colors.charcoal },
  chipText: { fontSize: 11.5, fontWeight: '700', color: colors.textSub },
  chipTextOn: { color: colors.white },

  emptyText: { padding: 20, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  footNote: { marginTop: 18, fontSize: 10, color: colors.textMuted, textAlign: 'center' },

  pill: { paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 999 },
  pillText: { fontSize: 10, fontWeight: '800' },

  setupCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    marginTop: 10,
  },
  setupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  setupTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  setupText: { fontSize: 12.5, color: colors.textSub, lineHeight: 20 },
  setupCode: { fontWeight: '800', color: colors.coralDark },
  setupSub: { marginTop: 10, fontSize: 11, color: colors.textMuted },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 26, minHeight: 420 },
  centerText: { marginTop: 10, fontSize: 12, color: colors.textSub },
  lockIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  lockIconDenied: { backgroundColor: '#FEF3F2' },
  gateTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 8, textAlign: 'center' },
  gateText: { fontSize: 12.5, color: colors.textSub, textAlign: 'center', lineHeight: 19, marginBottom: 18 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginBottom: 14,
  },
  googleBtnText: { fontSize: 13, fontWeight: '800', color: colors.text },
  ghostBtn: {
    backgroundColor: colors.charcoal,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 11,
    marginBottom: 14,
  },
  ghostBtnText: { color: colors.white, fontSize: 12.5, fontWeight: '800' },
  linkText: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'underline' },

  modalDim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: colors.white, borderRadius: 18, padding: 18 },
  modalTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  modalMessage: { fontSize: 12.5, color: colors.textSub, lineHeight: 19, marginTop: 8 },
  modalRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  modalBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 12 },
  modalCancel: { backgroundColor: colors.lineSoft },
  modalCancelText: { fontSize: 13, fontWeight: '800', color: colors.textSub },
  modalConfirm: { backgroundColor: colors.charcoal },
  modalDanger: { backgroundColor: '#D92D20' },
  modalConfirmText: { fontSize: 13, fontWeight: '800', color: colors.white },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: colors.textSub, marginTop: 12, marginBottom: 5 },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.bg,
    outlineStyle: 'none',
  },

  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: colors.charcoal,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  toastText: { color: colors.white, fontSize: 12, fontWeight: '700' },
});
