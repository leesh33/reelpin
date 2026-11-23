// 테스트(node)용 react-native 최소 스텁.
// src/utils/links.js 가 Platform/Linking 을 쓰기 때문에, node 에서 번들할 때 이 파일로 치환합니다.
//
// v2.41 — expo 모듈(expo-location·expo-image-picker·expo-modules-core)이 네이티브 브리지를
//   찾을 때 쓰는 export 들을 최소한으로 채워 둡니다. 실제 동작은 테스트에서 쓰지 않고,
//   번들 단계에서 "없는 export" 로 실패하지 않게 하는 것이 목적입니다.
export const Platform = { OS: 'ios', select: (obj) => obj.ios };
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
