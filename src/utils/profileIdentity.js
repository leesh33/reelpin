/**
 * src/utils/profileIdentity.js — v2.20.1
 * ─────────────────────────────────────────────────────────────
 * 「내 정보」 상단 프로필 카드에 쓸 **이름 · 핸들**을 로그인 상태에서만 만듭니다.
 *
 * 상훈 님 (2026-11-17):
 *   "그리고 로그아웃 했는데 어떻게 상단에 이상훈이라고 뜨는지 모르겠어"
 *
 * 원인은 호출부(App.js · MenuDrawerModal.js)가 `cloudUser` 가 없을 때도
 * 기본값 `'이상훈'` · `'odol'` 을 그대로 넘겨, 로그아웃 상태에서도 남의(내) 이름이
 * 찍히던 것이었습니다. 이제 이름의 출처는 **로그인한 계정 하나**입니다.
 *
 *   · 로그인 전 … displayName `게스트` · 보조줄 `로그인하면 핀이 클라우드에 동기화돼요`
 *   · 로그인 후 … user_metadata 의 full_name/name/nickname → 이메일 앞자리 순으로,
 *                핸들은 preferred_username/nickname → 이메일 앞자리 순으로.
 *                확인되지 않은 값을 지어내지 않습니다.
 */

/** 로그아웃(비로그인) 상태의 이름 — 예전 기본값 '이상훈' 을 대신합니다. */
export const GUEST_NAME = '게스트';

/** 로그아웃 상태의 보조줄 */
export const GUEST_HINT = '로그인하면 핀이 클라우드에 동기화돼요';

/** 로그인 상태인가 — 계정 카드(AccountCard)와 같은 규칙(id 또는 email) */
export function isSignedInUser(cloudUser) {
  return Boolean(cloudUser && (cloudUser.email || cloudUser.id));
}

/** 앞뒤 공백을 지우고, 값이 없으면 '' */
function clean(value) {
  return String(value == null ? '' : value).trim();
}

/** '@odol' → 'odol' */
function stripAt(value) {
  return clean(value).replace(/^@+/, '');
}

/**
 * 프로필 카드에 그대로 쓸 수 있는 값으로 정리합니다.
 * @returns {{signedIn:boolean, name:string, handle:string, displayName:string, initial:string, subline:string}}
 *   name … 로그인했을 때의 이름('' 이면 이름 없음) · 로그인 전에는 ''
 *   displayName … 화면에 쓸 이름 (로그인 전 '게스트')
 *   initial … 아바타 글자 (로그인 전 '?' — 게스트 아이콘을 쓸 때는 비웁니다)
 */
export function profileIdentity(cloudUser) {
  if (!isSignedInUser(cloudUser)) {
    return {
      signedIn: false,
      name: '',
      handle: '',
      displayName: GUEST_NAME,
      initial: '?',
      subline: GUEST_HINT,
    };
  }
  const meta = (cloudUser && cloudUser.user_metadata) || {};
  const emailLocal = clean(cloudUser.email).split('@')[0] || '';
  const name =
    clean(meta.full_name) || clean(meta.name) || clean(meta.nickname) || emailLocal || '';
  const handle =
    stripAt(meta.preferred_username) || stripAt(meta.nickname) || stripAt(meta.user_name) || stripAt(emailLocal);
  return {
    signedIn: true,
    name,
    handle,
    displayName: name || '내 계정',
    initial: name ? name.slice(0, 1).toUpperCase() : '?',
    subline: '',
  };
}
