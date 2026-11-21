/**
 * InAppPlaceModal.web.js — v1.8
 * ─────────────────────────────────────────────────────────────
 * [매장 정보 보기] 를 누르면 브라우저 밖으로 나가지 않고 앱 안에서
 * 네이버 모바일 플레이스(m.place.naver.com)를 iframe 으로 띄웁니다.
 *
 * · 헤더: 다크 차콜(#1C1C1E) 바탕에 가게 이름(흰색 · 동네 연회색)
 *   + [새 창으로 열기](반투명 필) + [닫기](원형 필 · 흰 ✕)
 *   → 바로 아래 네이버 플레이스의 흰 상단바와 한 줄로 붙어 보이지 않게 구분합니다.
 * · 본문: <iframe src={naverPlaceSearchUrl(pin)} />
 * · 안전장치: iframe 이 6초 안에 로드되지 않거나, 같은 출처(about:blank)로
 *   남아 본문이 비어 있으면(= 브라우저가 차단) 즉시 안내 배너 + [네이버 지도로 열기]
 *   원탭 폴백을 보여 줍니다. iframe 은 지우지 않아 사용자가 직접 확인할 수 있습니다.
 *
 * SSR(node renderToString) 안전: window/document 는 useEffect 안에서만 만집니다.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, typography } from '../theme';
import { naverMapWebUrl, naverPlaceSearchUrl } from '../utils/links';

/** iframe 이 이 시간(ms) 안에 onLoad 를 못 주면 차단으로 간주합니다. */
export const IFRAME_LOAD_TIMEOUT_MS = 6000;

/** 로드 직후 이 시간이 지나도 빈 about:blank 면 차단으로 봅니다(첫 about:blank 오작동 방지). */
export const BLANK_SETTLE_MS = 2000;

/** 차단 배너 문구 — 테스트에서 그대로 확인합니다. */
export const BLOCKED_NOTICE = '네이버 플레이스가 이 화면 안에서 열리지 않아요';
export const BLOCKED_HINT = '아래 [네이버 지도로 열기]를 누르면 새 화면에서 바로 확인할 수 있어요';

/**
 * iframe 문서가 '차단된 빈 화면'인지 판정합니다.
 * · doc 이 null → 다른 출처 페이지가 실제로 열린 것(정상)
 * · about:blank + 본문이 비어 있음 → 브라우저가 X-Frame-Options 등으로 거부
 *   단, iframe 이 처음 붙을 때 한 번 오는 about:blank 로드 이벤트와 헷갈리지 않도록
 *   BLANK_SETTLE_MS 가 지난 뒤(또는 force)에만 차단으로 인정합니다.
 */
export function looksLikeBlockedFrame(doc, elapsedMs, force) {
  if (!doc) return false;
  let href = '';
  try {
    href = doc.location ? doc.location.href : '';
  } catch (e) {
    return false;
  }
  const empty = !doc.body || doc.body.childElementCount === 0;
  if (!empty) return false;
  if (href !== 'about:blank' && href !== '') return false;
  return !!force || elapsedMs >= BLANK_SETTLE_MS;
}

export function placeModalTitle(pin) {
  if (!pin) return '';
  return [pin.name, pin.area].filter(Boolean).join(' · ');
}

/**
 * 웹 전용 진짜 링크. Pressable + window.open 은 팝업 차단에 걸릴 수 있어,
 * 외부로 나가는 버튼은 <a target="_blank"> 로 그립니다(새 탭·가운데 클릭 모두 동작).
 */
function ExternalLink({ href, label, style, children }) {
  return React.createElement(
    'a',
    {
      href,
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-label': label,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        textDecoration: 'none',
        ...(style || {}),
      },
    },
    children
  );
}

export default function InAppPlaceModal({ pin, onClose }) {
  const url = pin ? naverPlaceSearchUrl(pin) : '';
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  /**
   * 모달은 document.body 로 포털해 탭바·지도 위에 확실히 올립니다.
   * (SSR 에서는 document 가 없어 그대로 inline 렌더 → renderToString 안전)
   */
  const [portalReady] = useState(
    () => typeof document !== 'undefined' && !!(document && document.body)
  );
  const loadedRef = useRef(false);
  const mountedAt = useRef(0);
  const frameRef = useRef(null);
  const verifyTimer = useRef(null);

  /**
   * iframe 이 실제로 네이버 페이지를 그렸는지 확인합니다.
   * · contentDocument 가 null 이면 다른 출처 페이지가 정상 로드된 것
   * · about:blank 에 본문이 없으면 브라우저가 거부한 것(단, 처음 오는 about:blank 이벤트는 무시)
   */
  const verifyFrame = useCallback((force) => {
    let doc = null;
    try {
      doc = frameRef.current ? frameRef.current.contentDocument : null;
    } catch (err) {
      doc = null;
    }
    setBlocked(looksLikeBlockedFrame(doc, Date.now() - mountedAt.current, force));
  }, []);

  // 주소가 바뀌면 로드 상태를 초기화합니다.
  useEffect(() => {
    loadedRef.current = false;
    mountedAt.current = Date.now();
    setLoaded(false);
    setBlocked(false);
  }, [url]);

  // 로드가 안 되면 시간 초과로 차단 안내를 띄웁니다. (SSR 에서는 돌지 않음)
  useEffect(() => {
    if (!pin) return undefined;
    const timer = setTimeout(() => {
      if (!loadedRef.current) {
        setBlocked(true);
        return;
      }
      verifyFrame(true);
    }, IFRAME_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pin, url, verifyFrame]);

  // 모달을 닫으면 예약된 확인 작업을 정리합니다.
  useEffect(
    () => () => {
      if (verifyTimer.current) clearTimeout(verifyTimer.current);
    },
    []
  );

  // ESC 로 닫기 (웹 전용)
  useEffect(() => {
    if (!pin) return undefined;
    if (typeof window === 'undefined' || !window.addEventListener) return undefined;
    const onKeyDown = (event) => {
      if (event && (event.key === 'Escape' || event.key === 'Esc')) {
        if (typeof onClose === 'function') onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pin, onClose]);

  /**
   * iframe onLoad — 로드가 끝나면 짧게 기다렸다가 실제로 그려졌는지 확인합니다.
   * (iframe 이 처음 붙을 때 오는 빈 about:blank 이벤트로 오판하지 않기 위해)
   */
  const handleFrameLoad = useCallback(() => {
    loadedRef.current = true;
    setLoaded(true);
    if (verifyTimer.current) clearTimeout(verifyTimer.current);
    verifyTimer.current = setTimeout(() => verifyFrame(false), 1200);
  }, [verifyFrame]);

  if (!pin) return null;

  const placeUrl = url;
  const mapUrl = naverMapWebUrl(pin);

  const modal = (
    <View style={styles.overlay}>
      <Pressable
        style={styles.backdropFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="모달 닫기"
      />
      <View style={styles.panel}>
        {/* ── 헤더: 가게 이름 + 새 창으로 열기 + 닫기 ── */}
        <View style={styles.header}>
          {/* 다크 차콜 헤더 — 아래 네이버 플레이스(흰 배경)와 한 줄로 붙어 보이지 않게 합니다. */}
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {pin.name}
            </Text>
          </View>
          <ExternalLink href={placeUrl} label="새 창으로 열기" style={styles.externalBtn}>
            <Ionicons name="open-outline" size={13} color={colors.white} />
            <Text style={styles.externalText}>새 창으로 열기</Text>
          </ExternalLink>
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="닫기"
          >
            <Ionicons name="close" size={17} color={colors.white} />
          </Pressable>
        </View>

        {/* ── 차단 안내 + 원탭 폴백 ── */}
        {blocked && (
          <View style={styles.blockBanner}>
            <Ionicons name="alert-circle" size={15} color={colors.brandDark} />
            <View style={styles.blockTextWrap}>
              <Text style={styles.blockTitle}>{BLOCKED_NOTICE}</Text>
              <Text style={styles.blockHint}>{BLOCKED_HINT}</Text>
            </View>
            <ExternalLink href={mapUrl} label="네이버 지도로 열기" style={styles.blockBtn}>
              <Text style={styles.blockBtnText}>네이버 지도로 열기</Text>
            </ExternalLink>
          </View>
        )}

        {/* ── 본문: 네이버 모바일 플레이스 iframe ── */}
        <View style={styles.body}>
          {!loaded && !blocked && (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.loadingText}>네이버 플레이스 불러오는 중…</Text>
            </View>
          )}
          {React.createElement('iframe', {
            ref: frameRef,
            key: url,
            src: url,
            title: placeModalTitle(pin) + ' 네이버 플레이스',
            onLoad: handleFrameLoad,
            referrerPolicy: 'no-referrer-when-downgrade',
            allow: 'clipboard-write; geolocation',
            style: {
              border: 0,
              width: '100%',
              height: '100%',
              display: 'block',
              backgroundColor: colors.white,
            },
          })}
        </View>

        {/* ── 항상 보이는 폴백 줄 (즉시 안내) ── */}
        <View style={styles.footer}>
          <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
          <Text style={styles.footerText} numberOfLines={1}>
            화면이 비어 있으면
          </Text>
          <ExternalLink href={mapUrl} label="네이버 지도로 열기" style={styles.footerBtn}>
            <Text style={styles.footerBtnText}>네이버 지도로 열기</Text>
            <Ionicons name="chevron-forward" size={11} color={colors.brandDark} />
          </ExternalLink>
        </View>
      </View>
    </View>
  );

  if (portalReady && typeof document !== 'undefined' && document.body) {
    return createPortal(modal, document.body);
  }
  return modal;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  panel: {
    width: '100%',
    height: '100%',
    maxWidth: 560,
    maxHeight: '100%',
    backgroundColor: colors.card,
    overflow: 'hidden',
    flexDirection: 'column',
    zIndex: 1,
  },
  backdropFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: colors.charcoal,
    borderBottomWidth: 1,
    borderBottomColor: colors.charcoalLine,
  },
  titleWrap: { flex: 1, minWidth: 0 },
  title: {
    ...typography.h3,
    fontSize: 15,
    color: colors.white,
  },
  externalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.charcoalPill,
  },
  externalText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.charcoalPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.brandSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandSoft2,
  },
  blockTextWrap: { flex: 1, minWidth: 0 },
  blockTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.brandDark,
  },
  blockHint: {
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.brandDark,
    opacity: 0.8,
    marginTop: 1,
  },
  blockBtn: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
  },
  body: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    backgroundColor: colors.white,
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.white,
    zIndex: 2,
    pointerEvents: 'none',
  },
  loadingText: {
    ...typography.tiny,
    fontSize: 11,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  footerText: {
    ...typography.tiny,
    fontSize: 10.5,
    color: colors.textMuted,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.brandSoft,
  },
  footerBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.brandDark,
  },
});
