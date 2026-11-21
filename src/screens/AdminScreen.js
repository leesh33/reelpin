/**
 * src/screens/AdminScreen.js — v2.21 🛡️ 어드민(`/admin`)
 * ─────────────────────────────────────────────────────────────
 * 상훈 님 요청(2026-11-17):
 *   "릴스핀말이야 어드민도 필요하지 않을까?? 회원관리도 해야하고 장소관리(?)도 필요하지 않을까"
 *
 * 화면 구성
 *   · 로그인 전 … 관리자 계정으로 로그인 안내 (구글 로그인)
 *   · 로그인 후 … ① 📊 대시보드 ② 👥 회원 관리 ③ 📍 장소(핀) 관리 ④ 💬 제보 (v2.23)
 *                ⑤ 📌 기획전·배너 (v2.31 — 컬렉션 탭의 배너·운영자 추천 기획전)
 *     - 데스크톱: 왼쪽 내비 + 넓은 표 / 모바일(390px): 상단 탭 + 카드형 목록
 *   · 권한은 **서버(`/api/admin`)와 DB 함수**가 최종 판단합니다.
 *     이 화면은 안내만 하고, 401·403 이 오면 그대로 잠금 화면으로 돌아갑니다.
 *
 * 미리보기: 주소에 `?preview=1` 을 붙이면 **모의 데이터**로 화면만 보여 줍니다.
 *   (저장·삭제 요청은 보내지 않습니다 — 디자인 확인·스크린샷용)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
// v2.32 — 기획전 편집 모달의 포스터 미리보기 (앱과 같은 규칙으로 그립니다)
import { curatedChipLabel, curatedCoverLine } from '../utils/curation';
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
  // v2.31 — 📌 컬렉션 탭의 배너 · 운영자 추천 기획전
  { id: 'curation', label: '기획전·배너', icon: 'megaphone' },
];

/** v2.31 — 배지·이모지·색 선택지 (화면에서만 쓰는 기본값) */
const CURATION_BADGE_OPTIONS = ['기획전', '스폰서', '추천'];
const CURATED_EMOJI_OPTIONS = ['📂', '🍜', '☕', '🍰', '🍱', '🏞️', '🛍️', '🎬', '🚗', '🧸'];
const CURATED_COLOR_OPTIONS = ['#0D9488', '#F2A03D', '#0FA968', '#3B82F6', '#8B5CF6', '#EC4899'];

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
const FEEDBACK_STATUS_TONE = { open: 'muted', applied: 'brand', fixed: 'visit' };

/** v2.41 — 📊 접속자 통계 (7·14·30일 추이)
 *  · 앱이 부르는 RPC 는 `app_visit_track('reelpin', …)` (supabase/app_visits.sql)
 *  · 어드민 화면은 `/api/admin?view=visits` 로 오늘/전체 접속자와 일별 추이를 받습니다.
 */
const VISIT_DAY_OPTIONS = [14, 30];
const VISIT_PREVIEW_BASE = [
  3, 5, 4, 8, 11, 7, 6, 9, 13, 10, 12, 15, 18, 21,
  14, 17, 12, 9, 11, 16, 19, 22, 18, 15, 13, 17, 20, 24, 26, 23,
];

/** `YYYY-MM-DD` (로컬 기준 — 미리보기용) */
function isoDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 차트 아래 날짜 라벨 `11.22` */
function shortDay(value) {
  const raw = String(value || '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  return m ? `${m[2]}.${m[3]}` : raw.slice(-5).replace('-', '.');
}

/** 미리보기용 접속자 통계 — 오늘까지 14·30일 (실제 값이 아닙니다). */
function previewVisitStats(days) {
  const count = days === 30 ? 30 : 14;
  const today = new Date();
  const daily = [];
  let total = 0;
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const visitors = VISIT_PREVIEW_BASE[(count - 1 - i) % VISIT_PREVIEW_BASE.length];
    total += visitors;
    daily.push({ date: isoDay(d), visitors, views: visitors * 2 + 4 });
  }
  const todayRow = daily[daily.length - 1] || { visitors: 0, views: 0 };
  return {
    app_id: 'reelpin',
    today_visitors: todayRow.visitors,
    today_views: todayRow.views,
    total_visitors: total,
    total_views: total * 2 + count * 4,
    days: count,
    daily,
    preview: true,
  };
}

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
  // v2.41 — 📊 접속자 통계 미리보기 (실제 값이 아닙니다)
  visits: previewVisitStats(14),
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
  // v2.31 — 📌 기획전·배너 탭 미리보기 (실제 데이터가 아닙니다)
  banners: [
    { id: 'b-1', title: '이번 주 릴스핀 인기 맛집', subtitle: '릴스에서 본 그 가게, 지금 담아 두세요', badge: '기획전', linkUrl: '', imageUrl: '', sortOrder: 0, active: true, createdAt: '2026-11-18T07:00:00+09:00' },
    { id: 'b-2', title: '연말 모임 장소, 미리 잡아 두세요', subtitle: '스폰서 · ○○예약', badge: '스폰서', linkUrl: 'https://example.com', imageUrl: '', sortOrder: 1, active: false, createdAt: '2026-11-17T18:00:00+09:00' },
  ],
  curated: [
    {
      id: 'c-1',
      title: '영등포 직장인 점심 코스',
      description: '회사 근처에서 12시에 바로 갈 수 있는 곳',
      sponsor: '운영자 추천',
      badge: '기획전',
      emoji: '🍜',
      color: '#0D9488',
      imageUrl: '',
      chip: '점심',
      places: [
        { name: '베통 성수', category: '베이커리', area: '성수동', address: '서울 성동구 연무장길 18', lat: 37.5445, lng: 127.0557 },
        { name: '디오디아', category: '카페', area: '연남동', address: '서울 마포구 동교로 00', lat: 37.5628, lng: 126.9252 },
      ],
      placeCount: 2,
      sortOrder: 0,
      active: true,
      createdAt: '2026-11-18T07:00:00+09:00',
    },
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

/** 미리보기용 — 모의 제보를 유형·상태로 거릅니다. */
function filterPreviewFeedback(list, kind, status) {
  return (Array.isArray(list) ? list : []).filter(
    (item) => (!kind || item.kind === kind) && (!status || item.status === status)
  );
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
  return { ok: true, status: res.status, data: (data && data.data) != null ? data.data : data, email: data && data.email, extrasSkipped: Boolean(data && data.extrasSkipped) };
}

// ── 작은 조각들 ─────────────────────────────────────────────
function Pill({ text, tone = 'muted' }) {
  const tones = {
    muted: { bg: colors.lineSoft, fg: colors.mutedBadgeText },
    brand: { bg: colors.brandSoft, fg: colors.brandDark },
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

/**
 * v2.41 — 📊 일별 접속자 추이 막대 그래프.
 *   외부 차트 라이브러리 없이 View 높이로만 그립니다(웹·앱 같은 코드).
 *   막대 = 그날의 순 방문자(visitors) 수. 값은 막대 위에, 날짜는 아래에 조금씩만 씁니다.
 */
function VisitChart({ daily, days }) {
  const list = Array.isArray(daily) ? daily : [];
  if (list.length === 0) return null;
  const max = Math.max(1, ...list.map((d) => Number(d.visitors) || 0));
  const labelEvery = days > 20 ? 5 : days > 10 ? 3 : 1;
  return (
    <View style={styles.chartBox} testID="visit-chart">
      <View style={styles.chartRow}>
        {list.map((d, i) => {
          const value = Number(d.visitors) || 0;
          const height = Math.round((value / max) * 84);
          const showLabel = i === list.length - 1 || i % labelEvery === 0;
          return (
            <View
              key={String(d.date || i)}
              style={styles.chartCol}
              accessibilityLabel={`${shortDay(d.date)} 접속자 ${value}명·조회 ${Number(d.views) || 0}회`}
            >
              <Text style={styles.chartValue} numberOfLines={1}>
                {value > 0 ? value : ''}
              </Text>
              <View style={styles.chartTrack}>
                <View
                  style={[
                    styles.chartBar,
                    { height: Math.max(value > 0 ? 3 : 1, height) },
                    value === 0 && styles.chartBarZero,
                  ]}
                />
              </View>
              <Text style={styles.chartDay} numberOfLines={1}>
                {showLabel ? shortDay(d.date) : ''}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.chartHint}>막대 = 그날 접속한 사람 수(순 방문자) · 한국 시간 기준</Text>
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

// ── v2.31 📌 배너 · 🗂️ 기획전 편집 모달 ────────────────────
function ToggleChip({ on, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.toggleChip, on && styles.toggleChipOn]}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
    >
      <View style={[styles.toggleDot, on && styles.toggleDotOn]} />
      <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{on ? '켜짐' : '꺼짐'}</Text>
    </Pressable>
  );
}

function BannerEditModal({ target, onCancel, onSave, busy }) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [badge, setBadge] = useState('기획전');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!target) return;
    setTitle(target.title || '');
    setSubtitle(target.subtitle || '');
    setBadge(target.badge || '기획전');
    setLinkUrl(target.linkUrl || '');
    setImageUrl(target.imageUrl || '');
    setSortOrder(String(target.sortOrder != null ? target.sortOrder : 0));
    setActive(target.active !== false);
  }, [target]);
  const thumb = /^https?:\/\//i.test(imageUrl.trim()) ? imageUrl.trim() : '';
  const hasLink = /^https?:\/\//i.test(linkUrl.trim());

  if (!target) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalDim}>
        <ScrollView style={styles.modalCardTall} contentContainerStyle={styles.modalCardTallInner}>
          <Text style={styles.modalTitle}>{target.id ? '배너 수정' : '새 배너'}</Text>
          <Text style={styles.modalMessage}>컬렉션 탭에서 테마 칩 아래에 보이는 한 줄 배너입니다 · 켜 둔 것만 순서대로 보입니다</Text>

          <Text style={styles.fieldLabel}>제목</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={styles.fieldInput}
            placeholder="예: 이번 주 릴스핀 인기 맛집"
            placeholderTextColor={colors.textMuted}
            maxLength={40}
            accessibilityLabel="배너 제목"
            testID="banner-title-input"
          />

          <Text style={styles.fieldLabel}>부제 (한 줄)</Text>
          <TextInput
            value={subtitle}
            onChangeText={setSubtitle}
            style={styles.fieldInput}
            placeholder="예: 릴스에서 본 그 가게, 지금 담아 두세요"
            placeholderTextColor={colors.textMuted}
            maxLength={80}
            accessibilityLabel="배너 부제"
          />

          <Text style={styles.fieldLabel}>배지</Text>
          <View style={styles.chipWrap}>
            {CURATION_BADGE_OPTIONS.map((b) => (
              <Pressable key={b} onPress={() => setBadge(b)} style={[styles.chip, badge === b && styles.chipOn]}>
                <Text style={[styles.chipText, badge === b && styles.chipTextOn]}>{b}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={badge}
            onChangeText={setBadge}
            style={styles.fieldInput}
            placeholder="배지 직접 입력 (10자)"
            placeholderTextColor={colors.textMuted}
            maxLength={10}
            accessibilityLabel="배너 배지"
          />

          <Text style={styles.fieldLabel}>링크 (선택 · http/https)</Text>
          <TextInput
            value={linkUrl}
            onChangeText={setLinkUrl}
            style={styles.fieldInput}
            placeholder="https://..."
            placeholderTextColor={colors.textMuted}
            maxLength={300}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="배너 링크"
          />

          {/* v2.32 — 한 줄 배너 왼쪽에 들어갈 작은 사진 (없으면 배지가 그 자리에) */}
          <Text style={styles.fieldLabel}>썸네일 이미지 URL (선택 · http/https)</Text>
          <TextInput
            value={imageUrl}
            onChangeText={setImageUrl}
            style={styles.fieldInput}
            placeholder="https://…/banner.jpg"
            placeholderTextColor={colors.textMuted}
            maxLength={500}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="배너 썸네일 이미지 URL"
            testID="banner-image-url"
          />
          <View style={styles.previewBox} testID="banner-preview">
            <View style={styles.slimPreviewRow}>
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.slimPreviewThumb} resizeMode="cover" />
              ) : (
                <View style={styles.slimPreviewBadge}>
                  <Text style={styles.slimPreviewBadgeText} numberOfLines={1}>
                    {badge.trim() || '기획전'}
                  </Text>
                </View>
              )}
              <Text style={styles.slimPreviewTitle} numberOfLines={1}>
                {title.trim() || '배너 제목'}
                {subtitle.trim() ? <Text style={styles.slimPreviewSub}>{'  ' + subtitle.trim()}</Text> : null}
              </Text>
              {hasLink ? <Ionicons name="chevron-forward" size={13} color={colors.textMuted} /> : null}
            </View>
            <Text style={styles.previewHint}>컬렉션 탭의 한 줄 배너 미리보기</Text>
          </View>

          <View style={styles.modalSplitRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>순서 (작을수록 앞)</Text>
              <TextInput
                value={sortOrder}
                onChangeText={setSortOrder}
                style={styles.fieldInput}
                keyboardType="number-pad"
                maxLength={4}
                accessibilityLabel="배너 순서"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>노출</Text>
              <ToggleChip on={active} label="배너 노출" onPress={() => setActive((v) => !v)} />
            </View>
          </View>

          <View style={styles.modalRow}>
            <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={onCancel} disabled={busy}>
              <Text style={styles.modalCancelText}>취소</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalConfirm]}
              onPress={() =>
                onSave({
                  id: target.id || undefined,
                  title: title.trim(),
                  subtitle: subtitle.trim(),
                  badge: badge.trim() || '기획전',
                  linkUrl: linkUrl.trim(),
                  imageUrl: thumb,
                  sortOrder: Number(sortOrder) || 0,
                  active,
                })
              }
              disabled={busy || !title.trim()}
              testID="banner-save"
            >
              {busy ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.modalConfirmText}>저장</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

/** 핀 하나를 기획전 장소 모양으로 (좌표·이름·분류·동네·주소만) */
function placeFromPin(pin) {
  const coord = (value, kind) => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (kind === 'lat' && (n < -90 || n > 90)) return null;
    if (kind === 'lng' && (n < -180 || n > 180)) return null;
    return n;
  };
  return {
    name: String((pin && pin.name) || '').trim(),
    category: String((pin && pin.category) || ''),
    area: String((pin && pin.area) || ''),
    address: String((pin && pin.address) || ''),
    lat: coord(pin && pin.lat, 'lat'),
    lng: coord(pin && pin.lng, 'lng'),
  };
}

function CuratedEditModal({ target, onCancel, onSave, busy, pins, onLoadPins }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sponsor, setSponsor] = useState('');
  const [badge, setBadge] = useState('기획전');
  const [emoji, setEmoji] = useState('📂');
  const [color, setColor] = useState('#0D9488');
  const [imageUrl, setImageUrl] = useState('');
  const [chip, setChip] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [active, setActive] = useState(true);
  const [places, setPlaces] = useState([]);
  const [query, setQuery] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualArea, setManualArea] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');

  useEffect(() => {
    if (!target) return;
    setTitle(target.title || '');
    setDescription(target.description || '');
    setSponsor(target.sponsor || '');
    setBadge(target.badge || '기획전');
    setEmoji(target.emoji || '📂');
    setColor(target.color || '#0D9488');
    setImageUrl(target.imageUrl || '');
    setChip(target.chip || '');
    setSortOrder(String(target.sortOrder != null ? target.sortOrder : 0));
    setActive(target.active !== false);
    setPlaces(Array.isArray(target.places) ? target.places.slice() : []);
    setQuery('');
    setManualName('');
    setManualArea('');
    setManualAddress('');
    setManualLat('');
    setManualLng('');
  }, [target]);

  useEffect(() => {
    if (target && typeof onLoadPins === 'function') onLoadPins();
  }, [target, onLoadPins]);

  if (!target) return null;

  const posterImage = /^https?:\/\//i.test(imageUrl.trim()) ? imageUrl.trim() : '';
  const previewChip = curatedChipLabel({ chip: chip.trim(), title: title.trim() });

  const chosen = new Set(places.map((p) => String(p.name || '').trim().toLowerCase()));
  const keyword = query.trim().toLowerCase();
  const pinRows = (Array.isArray(pins) ? pins : [])
    .filter((p) => {
      if (!p || !p.name) return false;
      if (!keyword) return true;
      return [p.name, p.area, p.address, p.category].filter(Boolean).join(' ').toLowerCase().indexOf(keyword) >= 0;
    })
    .slice(0, 40);

  const addPlace = (place) => {
    if (!place || !place.name) return;
    setPlaces((list) => {
      const key = String(place.name).trim().toLowerCase();
      if (list.some((p) => String(p.name || '').trim().toLowerCase() === key)) return list;
      return list.concat([place]).slice(0, 50);
    });
  };

  const removePlace = (name) => {
    setPlaces((list) => list.filter((p) => String(p.name || '').trim() !== String(name || '').trim()));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalDim}>
        <ScrollView style={styles.modalCardTall} contentContainerStyle={styles.modalCardTallInner}>
          <Text style={styles.modalTitle}>{target.id ? '기획전 수정' : '새 기획전'}</Text>
          <Text style={styles.modalMessage}>
            컬렉션 탭 `운영자 추천 · 기획전` 에 보입니다 · 사용자는 [담기] 로 내 지도에 한 번에 담습니다
          </Text>

          <Text style={styles.fieldLabel}>제목</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={styles.fieldInput}
            placeholder="예: 영등포 직장인 점심 코스"
            placeholderTextColor={colors.textMuted}
            maxLength={40}
            accessibilityLabel="기획전 제목"
            testID="curated-title-input"
          />

          <Text style={styles.fieldLabel}>한 줄 설명</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            style={styles.fieldInput}
            placeholder="예: 회사 근처에서 12시에 바로 갈 수 있는 곳"
            placeholderTextColor={colors.textMuted}
            maxLength={100}
            accessibilityLabel="기획전 설명"
          />

          <View style={styles.modalSplitRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>스폰서 표기 (선택)</Text>
              <TextInput
                value={sponsor}
                onChangeText={setSponsor}
                style={styles.fieldInput}
                placeholder="예: 운영자 추천 · ○○"
                placeholderTextColor={colors.textMuted}
                maxLength={20}
                accessibilityLabel="기획전 스폰서"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>순서</Text>
              <TextInput
                value={sortOrder}
                onChangeText={setSortOrder}
                style={styles.fieldInput}
                keyboardType="number-pad"
                maxLength={4}
                accessibilityLabel="기획전 순서"
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>배지</Text>
          <View style={styles.chipWrap}>
            {CURATION_BADGE_OPTIONS.map((b) => (
              <Pressable key={b} onPress={() => setBadge(b)} style={[styles.chip, badge === b && styles.chipOn]}>
                <Text style={[styles.chipText, badge === b && styles.chipTextOn]}>{b}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>테마</Text>
          <View style={styles.chipWrap}>
            {CURATED_EMOJI_OPTIONS.map((e) => (
              <Pressable key={e} onPress={() => setEmoji(e)} style={[styles.chip, emoji === e && styles.chipOn]}>
                <Text style={[styles.chipText, emoji === e && styles.chipTextOn]}>{e}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.chipWrap}>
            {CURATED_COLOR_OPTIONS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotOn]}
                accessibilityLabel={'색 ' + c}
              />
            ))}
            <ToggleChip on={active} label="기획전 노출" onPress={() => setActive((v) => !v)} />
          </View>

          {/* v2.32 — 컬렉션 탭 카드에 들어갈 사진 · 빠른 테마 칩 */}
          <Text style={styles.fieldLabel}>썸네일 이미지 URL (선택 · http/https)</Text>
          <TextInput
            value={imageUrl}
            onChangeText={setImageUrl}
            style={styles.fieldInput}
            placeholder="https://…/poster.jpg · 비우면 색 + 이모지 커버"
            placeholderTextColor={colors.textMuted}
            maxLength={500}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="기획전 썸네일 이미지 URL"
            testID="curated-image-url"
          />
          <Text style={styles.fieldLabel}>빠른 테마 칩 이름 (선택 · 10자)</Text>
          <TextInput
            value={chip}
            onChangeText={setChip}
            style={styles.fieldInput}
            placeholder="예: 데이트 · 비우면 제목 앞 두 낱말"
            placeholderTextColor={colors.textMuted}
            maxLength={10}
            autoCapitalize="none"
            accessibilityLabel="기획전 빠른 테마 칩 이름"
            testID="curated-chip-input"
          />

          {/* 앱과 같은 규칙으로 그리는 포스터 카드 · 테마 칩 미리보기 */}
          <View style={styles.posterPreviewBox} testID="curated-poster-preview">
            <View style={styles.posterPreviewRow}>
              <View style={styles.posterPreviewCard}>
                <View style={styles.posterPreviewThumb}>
                  {posterImage ? (
                    <Image source={{ uri: posterImage }} style={styles.posterPreviewImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.posterPreviewFallback, { backgroundColor: color + '24' }]}>
                      <Text style={{ fontSize: 30 }}>{emoji}</Text>
                    </View>
                  )}
                  <View style={styles.posterPreviewBadge}>
                    <Text style={styles.posterPreviewBadgeText} numberOfLines={1}>
                      {badge.trim() || '기획전'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.posterPreviewTitle} numberOfLines={2}>
                  {title.trim() || '기획전 제목'}
                </Text>
                <Text style={styles.posterPreviewSub} numberOfLines={1}>
                  {curatedCoverLine({ places })}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                <Text style={styles.previewHintLabel}>포스터 카드</Text>
                <Text style={styles.previewSubHint}>컬렉션 탭에서 좌우로 넘겨 보는 카드</Text>
                <Text style={[styles.previewHintLabel, { marginTop: 6 }]}>빠른 테마 칩</Text>
                <View style={styles.previewChipPill}>
                  <Text style={{ fontSize: 13 }}>{emoji}</Text>
                  <Text style={styles.previewChipPillText} numberOfLines={1}>
                    {previewChip || '테마 칩'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <Text style={styles.fieldLabel}>담긴 장소 {places.length}곳 (최대 50)</Text>
          {places.length ? (
            <View style={styles.pickedList}>
              {places.map((place, index) => (
                <View key={(place.name || '') + index} style={styles.pickedRow}>
                  <Text style={styles.pickedRank}>{index + 1}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.pickedName} numberOfLines={1}>
                      {place.name}
                    </Text>
                    <Text style={styles.pickedMeta} numberOfLines={1}>
                      {[place.category, place.area].filter(Boolean).join(' · ') || '분류 없음'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => removePlace(place.name)}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={place.name + ' 빼기'}
                  >
                    <Ionicons name="close-circle" size={17} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>아직 담은 장소가 없어요 · 아래에서 고르거나 직접 추가하세요.</Text>
          )}

          <Text style={styles.fieldLabel}>저장된 장소에서 고르기</Text>
          <SearchBox value={query} onChange={setQuery} onSubmit={() => {}} placeholder="장소명·동네·주소 검색" />
          <View style={styles.pinPickList}>
            {!pinRows.length ? (
              <Text style={styles.emptyText}>조건에 맞는 장소가 없어요.</Text>
            ) : (
              pinRows.map((pin, i) => {
                const key = String(pin.name || '').trim().toLowerCase();
                const on = chosen.has(key);
                return (
                  <Pressable
                    key={(pin.pinId || '') + i}
                    style={[styles.pinPickRow, on && styles.pinPickRowOn]}
                    onPress={() => (on ? removePlace(pin.name) : addPlace(placeFromPin(pin)))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    aria-checked={on}
                    accessibilityLabel={(pin.name || '') + (on ? ' 빼기' : ' 담기')}
                    testID={'curated-pick-' + (pin.pinId || i)}
                  >
                    <View style={[styles.pickBox, on && styles.pickBoxOn]}>
                      {on ? <Ionicons name="checkmark" size={12} color={colors.white} /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.pickedName} numberOfLines={1}>
                        {pin.name}
                      </Text>
                      <Text style={styles.pickedMeta} numberOfLines={1}>
                        {[pin.category, pin.area, pin.address].filter(Boolean).join(' · ') || '주소 미확인'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>

          <Text style={styles.fieldLabel}>직접 추가 (저장된 곳에 없는 장소)</Text>
          <TextInput
            value={manualName}
            onChangeText={setManualName}
            style={styles.fieldInput}
            placeholder="장소 이름"
            placeholderTextColor={colors.textMuted}
            maxLength={80}
            accessibilityLabel="직접 추가 장소 이름"
          />
          <View style={styles.modalSplitRow}>
            <TextInput
              value={manualArea}
              onChangeText={setManualArea}
              style={[styles.fieldInput, { flex: 1 }]}
              placeholder="동네"
              placeholderTextColor={colors.textMuted}
              maxLength={40}
              accessibilityLabel="직접 추가 동네"
            />
            <TextInput
              value={manualAddress}
              onChangeText={setManualAddress}
              style={[styles.fieldInput, { flex: 1.6 }]}
              placeholder="주소"
              placeholderTextColor={colors.textMuted}
              maxLength={160}
              accessibilityLabel="직접 추가 주소"
            />
          </View>
          <View style={styles.modalSplitRow}>
            <TextInput
              value={manualLat}
              onChangeText={setManualLat}
              style={[styles.fieldInput, { flex: 1 }]}
              placeholder="위도 (선택)"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="직접 추가 위도"
            />
            <TextInput
              value={manualLng}
              onChangeText={setManualLng}
              style={[styles.fieldInput, { flex: 1 }]}
              placeholder="경도 (선택)"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="직접 추가 경도"
            />
            <Pressable
              style={styles.manualAddBtn}
              onPress={() => {
                addPlace({
                  name: manualName.trim(),
                  area: manualArea.trim(),
                  address: manualAddress.trim(),
                  category: '',
                  lat: Number.isFinite(Number(manualLat)) && manualLat !== '' ? Number(manualLat) : null,
                  lng: Number.isFinite(Number(manualLng)) && manualLng !== '' ? Number(manualLng) : null,
                });
                setManualName('');
                setManualArea('');
                setManualAddress('');
                setManualLat('');
                setManualLng('');
              }}
              disabled={!manualName.trim()}
              accessibilityRole="button"
              accessibilityLabel="장소 직접 추가"
            >
              <Text style={styles.manualAddText}>추가</Text>
            </Pressable>
          </View>
          <Text style={styles.coordHint}>좌표를 비우면 지도에는 찍히지 않아요(목록에는 남습니다).</Text>

          <View style={styles.modalRow}>
            <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={onCancel} disabled={busy}>
              <Text style={styles.modalCancelText}>취소</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalConfirm]}
              onPress={() =>
                onSave({
                  id: target.id || undefined,
                  title: title.trim(),
                  description: description.trim(),
                  sponsor: sponsor.trim(),
                  badge: badge.trim() || '기획전',
                  emoji,
                  color,
                  imageUrl: posterImage,
                  chip: chip.trim(),
                  sortOrder: Number(sortOrder) || 0,
                  active,
                  places,
                })
              }
              disabled={busy || !title.trim() || !places.length}
              testID="curated-save"
            >
              {busy ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.modalConfirmText}>저장</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
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
  // v2.41 — 📊 접속자 통계 (오늘/전체 접속자 · 14·30일 추이)
  const [visits, setVisits] = useState(preview ? PREVIEW_DATA.visits : null);
  const [visitDays, setVisitDays] = useState(14);
  const [visitError, setVisitError] = useState('');
  const [members, setMembers] = useState(preview ? PREVIEW_DATA.members : []);
  const [pins, setPins] = useState(preview ? PREVIEW_DATA.pins : []);
  const [memberQuery, setMemberQuery] = useState('');
  const [pinQuery, setPinQuery] = useState('');
  const [pinCategory, setPinCategory] = useState('');
  // v2.23 — 💬 제보 탭 (유형·상태 필터)
  const [feedback, setFeedback] = useState(preview ? PREVIEW_DATA.feedback : []);
  const [feedbackKind, setFeedbackKind] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState('');
  // v2.31 — 📌 배너 · 🗂️ 기획전 (컬렉션 탭에 보이는 것들)
  const [banners, setBanners] = useState(preview ? PREVIEW_DATA.banners : []);
  const [curated, setCurated] = useState(preview ? PREVIEW_DATA.curated : []);
  const [bannerEditing, setBannerEditing] = useState(null);
  const [curatedEditing, setCuratedEditing] = useState(null);
  const [curationPins, setCurationPins] = useState(preview ? PREVIEW_DATA.pins : []);

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
    async (which, overrides) => {
      // 필터 칩은 state 반영보다 먼저 불러오므로, 이번 요청의 값을 직접 넘겨받습니다.
      const o = overrides || {};
      const fbKind = o.kind !== undefined ? o.kind : feedbackKind;
      const fbStatus = o.status !== undefined ? o.status : feedbackStatus;
      if (preview) {
        // 미리보기 — 모의 제보도 필터가 실제로 걸리는 것처럼 보이도록 화면에서 직접 거릅니다.
        if (which === 'feedback') setFeedback(filterPreviewFeedback(PREVIEW_DATA.feedback, fbKind, fbStatus));
        if (which === 'curation') {
          setBanners(PREVIEW_DATA.banners);
          setCurated(PREVIEW_DATA.curated);
        }
        if (which === 'dashboard') {
          const dv = o.days !== undefined ? o.days : visitDays;
          setVisits(previewVisitStats(dv));
        }
        return;
      }
      const token = await currentToken();
      if (!token) {
        setGate('anon');
        return;
      }
      setLoading(true);
      try {
        if (which === 'dashboard') {
          const dv = o.days !== undefined ? o.days : visitDays;
          // 접속자 통계는 대시보드를 막지 않습니다 — 실패해도 나머지 요약은 그대로 보입니다.
          const [res, visitRes] = await Promise.all([
            callAdmin({ view: 'overview', token }),
            callAdmin({ view: 'visits', query: { days: dv }, token }),
          ]);
          if (!res.ok) throw res;
          setSchemaMissing('');
          setOverview(res.data || null);
          if (visitRes.ok) {
            setVisits(visitRes.data || null);
            setVisitError('');
          } else {
            setVisits(null);
            setVisitError(visitRes.message || '접속자 통계를 불러오지 못했어요.');
          }
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
            query: { kind: fbKind, status: fbStatus },
            token,
          });
          if (!res.ok) throw res;
          setSchemaMissing('');
          setFeedback(Array.isArray(res.data) ? res.data : []);
        } else if (which === 'curation') {
          // v2.31 — 배너·기획전을 한 번에 (둘 다 없으면 첫 배너를 바로 만들 수 있게 빈 목록)
          const [bannerRes, curatedRes] = await Promise.all([
            callAdmin({ view: 'banners', token }),
            callAdmin({ view: 'curated', token }),
          ]);
          if (!bannerRes.ok) throw bannerRes;
          if (!curatedRes.ok) throw curatedRes;
          setSchemaMissing('');
          setBanners(Array.isArray(bannerRes.data) ? bannerRes.data : []);
          setCurated(Array.isArray(curatedRes.data) ? curatedRes.data : []);
        } else if (which === 'curation-pins') {
          // 기획전 편집 모달 — 저장된 장소에서 고를 수 있게 전체 핀을 읽습니다.
          const res = await callAdmin({ view: 'pins', query: { q: '', category: '' }, token });
          if (!res.ok) throw res;
          setCurationPins(Array.isArray(res.data) ? res.data : []);
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
    [preview, currentToken, memberQuery, pinQuery, pinCategory, feedbackKind, feedbackStatus, visitDays, showToast]
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

  // ── v2.31 📌 배너 · 🗂️ 기획전 ────────────────────────
  const saveBannerItem = useCallback(
    async (values) => {
      if (preview) {
        setBannerEditing(null);
        showToast('미리보기에서는 저장되지 않아요');
        return;
      }
      setBusy(true);
      const token = await currentToken();
      const res = await callAdmin({ method: 'POST', token, body: { action: 'save-banner', ...values } });
      setBusy(false);
      if (!res.ok) {
        showToast(res.message || '배너를 저장하지 못했어요');
        return;
      }
      setBannerEditing(null);
      showToast(
        res.extrasSkipped
          ? '배너를 저장했어요 · 사진은 DB 준비 후 저장됩니다'
          : values.id
            ? '배너를 고쳤어요'
            : '배너를 올렸어요 · 컬렉션 탭 맨 위에 보입니다'
      );
      loadTab('curation');
    },
    [preview, currentToken, showToast, loadTab]
  );

  const toggleBannerItem = useCallback(
    async (item) => {
      if (!item) return;
      if (preview) {
        setBanners((list) => list.map((row) => (row.id === item.id ? { ...row, active: !row.active } : row)));
        showToast('미리보기에서는 저장되지 않아요');
        return;
      }
      setBusy(true);
      const token = await currentToken();
      const res = await callAdmin({
        method: 'POST',
        token,
        body: {
          action: 'save-banner',
          id: item.id,
          title: item.title,
          subtitle: item.subtitle,
          badge: item.badge,
          linkUrl: item.linkUrl,
          imageUrl: item.imageUrl || '',
          sortOrder: item.sortOrder,
          active: !item.active,
        },
      });
      setBusy(false);
      if (!res.ok) {
        showToast(res.message || '배너를 바꾸지 못했어요');
        return;
      }
      showToast('“' + item.title + '” 배너를 ' + (item.active ? '껐어요' : '켰어요'));
      loadTab('curation');
    },
    [preview, currentToken, showToast, loadTab]
  );

  const removeBannerItem = useCallback(
    async (item) => {
      setBusy(true);
      if (preview) {
        setBusy(false);
        setConfirm(null);
        showToast('미리보기에서는 저장되지 않아요');
        return;
      }
      const token = await currentToken();
      const res = await callAdmin({ method: 'POST', token, body: { action: 'delete-banner', id: item.id } });
      setBusy(false);
      setConfirm(null);
      if (!res.ok) {
        showToast(res.message || '배너를 지우지 못했어요');
        return;
      }
      showToast('“' + item.title + '” 배너를 지웠어요');
      loadTab('curation');
    },
    [preview, currentToken, showToast, loadTab]
  );

  const saveCuratedItem = useCallback(
    async (values) => {
      if (preview) {
        setCuratedEditing(null);
        showToast('미리보기에서는 저장되지 않아요');
        return;
      }
      setBusy(true);
      const token = await currentToken();
      const res = await callAdmin({ method: 'POST', token, body: { action: 'save-curated', ...values } });
      setBusy(false);
      if (!res.ok) {
        showToast(res.message || '기획전을 저장하지 못했어요');
        return;
      }
      setCuratedEditing(null);
      showToast(
        res.extrasSkipped
          ? '기획전을 저장했어요 · 사진·테마 칩은 DB 준비 후 저장됩니다'
          : values.id
            ? '기획전을 고쳤어요'
            : '기획전을 올렸어요 · 컬렉션 탭에 보입니다'
      );
      loadTab('curation');
    },
    [preview, currentToken, showToast, loadTab]
  );

  const toggleCuratedItem = useCallback(
    async (item) => {
      if (!item) return;
      if (preview) {
        setCurated((list) => list.map((row) => (row.id === item.id ? { ...row, active: !row.active } : row)));
        showToast('미리보기에서는 저장되지 않아요');
        return;
      }
      setBusy(true);
      const token = await currentToken();
      const res = await callAdmin({
        method: 'POST',
        token,
        body: {
          action: 'save-curated',
          id: item.id,
          title: item.title,
          description: item.description,
          sponsor: item.sponsor,
          badge: item.badge,
          emoji: item.emoji,
          color: item.color,
          imageUrl: item.imageUrl || '',
          chip: item.chip || '',
          places: item.places,
          sortOrder: item.sortOrder,
          active: !item.active,
        },
      });
      setBusy(false);
      if (!res.ok) {
        showToast(res.message || '기획전을 바꾸지 못했어요');
        return;
      }
      showToast('“' + item.title + '” 기획전을 ' + (item.active ? '껐어요' : '켰어요'));
      loadTab('curation');
    },
    [preview, currentToken, showToast, loadTab]
  );

  const removeCuratedItem = useCallback(
    async (item) => {
      setBusy(true);
      if (preview) {
        setBusy(false);
        setConfirm(null);
        showToast('미리보기에서는 저장되지 않아요');
        return;
      }
      const token = await currentToken();
      const res = await callAdmin({ method: 'POST', token, body: { action: 'delete-curated', id: item.id } });
      setBusy(false);
      setConfirm(null);
      if (!res.ok) {
        showToast(res.message || '기획전을 지우지 못했어요');
        return;
      }
      showToast('“' + item.title + '” 기획전을 지웠어요');
      loadTab('curation');
    },
    [preview, currentToken, showToast, loadTab]
  );

  const loadCurationPins = useCallback(() => {
    if (preview) return;
    loadTab('curation-pins');
  }, [preview, loadTab]);

  // ── 잠금 화면들 ──────────────────────────────────
  const renderGate = () => {
    if (gate === 'checking') {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.centerText}>어드민 권한을 확인하는 중…</Text>
        </View>
      );
    }
    if (gate === 'anon') {
      return (
        <View style={styles.centerBox}>
          <View style={styles.lockIcon}>
            <Ionicons name="shield-checkmark" size={26} color={colors.brand} />
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
            accent={colors.brandDark}
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
          <Text style={styles.sectionTitle}>접속자</Text>
          <View style={styles.rangeRow}>
            {VISIT_DAY_OPTIONS.map((d) => (
              <Pressable
                key={d}
                onPress={() => {
                  if (d === visitDays) return;
                  setVisitDays(d);
                  loadTab('dashboard', { days: d });
                }}
                style={[styles.rangeChip, visitDays === d && styles.rangeChipOn]}
                accessibilityRole="button"
                accessibilityLabel={`최근 ${d}일 추이`}
                accessibilityState={{ selected: visitDays === d }}
              >
                <Text style={[styles.rangeChipText, visitDays === d && styles.rangeChipTextOn]}>{d}일</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.statGrid}>
          <StatCard
            label="오늘 접속자"
            value={visits && visits.today_visitors != null ? visits.today_visitors : '—'}
            sub="한국 시간 기준 · 순 방문자"
            accent={colors.brandDark}
          />
          <StatCard
            label="전체 접속자"
            value={visits && visits.total_visitors != null ? visits.total_visitors : '—'}
            sub="누적 순 방문자"
            accent={colors.visitDark}
          />
        </View>
        {visitError ? <Text style={styles.visitError}>{visitError}</Text> : null}
        <View style={[styles.card, styles.chartCard]}>
          {visits && Array.isArray(visits.daily) && visits.daily.length ? (
            <VisitChart daily={visits.daily} days={visitDays} />
          ) : (
            <Text style={styles.emptyText}>{loading ? '불러오는 중…' : '접속자 추이가 아직 없어요.'}</Text>
          )}
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
                  {pin.category ? <Pill text={pin.category} tone="brand" /> : null}
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
                  loadTab('feedback', { kind: opt.id });
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
                  loadTab('feedback', { status: opt.id });
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
                    <Pill text={FEEDBACK_KIND_LABEL[item.kind] || '제안'} tone={item.kind === 'bug' ? 'brand' : 'muted'} />
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

  /** v2.31 — 📌 배너 · 🗂️ 기획전 관리 (컬렉션 탭에 바로 보입) */
  const renderCuration = () => (
    <>
      <View style={styles.sectionHead}>
        <View>
          <Text style={styles.sectionTitle}>📌 배너 {banners.length}개</Text>
          <Text style={styles.sectionHint}>컬렉션 탭 테마 칩 아래 한 줄 · 켜 둔 것만 보입</Text>
        </View>
        <Pressable
          style={styles.newCurationBtn}
          onPress={() => setBannerEditing({})}
          accessibilityRole="button"
          accessibilityLabel="새 배너"
          testID="admin-banner-new"
        >
          <Ionicons name="add" size={14} color={colors.white} />
          <Text style={styles.newCurationText}>새 배너</Text>
        </Pressable>
      </View>

      <View style={styles.card} testID="admin-banners">
        {!banners.length ? (
          <Text style={styles.emptyText}>{loading ? '불러오는 중…' : '아직 배너가 없어요 · [새 배너] 로 하나 올려 보세요.'}</Text>
        ) : (
          banners.map((item, i) => (
            <View
              key={item.id || i}
              style={[styles.curationRow, i === banners.length - 1 && styles.rowLast]}
              testID={'admin-banner-' + item.id}
            >
              <View style={styles.curationBody}>
                <View style={styles.pinTitleRow}>
                  <Pill text={item.badge || '기획전'} tone="brand" />
                  <Pill text={item.active ? '켜짐' : '꺼짐'} tone={item.active ? 'visit' : 'muted'} />
                  {item.imageUrl ? <Pill text="사진" tone="muted" /> : null}
                  <Text style={styles.curationOrder}>순서 {item.sortOrder != null ? item.sortOrder : 0}</Text>
                </View>
                <Text style={styles.curationTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                {!!item.subtitle && (
                  <Text style={styles.curationSub} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                )}
                {!!item.linkUrl && (
                  <Text style={styles.curationLink} numberOfLines={1}>
                    🔗 {item.linkUrl}
                  </Text>
                )}
              </View>
              <View style={styles.curationActions}>
                <Pressable
                  style={[styles.tinyBtn, item.active && styles.tinyBtnOn]}
                  onPress={() => toggleBannerItem(item)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={item.active ? '배너 끄기' : '배너 켜기'}
                  testID={'admin-banner-toggle-' + item.id}
                >
                  <Text style={[styles.tinyBtnText, item.active && styles.tinyBtnTextOn]}>
                    {item.active ? '끄기' : '켜기'}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.editBtn}
                  onPress={() => setBannerEditing(item)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="배너 수정"
                  testID={'admin-banner-edit-' + item.id}
                >
                  <Ionicons name="create-outline" size={15} color={colors.textSub} />
                </Pressable>
                <Pressable
                  style={styles.deleteBtn}
                  onPress={() => setConfirm({ kind: 'banner', target: item })}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="배너 삭제"
                  testID={'admin-banner-delete-' + item.id}
                >
                  <Ionicons name="trash-outline" size={15} color="#B42318" />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.sectionHead}>
        <View>
          <Text style={styles.sectionTitle}>🗂️ 기획전 {curated.length}개</Text>
          <Text style={styles.sectionHint}>사진형 포스터 카드 · [내 지도에 한 번에 담기]</Text>
        </View>
        <Pressable
          style={styles.newCurationBtn}
          onPress={() => setCuratedEditing({})}
          accessibilityRole="button"
          accessibilityLabel="새 기획전"
          testID="admin-curated-new"
        >
          <Ionicons name="add" size={14} color={colors.white} />
          <Text style={styles.newCurationText}>새 기획전</Text>
        </Pressable>
      </View>

      <View style={styles.card} testID="admin-curated">
        {!curated.length ? (
          <Text style={styles.emptyText}>{loading ? '불러오는 중…' : '아직 기획전이 없어요 · [새 기획전] 으로 장소를 묶어 보세요.'}</Text>
        ) : (
          curated.map((item, i) => {
            const places = Array.isArray(item.places) ? item.places : [];
            return (
              <View
                key={item.id || i}
                style={[styles.curationRow, i === curated.length - 1 && styles.rowLast]}
                testID={'admin-curated-' + item.id}
              >
                <View style={[styles.curationEmoji, { backgroundColor: (item.color || '#0D9488') + '1F', overflow: 'hidden' }]}>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.curationThumb} resizeMode="cover" />
                  ) : (
                    <Text style={{ fontSize: 17 }}>{item.emoji || '📂'}</Text>
                  )}
                </View>
                <View style={styles.curationBody}>
                  <View style={styles.pinTitleRow}>
                    <Pill text={item.badge || '기획전'} tone="brand" />
                    <Pill text={item.active ? '켜짐' : '꺼짐'} tone={item.active ? 'visit' : 'muted'} />
                    {item.chip ? <Pill text={item.chip} tone="muted" /> : null}
                    <Text style={styles.curationOrder}>
                      {places.length}곳 · 순서 {item.sortOrder != null ? item.sortOrder : 0}
                    </Text>
                  </View>
                  <Text style={styles.curationTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.curationSub} numberOfLines={2}>
                    {[item.sponsor, item.description].filter(Boolean).join(' · ') || '설명 없음'}
                  </Text>
                  <Text style={styles.curationLink} numberOfLines={1}>
                    {places.map((p) => p.name).join(' · ') || '장소 없음'}
                  </Text>
                </View>
                <View style={styles.curationActions}>
                  <Pressable
                    style={[styles.tinyBtn, item.active && styles.tinyBtnOn]}
                    onPress={() => toggleCuratedItem(item)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={item.active ? '기획전 끄기' : '기획전 켜기'}
                    testID={'admin-curated-toggle-' + item.id}
                  >
                    <Text style={[styles.tinyBtnText, item.active && styles.tinyBtnTextOn]}>
                      {item.active ? '끄기' : '켜기'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.editBtn}
                    onPress={() => setCuratedEditing(item)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="기획전 수정"
                    testID={'admin-curated-edit-' + item.id}
                  >
                    <Ionicons name="create-outline" size={15} color={colors.textSub} />
                  </Pressable>
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => setConfirm({ kind: 'curated', target: item })}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="기획전 삭제"
                    testID={'admin-curated-delete-' + item.id}
                  >
                    <Ionicons name="trash-outline" size={15} color="#B42318" />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>

      <Text style={styles.curationFootnote}>
        켜 둔 배너·기획전만 앱 컬렉션 탭에 보입니다 · 사용자가 [담기] 를 누르면 중복 없이 내 지도에 들어가고,
        같은 이름의 컬렉션으로 묶입니다.
      </Text>
    </>
  );

  /** DB 함수가 아직 없을 때 — SQL 한 번만 실행하면 된다는 안내 */
  const renderSchemaSetup = () => (
    <View style={styles.setupCard}>
      <View style={styles.setupHead}>
        <Ionicons name="construct" size={18} color={colors.brandDark} />
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
      ) : tab === 'curation' ? (
        renderCuration()
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
        <Ionicons name={t.icon} size={wide ? 16 : 15} color={on ? (wide ? colors.white : colors.brandDark) : colors.textSub} />
        <Text
          style={[wide ? styles.sideText : styles.tabText, on && (wide ? styles.sideTextOn : styles.tabTextOn)]}
          numberOfLines={1}
        >
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
          {!wide && gate === 'ready' ? (
            // v2.31 — 탭이 5개가 되어 390px 에서는 가로로 밀어 볼 수 있게 합니다(라벨 줄바꿈 방지).
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabsScroll}
              contentContainerStyle={styles.tabsRow}
            >
              {navItems}
            </ScrollView>
          ) : null}
          {body}
          <Text style={styles.footNote}>릴스핀 v2.31 · 관리자 화면은 서버에서 권한을 다시 확인합니다</Text>
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
            : confirm && confirm.kind === 'banner'
            ? '배너를 삭제할까요?'
            : confirm && confirm.kind === 'curated'
            ? '기획전을 삭제할까요?'
            : '핀을 삭제할까요?'
        }
        message={
          confirm && confirm.kind === 'member'
            ? (confirm.target.nickname || '') + ' (' + (confirm.target.email || '') + ') 님과 저장한 핀 ' + (confirm.target.pinCount || 0) + '개가 함께 지워집니다. 되돌릴 수 없어요.'
            : confirm && confirm.kind === 'feedback'
            ? '“' + (confirm.target.title || '') + '” 제보가 게시판에서 지워집니다. 되돌릴 수 없어요.'
            : confirm && confirm.kind === 'banner'
            ? '“' + (confirm.target.title || '') + '” 배너가 앱 컬렉션 탭에서 사라집니다. 되돌릴 수 없어요.'
            : confirm && confirm.kind === 'curated'
            ? '“' + (confirm.target.title || '') + '” 기획전이 사라집니다. 이미 담아 간 사용자의 지도는 그대로 남아요.'
            : confirm
            ? '“' + (confirm.target.name || '') + '” 핀이 ' + (confirm.target.nickname || confirm.target.email || '') + ' 님의 지도에서 지워집니다. 되돌릴 수 없어요.'
            : ''
        }
        confirmLabel="삭제"
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === 'member') return removeMember(confirm.target);
          if (confirm.kind === 'feedback') return removeFeedback(confirm.target);
          if (confirm.kind === 'banner') return removeBannerItem(confirm.target);
          if (confirm.kind === 'curated') return removeCuratedItem(confirm.target);
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

      {/* v2.31 — 📌 배너 · 🗂️ 기획전 편집 */}
      <BannerEditModal
        target={bannerEditing}
        busy={busy}
        onCancel={() => setBannerEditing(null)}
        onSave={saveBannerItem}
      />
      <CuratedEditModal
        target={curatedEditing}
        busy={busy}
        pins={curationPins}
        onLoadPins={loadCurationPins}
        onCancel={() => setCuratedEditing(null)}
        onSave={saveCuratedItem}
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
    backgroundColor: colors.brand,
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

  tabsScroll: { flexGrow: 0, marginBottom: 14 },
  tabsRow: { flexDirection: 'row', gap: 6, paddingRight: 4 },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabItemOn: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoft2 },
  tabText: { fontSize: 12, fontWeight: '700', color: colors.textSub },
  tabTextOn: { color: colors.brandDark },

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

  // v2.41 — 📊 접속자 통계 (14·30일 선택 · 막대 그래프)
  rangeRow: { flexDirection: 'row', gap: 6 },
  rangeChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  rangeChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  rangeChipText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  rangeChipTextOn: { color: colors.white },
  visitError: { fontSize: 11, color: '#B42318', marginTop: 8 },
  chartCard: { marginTop: 10, overflow: 'visible' },
  chartBox: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  chartCol: { flexGrow: 1, flexBasis: 0, minWidth: 6, alignItems: 'center' },
  chartValue: {
    fontSize: 8,
    lineHeight: 10,
    height: 10,
    width: 44,
    maxWidth: 44,
    flexShrink: 0,
    textAlign: 'center',
    color: colors.textMuted,
    fontWeight: '700',
  },
  chartTrack: { height: 84, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  chartBar: { width: '70%', maxWidth: 22, minWidth: 3, borderRadius: 4, backgroundColor: colors.brand },
  chartBarZero: { backgroundColor: colors.line },
  chartDay: {
    fontSize: 8,
    lineHeight: 12,
    height: 12,
    width: 44,
    maxWidth: 44,
    flexShrink: 0,
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: 4,
  },
  chartHint: { fontSize: 10, color: colors.textMuted, marginTop: 8 },

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
  rankBadgeTop: { backgroundColor: colors.brand },
  rankNumber: { fontSize: 11, fontWeight: '800', color: colors.textSub },
  rankNumberTop: { color: colors.white },
  rankBody: { flex: 1 },
  rankName: { fontSize: 13, fontWeight: '700', color: colors.text },
  rankMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rankCount: { alignItems: 'flex-end' },
  rankSaves: { fontSize: 14, fontWeight: '800', color: colors.brandDark },
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
  feedbackLikes: { fontSize: 10.5, fontWeight: '800', color: colors.brandDark },
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
  setupCode: { fontWeight: '800', color: colors.brandDark },
  setupSub: { marginTop: 10, fontSize: 11, color: colors.textMuted },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 26, minHeight: 420 },
  centerText: { marginTop: 10, fontSize: 12, color: colors.textSub },
  lockIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.brandSoft,
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

  // ── v2.31 📌 배너 · 🗂️ 기획전 ──────────────────────────
  newCurationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.charcoal,
  },
  newCurationText: { color: colors.white, fontSize: 11.5, fontWeight: '800' },
  curationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  curationEmoji: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  curationThumb: { width: 36, height: 36, borderRadius: 12 },
  // ── v2.32 🖼️ 편집 모달의 미리보기 (한 줄 배너 · 포스터 카드 · 테마 칩) ────
  previewBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 6,
  },
  slimPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  slimPreviewThumb: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.lineSoft },
  slimPreviewBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.charcoal,
  },
  slimPreviewBadgeText: { color: colors.white, fontSize: 9.5, fontWeight: '800' },
  slimPreviewTitle: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '800', color: colors.text },
  slimPreviewSub: { fontSize: 10.5, fontWeight: '600', color: colors.textMuted },
  previewHint: { fontSize: 9.5, fontWeight: '700', color: colors.textMuted },
  posterPreviewBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  posterPreviewRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  posterPreviewCard: { width: 116 },
  posterPreviewThumb: {
    width: 116,
    height: 118,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.lineSoft,
  },
  posterPreviewImage: { width: '100%', height: '100%' },
  posterPreviewFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  posterPreviewBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  posterPreviewBadgeText: { fontSize: 8.5, fontWeight: '800', color: colors.charcoal },
  posterPreviewTitle: { marginTop: 6, fontSize: 11.5, lineHeight: 16, fontWeight: '800', color: colors.text },
  posterPreviewSub: { marginTop: 2, fontSize: 10, fontWeight: '600', color: colors.textSub },
  previewHintLabel: { fontSize: 10, fontWeight: '800', color: colors.textSub },
  previewSubHint: { fontSize: 9.5, color: colors.textMuted, lineHeight: 14 },
  previewChipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    maxWidth: 150,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  previewChipPillText: { flexShrink: 1, fontSize: 11, fontWeight: '800', color: colors.text },
  curationBody: { flex: 1, minWidth: 0, gap: 2 },
  curationOrder: { fontSize: 10.5, fontWeight: '700', color: colors.textMuted },
  curationTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text, marginTop: 2 },
  curationSub: { fontSize: 11.5, color: colors.textSub, lineHeight: 16 },
  curationLink: { fontSize: 10.5, color: colors.textMuted },
  curationActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tinyBtn: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.lineSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tinyBtnOn: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoft2 },
  tinyBtnText: { fontSize: 10.5, fontWeight: '800', color: colors.textSub },
  tinyBtnTextOn: { color: colors.brandDark },
  curationFootnote: { fontSize: 10.5, color: colors.textMuted, lineHeight: 16, marginTop: 14, marginBottom: 8 },
  modalCardTall: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '90%',
    flexGrow: 0,
    backgroundColor: colors.white,
    borderRadius: 18,
  },
  modalCardTallInner: { padding: 18 },
  modalSplitRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.lineSoft,
    borderWidth: 1,
    borderColor: colors.line,
    alignSelf: 'flex-start',
  },
  toggleChipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoft2 },
  toggleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textMuted },
  toggleDotOn: { backgroundColor: colors.brand },
  toggleText: { fontSize: 11.5, fontWeight: '800', color: colors.textSub },
  toggleTextOn: { color: colors.brandDark },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotOn: { borderColor: colors.charcoal },
  pickedList: { gap: 6 },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pickedRank: { fontSize: 11, fontWeight: '800', color: colors.brandDark, width: 16 },
  pickedName: { fontSize: 12.5, fontWeight: '800', color: colors.text },
  pickedMeta: { fontSize: 10.5, color: colors.textMuted },
  pinPickList: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 6,
    gap: 4,
    marginTop: 8,
  },
  pinPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 8,
  },
  pinPickRowOn: { backgroundColor: colors.brandSoft },
  pickBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  pickBoxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  manualAddBtn: {
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.charcoal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualAddText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  coordHint: { fontSize: 10.5, color: colors.textMuted, marginTop: 6 },

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
