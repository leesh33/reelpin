/**
 * src/services/visits.js — 📊 익명 접속자 기록 (어드민 통계용)
 * ─────────────────────────────────────────────────────────────
 * 앱을 열 때 **한 번** Supabase RPC `app_visit_track('reelpin', visitor_id)` 를 부릅니다.
 * (DB: supabase/app_visits.sql · 릴스핀과 인생 한 턴이 같은 프로젝트를 씁니다)
 *
 *  · visitor_id — 이 기기에서 처음 만든 **임의의 UUID**. 이메일·위치·기기 정보는 보내지 않습니다.
 *    웹은 localStorage(`reelpin.visitor.id`), 앱은 AsyncStorage 에 같은 키로 남아
 *    앱을 다시 열어도 같은 사람으로 세어집니다(하루 한 사람 = 한 줄, 조회수만 증가).
 *  · 세션(앱 실행) 안에서 두 번 부르지 않습니다 — 화면이 다시 그려져도 한 번만.
 *  · 설정이 없거나(로컬 전용) 네트워크가 막히면 **조용히** 넘어갑니다. 앱 사용에는 영향이 없습니다.
 *  · service_role 키는 쓰지 않습니다(공개 anon 키 + RPC).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient, isSupabaseConfigured, loadSupabaseConfig } from './supabase';

/** 이 기기의 방문자 id 를 담아 두는 키 (웹에서는 localStorage 로 저장됩니다) */
export const VISITOR_STORAGE_KEY = 'reelpin.visitor.id';
/** 두 앱이 함께 쓰는 통계에서 릴스핀을 가리키는 값 */
export const VISIT_APP_ID = 'reelpin';
/** DB check 제약과 같은 모양 — 8~64자 영문·숫자·-·_ */
export const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** 이번 앱 실행에서 이미 기록했는가? */
let trackedThisSession = false;

/** UUID v4 모양의 임의 id (crypto 가 없으면 Math.random 으로 만듭니다) */
export function createVisitorId(random) {
  const rnd = typeof random === 'function' ? random : Math.random;
  const hex = (n) => {
    let out = '';
    for (let i = 0; i < n; i++) out += Math.floor(rnd() * 16).toString(16);
    return out;
  };
  // 8-4-4-4-12 (36자) — DB 의 8~64자 규칙을 넉넉히 만족합니다.
  return hex(8) + '-' + hex(4) + '-4' + hex(3) + '-' + '89ab'[Math.floor(rnd() * 4)] + hex(3) + '-' + hex(12);
}

/** DB check 제약과 같은 규칙으로 검사합니다. */
export function isValidVisitorId(value) {
  return VISITOR_ID_PATTERN.test(String(value == null ? '' : value).trim());
}

/**
 * 이 기기의 방문자 id — 없으면 만들어 저장합니다.
 * 저장이 안 되는 환경(프라이버시 모드·용량 초과)에서는 이번 실행에만 쓰는 id 를 돌려줍니다.
 */
export async function getVisitorId(options = {}) {
  const storage = options.storage || AsyncStorage;
  try {
    const saved = await storage.getItem(VISITOR_STORAGE_KEY);
    if (isValidVisitorId(saved)) return String(saved).trim();
  } catch (e) {
    // 읽기 실패 → 새로 만듭니다.
  }
  const fresh = createVisitorId(options.random);
  try {
    await storage.setItem(VISITOR_STORAGE_KEY, fresh);
  } catch (e) {
    // 저장 실패 → 이번 실행에서만 쓰는 id (다음에 새 id 가 되지만 통계에는 문제 없음)
  }
  return fresh;
}

/** 테스트·재시도용 — "이번 세션에 이미 기록함" 표시를 지웁니다. */
export function resetVisitTracking() {
  trackedThisSession = false;
}

/**
 * 앱을 열 때 한 번 호출하세요. (App.js 의 ready 이후 effect)
 * @returns {Promise<{ok:boolean, reason?:string, views?:number}>} — 실패해도 앱은 그대로 동작합니다.
 */
export async function trackVisit(options = {}) {
  if (trackedThisSession && !options.force) return { ok: false, reason: 'already-tracked' };
  trackedThisSession = true;
  try {
    if (!options.client) {
      // 웹은 `/api/auth-config` 에서 설정을 늦게 받아옵니다 — 먼저 기다립니다.
      await loadSupabaseConfig();
    }
    const configured = options.client ? true : isSupabaseConfigured();
    if (!configured) {
      // 설정이 아직 없으면 다음 기회에 다시 시도할 수 있게 표시를 풉니다.
      trackedThisSession = false;
      return { ok: false, reason: 'not-configured' };
    }
    const client = options.client || getSupabaseClient();
    if (!client || typeof client.rpc !== 'function') {
      trackedThisSession = false;
      return { ok: false, reason: 'no-client' };
    }
    const visitorId = options.visitorId || (await getVisitorId(options));
    if (!isValidVisitorId(visitorId)) return { ok: false, reason: 'invalid-visitor' };

    const res = await client.rpc('app_visit_track', {
      p_app_id: VISIT_APP_ID,
      p_visitor_id: String(visitorId).trim(),
    });
    if (res && res.error) return { ok: false, reason: 'rpc', message: res.error.message || '' };
    const data = (res && res.data) || {};
    return { ok: true, views: typeof data.views === 'number' ? data.views : undefined };
  } catch (e) {
    return { ok: false, reason: 'network' };
  }
}

export const __test = { createVisitorId, isValidVisitorId, getVisitorId, trackVisit, resetVisitTracking, VISITOR_STORAGE_KEY };
