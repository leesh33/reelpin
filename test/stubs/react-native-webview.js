// 테스트(node)용 react-native-webview 스텁.
//   node 테스트에는 실제 네이티브 WebView 가 없고, 진짜 패키지는 react-native 내부 깊은 경로를
//   import 해서 esbuild 가 RN 원본(Flow)을 읽다 실패합니다. 화면 구조만 확인하면 되므로
//   ref(injectJavaScript)·props 를 받아 주는 최소 컴포넌트로 바꿔 둡니다.
import React from 'react';

export class WebView extends React.Component {
  injectJavaScript() {}

  reload() {}

  render() {
    return React.createElement('div', { 'data-testid': this.props.testID || 'webview' });
  }
}

export default WebView;
