// 테스트(node)용 react-native 스텁 — **웹(브라우저) 빌드** 를 흉내 냅니다.
// Vercel 웹 배포에서 프록시(/api/*) 경로를 타는지 확인할 때 씁니다.
export const Platform = { OS: 'web', select: (obj) => obj.web };
export const Linking = {
  async openURL() {},
  async canOpenURL() {
    return false;
  },
};
