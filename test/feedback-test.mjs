/**
 * test/feedback-test.mjs — v2.23 💬 제안 · 버그 제보 게시판
 * ─────────────────────────────────────────────────────────────
 *   · 규칙: 제목 2~80자 · 내용 5~1200자 · 닉네임(비우면 익명) · 30초 쿨다운
 *   · 화면 데이터: 행 → 항목 변환 · 최신순/공감순 정렬 · 유형/상태 필터 · 상태 배지
 *   · Supabase: `reelpin_feedback` 조회(공개 컬럼만) · INSERT(app_version 자동) · 👍 RPC
 *   · 보안: anon 키 + RLS, `user_email` 은 공개 조회에 담지 않음, service_role 미사용
 *   · 화면 연결: 내 정보 설정 행 · ☰ 시트 전달 · App 모달 · 어드민 4번째 탭
 *
 * 네트워크는 가짜 Supabase 클라이언트로 대체합니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ANON_AUTHOR,
  APP_VERSION_NAME,
  FEEDBACK_KINDS,
  FEEDBACK_LIMITS,
  FEEDBACK_LIKE_RPC,
  FEEDBACK_SORTS,
  FEEDBACK_STATUS,
  FEEDBACK_TABLE,
  cooldownLabel,
  cooldownRemaining,
  countByKind,
  feedbackRowToItem,
  fetchFeedback,
  filterFeedback,
  friendlyFeedbackError,
  kindInfo,
  likeFeedback,
  normalizeAuthor,
  relativeTime,
  sortFeedback,
  statusInfo,
  submitFeedback,
  validateFeedback,
} from '../src/services/feedback.js';

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails++;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

/** 가짜 Supabase 클라이언트 — 어떤 요청이 나갔는지 그대로 기록합니다. */
function fakeClient(config = {}) {
  const calls = { table: '', selects: [], eqs: [], orders: [], limits: [], inserts: [], rpcs: [] };
  const api = {
    select(cols) {
      calls.selects.push(String(cols));
      return api;
    },
    eq(col, value) {
      calls.eqs.push([col, value]);
      return api;
    },
    order(col, options) {
      calls.orders.push([col, options || {}]);
      return api;
    },
    limit(n) {
      calls.limits.push(n);
      return Promise.resolve({ data: config.rows || [], error: config.error || null });
    },
    insert(row) {
      calls.inserts.push(row);
      return Promise.resolve({ data: null, error: config.error || null });
    },
  };
  const client = {
    from(table) {
      calls.table = table;
      return api;
    },
    rpc(name, args) {
      calls.rpcs.push([name, args]);
      return Promise.resolve({ data: config.rpcData, error: config.error || null });
    },
  };
  return { client, calls };
}

// ── 1. 유형 · 상태 · 정렬 이름 ───────────────────────────────
check('정의: 테이블 이름 = reelpin_feedback', FEEDBACK_TABLE === 'reelpin_feedback', FEEDBACK_TABLE);
check('정의: 공감 RPC 이름', FEEDBACK_LIKE_RPC === 'increment_reelpin_feedback_like', FEEDBACK_LIKE_RPC);
check(
  '정의: 💡 기능 제안 · 🐛 버그 제보 2탭',
  FEEDBACK_KINDS.length === 2 &&
    FEEDBACK_KINDS[0].id === 'idea' &&
    FEEDBACK_KINDS[0].emoji === '💡' &&
    FEEDBACK_KINDS[0].label === '기능 제안' &&
    FEEDBACK_KINDS[1].id === 'bug' &&
    FEEDBACK_KINDS[1].emoji === '🐛' &&
    FEEDBACK_KINDS[1].label === '버그 제보',
  JSON.stringify(FEEDBACK_KINDS.map((k) => k.id + ':' + k.label))
);
check(
  '정의: 상태 배지 = 접수됨 · 반영됨 · 수정됨',
  FEEDBACK_STATUS.open.label === '접수됨' &&
    FEEDBACK_STATUS.applied.label === '반영됨' &&
    FEEDBACK_STATUS.fixed.label === '수정됨' &&
    statusInfo('applied').label === '반영됨' &&
    statusInfo('??').id === 'open',
  ''
);
check(
  '정의: 정렬 = 최신순 · 공감순',
  FEEDBACK_SORTS.map((s) => s.label).join('|') === '최신순|공감순',
  FEEDBACK_SORTS.map((s) => s.label).join('|')
);
check('정의: 길이 제한 2~80 / 5~1200 / 닉네임 12자', FEEDBACK_LIMITS.titleMin === 2 && FEEDBACK_LIMITS.titleMax === 80 && FEEDBACK_LIMITS.contentMin === 5 && FEEDBACK_LIMITS.contentMax === 1200 && FEEDBACK_LIMITS.authorMax === 12, JSON.stringify(FEEDBACK_LIMITS));
check('정의: 앱 버전 자동 첨부값 = 2.31.0', APP_VERSION_NAME === '2.32.2', APP_VERSION_NAME);
check('정의: 모르는 유형은 기능 제안으로', kindInfo('nope').id === 'idea' && kindInfo('bug').id === 'bug', '');

// ── 2. 닉네임 · 글 검사 ─────────────────────────────────────
check('닉네임: 비우면 익명', normalizeAuthor('') === ANON_AUTHOR && normalizeAuthor(null) === '익명' && normalizeAuthor('   ') === '익명', normalizeAuthor(''));
check('닉네임: 공백 정리', normalizeAuthor('  꼬야   네 ') === '꼬야 네', normalizeAuthor('  꼬야   네 '));
check('닉네임: 12자까지만', normalizeAuthor('가'.repeat(20)).length === 12, normalizeAuthor('가'.repeat(20)));

const empty = validateFeedback({ kind: 'idea', title: '', content: '', author: '' });
check('검사: 빈 제목 거부', empty.ok === false && empty.field === 'title', JSON.stringify(empty));
const shortTitle = validateFeedback({ kind: 'idea', title: 'a', content: '내용은 충분히 깁니다', author: '' });
check('검사: 1자 제목 거부', shortTitle.ok === false && shortTitle.field === 'title', JSON.stringify(shortTitle));
const shortContent = validateFeedback({ kind: 'bug', title: '지도 흰 화면', content: '네', author: '' });
check('검사: 짧은 내용 거부', shortContent.ok === false && shortContent.field === 'content', shortContent.message);
const sameText = validateFeedback({ kind: 'idea', title: '같은 글입니다', content: '같은 글입니다', author: '' });
check('검사: 제목=내용 도배 거부', sameText.ok === false && /제목과 내용/.test(sameText.message), sameText.message);
const good = validateFeedback({ kind: 'bug', title: '  지도가   흰 화면이 돼요 ', content: ' 사파리에서 다시 열면 2초쯤 흰 화면입니다. ', author: '  꼬야네 ' });
check(
  '검사: 정상 글이면 값이 정리돼 통과',
  good.ok === true &&
    good.values.kind === 'bug' &&
    good.values.title === '지도가 흰 화면이 돼요' &&
    good.values.author === '꼬야네' &&
    good.values.content === '사파리에서 다시 열면 2초쯤 흰 화면입니다.',
  JSON.stringify(good.values)
);
const longTitle = validateFeedback({ kind: 'idea', title: '제'.repeat(200), content: '내용은 충분히 깁니다', author: '' });
check('검사: 제목 상한은 자르고 통과', longTitle.ok === true && longTitle.values.title.length === 80, longTitle.values && longTitle.values.title.length);

// ── 3. 쿨다운 · 상대 시각 ───────────────────────────────────
const now = new Date('2026-11-17T11:00:00+09:00').getTime();
check('쿨다운: 기록이 없으면 통과', cooldownRemaining(0, now) === 0 && cooldownRemaining(null, now) === 0, '');
check('쿨다운: 방금 올렸으면 30초', cooldownRemaining(now - 1000, now) === 29000, String(cooldownRemaining(now - 1000, now)));
check('쿨다운: 30초가 지나면 통과', cooldownRemaining(now - 31000, now) === 0, String(cooldownRemaining(now - 31000, now)));
check('쿨다운: 안내 문구', cooldownLabel(15000) === '15초' && cooldownLabel(90000) === '2분', cooldownLabel(15000) + '/' + cooldownLabel(90000));

check('시각: 방금', relativeTime(new Date(now - 20000).toISOString(), now) === '방금', relativeTime(new Date(now - 20000).toISOString(), now));
check('시각: 5분 전', relativeTime(new Date(now - 5 * 60000).toISOString(), now) === '5분 전', relativeTime(new Date(now - 5 * 60000).toISOString(), now));
check('시각: 3시간 전', relativeTime(new Date(now - 3 * 3600000).toISOString(), now) === '3시간 전', relativeTime(new Date(now - 3 * 3600000).toISOString(), now));
check('시각: 2일 전', relativeTime(new Date(now - 2 * 86400000).toISOString(), now) === '2일 전', relativeTime(new Date(now - 2 * 86400000).toISOString(), now));
check('시각: 일주일이 넘으면 날짜', /월 \d+일/.test(relativeTime('2026-11-03T10:00:00+09:00', now)), relativeTime('2026-11-03T10:00:00+09:00', now));
check('시각: 값이 없으면 빈 문자열', relativeTime(null, now) === '' && relativeTime('이상한 값', now) === '', '');

// ── 4. 행 → 항목 · 정렬 · 필터 ──────────────────────────────
const row = {
  id: 'a1',
  kind: 'bug',
  title: '지도 흰 화면',
  content: '사파리에서 그럽니다',
  author: '꼬야네',
  app_version: '2.32.2',
  likes: 3,
  status: 'fixed',
  created_at: '2026-11-17T09:00:00+09:00',
};
const item = feedbackRowToItem(row);
check(
  '변환: snake_case → 화면 항목',
  item.id === 'a1' &&
    item.kind === 'bug' &&
    item.appVersion === '2.32.2' &&
    item.likes === 3 &&
    item.status === 'fixed' &&
    item.createdAt === row.created_at,
  JSON.stringify(item)
);
check('변환: 공감 수는 0 미만이 되지 않음', feedbackRowToItem({ likes: -5 }).likes === 0 && feedbackRowToItem({ likes: 'x' }).likes === 0, '');
check('변환: 모르는 상태·유형은 기본값', feedbackRowToItem({ status: 'zzz', kind: 'zzz' }).status === 'open' && feedbackRowToItem({ kind: 'zzz' }).kind === 'idea', '');
check('변환: 작성자가 비면 익명', feedbackRowToItem({ author: '' }).author === '익명', '');

const list = [
  { id: '1', kind: 'idea', status: 'open', likes: 1, createdAt: '2026-11-17T08:00:00+09:00' },
  { id: '2', kind: 'idea', status: 'applied', likes: 9, createdAt: '2026-11-16T08:00:00+09:00' },
  { id: '3', kind: 'bug', status: 'fixed', likes: 5, createdAt: '2026-11-17T10:00:00+09:00' },
];
check('정렬: 최신순', sortFeedback(list, 'latest').map((i) => i.id).join('') === '312', sortFeedback(list, 'latest').map((i) => i.id).join(''));
check('정렬: 공감순', sortFeedback(list, 'likes').map((i) => i.id).join('') === '231', sortFeedback(list, 'likes').map((i) => i.id).join(''));
check('정렬: 원본은 그대로', list.map((i) => i.id).join('') === '123', list.map((i) => i.id).join(''));
check('필터: 유형', filterFeedback(list, { kind: 'bug' }).map((i) => i.id).join('') === '3', '');
check('필터: 상태', filterFeedback(list, { status: 'applied' }).map((i) => i.id).join('') === '2', '');
check('필터: 유형+상태', filterFeedback(list, { kind: 'idea', status: 'open' }).map((i) => i.id).join('') === '1', '');
check('개수: 유형별', countByKind(list).idea === 2 && countByKind(list).bug === 1, JSON.stringify(countByKind(list)));

// ── 5. Supabase 조회 ────────────────────────────────────────
{
  const { client, calls } = fakeClient({ rows: [row] });
  const res = await fetchFeedback({ kind: 'bug', sort: 'latest', client });
  check('조회: 성공 + 항목 변환', res.ok === true && res.items.length === 1 && res.items[0].id === 'a1', JSON.stringify(res).slice(0, 120));
  check('조회: 테이블 = reelpin_feedback', calls.table === 'reelpin_feedback', calls.table);
  check('조회: 유형으로 거름', calls.eqs.length === 1 && calls.eqs[0][0] === 'kind' && calls.eqs[0][1] === 'bug', JSON.stringify(calls.eqs));
  check('조회: 최신순은 created_at desc', calls.orders.length === 1 && calls.orders[0][0] === 'created_at' && calls.orders[0][1].ascending === false, JSON.stringify(calls.orders));
  check('조회: 기본 100건', calls.limits[0] === 100, String(calls.limits[0]));
  const cols = calls.selects[0] || '';
  check('보안: 공개 조회에 user_email 을 넣지 않음', cols.indexOf('user_email') < 0 && cols.indexOf('title') >= 0, cols);
}
{
  const { client, calls } = fakeClient({ rows: [] });
  await fetchFeedback({ kind: 'idea', sort: 'likes', client });
  check(
    '조회: 공감순은 likes desc → created_at desc',
    calls.orders.length === 2 && calls.orders[0][0] === 'likes' && calls.orders[0][1].ascending === false && calls.orders[1][0] === 'created_at',
    JSON.stringify(calls.orders)
  );
}
{
  const { client } = fakeClient({ error: { message: 'relation "reelpin_feedback" does not exist', code: '42P01' } });
  const res = await fetchFeedback({ kind: 'idea', client });
  check('조회: DB 미준비 안내', res.ok === false && /준비되지 않았어요|다시 시도/.test(res.message), res.message);
}
{
  const res = await fetchFeedback({ kind: 'idea', client: null });
  check('조회: 설정이 없으면 조용히 실패(앱은 계속 동작)', res.ok === false && res.items.length === 0 && !!res.message, res.message);
}

// ── 6. 글 올리기 ────────────────────────────────────────────
{
  const { client, calls } = fakeClient({});
  const res = await submitFeedback(
    { kind: 'bug', title: '지도 흰 화면', content: '사파리에서 다시 열면 흰 화면입니다.', author: '' },
    { client, email: 'Andy.Leesh33@Gmail.com' }
  );
  check('등록: 성공', res.ok === true && res.item && res.item.likes === 0 && res.item.status === 'open', JSON.stringify(res).slice(0, 140));
  const sent = calls.inserts[0] || {};
  check('등록: 앱 버전 자동 첨부', sent.app_version === '2.32.2', JSON.stringify(sent));
  check('등록: 닉네임 비면 익명', sent.author === '익명', sent.author);
  check('등록: 로그인했으면 이메일 기록(소문자)', sent.user_email === 'andy.leesh33@gmail.com', sent.user_email);
  check('등록: 공감·상태는 보내지 않음(RLS 가 0/open 강제)', sent.likes === undefined && sent.status === undefined, JSON.stringify(sent));
}
{
  const { client, calls } = fakeClient({});
  const res = await submitFeedback(
    { kind: 'idea', title: '컬렉션 공유', content: '제목과 설명도 같이 보이면 좋겠어요', author: '맛집탐험가' },
    { client, email: '' }
  );
  check('등록: 비로그인은 이메일 없이', res.ok === true && calls.inserts[0].user_email === undefined, JSON.stringify(calls.inserts[0]));
}
{
  const { client, calls } = fakeClient({});
  const res = await submitFeedback({ kind: 'idea', title: '', content: '내용', author: '' }, { client });
  check('등록: 검사에서 막히면 요청을 보내지 않음', res.ok === false && calls.inserts.length === 0, res.message);
}
{
  const { client } = fakeClient({ error: { message: 'new row violates row-level security policy', code: '42501' } });
  const res = await submitFeedback({ kind: 'idea', title: '제목입니다', content: '내용입니다 충분히 길어요', author: '' }, { client });
  check('등록: RLS 거부 → 길이 안내', res.ok === false && /제목·내용 길이/.test(res.message), res.message);
}

// ── 7. 👍 공감 ──────────────────────────────────────────────
{
  const { client, calls } = fakeClient({ rpcData: 4 });
  const res = await likeFeedback('a1', { client });
  check('공감: RPC 로만 +1', res.ok === true && res.likes === 4, JSON.stringify(res));
  check('공감: 함수 이름·인자', calls.rpcs.length === 1 && calls.rpcs[0][0] === 'increment_reelpin_feedback_like' && calls.rpcs[0][1].row_id === 'a1', JSON.stringify(calls.rpcs));
}
{
  const { client } = fakeClient({ error: { message: 'feedback not found', code: 'P0002' } });
  const res = await likeFeedback('nope', { client });
  check('공감: 없는 글이면 안내', res.ok === false && /찾지 못했어요/.test(res.message), res.message);
}
{
  const res = await likeFeedback('', { client: null });
  check('공감: id 가 없으면 요청하지 않음', res.ok === false, res.message);
}

// ── 8. 오류 문구 ────────────────────────────────────────────
check('오류: 네트워크 실패 문구', /네트워크/.test(friendlyFeedbackError({ message: 'Failed to fetch' })), friendlyFeedbackError({ message: 'Failed to fetch' }));
check('오류: 모르는 오류도 한 줄로', friendlyFeedbackError({}) === '네트워크가 불안정해요. 잠시 뒤 다시 시도해 주세요.', friendlyFeedbackError({}));

// ── 9. 화면 연결 ────────────────────────────────────────────
const profileSource = read('src/screens/ProfileScreen.js');
const menuSource = read('src/components/MenuDrawerModal.js');
const appSource = read('App.js');
const modalSource = read('src/components/FeedbackBoardModal.js');
const adminScreenSource = read('src/screens/AdminScreen.js');
const adminApiSource = read('api/admin.js');
const adminDbSource = read('server/admin-db.js');

check(
  '화면: 내 정보 설정 목록에 `제안 · 버그 제보` 행 (앱 정보 다음)',
  profileSource.indexOf('profile-row-feedback') > 0 &&
    profileSource.indexOf('profile-row-about') < profileSource.indexOf('profile-row-feedback') &&
    profileSource.indexOf('기능 아이디어 · 버그 신고') > 0,
  ''
);
check('화면: ☰ 시트가 게시판 열기를 전달', menuSource.indexOf('onOpenFeedback') > 0 && menuSource.indexOf('onOpenFeedback={onOpenFeedback}') > 0, '');
check('화면: App 이 게시판 모달을 그리고 로그인 정보를 넘김', appSource.indexOf('<FeedbackBoardModal') > 0 && appSource.indexOf('userName={profile.name}') > 0 && appSource.indexOf('onOpenFeedback={() => setFeedbackOpen(true)}') > 0, '');
check(
  '화면: 게시판 모달이 LayerSheet 틀을 씀 (다른 레이어 팝업과 동일)',
  modalSource.indexOf("from './LayerSheet'") > 0 && modalSource.indexOf('icon="chatbubble-ellipses"') > 0 && modalSource.indexOf('title={composing ? ') > 0,
  ''
);
check(
  '화면: 2탭 · 최신순/공감순 · 글쓰기 버튼',
  modalSource.indexOf('feedback-tab-') > 0 && modalSource.indexOf('feedback-sort-') > 0 && modalSource.indexOf('feedback-write') > 0,
  ''
);
check(
  '화면: 카드에 상태 배지 · 작성자 · 상대 시각 · 앱 버전 · 👍 공감',
  modalSource.indexOf('StatusBadge') > 0 && modalSource.indexOf('item.author') > 0 && modalSource.indexOf('relativeTime(item.createdAt)') > 0 && modalSource.indexOf("' · v'") > 0 && modalSource.indexOf('👍 공감') > 0,
  ''
);
check(
  '화면: 글쓰기 폼에 제목·내용·닉네임 + 로그인 이름 미리 채움',
  modalSource.indexOf('feedback-title-input') > 0 && modalSource.indexOf('feedback-content-input') > 0 && modalSource.indexOf('feedback-author-input') > 0 && modalSource.indexOf('setAuthor(normalizeAuthor(userName)') > 0,
  ''
);
check('보안: 화면이 service_role 키를 쓰지 않음', modalSource.indexOf('SERVICE_ROLE') < 0 && read('src/services/feedback.js').indexOf('SERVICE_ROLE') < 0, '');

// ── 10. 어드민 4번째 탭 ────────────────────────────────────
check(
  '어드민: 4번째 탭 제보',
  adminScreenSource.indexOf("{ id: 'feedback', label: '제보'") > 0 && adminScreenSource.indexOf("id: 'pins', label: '장소 관리'") < adminScreenSource.indexOf("{ id: 'feedback'"),
  ''
);
check(
  '어드민: 유형·상태 필터',
  adminScreenSource.indexOf("FEEDBACK_KIND_OPTIONS") > 0 &&
    adminScreenSource.indexOf("FEEDBACK_STATUS_OPTIONS") > 0 &&
    adminScreenSource.indexOf("'전체'") > 0 &&
    adminScreenSource.indexOf("'접수됨'") > 0 &&
    adminScreenSource.indexOf("'반영됨'") > 0 &&
    adminScreenSource.indexOf("'수정됨'") > 0,
  ''
);
check(
  '어드민: 상태 변경·삭제 요청',
  adminScreenSource.indexOf("action: 'update-feedback-status'") > 0 &&
    adminScreenSource.indexOf("action: 'delete-feedback'") > 0 &&
    adminScreenSource.indexOf("kind: 'feedback'") > 0,
  ''
);
check(
  '어드민: 미리보기 모의 제보 목록',
  adminScreenSource.indexOf('feedback: [') > 0 && adminScreenSource.indexOf("id: 'f-1'") > 0,
  ''
);
check(
  '어드민: 미리보기에서도 유형·상태 필터가 걸림',
  adminScreenSource.indexOf('filterPreviewFeedback(PREVIEW_DATA.feedback') > 0 && adminScreenSource.indexOf('function filterPreviewFeedback') > 0,
  ''
);
check(
  'API: 제보 조회·상태 변경·삭제 경로',
  adminApiSource.indexOf("view === 'feedback'") > 0 &&
    adminApiSource.indexOf("action === 'update-feedback-status'") > 0 &&
    adminApiSource.indexOf("action === 'delete-feedback'") > 0,
  ''
);
check(
  'DB 계층: reelpin_admin_feedback · 상태 변경 · 삭제 RPC',
  adminDbSource.indexOf('reelpin_admin_feedback') > 0 &&
    adminDbSource.indexOf('reelpin_admin_update_feedback_status') > 0 &&
    adminDbSource.indexOf('reelpin_admin_delete_feedback') > 0,
  ''
);

// ── 11. SQL 파일 (실제 실행 전 점검) ───────────────────────
const sqlSource = read('supabase/feedback.sql');
check(
  'SQL: 테이블·컬럼',
  sqlSource.indexOf('create table if not exists public.reelpin_feedback') > 0 &&
    ['kind', 'title', 'content', 'author', 'user_email', 'app_version', 'likes', 'status', 'created_at'].every((c) => sqlSource.indexOf('  ' + c) >= 0 || sqlSource.indexOf('\n  ' + c) >= 0),
  ''
);
check(
  'SQL: 재실행 안전',
  sqlSource.indexOf('create table if not exists') > 0 &&
    sqlSource.indexOf('create or replace function') > 0 &&
    sqlSource.indexOf('drop policy if exists') > 0 &&
    sqlSource.indexOf('drop constraint if exists') > 0,
  ''
);
check(
  'SQL: RLS 공개 읽기·쓰기 강제(likes=0 · status=open)',
  sqlSource.indexOf('create policy reelpin_feedback_read') > 0 &&
    sqlSource.indexOf('create policy reelpin_feedback_insert') > 0 &&
    sqlSource.indexOf('likes = 0') > 0 &&
    sqlSource.indexOf("status = 'open'") > 0,
  ''
);
check(
  'SQL: 공감 RPC · 어드민 RPC 3개',
  sqlSource.indexOf('function public.increment_reelpin_feedback_like') > 0 &&
    sqlSource.indexOf('function public.reelpin_admin_feedback') > 0 &&
    sqlSource.indexOf('function public.reelpin_admin_update_feedback_status') > 0 &&
    sqlSource.indexOf('function public.reelpin_admin_delete_feedback') > 0,
  ''
);
check(
  'SQL: 관리자 이메일을 auth.jwt() 로 확인',
  sqlSource.indexOf("auth.jwt() ->> 'email'") > 0 &&
    sqlSource.indexOf('andy.leesh33@gmail.com') > 0 &&
    sqlSource.indexOf('shhy@kakao.com') > 0,
  ''
);
check(
  'SQL: 개인정보 — 공개 조회에서 user_email 컬럼 제외',
  sqlSource.indexOf('grant select (id, kind, title, content, author, app_version, likes, status, created_at)') > 0,
  ''
);

if (fails) {
  console.log('\nFEEDBACK_TEST_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nFEEDBACK_TESTS_OK');
