/**
 * src/services/fontLoader.js — 🔤 네이티브 글꼴 로딩 (v2.40.0)
 * ─────────────────────────────────────────────────────────────
 * Expo(`expo-font`)로 Gmarket Sans 두 굵기를 앱이 켜질 때 한 번 읽습니다.
 *
 *   · **웹에서는 아무 것도 하지 않습니다** — `public/fonts/*.woff2` 를 `index.html` 의
 *     @font-face 가 이미 받고 있어, 여기서 또 받으면 같은 글꼴을 두 번 내려받게 됩니다.
 *   · 실패해도 앱은 그대로 뜹니다(시스템 글꼴). `setNativeFontsAvailable(false)` 로 기억해
 *     `AppText` 가 없는 글꼴 이름을 계속 붙이지 않게 합니다.
 *   · 여러 번 불러도 실제 로딩은 한 번입니다(같은 Promise 를 돌려줍니다).
 */
import { Platform } from 'react-native';
import * as Font from 'expo-font';
import { FONT_FILES } from '../utils/fontAssets';
import { setNativeFontsAvailable } from '../utils/fonts';

let loading = null;

/** 글꼴 로딩 결과 `{ ok, skipped?, error? }` — 절대 throw 하지 않습니다. */
export function loadAppFonts() {
  if (Platform.OS === 'web') {
    // 웹은 CSS(@font-face)가 맡습니다.
    return Promise.resolve({ ok: true, skipped: 'web' });
  }
  if (loading) return loading;
  loading = (async () => {
    try {
      await Font.loadAsync(FONT_FILES);
      setNativeFontsAvailable(true);
      return { ok: true, fonts: Object.keys(FONT_FILES) };
    } catch (e) {
      setNativeFontsAvailable(false);
      return { ok: false, error: String((e && e.message) || e) };
    }
  })();
  return loading;
}

/** 테스트용 — 한 번 로딩한 기억을 지웁니다. */
export function __resetFontLoader() {
  loading = null;
}
