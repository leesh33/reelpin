/**
 * test/account-deletion-test.jsx — 🗑️ 회원탈퇴(계정 삭제) 검사 (v2.40.0)
 * ─────────────────────────────────────────────────────────────
 * App Store 심사 지침 **5.1.1(v)** — 계정을 만든 앱은 **앱 안에서** 계정을 지울 수 있어야 합니다.
 *
 * 지켜야 하는 것
 *   ① `내 정보` › 설정 목록 맨 끝에 `회원탈퇴` 행 — **로그인한 계정에만** 보인다
 *   ② 누르면 **두 단계** 확인 — ① 경고(무엇이 지워지나) → ② 마지막 확인(빨간 `탈퇴하기`)
 *   ③ 서버: `supabase/account-deletion.sql` 의 `delete_my_account()` 가
 *      **security definer + auth.uid() 가드**로 본인 핀·제보·공유 컬렉션·auth.users 만 지운다
 *   ④ 앱: `cloudSync.deleteMyAccount()` 가 RPC 를 부르고, 끝나면 세션을 정리한다
 *      (실패 문구는 다음에 할 일이 분명한 말 — 로그인 풀림 / 서버 미준비 / 네트워크)
 *   ⑤ 화면 배선: App → MenuDrawerModal → ProfileScreen → 확인 창
 *
 * 렌더는 react-native-web(SSR)으로 실제 컴포넌트를 그려 확인하고(네트워크 없음),
 * Supabase 는 가짜 클라이언트로 바꿔 **호출 모양**만 검사합니다.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import ProfileScreen, { APP_INFO_VERSION } from '../src/screens/ProfileScreen';
import MenuDrawerModal from '../src/components/MenuDrawerModal';
import DeleteAccountModal from '../src/components/DeleteAccountModal';
import { setSupabaseConfig, __setSupabaseClient, resetSupabaseConfigCache } from '../src/services/supabase';
import { deleteMyAccount } from '../src/services/cloudSync';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const noop = () => {};

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

const PINS = [
  { id: 'p1', name: '영등포아바이순대국', category: '맛집', visited: false },
  { id: 'p2', name: '문래동 소금빵', category: '카페', visited: true },
  { id: 'p3', name: '연남동 딸기 케이크', category: '카페', visited: false },
];

const baseProps = {
  name: '이상훈',
  handle: 'odol',
  pins: PINS,
  categories: ['맛집', '카페'],
  radiusMeters: 500,
  alertsOn: true,
  isPro: false,
  onStartPro: noop,
  onGoPaste: noop,
  onToast: noop,
  onChangeRadius: noop,
  onToggleAlerts: noop,
  onAddCategory: noop,
  onRenameCategory: noop,
  onRemoveCategory: noop,
  cloudConfigured: true,
  cloudUser: { id: 'u-1', email: 'andy.leesh33@gmail.com' },
  cloudPinCount: 3,
  onDeleteAccount: async () => ({ ok: true }),
};

const html = (node) => renderToString(node);

async function main() {

// ── 1. SQL ───────────────────────────────────────────────────
const sql = read('supabase/account-deletion.sql');
const sqlLower = sql.toLowerCase();

check('SQL: 파일이 supabase/account-deletion.sql 로 들어 있다', sql.length > 800, sql.length + '자');
check('SQL: delete_my_account() 를 만들고 다시 실행해도 안전(create or replace)',
  sqlLower.indexOf('create or replace function public.delete_my_account()') >= 0);
check('SQL: SECURITY DEFINER + search_path 고정',
  sqlLower.indexOf('security definer') >= 0 && sqlLower.indexOf('set search_path = public, auth') >= 0);
check('SQL: 로그인(auth.uid()) 가 없으면 아무것도 지우지 않고 예외',
  sqlLower.indexOf('if v_uid is null then') >= 0 && sqlLower.indexOf('raise exception') >= 0);
check('SQL: 본인 핀만 지운다 (user_id = v_uid)',
  sqlLower.indexOf('delete from public.pins where user_id = v_uid') >= 0);
check('SQL: 내 이메일로 남긴 제보도 지운다',
  sqlLower.indexOf('delete from public.reelpin_feedback') >= 0 && sqlLower.indexOf('lower(user_email) = v_email') >= 0);
check('SQL: 내가 공유한 컬렉션도 지운다 (owner_id = v_uid)',
  sqlLower.indexOf('delete from public.reelpin_shared_collections where owner_id = v_uid') >= 0);
check('SQL: 마지막에 auth.users 계정을 지운다',
  sqlLower.indexOf('delete from auth.users where id = v_uid') >= 0);
check('SQL: 권한 — authenticated 만 실행 (anon·public 회수)',
  sqlLower.indexOf('revoke all on function public.delete_my_account() from anon') >= 0 &&
    sqlLower.indexOf('grant execute on function public.delete_my_account() to authenticated') >= 0);
check('SQL: 운영 데이터를 통째로 지우는 구문 없음 (drop table · truncate 없음)',
  sqlLower.indexOf('drop table') < 0 && sqlLower.indexOf('truncate') < 0);
check('SQL: 모든 delete 에 where 가 있다',
  (sqlLower.match(/delete from [^;]+/g) || []).every((stmt) => stmt.indexOf(' where ') > 0),
  (sqlLower.match(/delete from [^;]+/g) || []).join(' | '));

// ── 2. cloudSync.deleteMyAccount ─────────────────────────────
setSupabaseConfig({ url: 'https://zdcdvjlssncsawpqsjwe.supabase.co', anonKey: 'sb_publishable_test' });

async function cloudChecks() {
  // 성공 — RPC 1회 + 세션 정리
  let rpcName = null;
  let signedOut = 0;
  __setSupabaseClient({
    rpc: async (name) => {
      rpcName = name;
      return { data: { ok: true, pins: 3, feedback: 1, shared_collections: 0 }, error: null };
    },
    auth: {
      signOut: async () => {
        signedOut += 1;
        return { error: null };
      },
    },
  });
  const okRes = await deleteMyAccount();
  check('앱: RPC 이름은 delete_my_account', rpcName === 'delete_my_account', rpcName);
  check('앱: 성공하면 { ok:true } + 지운 개수', okRes.ok === true && okRes.deleted && okRes.deleted.pins === 3, JSON.stringify(okRes));
  check('앱: 성공하면 기기 세션을 정리한다(로그아웃 1회)', signedOut === 1, signedOut);
  check('앱: 성공 문구는 무엇이 지워졌는지 말한다',
    String(okRes.message || '').indexOf('계정과 클라우드 데이터') >= 0, okRes.message);

  // 함수가 아직 없는 DB
  __setSupabaseClient({
    rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.delete_my_account' } }),
    auth: { signOut: async () => ({ error: null }) },
  });
  const missing = await deleteMyAccount();
  check('앱: 함수가 없으면 실패 + `서버에 아직 준비되지 않았어요`',
    missing.ok === false && String(missing.message).indexOf('준비되지 않았') >= 0, missing.message);

  // 세션이 풀린 경우
  __setSupabaseClient({
    rpc: async () => ({ data: null, error: { code: '28000', message: '로그인이 필요해요' } }),
    auth: { signOut: async () => ({ error: null }) },
  });
  const notSigned = await deleteMyAccount();
  check('앱: 세션이 풀렸으면 `다시 로그인한 뒤` 안내',
    notSigned.ok === false && String(notSigned.message).indexOf('다시 로그인') >= 0, notSigned.message);

  // 네트워크
  __setSupabaseClient({
    rpc: async () => {
      throw new Error('Failed to fetch');
    },
    auth: { signOut: async () => ({ error: null }) },
  });
  const netErr = await deleteMyAccount();
  check('앱: 네트워크 오류는 네트워크 문구로', netErr.ok === false && String(netErr.message).indexOf('네트워크') >= 0, netErr.message);

  // 설정 자체가 없는 환경 (주입 설정·클라이언트를 모두 비움)
  setSupabaseConfig(null);
  resetSupabaseConfigCache();
  __setSupabaseClient(null);
  const savedUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const savedKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const offRes = await deleteMyAccount();
  check('앱: 클라우드 설정이 없으면 not-configured', offRes.ok === false && offRes.error === 'not-configured', JSON.stringify(offRes));
  if (savedUrl !== undefined) process.env.EXPO_PUBLIC_SUPABASE_URL = savedUrl;
  if (savedKey !== undefined) process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = savedKey;
  setSupabaseConfig({ url: 'https://zdcdvjlssncsawpqsjwe.supabase.co', anonKey: 'sb_publishable_test' });
}

// ── 3. 내 정보 화면 ──────────────────────────────────────────
const signedOut = html(<ProfileScreen {...baseProps} cloudUser={null} cloudPinCount={0} name="" handle="" />);
const signedIn = html(<ProfileScreen {...baseProps} />);
const signedInMenu = html(
  <MenuDrawerModal
    visible
    pins={PINS}
    categories={['맛집', '카페']}
    cloudConfigured
    cloudUser={{ id: 'u-1', email: 'andy.leesh33@gmail.com' }}
    cloudPinCount={3}
    radiusMeters={500}
    onClose={noop}
    onToast={noop}
    onDeleteAccount={baseProps.onDeleteAccount}
  />
);

check('내 정보: 로그인하면 맨 끝에 `회원탈퇴` 행이 있다',
  signedIn.indexOf('profile-row-delete-account') > 0 && signedIn.indexOf('회원탈퇴') > 0);
check('내 정보: 로그아웃 상태에는 회원탈퇴 행이 없다',
  signedOut.indexOf('profile-row-delete-account') < 0 && signedOut.indexOf('회원탈퇴') < 0);
check('내 정보: 행은 설정 목록 안 · `앱 정보` 뒤에 온다',
  signedIn.indexOf('profile-settings-rows') < signedIn.indexOf('profile-row-delete-account') &&
    signedIn.indexOf('profile-row-about') < signedIn.indexOf('profile-row-delete-account'));
check('내 정보: 행 설명은 무엇이 지워지는지 말한다',
  signedIn.indexOf('계정과 클라우드에 저장한 데이터를 지웁니다') > 0);
check('☰ 내 정보 시트에도 같은 행이 그려진다', signedInMenu.indexOf('profile-row-delete-account') > 0);
check('첫 화면에는 확인 창이 없다 (누르기 전)',
  signedIn.indexOf('delete-account-modal') < 0 && signedIn.indexOf('delete-account-overlay') < 0);

// ── 4. 확인 창 — 두 단계 ─────────────────────────────────────
const step1 = html(<DeleteAccountModal visible email="andy.leesh33@gmail.com" pinCount={3} onCancel={noop} onConfirm={noop} />);
const step2 = html(
  <DeleteAccountModal visible initialStep="final" email="andy.leesh33@gmail.com" pinCount={3} onCancel={noop} onConfirm={noop} />
);
const busy = html(<DeleteAccountModal visible initialStep="final" busy email="andy.leesh33@gmail.com" onCancel={noop} onConfirm={noop} />);
const errored = html(
  <DeleteAccountModal visible initialStep="final" error="회원탈퇴가 서버에 아직 준비되지 않았어요" email="a@b.co" onCancel={noop} onConfirm={noop} />
);

check('1단계: 제목 `회원탈퇴` + 되돌릴 수 없다는 안내',
  step1.indexOf('delete-account-title') > 0 && step1.indexOf('회원탈퇴') > 0 && step1.indexOf('되돌릴 수 없습니다') > 0);
check('1단계: 계정 이메일을 보여 준다', step1.indexOf('andy.leesh33@gmail.com') > 0);
check('1단계: 지워지는 것 목록 — 핀 개수 · 제보 · 공유 링크',
  step1.indexOf('클라우드에 저장한 핀') > 0 && step1.indexOf('3개') > 0 &&
    step1.indexOf('제안 · 버그 제보') > 0 && step1.indexOf('공유한 컬렉션 링크') > 0);
check('1단계: 기기에 저장된 핀은 남는다고 알린다',
  step1.indexOf('이 기기에 저장된 핀은 그대로') > 0);
check('1단계: 버튼은 `취소` · `탈퇴 계속` (아직 지우지 않음)',
  step1.indexOf('delete-account-cancel') > 0 && step1.indexOf('delete-account-continue') > 0 &&
    step1.indexOf('delete-account-final') < 0);
check('2단계: `정말 탈퇴할까요?` + 마지막 경고',
  step2.indexOf('정말 탈퇴할까요?') > 0 && step2.indexOf('다시 로그인할 수 없고') > 0);
check('2단계: 빨간 `탈퇴하기` 버튼 하나 (계속 버튼은 사라짐)',
  step2.indexOf('delete-account-final') > 0 && step2.indexOf('delete-account-continue') < 0 && step2.indexOf('탈퇴하기') > 0);
check('2단계: 탈퇴 요청 중에는 `탈퇴 중…` 으로 잠근다',
  busy.indexOf('delete-account-busy') > 0 && busy.indexOf('탈퇴 중…') > 0);
check('2단계: 실패 문구를 창 안에도 보여 준다',
  errored.indexOf('delete-account-error') > 0 && errored.indexOf('아직 준비되지 않았어요') > 0);

// ── 5. 화면 배선 ─────────────────────────────────────────────
const profileSrc = read('src/screens/ProfileScreen.js');
const menuSrc = read('src/components/MenuDrawerModal.js');
const appSrc = read('App.js');
const modalSrc = read('src/components/DeleteAccountModal.js');

check('배선: ProfileScreen 이 onDeleteAccount() 를 부르고 결과로 창을 닫는다',
  profileSrc.indexOf('const res = await onDeleteAccount()') > 0 && profileSrc.indexOf('if (res && res.ok)') > 0);
check('배선: 실패하면 창을 열어 둔 채 error 를 넘긴다',
  profileSrc.indexOf('setDeleteError(') > 0 && profileSrc.indexOf('error={deleteError}') > 0);
check('배선: ☰ 시트가 onDeleteAccount 를 그대로 넘긴다', menuSrc.indexOf('onDeleteAccount={onDeleteAccount}') > 0);
check('배선: App 이 deleteMyAccount 로 지우고 세션을 비운다',
  appSrc.indexOf('deleteMyAccount') > 0 && appSrc.indexOf('clearCloudSession()') > 0 &&
    appSrc.indexOf('onDeleteAccount={handleDeleteAccount}') > 0);
check('배선: 확인 창은 두 단계 상태(warn → final)로만 진행된다',
  modalSrc.indexOf("useState(initialStep === 'final' ? 'final' : 'warn')") > 0 &&
    modalSrc.indexOf("setStep('final')") > 0 && modalSrc.indexOf('onConfirm()') > 0);
// 390px 폭에서 긴 이메일이 창 밖으로 넘치지 않게 (v2.40.0 라이브 실측에서 발견 → 수정)
check('레이아웃: 목록 라벨은 줄이지 않고 값만 말줄임 (라벨이 `계⋯` 로 잘리지 않음)',
  modalSrc.indexOf('rowLabel: { flexShrink: 0') > 0 && modalSrc.indexOf('rowValue: { flex: 1, minWidth: 0') > 0);
check('레이아웃: 2단계 계정은 자기 줄에서 말줄임 (상자 밖으로 넘치지 않음)',
  modalSrc.indexOf('warnAccount') > 0 && modalSrc.indexOf('testID="delete-account-final-email"') > 0);
check('배선: 버전도 함께 올렸다 (앱 정보 = 2.40.0)', APP_INFO_VERSION === '릴스핀 v2.40.0', APP_INFO_VERSION);

  await cloudChecks();

  if (fails) {
    console.log('\nACCOUNT_DELETION_FAILED (' + fails + ')');
    process.exit(1);
  }
  console.log('\nACCOUNT_DELETION_OK');
}

main().catch((e) => {
  console.log('FAIL 예외 -> ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
