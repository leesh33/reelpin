// test/node용 expo-font 스텁 — 글꼴 로딩은 네이티브에서만 일어나므로 node 에서는 성공만 돌려줍니다.
export async function loadAsync() {
  return true;
}
export async function isLoaded() {
  return true;
}
export const Font = { loadAsync, isLoaded };
export default { loadAsync, isLoaded };
