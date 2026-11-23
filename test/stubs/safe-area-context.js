// 테스트(node)용 react-native-safe-area-context 스텁.
//   진짜 패키지는 `react-native/Libraries/...` 깊은 경로를 import 해서 node/esbuild 번들에서
//   해석되지 않습니다. 화면 구조만 확인하면 되므로 안전 영역 값을 0 으로 돌려줍니다.
import React from 'react';

const ZERO_INSETS = { top: 0, left: 0, right: 0, bottom: 0 };
const ZERO_FRAME = { x: 0, y: 0, width: 0, height: 0 };

export const initialWindowMetrics = null;

export const SafeAreaInsetsContext = React.createContext(ZERO_INSETS);
export const SafeAreaFrameContext = React.createContext(ZERO_FRAME);

export function SafeAreaProvider({ children }) {
  return React.createElement(React.Fragment, null, children);
}

export function SafeAreaView({ children, ...rest }) {
  return React.createElement('div', rest, children);
}

export function SafeAreaConsumer({ children }) {
  return children(ZERO_INSETS);
}

export function useSafeAreaInsets() {
  return ZERO_INSETS;
}

export function useSafeAreaFrame() {
  return ZERO_FRAME;
}

export function withSafeAreaInsets(Component) {
  return Component;
}

export default {
  SafeAreaProvider,
  SafeAreaView,
  SafeAreaConsumer,
  useSafeAreaInsets,
  useSafeAreaFrame,
  initialWindowMetrics,
};
