/**
 * src/services/curation.js — v2.31 🗂️ 기획전 · 공유 컬렉션 DB 접속
 * ─────────────────────────────────────────────────────────────
 * 앱(컬렉션 탭)이 부르는 **공개 함수 4개**만 이 파일에 있습니다.
 *
 *   reelpin_public_banners()        … 켜 둔 배너
 *   reelpin_public_curated()        … 켜 둔 기획전
 *   reelpin_share_collection(...)   … 내 컬렉션을 링크로 공유 (스냅샷 저장)
 *   reelpin_shared_collection(id)   … 공유 링크로 받은 컬렉션 읽기
 *
 * 보안
 *   · 앱은 **anon(publishable) 키 + RLS/security definer 함수** 로만 동작합니다.
 *     `service_role` 키는 쓰지 않습니다.
 *   · 공유 스냅샷에는 **이름·분류·동네·주소·좌표**만 담습니다 — 메모·전화번호는 보내지 않습니다.
 *   · 공유받은 컬렉션의 작성자 이메일·id 는 응답에 담기지 않습니다.
 *
 * 준비물: `supabase/curation.sql` 을 Supabase SQL Editor 에서 한 번 실행해 두면 됩니다.
 */
import { isSupabaseConfigured, loadSupabaseConfig, supabase } from './supabase';
import {
  buildCollectionShareUrl,
  normalizeBanners,
  normalizeCuratedList,
  normalizeCurated,
  normalizePlaces,
  placesFromPins,
  SHARE_MAX_PLACES,
} from '../utils/curation';

export const CURATION_RPC = {
  banners: 'reelpin_public_banners',
  curated: 'reelpin_public_curated',
  share: 'reelpin_share_collection',
  shared: 'reelpin_shared_collection',
};

const NETWORK_MESSAGE = '네트워크가 불안정해요. 잠시 뒤 다시 시도해 주세요.';
const NOT_READY_MESSAGE = '기획전·공유 기능이 아직 켜지지 않았어요. 잠시 뒤 다시 시도해 주세요.';
const SCHEMA_MISSING_MESSAGE = '기획전·공유 DB 가 아직 준비되지 않았어요 (supabase/curation.sql).';

/**
 * 클라이언트를 고릅니다. 웹은 Supabase 설정(`/api/auth-config`)을 늦게 받아오므로
 * 호출부에서 `await loadSupabaseConfig()` 를 먼저 기다린 뒤 이 함수를 부릅니다.
 */
function resolveClient(client) {
  if (client) return client;
  if (!isSupabaseConfigured()) return null;
  try {
    return supabase();
  } catch (e) {
    return null;
  }
}

/** Supabase 오류 → 사람이 읽는 한국어 (키·본문은 담지 않음) */
export function friendlyCurationError(error) {
  const code = String((error && (error.code || error.error)) || '');
  const message = String((error && (error.message || error.details)) || '');
  if (code === 'PGRST202' || /could not find the function|does not exist|schema cache/i.test(message)) {
    return SCHEMA_MISSING_MESSAGE;
  }
  if (code === '42501' || /permission denied|row-level security/i.test(message)) {
    return '권한이 없어 처리하지 못했어요.';
  }
  if (code === '22023' || /required|invalid|check constraint/i.test(message)) {
    return '내용을 다시 확인해 주세요.';
  }
  if (code === 'P0002' || /not found/i.test(message)) {
    return '찾을 수 없어요. 링크가 만료됐을 수 있어요.';
  }
  return NETWORK_MESSAGE;
}

/** 켜 둔 배너 목록 — 실패해도 화면은 조용히 배너 없이 그립니다 */
export async function fetchPublicBanners(options = {}) {
  if (!options.client) await loadSupabaseConfig();
  const client = resolveClient(options.client);
  if (!client) return { ok: false, items: [], message: NOT_READY_MESSAGE };
  try {
    const { data, error } = await client.rpc(CURATION_RPC.banners);
    if (error) return { ok: false, items: [], message: friendlyCurationError(error), error };
    const items = normalizeBanners(Array.isArray(data) ? data : []);
    return { ok: true, items, message: '' };
  } catch (e) {
    return { ok: false, items: [], message: NETWORK_MESSAGE, error: e };
  }
}

/** 켜 둔 기획전 목록 */
export async function fetchPublicCurated(options = {}) {
  if (!options.client) await loadSupabaseConfig();
  const client = resolveClient(options.client);
  if (!client) return { ok: false, items: [], message: NOT_READY_MESSAGE };
  try {
    const { data, error } = await client.rpc(CURATION_RPC.curated, { p_id: null });
    if (error) return { ok: false, items: [], message: friendlyCurationError(error), error };
    const items = normalizeCuratedList(Array.isArray(data) ? data : []);
    return { ok: true, items, message: '' };
  } catch (e) {
    return { ok: false, items: [], message: NETWORK_MESSAGE, error: e };
  }
}

/**
 * 내 컬렉션 공유 — 스냅샷을 저장하고 링크를 돌려줍니다.
 *   · 컬렉션 카드(pinIds)와 핀 목록을 받아 **필요한 필드만** 보냅니다.
 *   · 성공하면 `{ ok:true, shareId, url, placeCount }`
 */
export async function shareCollectionSnapshot(collection, pins, options = {}) {
  const places = normalizePlaces(placesFromPins(pins, SHARE_MAX_PLACES));
  if (!places.length) {
    return { ok: false, message: '이 컬렉션에 담긴 핀이 없어요 · 먼저 핀을 담아 주세요' };
  }
  if (!options.client) await loadSupabaseConfig();
  const client = resolveClient(options.client);
  if (!client) return { ok: false, message: NOT_READY_MESSAGE };

  const title = String((collection && (collection.title || collection.name)) || '').trim();
  if (!title) return { ok: false, message: '컬렉션 이름이 없어 공유하지 못했어요' };

  try {
    const { data, error } = await client.rpc(CURATION_RPC.share, {
      p_title: title,
      p_description: String((collection && (collection.description || collection.desc)) || ''),
      p_emoji: String((collection && collection.emoji) || '📂'),
      p_color: String((collection && collection.color) || '#0D9488'),
      p_places: places,
    });
    if (error) return { ok: false, message: friendlyCurationError(error), error };
    const shareId = String((data && (data.shareId || data.share_id)) || '');
    if (!shareId) return { ok: false, message: '공유 링크를 만들지 못했어요. 다시 시도해 주세요.' };
    return {
      ok: true,
      shareId,
      url: buildCollectionShareUrl(shareId, options.origin),
      placeCount: places.length,
    };
  } catch (e) {
    return { ok: false, message: NETWORK_MESSAGE, error: e };
  }
}

/** 공유 링크(?col=)로 받은 컬렉션 하나 — 없거나 지워졌으면 ok:false */
export async function fetchSharedCollection(shareId, options = {}) {
  const id = String(shareId == null ? '' : shareId).trim();
  if (!id) return { ok: false, item: null, message: '공유 링크가 비어 있어요.' };
  if (!options.client) await loadSupabaseConfig();
  const client = resolveClient(options.client);
  if (!client) return { ok: false, item: null, message: NOT_READY_MESSAGE };
  try {
    const { data, error } = await client.rpc(CURATION_RPC.shared, { p_id: id });
    if (error) return { ok: false, item: null, message: friendlyCurationError(error), error };
    if (!data || data.ok === false) {
      return { ok: false, item: null, message: '공유된 컬렉션을 찾지 못했어요 · 링크가 만료됐을 수 있어요' };
    }
    const raw = data.item || data;
    const item = normalizeCurated({
      id: raw.shareId || raw.id,
      title: raw.title,
      description: raw.description,
      emoji: raw.emoji,
      color: raw.color,
      places: raw.places,
      createdAt: raw.createdAt,
    });
    if (!item) return { ok: false, item: null, message: '공유된 컬렉션을 읽지 못했어요.' };
    return {
      ok: true,
      item: { ...item, shareId: String(raw.shareId || raw.id || id), viewCount: Number(raw.viewCount) || 0 },
      message: '',
    };
  } catch (e) {
    return { ok: false, item: null, message: NETWORK_MESSAGE, error: e };
  }
}

/** 공유받은 컬렉션 → 담기용 기획전 모양 (화면이 같은 미리보기를 씁니다) */
export function sharedAsCurated(shared) {
  return normalizeCurated({
    id: shared && shared.shareId ? 'shared-' + shared.shareId : 'shared',
    title: shared && shared.title,
    description: shared && shared.description,
    emoji: shared && shared.emoji,
    color: shared && shared.color,
    places: shared && shared.places,
  });
}
