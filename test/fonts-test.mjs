/**
 * test/fonts-test.mjs — 🔤 Gmarket Sans 네이티브(iOS·Android) 준비 검사 (v2.40.0)
 * ─────────────────────────────────────────────────────────────
 * v2.38.0 에서 **웹(PWA)** 은 Gmarket Sans 로 바꿨지만 Expo 네이티브 빌드는 시스템 글꼴이었습니다.
 * 이번(v2.40.0)에 네이티브까지 같은 글꼴로 맞춥니다.
 *
 * 지켜야 하는 것
 *   ① 글꼴 파일이 앱 안에 있다 — `assets/fonts/GmarketSans{Medium,Bold}.otf` (OTF · 이름 일치)
 *   ② `app.json` 의 expo-font 플러그인이 그 두 파일을 **빌드에 넣는다**
 *   ③ 앱이 켜질 때 `expo-font` 로 한 번 로딩한다(웹은 건너뜀 · 실패해도 앱은 뜸)
 *   ④ 모든 글자가 `AppText` 를 쓴다 — 굵기 700 이상은 Bold 파일, 그 전에는 Medium
 *      (react-native 의 Text 를 직접 쓰는 파일이 하나도 없어야 한다)
 *   ⑤ **웹은 그대로** — @font-face(woff2)·아이콘(ionicons) 배선을 건드리지 않았다
 *   ⑥ `app.json` iOS 권한 설명 — 사진·카메라(한국어)
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  FONT_BOLD,
  FONT_FAMILY_WEB,
  FONT_MEDIUM,
  __resetNativeFontsFlag,
  fontFamilyForWeight,
  isBoldWeight,
  isNativeFontsAvailable,
  nativeTextFontStyle,
  setNativeFontsAvailable,
} from '../src/utils/fonts.js';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

let fails = 0;
const check = (label, cond, extra) => {
  if (cond) console.log('OK   ' + label);
  else {
    fails += 1;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

// ── 1. 규칙 (순수 함수) ─────────────────────────────────────
check('규칙: 글꼴 이름 = GmarketSansMedium · GmarketSansBold',
  FONT_MEDIUM === 'GmarketSansMedium' && FONT_BOLD === 'GmarketSansBold', FONT_MEDIUM + ' / ' + FONT_BOLD);
check('규칙: 웹 CSS 이름은 `Gmarket Sans`', FONT_FAMILY_WEB === "'Gmarket Sans'", FONT_FAMILY_WEB);
check('규칙: 700 이상만 Bold', isBoldWeight('700') && isBoldWeight(800) && isBoldWeight('900') &&
  !isBoldWeight('500') && !isBoldWeight(600) && !isBoldWeight(undefined));
check('규칙: 네이티브 500·600 → Medium, 700·800 → Bold',
  fontFamilyForWeight('500', 'ios') === FONT_MEDIUM && fontFamilyForWeight(600, 'android') === FONT_MEDIUM &&
    fontFamilyForWeight('700', 'ios') === FONT_BOLD && fontFamilyForWeight('800', 'android') === FONT_BOLD);
check('규칙: 웹에서는 fontFamily 를 주지 않는다 (CSS 가 맡음)',
  fontFamilyForWeight('700', 'web') === undefined && nativeTextFontStyle('700', 'web') === null);
check('규칙: 네이티브에서는 스타일 객체를 준다',
  JSON.stringify(nativeTextFontStyle('700', 'ios', null)) === '{"fontFamily":"GmarketSansBold"}',
  JSON.stringify(nativeTextFontStyle('700', 'ios', null)));
check('규칙: 로딩 실패(false)면 글꼴을 붙이지 않는다 (시스템 글꼴로)',
  nativeTextFontStyle('700', 'ios', false) === null);

__resetNativeFontsFlag();
check('규칙: 처음엔 `모름`(null) — 빌드에 들어간 글꼴을 바로 쓴다', isNativeFontsAvailable() === null);
setNativeFontsAvailable(true);
check('규칙: 로딩 성공을 기억한다', isNativeFontsAvailable() === true);
setNativeFontsAvailable(false);
check('규칙: 로딩 실패도 기억한다', isNativeFontsAvailable() === false);
__resetNativeFontsFlag();

// ── 2. 글꼴 파일 ────────────────────────────────────────────
for (const [file, family] of [
  ['assets/fonts/GmarketSansMedium.otf', FONT_MEDIUM],
  ['assets/fonts/GmarketSansBold.otf', FONT_BOLD],
]) {
  const abs = path.join(root, file);
  const exists = fs.existsSync(abs);
  const buf = exists ? fs.readFileSync(abs) : Buffer.alloc(0);
  check('파일: ' + file + ' 가 있다', exists, file);
  check('파일: ' + file + ' 은 OTF(OTTO) 이고 1MB 이상', buf.slice(0, 4).toString('ascii') === 'OTTO' && buf.length > 1000000,
    buf.slice(0, 4).toString('ascii') + ' · ' + Math.round(buf.length / 1024) + 'KB');
  check('파일: ' + file + ' 안의 글꼴 이름이 ' + family + ' 와 같다',
    buf.includes(Buffer.from(family, 'ascii')), family);
  check('파일: ' + file + ' 에 글자표(cmap)·윤곽선(CFF) 테이블이 있다',
    ['CFF ', 'cmap', 'name', 'head'].every((tag) => buf.includes(Buffer.from(tag, 'ascii'))));
}

// ── 3. app.json — expo-font 플러그인 · 권한 ──────────────────
const app = readJson('app.json').expo;
const plugins = JSON.stringify(app.plugins || []);
check('app.json: expo-font 플러그인에 두 파일이 들어 있다',
  plugins.indexOf('expo-font') >= 0 && plugins.indexOf('GmarketSansMedium.otf') >= 0 && plugins.indexOf('GmarketSansBold.otf') >= 0,
  plugins);
const plist = (app.ios && app.ios.infoPlist) || {};
check('app.json: NSPhotoLibraryUsageDescription (사진 보관함 · 한국어)',
  String(plist.NSPhotoLibraryUsageDescription || '').indexOf('사진') >= 0);
check('app.json: NSCameraUsageDescription (카메라 · 한국어)',
  String(plist.NSCameraUsageDescription || '').indexOf('카메라') >= 0);
check('app.json: NSPhotoLibraryAddUsageDescription (사진 저장 · 한국어)',
  String(plist.NSPhotoLibraryAddUsageDescription || '').indexOf('사진') >= 0);
check('app.json: 기존 위치 권한 두 개는 그대로',
  String(plist.NSLocationWhenInUseUsageDescription || '').indexOf('위치') >= 0 &&
    String(plist.NSLocationAlwaysAndWhenInUseUsageDescription || '').indexOf('위치') >= 0);
check('app.json: 버전 2.40.0 · 빌드 번호 올림(16) · Android versionCode 18',
  app.version === '2.40.0' && String(app.ios.buildNumber) === '16' && app.android.versionCode === 18,
  app.version + ' / ' + app.ios.buildNumber + ' / ' + app.android.versionCode);

// ── 4. 로더 · AppText ───────────────────────────────────────
const loader = read('src/services/fontLoader.js');
const appText = read('src/components/AppText.js');
const appSrc = read('App.js');
check('로더: 웹은 건너뛴다 (index.html @font-face 가 이미 받음)',
  loader.indexOf("Platform.OS === 'web'") > 0 && loader.indexOf("skipped: 'web'") > 0);
check('로더: expo-font loadAsync 로 두 파일을 한 번만',
  loader.indexOf('Font.loadAsync(FONT_FILES)') > 0 && loader.indexOf('if (loading) return loading;') > 0);
check('로더: 실패해도 앱이 뜬다 (throw 없음 · false 로 기억)',
  loader.indexOf('catch (e)') > 0 && loader.indexOf('setNativeFontsAvailable(false)') > 0);
check('App: 켜질 때 글꼴 로딩을 부른다', appSrc.indexOf('loadAppFonts()') > 0 && appSrc.indexOf('loadAppFonts') > 0);

check('AppText: 웹은 스타일을 그대로 넘긴다 (DOM 변화 0)',
  appText.indexOf("Platform.OS === 'web' ? null") > 0);
check('AppText: 네이티브는 굵기로 글꼴을 고른다', appText.indexOf('nativeTextFontStyle(') > 0);
check('AppText: TextInput 도 같은 규칙', appText.indexOf('AppTextInput') > 0 && appText.indexOf('RNTextInput') > 0);
check('AppText: 아이콘 폰트를 건드리지 않는다 (@expo/vector-icons·ionicons import 없음)',
  !/^import .*@expo\/vector-icons/m.test(appText) && !/^import .*ionicons/m.test(appText) &&
    !/fontFamily:\s*['"]ionicons/i.test(appText));

// ── 5. 모든 글자가 AppText 를 쓴다 ─────────────────────────
const srcFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir + '/' + entry.name;
    if (entry.isDirectory()) walk(rel);
    else if (entry.name.endsWith('.js')) srcFiles.push(rel);
  }
};
walk('src');
srcFiles.push('App.js');
const offenders = [];
const appTextUsers = [];
for (const rel of srcFiles) {
  if (rel === 'src/components/AppText.js') continue;
  const source = read(rel);
  const rnImport = source.match(/import \{([^}]*)\} from 'react-native';/);
  const names = rnImport ? rnImport[1].replace(/\n/g, ' ').split(',').map((n) => n.trim()) : [];
  if (names.includes('Text') || names.includes('TextInput')) offenders.push(rel);
  if (/from '[^']*AppText'/.test(source)) appTextUsers.push(rel);
}
check('글자: react-native 의 Text·TextInput 을 직접 쓰는 파일이 없다', offenders.length === 0, offenders.join(', '));
check('글자: AppText 를 쓰는 파일이 20개 이상 (지도·시트·화면 전부)',
  appTextUsers.length >= 20, appTextUsers.length + '개');
check('글자: 아이콘은 그대로 @expo/vector-icons (Ionicons)',
  read('src/components/AppHeader.js').indexOf('@expo/vector-icons') > 0 &&
    read('src/screens/ProfileScreen.js').indexOf('@expo/vector-icons') > 0);

// ── 6. 웹은 그대로 ─────────────────────────────────────────
const patch = read('scripts/patch-web-html.mjs');
check('웹: @font-face(Gmarket Sans) 주입 그대로',
  patch.indexOf("FONT_FAMILY = \"'Gmarket Sans'\"") > 0 && patch.indexOf('GmarketSans-Medium.woff2') > 0 &&
    patch.indexOf('GmarketSans-Bold.woff2') > 0);
check('웹: woff2 파일 두 개가 public/fonts 에 그대로',
  fs.existsSync(path.join(root, 'public/fonts/GmarketSans-Medium.woff2')) &&
    fs.existsSync(path.join(root, 'public/fonts/GmarketSans-Bold.woff2')));
check('토큰: typography 굵기 → 글꼴 (제목 800 = Bold · 본문 500 = Medium)',
  fontFamilyForWeight('800', 'ios') === FONT_BOLD && fontFamilyForWeight('500', 'ios') === FONT_MEDIUM);

if (fails) {
  console.log('\nFONTS_FAILED (' + fails + ')');
  process.exit(1);
}
console.log('\nFONTS_OK');
