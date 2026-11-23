/**
 * src/utils/safeArea.js — 📱 아래 안전 영역(홈 인디케이터)만큼 떠 있는 UI 를 올리는 값 (v2.42 · 빌드 20)
 * ─────────────────────────────────────────────────────────────
 * 상훈 님 지적(빌드 19 스크린샷 IMG_9332): "맨 아래에 흰 띠가 남아 있다".
 *
 *   원인: 앱 루트가 `SafeAreaView` 라 **아래 34px 를 잘라 낸 채** 그렸습니다.
 *         지도는 그 위까지만 그려지고, 잘린 자리는 `colors.bg`(연회색)가 남았습니다.
 *
 *   고침: 루트를 화면 끝까지 채우고(노치 쪽만 비움), 바닥에 붙어 있던 UI
 *         (플로팅 탭바 · 지도 `내 위치`/`+ −`/도구 버튼 · 토스트 · 시트·목록의 끝 여백)는
 *         `useBottomLift()` 값만큼 **스스로** 위로 올라갑니다.
 *         → 예전과 같은 높이에 놓이면서, 지도만 화면 맨 아래까지 이어집니다.
 *
 *   · 값이 0 이면(안전 영역이 없는 기기·웹 브라우저) 스타일이 그대로라 아무것도 달라지지 않습니다.
 *   · 테스트(node)는 `react-native-safe-area-context` 스텁이 0 을 돌려줍니다.
 */
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useBottomLift() {
  const insets = useSafeAreaInsets();
  const bottom = insets && typeof insets.bottom === 'number' ? insets.bottom : 0;
  return bottom > 0 ? bottom : 0;
}

export default useBottomLift;
