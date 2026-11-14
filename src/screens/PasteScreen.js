import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { PRESETS, extractPlaces, isSupportedUrl, parseUrl } from '../services/extractor';
import { FREE_PIN_LIMIT } from '../data/seedPins';
import { cardShadow, colors, radius, typography } from '../theme';

const EMOJI_BY_CATEGORY = {
  베이커리: '🥐',
  디저트: '🍰',
  카페: '☕️',
  맛집: '🍜',
  가볼곳: '🌳',
};

const TILE_BG = ['#FFF0EA', '#EDF6F2', '#F2F1FA', '#FFF7E6'];

export default function PasteScreen({
  active,
  pinCount,
  isPro,
  onSaved,
  onClose,
  onGoProfile,
  onToast,
}) {
  const [url, setUrl] = useState('');
  const [clipboardUrl, setClipboardUrl] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [stage, setStage] = useState(0);
  const [candidates, setCandidates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  const limitReached = !isPro && pinCount >= FREE_PIN_LIMIT;

  const readClipboard = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      const trimmed = (text || '').trim();
      if (trimmed && isSupportedUrl(trimmed)) {
        setClipboardUrl(trimmed);
        return trimmed;
      }
    } catch (e) {
      // 웹 브라우저에서는 권한이 없으면 읽기가 막힙니다 — 조용히 넘어갑니다.
    }
    return null;
  }, []);

  useEffect(() => {
    if (active) readClipboard();
  }, [active, readClipboard]);

  const applyPaste = async () => {
    const text = await readClipboard();
    if (text) {
      setUrl(text);
      setError('');
      onToast('복사한 링크를 붙여넣었어요');
    } else {
      onToast('클립보드에 릴스·쇼츠 링크가 없어요');
    }
  };

  const runExtract = async (targetUrl) => {
    const value = (targetUrl != null ? targetUrl : url).trim();
    if (!value) {
      setError('릴스·쇼츠 링크를 먼저 붙여넣어 주세요.');
      return;
    }
    if (!isSupportedUrl(value)) {
      setError('인스타 릴스·유튜브 쇼츠·틱톡 링크만 인식할 수 있어요.');
      return;
    }
    setError('');
    setExtracting(true);
    setCandidates([]);
    setSelectedId(null);
    setStage(0);

    const stageTimer = setInterval(() => {
      setStage((s) => (s < 2 ? s + 1 : s));
    }, 380);

    const preset = PRESETS.find((p) => p.url === value);
    try {
      const result = await extractPlaces(value, { caption: preset ? preset.caption : '' });
      // 최소 로딩 시간을 줘서 '분석 중' 단계가 눈에 보이게 합니다.
      await new Promise((resolve) => setTimeout(resolve, 520));
      clearInterval(stageTimer);
      setExtracting(false);
      if (!result.ok) {
        setError(result.reason || '링크를 읽지 못했어요.');
        return;
      }
      setCandidates(result.candidates || []);
      setSelectedId(result.candidates && result.candidates[0] ? result.candidates[0].id : null);
      setMeta({
        platform: result.platformLabel || '링크',
        platformKey: result.platform,
        usedAdapter: result.usedAdapter,
      });
      setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 120);
    } catch (e) {
      clearInterval(stageTimer);
      setExtracting(false);
      setError('추출 중 문제가 생겼어요. 다시 시도해 주세요.');
    }
  };

  const usePreset = (preset) => {
    setUrl(preset.url);
    setError('');
    runExtract(preset.url);
  };

  const selectedCandidate = candidates.find((c) => c.id === selectedId) || null;

  const savePin = () => {
    if (!selectedCandidate) return;
    if (limitReached) {
      onToast('무료 플랜은 핀 10개까지예요');
      return;
    }
    const parsed = parseUrl(url);
    const pin = {
      id: 'pin-' + Date.now(),
      name: selectedCandidate.name,
      area: selectedCandidate.area || '',
      category: selectedCandidate.category || '맛집',
      menuTags: selectedCandidate.menuTags || [],
      address: selectedCandidate.address || '주소 미확인',
      lat: selectedCandidate.lat,
      lng: selectedCandidate.lng,
      sourceUrl: url.trim(),
      platform: parsed.platform || 'instagram',
      note: '',
      createdAt: new Date().toISOString(),
    };
    onSaved(pin);
    setUrl('');
    setCandidates([]);
    setSelectedId(null);
    setMeta(null);
    setClipboardUrl(null);
  };

  const stageLabels = ['링크 확인', '캡션 분석', '좌표 매칭'];

  return (
    <View style={styles.root}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.brandPin}>
            <Ionicons name="location" size={16} color={colors.white} />
          </View>
          <Text style={styles.brandText}>ReelPin</Text>
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>저장</Text>
          </View>
        </View>
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8} accessibilityLabel="닫기">
          <Ionicons name="close" size={18} color={colors.textSub} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 클립보드 자동 감지 배너 */}
        {clipboardUrl ? (
          <View style={styles.clipBanner}>
            <View style={styles.clipIcon}>
              <Ionicons name="clipboard-outline" size={20} color={colors.coral} />
            </View>
            <View style={styles.clipTextWrap}>
              <Text style={styles.clipTitle}>방금 복사한 링크가 있어요</Text>
              <Text style={styles.clipSub} numberOfLines={1}>
                {clipboardUrl}
              </Text>
              <Pressable style={styles.clipBtn} onPress={applyPaste}>
                <Text style={styles.clipBtnText}>바로 붙여넣기</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Text style={styles.label}>릴스 · 쇼츠 링크</Text>
        <View style={styles.inputWrap}>
          <TextInput
            value={url}
            onChangeText={(t) => {
              setUrl(t);
              setError('');
            }}
            placeholder="https://www.instagram.com/reel/..."
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={() => runExtract()}
            accessibilityLabel="릴스 링크 입력"
          />
          <Pressable style={styles.inputIconBtn} onPress={applyPaste} hitSlop={8} accessibilityLabel="붙여넣기">
            <Ionicons name="clipboard-outline" size={18} color={colors.coral} />
          </Pressable>
        </View>

        <Pressable
          style={[styles.primaryBtn, extracting && styles.primaryBtnDisabled]}
          onPress={() => runExtract()}
          disabled={extracting}
          accessibilityRole="button"
        >
          {extracting ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.white} size="small" />
              <Text style={styles.primaryBtnText}>{stageLabels[stage]} 중…</Text>
            </View>
          ) : (
            <Text style={styles.primaryBtnText}>장소 추출하기</Text>
          )}
        </Pressable>

        {!!error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={15} color={colors.coralDark} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* 원탭 테스트 프리셋 */}
        <View style={styles.presetHead}>
          <Text style={styles.sectionTitle}>원탭 테스트</Text>
          <Text style={styles.sectionHint}>링크 없이 바로 눌러 보세요</Text>
        </View>
        <View style={styles.presetRow}>
          {PRESETS.map((p) => (
            <Pressable key={p.url} style={styles.presetChip} onPress={() => usePreset(p)}>
              <Text style={styles.presetText} numberOfLines={1}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* 추출 결과 */}
        {candidates.length > 0 && (
          <View style={styles.resultWrap}>
            <View style={styles.resultHead}>
              <Text style={styles.sectionTitle}>추출된 장소 {candidates.length}곳</Text>
              <View style={styles.platformChip}>
                <Text style={styles.platformChipText}>{meta ? meta.platform : '링크'}</Text>
              </View>
            </View>

            <View style={styles.heroCard}>
              <View style={styles.heroTile}>
                <Text style={styles.heroEmoji}>
                  {EMOJI_BY_CATEGORY[selectedCandidate ? selectedCandidate.category : '맛집'] || '📍'}
                </Text>
              </View>
              <View style={styles.heroOverlay}>
                <Text style={styles.heroName} numberOfLines={1}>
                  {selectedCandidate ? selectedCandidate.name : ''}
                </Text>
              </View>
            </View>

            {candidates.map((c, i) => {
              const on = c.id === selectedId;
              return (
                <Pressable
                  key={c.id}
                  style={[styles.candCard, on && styles.candCardOn]}
                  onPress={() => setSelectedId(c.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <View style={[styles.candTile, { backgroundColor: TILE_BG[i % TILE_BG.length] }]}>
                    <Text style={styles.candEmoji}>{EMOJI_BY_CATEGORY[c.category] || '📍'}</Text>
                  </View>
                  <View style={styles.candTextWrap}>
                    <Text style={styles.candName} numberOfLines={1}>
                      {i + 1}. {c.name}
                    </Text>
                    <Text style={styles.candAddr} numberOfLines={1}>
                      {c.address} · {c.category}
                    </Text>
                  </View>
                  <View style={[styles.radio, on && styles.radioOn]}>
                    {on ? <View style={styles.radioDot} /> : null}
                  </View>
                </Pressable>
              );
            })}

            {meta && meta.usedAdapter === 'offline' && (
              <Text style={styles.adapterNote}>
                오프라인 추출기로 찾은 후보예요. API 키를 연결하면 실제 가게·좌표로 정확도가 올라갑니다.
              </Text>
            )}

            {limitReached ? (
              <Pressable style={styles.proGate} onPress={onGoProfile}>
                <Ionicons name="lock-closed" size={15} color={colors.coralDark} />
                <Text style={styles.proGateText}>
                  무료 플랜은 핀 {FREE_PIN_LIMIT}개까지예요. 프로에서 무제한으로 저장하세요.
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.primaryBtn, styles.saveBtn]}
                onPress={savePin}
                disabled={!selectedCandidate}
                accessibilityRole="button"
              >
                <Ionicons name="location" size={16} color={colors.white} />
                <Text style={styles.primaryBtnText}>지도에 핀 꽂기</Text>
              </Pressable>
            )}

            <Pressable style={styles.againBtn} onPress={() => runExtract()}>
              <Text style={styles.againText}>다시 추출하기</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {isPro
              ? '프로 플랜 · 저장 무제한'
              : `무료 플랜 · ${pinCount} / ${FREE_PIN_LIMIT}건 저장됨`}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  brandPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
  },
  brandBadge: {
    backgroundColor: colors.lineSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  brandBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSub,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  clipBanner: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 18,
  },
  clipIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipTextWrap: { flex: 1 },
  clipTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  clipSub: {
    fontSize: 11,
    color: colors.textSub,
    marginTop: 3,
  },
  clipBtn: {
    alignSelf: 'flex-start',
    marginTop: 9,
    backgroundColor: colors.coral,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9,
  },
  clipBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  label: {
    ...typography.sub,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 7,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingLeft: 14,
    paddingRight: 6,
    height: 52,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 0,
  },
  inputIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: colors.coralDark,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryBtnDisabled: {
    opacity: 0.85,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.coralDark,
  },
  presetHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 22,
    marginBottom: 9,
  },
  sectionTitle: {
    ...typography.h3,
    fontSize: 14,
  },
  sectionHint: {
    fontSize: 11,
    color: colors.textMuted,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  presetText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSub,
  },
  resultWrap: {
    marginTop: 24,
    backgroundColor: '#F0EFF4',
    borderRadius: radius.xl,
    padding: 14,
  },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  platformChip: {
    backgroundColor: colors.card,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  platformChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSub,
  },
  heroCard: {
    height: 132,
    borderRadius: radius.lg,
    backgroundColor: '#E9E4DE',
    overflow: 'hidden',
    marginBottom: 12,
  },
  heroTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3E6D8',
  },
  heroEmoji: {
    fontSize: 52,
  },
  heroOverlay: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    backgroundColor: colors.white,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    maxWidth: '70%',
  },
  heroName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  candCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: 10,
    marginBottom: 8,
  },
  candCardOn: {
    borderColor: colors.coral,
    backgroundColor: colors.white,
    ...cardShadow,
  },
  candTile: {
    width: 46,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  candEmoji: {
    fontSize: 24,
  },
  candTextWrap: { flex: 1 },
  candName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  candAddr: {
    fontSize: 11,
    color: colors.textSub,
    marginTop: 3,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#D8D8E0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  radioOn: {
    borderColor: colors.coral,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.coral,
  },
  adapterNote: {
    fontSize: 11,
    color: colors.textSub,
    lineHeight: 16,
    marginTop: 2,
    marginBottom: 4,
  },
  saveBtn: {
    flexDirection: 'row',
    gap: 7,
  },
  proGate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 6,
  },
  proGateText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.coralDark,
    lineHeight: 17,
  },
  againBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    marginTop: 2,
  },
  againText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSub,
  },
  footer: {
    marginTop: 22,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
