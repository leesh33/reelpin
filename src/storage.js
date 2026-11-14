import AsyncStorage from '@react-native-async-storage/async-storage';
import { FREE_PIN_LIMIT, SEED_PINS } from './data/seedPins';

const PINS_KEY = 'reelpin.pins.v1';
const RADIUS_KEY = 'reelpin.radius.v1';
const PRO_KEY = 'reelpin.pro.v1';

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

export function pinLimit(isPro) {
  return isPro ? Infinity : FREE_PIN_LIMIT;
}
