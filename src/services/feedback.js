/**
 * src/services/feedback.js — v2.23 💬 제안 · 버그 제보 게시판
 * ─────────────────────────────────────────────────────────────
 * 상훈 님 요청(2026-11-17):
 *   "릴스핀도 제안/버그 제보 게시판 있으면 좋겠다"
 *
 * 이 파일 하나가 게시판의 **규칙**과 **DB 접속**을 모두 맡습니다.
 *   · FEEDBACK_KINDS   … 💡 기능 제안 / 🐛 버그 제보
 *   · FEEDBACK_STATUS  … 접수됨(open) · 반영됨(applied) · 수정됨(fixed)
 *   · validateFeedback … 빈 글·길이 제한 (화면과 DB 가 같은 값을 씁니다)
 *   · cooldownRemaining… 연속 작성 방지 (기기에서 30초)
 *   · fetchFeedback · submitFeedback · likeFeedback … Supabase RLS/RPC 호출
 *
 * 보안 (이 파일이 지키는 선)
 *   · 앱은 **anon(publishable) 키 + RLS** 로만 동작합니다. `service_role` 키는 쓰지 않습니다.
 *   · `user_email` 은 **컬럼 권한에서 빠져 있어** 공개 API 응답에 담기지 않습니다(dashboard RPC 전용).
 *   · 공감은 `increment_reelpin_feedback_like` RPC 로만 +1 — 글의 likes 를 직접 고칠 수 없습니다.
 *
 * 준비물: `supabase/feedback.sql` 을 Supabase SQL Editor 에서 한 번 실행해 두면 됩니다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from './supabase';

/** 게시판 테이블 · 공감 RPC 이름 (SQL 과 한 곳에서 맞춥니다) */
export const FEEDBACK_TABLE = 'reelpin_feedback';
export const FEEDBACK_LIKE_RPC = 'increment_reelpin_feedback_like';

/** 글에 자동으로 붙는 앱 버전 (package.json · app.json 과 함께 올립니다) */
export const APP_VERSION_NAME = '2.23.0';

/** 닉네임을 비우면 이 이름으로 올라갑니다. */
export const ANON_AUTHOR = '익명';

/** 제목·내용·닉네임 길이 — DB 제약(check)과 같은 값입니다. */
export const FEEDBACK_LIMITS = {
  titleMin: 2,
  titleMax: 80,
  contentMin: 5,
  contentMax: 1200,
  authorMax: 12,
};

/** 연속 작성 방지 — 같은 기기에서 이 시간 안에 또 올리면 잠깐 기다리게 합니다. */
export const FEEDBACK_COOLDOWN_MS = 30 * 1000;

/** 목록 한 번에 받아 오는 최대 글 수 */
export const FEEDBACK_PAGE_SIZE = 100;

/** 공감한 글 id 를 기기에 기억해 두는 키 (한 기기에서 한 번만) */
export const FEEDBACK_LIKED_KEY = 'reelpin.feedback.liked.v1';

/** 마지막으로 글을 올린 시각을 기억해 두는 키 (쿨다운) */
export const FEEDBACK_LAST_POST_KEY = 'reelpin.feedback.lastPost.v1';

/** 💡 기능 제안 | 🐛 버그 제보 */
export const FEEDBACK_KINDS = [
  {
    id: 'idea',
    label: '기능 제안',
    emoji: '💡',
    empty: '아직 제안이 없어요',
    placeholderTitle: '한 줄로 어떤 기능이 있으면 좋을까요?',
    placeholderContent: '언제 쓰고 싶은지, 지금은 어떻게 불편한지 적어 주시면 좋아요.',
  },
  {
    id: 'bug',
    label: '버그 제보',
    emoji: '🐛',
    empty: '아직 제보가 없어요',
    placeholderTitle: '무엇이 잘못됐는지 한 줄로 알려 주세요',
    placeholderContent: '어떤 화면에서 무엇을 했을 때 그랬는지 적어 주시면 빨리 고칠 수 있어요.',
  },
];

/** 상태 배지 — 접수됨 / 반영됨 / 수정됨 */
export const FEEDBACK_STATUS = {
  open: { id: 'open', label: '접수됨', tone: 'muted' },
  applied: { id: 'applied', label: '반영됨', tone: 'applied' },
  fixed: { id: 'fixed', label: '수정됨', tone: 'fixed' },
};

/** 정렬 — 최신순 | 공감순 */
export const FEEDBACK_SORTS = [
  { id: 'latest', label: '최신순' },
  { id: 'likes', label: '공감순' },
];

/** 공감하지 못했을 때의 안내 (RLS·네트워크 모두 같은 말) */
const NETWORK_MESSAGE = '네트워크가 불안정해요. 잠시 뒤 다시 시도해 주세요.';
const NOT_READY_MESSAGE = '제보 게시판이 아직 켜지지 않았어요. 잠시 뒤 다시 시도해 주세요.';

// ─────────────────────────────────────────────────────────────
// 1. 값 다듬기 · 검사
// ─────────────────────────────────────────────────────────────

/** 유형 id → 정의 (모르는 값은 기능 제안으로) */
export function kindInfo(kind) {
  return FEEDBACK_KINDS.find((k) => k.id === kind) || FEEDBACK_KINDS[0];
}

/** 상태 id → 배지 정보 (모르는 값은 접수됨) */
export function statusInfo(status) {
  return FEEDBACK_STATUS[String(status || '').toLowerCase()] || FEEDBACK_STATUS.open;
}

/** 닉네임 — 공백 정리, 길면 자르고, 비면 `익명` */
export function normalizeAuthor(value) {
  const text = String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FEEDBACK_LIMITS.authorMax);
  return text || ANON_AUTHOR;
}

/** 제목·내용 — 앞뒤 공백 제거 + 길이 상한 (입력 중에는 자르기만) */
export function normalizeTitle(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, FEEDBACK_LIMITS.titleMax);
}

export function normalizeContent(value) {
  return String(value == null ? '' : value).trim().slice(0, FEEDBACK_LIMITS.contentMax);
}

/**
 * 글쓰기 폼 검사 — 화면에서 [등록]을 누르기 전에, 그리고 전송 직전에 한 번 더.
 * @returns {{ ok:boolean, field:string, message:string, values:{kind,title,content,author} }}
 */
export function validateFeedback(draft) {
  const d = draft || {};
  const kind = d.kind === 'bug' ? 'bug' : 'idea';
  const title = normalizeTitle(d.title);
  const content = normalizeContent(d.content);
  const author = normalizeAuthor(d.author);
  const values = { kind, title, content, author };
  const limit = FEEDBACK_LIMITS;

  if (!title) return { ok: false, field: 'title', message: '제목을 적어 주세요.', values };
  if (title.length < limit.titleMin) {
    return { ok: false, field: 'title', message: '제목은 ' + limit.titleMin + '자 이상 적어 주세요.', values };
  }
  if (!content) return { ok: false, field: 'content', message: '내용을 적어 주세요.', values };
  if (content.length < limit.contentMin) {
    return { ok: false, field: 'content', message: '내용은 ' + limit.contentMin + '자 이상 적어 주세요.', values };
  }
  if (title.length > limit.titleMax || content.length > limit.contentMax) {
    return { ok: false, field: 'content', message: '글이 너무 길어요. 조금 줄여 주세요.', values };
  }
  // 같은 글을 두 번 올린 경우(제목=내용) 막습니다 — 도배 방지의 가장 흔한 모양입니다.
  if (title === content) {
    return { ok: false, field: 'content', message: '제목과 내용이 같아요. 내용을 조금 더 적어 주세요.', values };
  }
  return { ok: true, field: '', message: '', values };
}

/**
 * 연속 작성 쿨다운 — 남은 시간(ms). 0 이면 지금 올릴 수 있습니다.
 * @param {number|string|Date|null} lastAt 마지막 작성 시각
 * @param {number} now 지금 (테스트용)
 */
export function cooldownRemaining(lastAt, now = Date.now()) {
  const at = lastAt instanceof Date ? lastAt.getTime() : Number(lastAt);
  if (!at || Number.isNaN(at)) return 0;
  const diff = now - at;
  if (diff >= FEEDBACK_COOLDOWN_MS) return 0;
  if (diff < 0) return 0;
  return FEEDBACK_COOLDOWN_MS - diff;
}

/** '30초' · '1분' — 쿨다운 안내 문구 */
export function cooldownLabel(ms) {
  const seconds = Math.max(1, Math.ceil(Number(ms) / 1000));
  if (seconds < 60) return seconds + '초';
  return Math.ceil(seconds / 60) + '분';
}

/** '방금' · '3분 전' · '2시간 전' · '5일 전' · '11월 3일' */
export function relativeTime(value, now = Date.now()) {
  if (!value) return '';
  const at = new Date(value).getTime();
  if (Number.isNaN(at)) return '';
  const diff = now - at;
  if (diff < 0) return '방금';
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return min + '분 전';
  const hour = Math.floor(min / 60);
  if (hour < 24) return hour + '시간 전';
  const day = Math.floor(hour / 24);
  if (day < 7) return day + '일 전';
  const d = new Date(at);
  return d.getMonth() + 1 + '월 ' + d.getDate() + '일';
}

/** DB 행 → 화면 항목 (없는 값은 안전한 기본값) */
export function feedbackRowToItem(row) {
  const r = row || {};
  return {
    id: String(r.id || ''),
    kind: r.kind === 'bug' ? 'bug' : 'idea',
    title: String(r.title || ''),
    content: String(r.content || ''),
    author: String(r.author || ANON_AUTHOR),
    appVersion: String(r.app_version || r.appVersion || ''),
    likes: Math.max(0, Number(r.likes) || 0),
    status: statusInfo(r.status).id,
    createdAt: r.created_at || r.createdAt || null,
  };
}

/** 목록 정렬 — 최신순 / 공감순 (원본은 건드리지 않습니다) */
export function sortFeedback(items, sort = 'latest') {
  const list = Array.isArray(items) ? items.slice() : [];
  const time = (item) => new Date(item && item.createdAt ? item.createdAt : 0).getTime() || 0;
  if (sort === 'likes') {
    return list.sort((a, b) => (b.likes || 0) - (a.likes || 0) || time(b) - time(a));
  }
  return list.sort((a, b) => time(b) - time(a));
}

/** 어드민 필터 — 유형(전체/제안/버그) · 상태(전체/접수됨/반영됨/수정됨) */
export function filterFeedback(items, filters) {
  const f = filters || {};
  const list = Array.isArray(items) ? items : [];
  return list.filter((item) => {
    if (f.kind && item.kind !== f.kind) return false;
    if (f.status && item.status !== f.status) return false;
    return true;
  });
}

/** 탭 옆에 작은 숫자로 쓸 글 개수 */
export function countByKind(items) {
  const list = Array.isArray(items) ? items : [];
  return {
    idea: list.filter((i) => i.kind === 'idea').length,
    bug: list.filter((i) => i.kind === 'bug').length,
  };
}

// ─────────────────────────────────────────────────────────────
// 2. 기기 저장 (공감 기록 · 쿨다운)
// ─────────────────────────────────────────────────────────────
async function readJsonArray(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/** 이 기기에서 공감한 글 id 목록 */
export function loadLikedIds() {
  return readJsonArray(FEEDBACK_LIKED_KEY);
}

/** 공감한 글 id 를 기기에 남깁니다 (같은 id 는 한 번만) */
export async function saveLikedId(id) {
  const key = String(id || '');
  if (!key) return [];
  const current = await readJsonArray(FEEDBACK_LIKED_KEY);
  if (current.indexOf(key) >= 0) return current;
  const next = current.concat(key).slice(-300);
  try {
    await AsyncStorage.setItem(FEEDBACK_LIKED_KEY, JSON.stringify(next));
  } catch (e) {
    /* 저장 실패는 조용히 — 화면은 메모리 상태로 계속 동작합니다 */
  }
  return next;
}

/** 마지막으로 글을 올린 시각 (ms) — 없으면 0 */
export async function loadLastPostAt() {
  try {
    const raw = await AsyncStorage.getItem(FEEDBACK_LAST_POST_KEY);
    const at = Number(raw);
    return Number.isFinite(at) ? at : 0;
  } catch (e) {
    return 0;
  }
}

export async function saveLastPostAt(at) {
  try {
    await AsyncStorage.setItem(FEEDBACK_LAST_POST_KEY, String(Number(at) || Date.now()));
  } catch (e) {
    /* no-op */
  }
}

// ─────────────────────────────────────────────────────────────
// 3. Supabase
// ─────────────────────────────────────────────────────────────

/** 화면이 넘겨준 클라이언트(테스트) 또는 앱의 공용 클라이언트 */
function resolveClient(client) {
  if (client) return client;
  if (!isSupabaseConfigured()) return null;
  try {
    return supabase();
  } catch (e) {
    return null;
  }
}

/** Supabase 오류 → 사람이 읽을 수 있는 한 줄 */
export function friendlyFeedbackError(error) {
  const message = String((error && (error.message || error.error_description)) || '');
  const code = String((error && (error.code || error.error)) || '');
  if (code === 'PGRST205' || /relation .* does not exist|schema cache/i.test(message)) {
    return '제보 게시판 DB 가 아직 준비되지 않았어요. 잠시 뒤 다시 시도해 주세요.';
  }
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return '제목·내용 길이를 확인해 주세요. (2~80자 / 5~1200자)';
  }
  if (code === 'P0002' || /not found/i.test(message)) {
    return '글을 찾지 못했어요. 새로고침해 주세요.';
  }
  if (/failed to fetch|network|timeout/i.test(message)) return NETWORK_MESSAGE;
  return message || NETWORK_MESSAGE;
}

/**
 * 글 목록 — 최신순으로 받아 화면에서 정렬합니다.
 * (공감순은 `likes` 로 정렬해 다시 조회 — 아래 order 를 서버에 맡깁니다)
 */
export async function fetchFeedback(options = {}) {
  const kind = options.kind === 'bug' ? 'bug' : 'idea';
  const sort = options.sort === 'likes' ? 'likes' : 'latest';
  const limit = Number(options.limit) > 0 ? Math.min(Number(options.limit), 300) : FEEDBACK_PAGE_SIZE;
  const client = resolveClient(options.client);
  if (!client) return { ok: false, items: [], message: NOT_READY_MESSAGE };

  try {
    let query = client
      .from(FEEDBACK_TABLE)
      .select('id, kind, title, content, author, app_version, likes, status, created_at')
      .eq('kind', kind);
    query =
      sort === 'likes'
        ? query.order('likes', { ascending: false }).order('created_at', { ascending: false })
        : query.order('created_at', { ascending: false });
    const { data, error } = await query.limit(limit);
    if (error) return { ok: false, items: [], message: friendlyFeedbackError(error), error };
    const items = (Array.isArray(data) ? data : []).map(feedbackRowToItem);
    return { ok: true, items: sortFeedback(items, sort), message: '' };
  } catch (e) {
    return { ok: false, items: [], message: NETWORK_MESSAGE, error: e };
  }
}

/**
 * 글 올리기 — 성공하면 화면에 바로 꽂을 항목을 돌려줍니다.
 * `user_email` 은 로그인한 본인 이메일일 때만 담습니다(RLS 가 한 번 더 확인).
 */
export async function submitFeedback(draft, options = {}) {
  const checked = validateFeedback(draft);
  if (!checked.ok) return { ok: false, field: checked.field, message: checked.message };

  const client = resolveClient(options.client);
  if (!client) return { ok: false, message: NOT_READY_MESSAGE };

  const email = String(options.email || '').trim().toLowerCase();
  const appVersion = String(options.appVersion || APP_VERSION_NAME).trim().slice(0, 24);
  const row = {
    kind: checked.values.kind,
    title: checked.values.title,
    content: checked.values.content,
    author: checked.values.author,
    app_version: appVersion || null,
  };
  if (email) row.user_email = email;

  try {
    const { error } = await client.from(FEEDBACK_TABLE).insert(row);
    if (error) return { ok: false, message: friendlyFeedbackError(error), error };
    const item = feedbackRowToItem({ ...row, id: 'local-' + Date.now(), likes: 0, status: 'open', created_at: new Date().toISOString() });
    return { ok: true, item, message: '제보를 남겼어요. 고맙습니다!' };
  } catch (e) {
    return { ok: false, message: NETWORK_MESSAGE, error: e };
  }
}

/** 👍 공감 — RPC 로 +1 만 (성공하면 새 공감 수) */
export async function likeFeedback(id, options = {}) {
  const rowId = String(id || '');
  if (!rowId) return { ok: false, likes: 0, message: NOT_READY_MESSAGE };
  const client = resolveClient(options.client);
  if (!client) return { ok: false, likes: 0, message: NOT_READY_MESSAGE };

  try {
    const { data, error } = await client.rpc(FEEDBACK_LIKE_RPC, { row_id: rowId });
    if (error) return { ok: false, likes: 0, message: friendlyFeedbackError(error), error };
    const likes = Number(data);
    return { ok: true, likes: Number.isFinite(likes) ? likes : 0, message: '' };
  } catch (e) {
    return { ok: false, likes: 0, message: NETWORK_MESSAGE, error: e };
  }
}
