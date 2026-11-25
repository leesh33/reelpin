/**
 * src/utils/saveResult.js — v2.33.4
 * ─────────────────────────────────────────────────────────────
 * 저장 화면(`PasteScreen`)의 **선택한 후보 N곳 → 핀 목록**을 한 곳에서 만듭니다.
 *   세 탭(`릴스·쇼츠로 찾기` · `사진으로 찾기` · `가게명 찾기`)이 같은 결과 카드·같은 저장 버튼을
 *   쓰므로, 저장 페이로드(링크·플랫폼·분류·한줄 메모·✅ 가봤어요)도 한 곳에서 만들어야
 *   탭마다 값이 갈라지지 않습니다.
 *
 * v2.33.4 — ✅ 가봤어요 토글
 *   · `visited: true` 면 **이번에 저장하는 모든 핀**이 `visited: true` + `visitedAt`(저장 시각)로
 *     저장됩니다 (`utils/pins.buildPin` 이 채웁니다).
 *   · 한 묶음은 **같은 시각(now)** 을 쓰되, id 는 순번을 붙여 겹치지 않게 합니다
 *     (예전에는 같은 밀리초에 두 곳을 만들면 id 가 같아질 수 있었습니다).
 */
import { buildPin } from './pins';

/**
 * @param {Array<object>} candidates 선택한 후보들
 * @param {object} options
 *   · category   … 저장할 분류 (화면에서 고른 값 / 자동 분류)
 *   · sourceUrl  … 원본 릴스·쇼츠 링크 (검색·사진 저장은 빈 문자열)
 *   · platform   … 'instagram' | 'youtube' | 'search' | 'photo' …
 *   · memo       … 한줄 메모 (선택)
 *   · visited    … ✅ 가봤어요 체크 여부
 *   · now        … 저장 시각 (검사에서 고정값을 넣기 위한 옵션)
 * @returns {Array<object>} 저장할 핀 목록 (이름이 없어 만들 수 없는 후보는 빠짐)
 */
export function buildResultPins(candidates, options = {}) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (!list.length) return [];
  const now = options.now ? new Date(options.now) : new Date();
  const base = now.getTime();
  const visited = options.visited === true;
  const category = String(options.category || '').trim();
  const pins = [];
  list.forEach((candidate, index) => {
    // v2.44 — 자리표시자 후보(예전 '이름 없는 릴스 장소')는 저장하지 않습니다.
    if (!candidate.name || candidate.placeholder === true || /^이름 없는/.test(String(candidate.name))) return;
    const pin = buildPin(
      { ...candidate, category: category || candidate.category || '맛집' },
      {
        sourceUrl: options.sourceUrl || '',
        platform: options.platform || 'instagram',
        memo: options.memo,
        visited,
        now,
        // 한 번에 여러 곳을 저장해도 id 가 겹치지 않게 순번을 붙입니다.
        id: 'pin-' + base + '-' + index,
      }
    );
    if (pin) pins.push(pin);
  });
  return pins;
}
