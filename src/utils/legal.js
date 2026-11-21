/**
 * src/utils/legal.js — 개인정보처리방침 · 이용약관 링크 (2026-11-20)
 * ─────────────────────────────────────────────────────────────
 * 앱(☰ 내 정보 발끝)과 로그인 카드가 **같은 주소·같은 문구**를 쓰도록 한 곳에 모읍니다.
 *
 * 실제 문서는 배포 도메인의 정적 페이지입니다.
 *   · `public/privacy.html`  → https://reelpin.vercel.app/privacy
 *   · `public/terms.html`    → https://reelpin.vercel.app/terms
 * `vercel.json` 의 rewrite 두 줄이 그 경로를 연결합니다
 * (App Store·Google OAuth 심사에서 요구하는 공개 주소).
 *
 * 여는 방법
 *   · 웹 : 같은 탭으로 그 페이지를 엽니다(뒤로 가면 앱으로 돌아옵니다)
 *   · 앱 : 기기 브라우저로 같은 주소를 엽니다
 */
import { Linking, Platform } from 'react-native';

/** 배포 도메인 — 정적 페이지의 기준 주소 */
export const LEGAL_BASE_URL = 'https://reelpin.vercel.app';

/** 링크 순서·이름·경로 (화면과 검사가 함께 씁니다)
 *  v2.40.0 — ☰ 내 정보 메뉴에 별도 행으로 서면서 한 줄 설명(`desc`)도 함께 씁니다. */
export const LEGAL_LINKS = [
  { key: 'privacy', label: '개인정보처리방침', path: '/privacy', desc: '수집 항목 · 이용 목적 · 보관과 파기' },
  { key: 'terms', label: '이용약관', path: '/terms', desc: '서비스 이용 조건과 책임 범위' },
];

/** `/privacy` 같은 경로를 실제 배포 주소로 */
export function legalPageUrl(path) {
  const raw = String(path == null ? '' : path);
  const clean = raw.startsWith('/') ? raw : '/' + raw;
  return LEGAL_BASE_URL + clean;
}

/** 법적 고지 페이지를 엽니다(웹 = 같은 탭 · 앱 = 브라우저). */
export async function openLegalPage(path) {
  const url = legalPageUrl(path);
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
      window.location.href = url;
      return { opened: 'web', url };
    }
    await Linking.openURL(url);
    return { opened: Platform.OS === 'web' ? 'web' : 'app', url };
  } catch (e) {
    return { opened: 'failed', url };
  }
}
