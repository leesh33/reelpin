/**
 * test/apple-signin-test.jsx — 🍎 Sign in with Apple 준비 검사 (v2.40.0)
 * ─────────────────────────────────────────────────────────────
 * App Store 심사 지침 **4.8** — 다른 소셜 로그인(카카오·구글)을 제공하면 **Apple 로그인도**
 * 함께 제공해야 합니다. 상훈 님은 유료 Apple Developer 계정(연 129,000원)을 아직 만들지 않아
 * Apple Provider(Service ID · Key)가 꺼져 있습니다.
 *
 * 그래서 이번에 만든 것 — **깨진 버튼을 내보내지 않는 스위치**
 *   `SHOW_APPLE_SIGNIN = false`  … Apple 버튼은 `준비 중` 배지로 보이고, 눌러도 Supabase 를
 *                                  부르지 않고 안내 토스트만 (오류 페이지 방지) — **지금 상태**
 *   `SHOW_APPLE_SIGNIN = true`   … Apple 버튼이 활성, 누르면 `signInWithOAuth({provider:'apple'})`
 *                                  (Apple Developer 콘솔 + Supabase Providers 를 켠 뒤 한 줄만 바꿈)
 *
 * 지켜야 하는 것
 *   ① 스위치가 **한 곳**(cloudSync.js)에 있고, 목록이 그 값으로 만들어진다
 *   ② 꺼짐: `pending` 배지 · 안내 문구 · Supabase 호출 0회
 *   ③ 켜짐: 배지 없음 · 읽어 주는 이름 정상 · `oauthProviderReady('apple')` = true
 *   ④ 로그인 화면(App · ProfileScreen)이 같은 가드(`oauthProviderReady`)를 쓴다
 *   ⑤ README 에 **켜는 순서**(Apple Developer → Supabase → 스위치)가 적혀 있다
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import {
  OAUTH_PENDING_MESSAGE,
  OAUTH_PROVIDERS,
  SHOW_APPLE_SIGNIN,
  buildOAuthProviders,
  oauthProviderReady,
  parseOAuthCallback,
  signInWithOAuth,
} from '../src/services/cloudSync';
import { AccountCard } from '../src/screens/ProfileScreen';
import { setSupabaseConfig, __setSupabaseClient } from '../src/services/supabase';

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

const appSrc = read('App.js');
const profileSrc = read('src/screens/ProfileScreen.js');
const cloudSrc = read('src/services/cloudSync.js');
const readme = read('README.md');

const off = buildOAuthProviders(false);
const on = buildOAuthProviders(true);
const appleOf = (list) => list.find((p) => p.id === 'apple') || {};

const cardOff = renderToString(
  React.createElement(AccountCard, {
    cloudConfigured: true,
    cloudUser: null,
    cloudPinCount: 0,
    onToast: noop,
    providers: off,
  })
);
const cardOn = renderToString(
  React.createElement(AccountCard, {
    cloudConfigured: true,
    cloudUser: null,
    cloudPinCount: 0,
    onToast: noop,
    providers: on,
  })
);

check('스위치: 지금은 켜짐 (Apple Developer·Supabase Provider 등록 후)', SHOW_APPLE_SIGNIN === true, String(SHOW_APPLE_SIGNIN));
check('스위치: 목록은 스위치 값으로 만들어진다 (OAUTH_PROVIDERS = buildOAuthProviders())',
  cloudSrc.indexOf('export const OAUTH_PROVIDERS = buildOAuthProviders();') > 0 &&
    cloudSrc.indexOf('export const SHOW_APPLE_SIGNIN = ' + SHOW_APPLE_SIGNIN + ';') > 0);
check('목록: 카카오 · 구글 · Apple 세 개 (순서 그대로)',
  OAUTH_PROVIDERS.map((p) => p.id).join(',') === 'kakao,google,apple',
  OAUTH_PROVIDERS.map((p) => p.id).join(','));
check('켜짐/꺼짐 모두 카카오·구글은 늘 준비됨',
  oauthProviderReady('kakao', off) && oauthProviderReady('google', off) &&
    oauthProviderReady('kakao', on) && oauthProviderReady('google', on));

// ── 꺼짐 상태 ────────────────────────────────────────────────
check('꺼짐: Apple 은 pending (Supabase 로 넘기지 않음)',
  appleOf(off).pending === true && oauthProviderReady('apple', off) === false && oauthProviderReady('apple') === true);
check('꺼짐: 화면에 `준비 중` 배지 + 안내 줄',
  cardOff.indexOf('social-apple-pending') > 0 && cardOff.indexOf('준비 중') > 0 &&
    cardOff.indexOf('social-pending-line') > 0 && cardOff.indexOf('Apple 로그인은 준비 중이에요') > 0);
check('꺼짐: 읽어 주는 이름에도 (준비 중)',
  cardOff.indexOf('Apple 로 (준비 중)') > 0 || cardOff.indexOf('(준비 중)') > 0);
check('꺼짐: 카카오·구글 버튼은 그대로 활성',
  cardOff.indexOf('social-kakao') > 0 && cardOff.indexOf('social-google') > 0 &&
    cardOff.indexOf('social-kakao-pending') < 0 && cardOff.indexOf('social-google-pending') < 0);

// ── 켜짐 상태 ────────────────────────────────────────────────
check('켜짐: Apple 이 준비됨 (pending 아님)',
  appleOf(on).pending !== true && oauthProviderReady('apple', on) === true);
check('켜짐: 화면에 활성 Apple 버튼 (준비 중 배지·안내 줄 없음)',
  cardOn.indexOf('social-apple') > 0 && cardOn.indexOf('social-apple-pending') < 0 &&
    cardOn.indexOf('준비 중') < 0 && cardOn.indexOf('social-pending-line') < 0);
check('켜짐: `Apple 로 로그인` 이라는 읽어 주는 이름',
  cardOn.indexOf('Apple 로 로그인') > 0);

// ── 실제 호출 가드 ───────────────────────────────────────────
async function callChecks() {
  setSupabaseConfig({ url: 'https://zdcdvjlssncsawpqsjwe.supabase.co', anonKey: 'sb_publishable_test' });
  let calls = 0;
  __setSupabaseClient({
    auth: {
      signInWithOAuth: async () => {
        calls += 1;
        return { data: { url: 'https://appleid.apple.com/auth/authorize' }, error: null };
      },
    },
  });
  // v2.40.0 빌드 21 — 웹 흉내(window.document 있음)로 웹 경로를 검사합니다.
  //   (node 는 window 가 없어 네이티브 경로 → 창이 없으니 cancelled. 그 경로는 test:cloud 가 검사)
  globalThis.window = { document: {}, location: { origin: 'https://reelpin.vercel.app' } };
  const res = await signInWithOAuth('apple');
  delete globalThis.window;
  check('켜짐: signInWithOAuth("apple") 이 Supabase 를 부른다', calls === 1 && res.ok === true &&
    res.error !== 'provider-pending', calls + ' / ' + JSON.stringify(res));
  check('꺼짐: 안내 문구는 지금 문구 그대로',
    OAUTH_PENDING_MESSAGE === 'Apple 로그인은 준비 중이에요. 구글이나 카카오 로그인을 이용해 주세요.', OAUTH_PENDING_MESSAGE);
  __setSupabaseClient(null);
}

// ── 코드 배선 ────────────────────────────────────────────────
check('배선: 로그인 함수가 provider 그대로 넘긴다 (provider: id)',
  cloudSrc.indexOf('provider: id,') > 0 && cloudSrc.indexOf("if (!oauthProviderReady(id)) return fail('provider-pending', OAUTH_PENDING_MESSAGE);") > 0);
check('배선: Apple 은 Supabase `signInWithOAuth` 그대로 (별도 SDK·네이티브 모듈 없음)',
  cloudSrc.indexOf('client.auth.signInWithOAuth') > 0 && !read('package.json').includes('expo-apple-authentication'));
check('배선: App·ProfileScreen 모두 준비 중 가드 + 토스트',
  appSrc.indexOf('!oauthProviderReady(provider)') > 0 && appSrc.indexOf('OAUTH_PENDING_MESSAGE') > 0 &&
    profileSrc.indexOf('!oauthProviderReady(provider, providers)') > 0 &&
    profileSrc.indexOf('toast(OAUTH_PENDING_MESSAGE)') > 0);

// ── v2.41 — 아이폰 로그인 복귀 주소(딥링크) 처리 ─────────────
const cbCode = parseOAuthCallback('reelpin://auth-callback?code=abc123&state=xyz');
check('복귀 주소: `?code=` 를 뽑아낸다 (PKCE)', cbCode.code === 'abc123' && cbCode.error === '', JSON.stringify(cbCode));
const cbHash = parseOAuthCallback('reelpin://auth-callback#access_token=at1&refresh_token=rt1');
check('복귀 주소: 해시의 토큰도 뽑아낸다', cbHash.accessToken === 'at1' && cbHash.refreshToken === 'rt1', JSON.stringify(cbHash));
const cbError = parseOAuthCallback('reelpin://auth-callback?error=access_denied&error_description=nope');
check('복귀 주소: 거절(error) 도 알아본다', cbError.error === 'access_denied' && cbError.errorDescription === 'nope');
check('복귀 주소: 빈 값이면 아무것도 없다', parseOAuthCallback('').code === '' && parseOAuthCallback(null).code === '');
check('배선: 네이티브는 openAuthSessionAsync + exchangeCodeForSession 으로 세션을 만든다',
  cloudSrc.indexOf('openAuthSessionAsync') > 0 && cloudSrc.indexOf('exchangeCodeForSession') > 0 &&
    cloudSrc.indexOf('completeOAuthCallback') > 0);
check('배선: 앱이 딥링크(url) 로 돌아온 로그인도 받는다',
  appSrc.indexOf("Linking.addEventListener('url'") > 0 && appSrc.indexOf('completeOAuthCallback(null, url)') > 0);

// ── README 안내 ──────────────────────────────────────────────
// 안내는 **제목 줄**('## … Apple 로그인 켜기 …')부터 잘라 봅니다 — 본문 중간의 안내 문구와 섞이지 않게
const headingMatch = readme.match(/^#{1,3}[^\n]*Apple 로그인 켜기[^\n]*\n([\s\S]{0,4000})/m);
const readmeBlock = headingMatch ? headingMatch[1] : '';
check('README: `Apple 로그인 켜기` 안내가 있다', headingMatch !== null);
check('README: Apple Developer(Service ID · Key) → Supabase Providers → 스위치 순서',
  readmeBlock.indexOf('Service ID') > 0 && readmeBlock.indexOf('Supabase') > 0 &&
    readmeBlock.indexOf('SHOW_APPLE_SIGNIN') > 0);
check('README: 스위치를 켜는 파일 경로가 적혀 있다', readmeBlock.indexOf('src/services/cloudSync.js') > 0);

if (fails) {
  console.log('\nAPPLE_SIGNIN_FAILED (' + fails + ')');
  process.exit(1);
}

callChecks()
  .then(() => {
    if (fails) {
      console.log('\nAPPLE_SIGNIN_FAILED (' + fails + ')');
      process.exit(1);
    }
    console.log('\nAPPLE_SIGNIN_OK');
  })
  .catch((e) => {
    console.log('FAIL 예외 -> ' + (e && e.stack ? e.stack : e));
    process.exit(1);
  });
