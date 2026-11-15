/**
 * InAppPlaceModal.web.js — v1.7
 * ─────────────────────────────────────────────────────────────
 * [매장 정보 보기] 를 누르면 브라우저 밖으로 나가지 않고 앱 안에서
 * 네이버 모바일 플레이스(m.place.naver.com)를 iframe 으로 띄웁니다.
 *
 * · 헤더: 가게 이름 + [새 창으로 열기](외부 열기 폴백) + [닫기]
 * · 본문: <iframe src={naverPlaceSearchUrl(pin)} />
 * · 안전장치: iframe 이 6초 안에 로드되지 않거나, 같은 출처(about:blank)로
 *   남아 본문이 비어 있으면(= 브라우저가 차단) 즉시 안내 배너 + [네이버 지도로 열기]
 *   원탭 폴백을 보여 줍니다. iframe 은 지우지 않아 사용자가 직접 확인할 수 있습니다.
 *
 * SSR(node renderToString) 안전: window/document 는 useEffect 안에서만 만집니다.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, typography } from '../theme';
import { naverMapWebUrl, naverPlaceSearchUrl, openExternalUrl } from '../utils/links';

/** iframe 이 이 시간(ms) 안에 onLoad 를 못 주면 차단으로 간주합니다. */
export const IFRAME_LOAD_TIMEOUT_MS = 6000;

/** 차단 배너 문구 — 테스트에서 그대로 확인합니다. */
export const BLOCKED_NOTICE = '네이버 플레이스가 이 화면 안에서 열리지 않아요';
export const BLOCKED_HINT = '아래 [네이버 지도로 열기]를 누르면 새 화면에서 바로 확인할 수 있어요';

export function placeModalTitle(pin) {
  if (!pin) return '';
  return [pin.name, pin.area].filter(Boolean).join(' · ');
}

export default function InAppPlaceModal({ pin, onClose, onToast }) {
  const url = pin ? naverPlaceSearchUrl(pin) : '';
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const loadedRef = useRef(false);
  const frameRef = useRef(null);

  // 주소가 바뀌면 로드 상태를 초기화합니다.
  useEffect(() => {
    loadedRef.current = false;
    setLoaded(false);
    setBlocked(false);
  }, [url]);

  // 로드가 안 되면 시간 초과로 차단 안내를 띄웁니다. (SSR 에서는 돌지 않음)
  useEffect(() => {
    if (!pin) return undefined;
    const timer = setTimeout(() => {
      if (!loadedRef.current) setBlocked(true);
    }, IFRAME_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pin, url]);

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
   * iframe onLoad — 실제로 네이버 페이지가 그려졌는지 확인합니다.
   * · contentDocument 접근이 막히면(SecurityError) = 다른 출처 페이지가 정상 로드됨
   * · 접근되는데 about:blank 에 본문이 없으면 = 브라우저가 X-Frame-Options 등으로 차단
   */
  const handleFrameLoad = useCallback((event) => {
    loadedRef.current = true;
    setLoaded(true);
    const frame = (event && event.target) || frameRef.current;
    try {
      const doc = frame && frame.contentDocument;
      const href = doc && doc.location ? doc.location.href : '';
      const empty = !doc || !doc.body || doc.body.childElementCount === 0;
      if (empty && (href === 'about:blank' || href === '')) setBlocked(true);
      else setBlocked(false);
    } catch (err) {
      // cross-origin → 네이버 페이지가 실제로 열렸습니다.
      setBlocked(false);
    }
  }, []);

  const openExternal = useCallback(async () => {
    const result = await openExternalUrl(url);
    if (!result.opened && onToast) {
      onToast('새 창을 열 수 없어요. 잠시 후 다시 시도해 주세요');
      return;
    }
    if (onToast) onToast('네이버 플레이스로 열었어요');
  }, [url, onToast]);

  const openNaverMap = useCallback(async () => {
    const result = await openExternalUrl(naverMapWebUrl(pin || {}));
    if (onToast) {
      onToast(result.opened ? '네이버 지도로 열었어요' : '지도를 열 수 없어요. 잠시 후 다시 시도해 주세요');
    }
  }, [pin, onToast]);

  if (!pin) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.panel}>
        {/* ── 헤더: 가게 이름 + 새 창으로 열기 + 닫기 ── */}
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {pin.name}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {[pin.area, '네이버 플레이스'].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Pressable
            style={styles.externalBtn}
            onPress={openExternal}
            accessibilityRole="link"
            accessibilityLabel="새 창으로 열기"
          >
            <Ionicons name="open-outline" size={13} color={colors.coralDark} />
            <Text style={styles.externalText}>새 창으로 열기</Text>
          </Pressable>
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="닫기"
          >
            <Ionicons name="close" size={18} color={colors.textSub} />
          </Pressable>
        </View>

        {/* ── 차단 안내 + 원탭 폴백 ── */}
        {blocked && (
          <View style={styles.blockBanner}>
            <Ionicons name="alert-circle" size={15} color={colors.coralDark} />
            <View style={styles.blockTextWrap}>
              <Text style={styles.blockTitle}>{BLOCKED_NOTICE}</Text>
              <Text style={styles.blockHint}>{BLOCKED_HINT}</Text>
            </View>
            <Pressable
              style={styles.blockBtn}
              onPress={openNaverMap}
              accessibilityRole="link"
              accessibilityLabel="네이버 지도로 열기"
            >
              <Text style={styles.blockBtnText}>네이버 지도로 열기</Text>
            </Pressable>
          </View>
        )}

        {/* ── 본문: 네이버 모바일 플레이스 iframe ── */}
        <View style={styles.body}>
          {!loaded && !blocked && (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.coral} />
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
          <Pressable
            style={styles.footerBtn}
            onPress={openNaverMap}
            accessibilityRole="link"
            accessibilityLabel="네이버 지도로 열기"
          >
            <Text style={styles.footerBtnText}>네이버 지도로 열기</Text>
            <Ionicons name="chevron-forward" size={11} color={colors.coralDark} />
          </Pressable>
        </View>
      </View>
    </View>
  );
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  titleWrap: { flex: 1, minWidth: 0 },
  title: {
    ...typography.h3,
    fontSize: 15,
  },
  subtitle: {
    ...typography.tiny,
    fontSize: 10.5,
    marginTop: 1,
  },
  externalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.coralSoft,
  },
  externalText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.coralDark,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.coralSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.coralSoft2,
  },
  blockTextWrap: { flex: 1, minWidth: 0 },
  blockTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.coralDark,
  },
  blockHint: {
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.coralDark,
    opacity: 0.8,
    marginTop: 1,
  },
  blockBtn: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.coral,
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
    backgroundColor: colors.coralSoft,
  },
  footerBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.coralDark,
  },
});
