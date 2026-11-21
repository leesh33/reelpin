/**
 * src/components/AppText.js — 🔤 앱의 기본 Text (v2.40.0)
 * ─────────────────────────────────────────────────────────────
 * 상훈 님이 고른 **Gmarket Sans** 를 iOS·Android 네이티브에서도 모든 글자에 적용합니다.
 *
 *   · **웹은 지금과 완전히 같습니다** — 스타일을 하나도 더하지 않고 `Text` 그대로 그립니다.
 *     (웹 글꼴은 `index.html` 의 @font-face 가 맡고 있어서 DOM 이 바뀌면 오히려 어긋납니다)
 *   · **네이티브는 굵기에 따라 파일을 고릅니다** — RN 은 `fontWeight` 로 글꼴 파일을 고르지
 *     못하므로, 이 컴포넌트가 스타일의 `fontWeight`(700 이상이면 Bold)를 읽어
 *     `fontFamily: 'GmarketSansMedium' | 'GmarketSansBold'` 를 덧붙입니다.
 *     규칙은 `src/utils/fonts.js` 한 곳에 있습니다.
 *   · `Ionicons` 같은 **아이콘은 이 컴포넌트를 쓰지 않습니다** (`@expo/vector-icons` 가
 *     자기 글꼴을 직접 지정) — 아이콘이 네모(□)로 깨질 일이 없습니다.
 *
 * 쓰는 방법: 각 파일에서 `import { Text } from 'react-native'` 대신
 *   `import { AppText as Text } from './AppText'`
 * (그래서 기존 화면 코드는 `<Text style={...}>` 를 그대로 씁니다)
 */
import React, { forwardRef } from 'react';
import { Platform, StyleSheet, Text as RNText, TextInput as RNTextInput } from 'react-native';
import { nativeTextFontStyle } from '../utils/fonts';

export const AppText = forwardRef(function AppText({ style, ...rest }, ref) {
  // 웹에서는 스타일을 그대로 넘깁니다 (flatten 조차 하지 않음)
  const fontStyle = Platform.OS === 'web' ? null : nativeTextFontStyle(
    (StyleSheet.flatten(style) || {}).fontWeight,
    Platform.OS
  );
  return <RNText ref={ref} {...rest} style={fontStyle ? [style, fontStyle] : style} />;
});

AppText.displayName = 'AppText';

/**
 * 입력칸(`TextInput`)도 같은 글꼴로 — 로그인·검색·메모 입력의 글자가
 * 옆의 본문 글꼴과 어긋나지 않게 합니다. 규칙은 `Text` 와 똑같습니다.
 */
export const AppTextInput = forwardRef(function AppTextInput({ style, ...rest }, ref) {
  const fontStyle = Platform.OS === 'web' ? null : nativeTextFontStyle(
    (StyleSheet.flatten(style) || {}).fontWeight,
    Platform.OS
  );
  return <RNTextInput ref={ref} {...rest} style={fontStyle ? [style, fontStyle] : style} />;
});

AppTextInput.displayName = 'AppTextInput';

export default AppText;
