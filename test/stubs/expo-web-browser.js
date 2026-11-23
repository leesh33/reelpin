// 테스트(node)용 expo-web-browser 스텁 — v2.40.0 빌드 21
//
// 실제 모듈은 네이티브 브리지(expo-modules-core)를 타서 node 에서 읽을 수 없습니다.
// 이 스텁은 **브라우저를 열지 않고** 무엇을 열려 했는지(calls)만 기록하고,
// 테스트가 정해 둔 결과(`globalThis.__expoWebBrowserStub.next`)를 그대로 돌려줍니다.
//
//   · `{ type: 'success', url: 'reelpin://auth-callback?code=…' }` … 사용자가 로그인을 마치고 돌아옴
//   · `{ type: 'dismiss' }`                                   … 사용자가 창을 그냥 닫음(취소)
//
// `src/services/cloudSync.js` 의 네이티브 OAuth 경로(`openNativeOAuth`)가 이 모듈을
// `require('expo-web-browser')` 로 읽기 때문에, test/run-tests.mjs 의 alias 로 이 파일이 들어갑니다.

const state = (globalThis.__expoWebBrowserStub = globalThis.__expoWebBrowserStub || {
  calls: [],
  next: null,
});

export async function openAuthSessionAsync(url, redirectUrl) {
  state.calls.push({ url: String(url), redirectUrl: String(redirectUrl) });
  if (typeof state.next === 'function') return state.next(url, redirectUrl);
  return state.next || { type: 'dismiss' };
}

export function dismissBrowser() {}
export function dismissAuthSession() {}
export async function openBrowserAsync(url) {
  state.calls.push({ url: String(url), redirectUrl: '' });
  return { type: 'opened' };
}
export function warmUpAsync() {}
export function coolDownAsync() {}

export default { openAuthSessionAsync, openBrowserAsync, dismissBrowser, dismissAuthSession };
