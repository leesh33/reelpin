// 테스트(node)용 react-native 스텁 — **웹(브라우저) 빌드** 를 흉내 냅니다.
// Vercel 웹 배포에서 프록시(/api/*) 경로를 타는지 확인할 때 씁니다.
//
// v2.41 — expo 모듈이 네이티브 브리지를 찾을 때 쓰는 export 들을 최소한으로 채워 둡니다.
//   (번들 단계에서 "없는 export" 로 실패하지 않게 하는 것이 목적)
export const Platform = { OS: 'web', select: (obj) => obj.web };
export const Linking = {
  async openURL() {},
  async canOpenURL() {
    return false;
  },
};

export const NativeModules = {};

class TestNativeEventEmitter {
  constructor() {}
  addListener() {
    return { remove() {} };
  }
  removeAllListeners() {}
  removeListeners() {}
  emit() {}
}

export const NativeEventEmitter = TestNativeEventEmitter;

export const DeviceEventEmitter = {
  addListener() {
    return { remove() {} };
  },
  removeListener() {},
  removeAllListeners() {},
  emit() {},
};

export const AppState = {
  currentState: 'active',
  addEventListener() {
    return { remove() {} };
  },
  removeEventListener() {},
};

export const processColor = (value) => value;
