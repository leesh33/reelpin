// 테스트(node)용 react-native 최소 스텁.
// src/utils/links.js 가 Platform/Linking 을 쓰기 때문에, node 에서 번들할 때 이 파일로 치환합니다.
export const Platform = { OS: 'ios', select: (obj) => obj.ios };
export const Linking = {
  async openURL() {},
  async canOpenURL() {
    return false;
  },
};
