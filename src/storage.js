import AsyncStorage from '@react-native-async-storage/async-storage';
import { SEED_PINS } from './data/seedPins';

const PINS_KEY = 'reelpin.pins.v1';
const RADIUS_KEY = 'reelpin.radius.v1';
const PRO_KEY = 'reelpin.pro.v1';
// v2.2 — 사용자가 만든 커스텀 분류 이름 목록 (기본 3개는 여기에 저장하지 않습니다)
const CATEGORIES_KEY = 'reelpin.categories.v1';

/** 저장된 핀 목록을 읽습니다. 처음 실행이면 샘플 4개로 시작합니다. */
export async function loadPins() {
  try {
    const raw = await AsyncStorage.getItem(PINS_KEY);
    if (raw == null) {
      await AsyncStorage.setItem(PINS_KEY, JSON.stringify(SEED_PINS));
      return SEED_PINS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED_PINS;
  } catch (e) {
    return SEED_PINS;
  }
}

export async function savePins(pins) {
  try {
    await AsyncStorage.setItem(PINS_KEY, JSON.stringify(pins));
  } catch (e) {
    // 저장 실패는 조용히 무시하고 메모리 상태를 유지합니다.
  }
}

export async function resetPins() {
  await savePins(SEED_PINS);
  return SEED_PINS;
}

/** 지오펜스 알림 반경(300 / 500 / 1000 m) */
export async function loadRadius() {
  try {
    const raw = await AsyncStorage.getItem(RADIUS_KEY);
    const value = Number(raw);
    return [300, 500, 1000].includes(value) ? value : 300;
  } catch (e) {
    return 300;
  }
}

export async function saveRadius(radius) {
  try {
    await AsyncStorage.setItem(RADIUS_KEY, String(radius));
  } catch (e) {}
}

export async function loadPro() {
  try {
    return (await AsyncStorage.getItem(PRO_KEY)) === 'true';
  } catch (e) {
    return false;
  }
}

export async function savePro(isPro) {
  try {
    await AsyncStorage.setItem(PRO_KEY, isPro ? 'true' : 'false');
  } catch (e) {}
}

/**
 * v2.2 — 커스텀 분류 목록. 웹은 localStorage, 앱은 AsyncStorage 에 같은 코드로 저장됩니다.
 * 읽기 실패·값이 깨졌을 때는 빈 목록(기본 3개만)으로 조용히 돌아갑니다.
 */
export async function loadCategories() {
  try {
    const raw = await AsyncStorage.getItem(CATEGORIES_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((name) => typeof name === 'string' && name.trim());
  } catch (e) {
    return [];
  }
}

export async function saveCategories(categories) {
  try {
    const list = (Array.isArray(categories) ? categories : []).filter(
      (name) => typeof name === 'string' && name.trim()
    );
    await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(list));
  } catch (e) {
    // 저장 실패는 조용히 무시하고 화면 상태를 유지합니다.
  }
}

/** v2.10 — 저장 개수 한도 없음 (예전 화면·테스트 호환용 이름) */
export function pinLimit() {
  return Infinity;
}
