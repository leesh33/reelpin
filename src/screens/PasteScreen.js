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
import {
  DIRECT_PRESETS,
  PRESETS,
  extractPlaces,
  isSupportedUrl,
  parseUrl,
  searchPlacesDirect,
  splitSharedText,
} from '../services/extractor';
import { FREE_PIN_LIMIT } from '../data/seedPins';
import ProviderBadges from '../components/ProviderBadge';
import ExtractedTitleNote from '../components/ExtractedTitleNote';
import { buildPin } from '../utils/pins';
import { cardShadow, colors, radius, typography } from '../theme';

const EMOJI_BY_CATEGORY = {
  베이커리: '🥐',
  디저트: '🍰',
  카페: '☕️',
  맛집: '🍜',
  가볼곳: '🌳',
};

const TILE_BG = ['#FFF0EA', '#EDF6F2', '#F2F1FA', '#FFF7E6'];

const LINK_STAGES = ['링크 확인', '캡션 분석', '좌표 매칭'];
const SEARCH_STAGES = ['지도 조회', '중복 정리', '후보 정렬'];

export default function PasteScreen({
  active,
  pinCount,
  isPro,
  onSaved,
  onClose,
  onGoProfile,
  onToast,
  initialMode = 'link',
}) {
  const [mode, setMode] = useState(initialMode === 'search' ? 'search' : 'link'); // 'link' | 'search'
  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const [clipboardUrl, setClipboardUrl] = useState(null);
  const [clipboardCaption, setClipboardCaption] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [stage, setStage] = useState(0);
  const [candidates, setCandidates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  const limitReached = !isPro && pinCount >= FREE_PIN_LIMIT;
  const isSearch = mode === 'search';
  const stageLabels = isSearch ? SEARCH_STAGES : LINK_STAGES;

  const readClipboard = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      // v1.2: 공유 시트에서 복사한 건 "문구 + 링크" 덩어리입니다. 그 안에서 링크만 골라 씁니다.
      const shared = splitSharedText(text || '');
      if (shared.url && isSupportedUrl(shared.url)) {
        setClipboardUrl(shared.url);
        setClipboardCaption(shared.caption || '');
        return shared.url;
      }
    } catch (e) {
      // 웹 브라우저에서는 권한이 없으면 읽기가 막힙니다 — 조용히 넘어갑니다.
    }
    return null;
  }, []);

  useEffect(() => {
    if (active && !isSearch) readClipboard();
  }, [active, isSearch, readClipboard]);

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

  /** 모드를 바꾸면 이전 결과는 지웁니다. (링크 결과를 검색 결과처럼 저장하는 실수 방지) */
  const changeMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setError('');
    setCandidates([]);
    setSelectedId(null);
    setMeta(null);
    setStage(0);
  };

  const startProgress = () => {
    setStage(0);
    return setInterval(() => {
      setStage((s) => (s < 2 ? s + 1 : s));
    }, 380);
  };

  const runExtract = async (targetUrl) => {
    const value = (targetUrl != null ? targetUrl : url).trim();
    if (!value) {
      setError('릴스·쇼츠 링크를 먼저 붙여넣어 주세요.');
      return;
    }
    // "성수동 소금빵 맛집 베통 https://..." 처럼 문구와 링크가 붙어 있어도 링크만 골라 씁니다.
    const shared = splitSharedText(value);
    if (!shared.url) {
      setError('링크가 들어 있지 않아요. 공유 문구와 함께 링크를 붙여넣어 주세요.');
      return;
    }
    if (!isSupportedUrl(shared.url)) {
      setError('http:// 또는 https:// 로 시작하는 링크를 넣어 주세요.');
      return;
    }
    setError('');
    setExtracting(true);
    setCandidates([]);
    setSelectedId(null);

    const stageTimer = startProgress();

    const preset = PRESETS.find((p) => p.url === shared.url);
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
        mode: 'link',
        platform: result.platformLabel || '링크',
        platformKey: result.platform,
        usedAdapter: result.usedAdapter,
        query: result.query || '',
        sources: result.providersUsed || [],
        sourceTitle: result.sourceTitle || '',
        titleStatus: result.titleStatus || 'none',
        titleNotice: result.titleNotice || '',
        suggestedQuery: result.suggestedQuery || '',
      });
      setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 120);
    } catch (e) {
      clearInterval(stageTimer);
      setExtracting(false);
      setError('추출 중 문제가 생겼어요. 다시 시도해 주세요.');
    }
  };

  /** '가게명으로 찾기' — 캡션 없이 검색어만으로 지도 3사를 바로 조회합니다. */
  const runSearch = async (targetQuery) => {
    const value = (targetQuery != null ? targetQuery : query).trim();
    if (!value) {
      setError('가게명이나 동네를 먼저 입력해 주세요. 예) 성수동 소금빵');
      return;
    }
    setError('');
    setExtracting(true);
    setCandidates([]);
    setSelectedId(null);
    if (targetQuery != null) setQuery(targetQuery);

    const stageTimer = startProgress();
    try {
      const result = await searchPlacesDirect(value, { limit: 4 });
      await new Promise((resolve) => setTimeout(resolve, 420));
      clearInterval(stageTimer);
      setExtracting(false);
      if (!result.ok) {
        setCandidates([]);
        setMeta(null);
        setError(result.message || '검색 결과를 찾지 못했어요.');
        return;
      }
      setCandidates(result.candidates || []);
      setSelectedId(result.candidates && result.candidates[0] ? result.candidates[0].id : null);
      setMeta({
        mode: 'search',
        platform: '직접 검색',
        platformKey: 'search',
        usedAdapter: result.usedAdapter,
        query: result.query,
        sources: result.providersUsed || [],
      });
      setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 120);
    } catch (e) {
      clearInterval(stageTimer);
      setExtracting(false);
      setError('검색 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
    }
  };

  const runPrimary = () => (isSearch ? runSearch() : runExtract());

  /**
   * 제목을 못 읽어온 링크에서 [가게명으로 찾기] 한 번으로 검색 모드로 넘어가고,
   * 추출해 둔 '동네 + 키워드'로 바로 조회합니다. (v1.2)
   */
  const switchToSearch = (suggested) => {
    const nextQuery = String(suggested || '').trim();
    setMode('search');
    setError('');
    setCandidates([]);
    setSelectedId(null);
    setMeta(null);
    setStage(0);
    setQuery(nextQuery);
    if (nextQuery.length >= 2) runSearch(nextQuery);
  };

  const usePreset = (preset) => {
    setUrl(preset.url);
    setError('');
    runExtract(preset.url);
  };

  const selectedCandidate = candidates.find((c) => c.id === selectedId) || null;

  const resetInputs = () => {
    setUrl('');
    setQuery('');
    setCandidates([]);
    setSelectedId(null);
    setMeta(null);
    setClipboardUrl(null);
    setClipboardCaption('');
  };

  const savePin = () => {
    if (!selectedCandidate) return;
    if (limitReached) {
      onToast('무료 플랜은 핀 10개까지예요');
      return;
    }
    const searchMode = meta ? meta.mode === 'search' : isSearch;
    const sourceUrl = searchMode ? '' : url.trim();
    const platform = searchMode ? 'search' : parseUrl(sourceUrl).platform || 'instagram';
    const pin = buildPin(selectedCandidate, { sourceUrl, platform });
    if (!pin) {
      setError('저장할 장소 정보가 비어 있어요. 후보를 다시 골라 주세요.');
      return;
    }
    onSaved(pin);
    resetInputs();
  };

  const sourceLabel = (meta && meta.sources ? meta.sources : [])
    .map((id) => ({ kakao: '카카오', naver: '네이버', google: '구글' }[id] || ''))
    .filter(Boolean)
    .join(' · ');

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
        {/* 입력 방식 전환: 릴스 링크 ↔ 가게명 직접 검색 */}
        <View style={styles.modeRow}>
          {[
            { key: 'link', label: '릴스 링크', icon: 'link-outline' },
            { key: 'search', label: '가게명으로 찾기', icon: 'search' },
          ].map((m) => {
            const on = mode === m.key;
            return (
              <Pressable
                key={m.key}
                style={[styles.modeBtn, on && styles.modeBtnOn]}
                onPress={() => changeMode(m.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Ionicons name={m.icon} size={14} color={on ? colors.coralDark : colors.textSub} />
                <Text style={[styles.modeText, on && styles.modeTextOn]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* 클립보드 자동 감지 배너 (링크 모드 전용) */}
        {!isSearch && clipboardUrl ? (
          <View style={styles.clipBanner}>
            <View style={styles.clipIcon}>
              <Ionicons name="clipboard-outline" size={20} color={colors.coral} />
            </View>
            <View style={styles.clipTextWrap}>
              <Text style={styles.clipTitle}>방금 복사한 링크가 있어요</Text>
              <Text style={styles.clipSub} numberOfLines={1}>
                {clipboardCaption ? '“' + clipboardCaption.slice(0, 60) + '” · ' : ''}
                {clipboardUrl}
              </Text>
              <Pressable style={styles.clipBtn} onPress={applyPaste}>
                <Text style={styles.clipBtnText}>바로 붙여넣기</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {isSearch ? (
          <>
            <Text style={styles.label}>가게명 · 동네</Text>
            <View style={styles.inputWrap}>
              <TextInput
                value={query}
                onChangeText={(t) => {
                  setQuery(t);
                  setError('');
                }}
                placeholder="예) 성수동 소금빵, 연남동 딸기케이크"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => runSearch()}
                accessibilityLabel="가게명 검색 입력"
              />
              {query ? (
                <Pressable
                  style={styles.inputIconBtn}
                  onPress={() => {
                    setQuery('');
                    setError('');
                  }}
                  hitSlop={8}
                  accessibilityLabel="검색어 지우기"
                >
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.helper}>
              카카오·네이버 지도에서 바로 찾아 좌표까지 채워요. 캡션을 못 긁어온 릴스도 이렇게 저장하세요.
            </Text>
          </>
        ) : (
          <>
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
            <Text style={styles.helper}>
              공유할 때 복사된 문구를 통째로 붙여넣어도 돼요. (예: “성수동 소금빵 맛집 베통
              https://...”) 유튜브는 제목을, 네이버 블로그는 페이지 제목을 읽어 가게를 찾아요.
            </Text>
          </>
        )}

        <Pressable
          style={[styles.primaryBtn, extracting && styles.primaryBtnDisabled]}
          onPress={runPrimary}
          disabled={extracting}
          accessibilityRole="button"
        >
          {extracting ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.white} size="small" />
              <Text style={styles.primaryBtnText}>{stageLabels[stage]} 중…</Text>
            </View>
          ) : (
            <View style={styles.loadingRow}>
              <Ionicons name={isSearch ? 'search' : 'sparkles'} size={16} color={colors.white} />
              <Text style={styles.primaryBtnText}>{isSearch ? '가게 찾기' : '장소 추출하기'}</Text>
            </View>
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
          <Text style={styles.sectionTitle}>{isSearch ? '이렇게 찾아보세요' : '원탭 테스트'}</Text>
          <Text style={styles.sectionHint}>{isSearch ? '한 번 눌러 바로 검색' : '링크 없이 바로 눌러 보세요'}</Text>
        </View>
        <View style={styles.presetRow}>
          {isSearch
            ? DIRECT_PRESETS.map((q) => (
                <Pressable key={q} style={styles.presetChip} onPress={() => runSearch(q)}>
                  <Text style={styles.presetText} numberOfLines={1}>
                    {q}
                  </Text>
                </Pressable>
              ))
            : PRESETS.map((p) => (
                <Pressable key={p.url} style={styles.presetChip} onPress={() => usePreset(p)}>
                  <Text style={styles.presetText} numberOfLines={1}>
                    {p.label}
                  </Text>
                </Pressable>
              ))}
        </View>

        {/* 안내 카드 */}
        {candidates.length === 0 && !extracting && (
          <View style={styles.guideCard}>
            <Text style={styles.guideTitle}>{isSearch ? '이름만 알 때는 이렇게' : '저장은 3초면 끝나요'}</Text>
            {(isSearch
              ? [
                  ['가게명이나 동네를 입력', '예) 성수동 소금빵'],
                  ['지도에서 찾은 후보 확인', '출처 배지로 카카오·네이버 확인'],
                  ['[지도에 핀 꽂기]', '매장 정보 링크까지 함께 저장'],
                ]
              : [
                  ['릴스 공유 버튼 → 링크 복사', '인스타·유튜브 어디서든'],
                  ['위 칸에 붙여넣고 [장소 추출하기]', '캡션에서 가게·메뉴를 뽑아요'],
                  ['후보 확인 후 [지도에 핀 꽂기]', '그 동네 가면 알려드려요'],
                ]
            ).map((step, i) => (
              <View key={step[0]} style={styles.guideRow}>
                <View style={styles.guideNum}>
                  <Text style={styles.guideNumText}>{i + 1}</Text>
                </View>
                <View style={styles.guideTextWrap}>
                  <Text style={styles.guideText}>{step[0]}</Text>
                  <Text style={styles.guideSub}>{step[1]}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {candidates.length > 0 && (
          <View style={styles.resultWrap}>
            <View style={styles.resultHead}>
              <Text style={styles.sectionTitle}>
                {meta && meta.mode === 'search' ? '찾은 가게' : '추출된 장소'} {candidates.length}곳
              </Text>
              <View style={styles.platformChip}>
                <Text style={styles.platformChipText}>{meta ? meta.platform : '링크'}</Text>
              </View>
            </View>

            {!!sourceLabel && (
              <View style={styles.sourceLine}>
                <Ionicons name="layers-outline" size={12} color={colors.textSub} />
                <Text style={styles.sourceLineText} numberOfLines={1}>
                  {sourceLabel} 지도에서 실시간 확인
                  {meta && meta.query ? ' · “' + meta.query + '”' : ''}
                </Text>
              </View>
            )}

            {/* 읽어온 제목 · 인스타처럼 못 읽은 경우의 원탭 안내 (v1.2) */}
            <ExtractedTitleNote
              title={meta && meta.mode === 'link' ? meta.sourceTitle : ''}
              notice={meta && meta.mode === 'link' ? meta.titleNotice : ''}
              onSearchByName={() => switchToSearch(meta && meta.suggestedQuery)}
            />

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
                {selectedCandidate ? <ProviderBadges item={selectedCandidate} size="sm" style={styles.heroBadges} /> : null}
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
                    <View style={styles.candMetaRow}>
                      <ProviderBadges item={c} size="sm" />
                      <Text style={styles.candAddr} numberOfLines={1}>
                        {c.address} · {c.category}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.radio, on && styles.radioOn]}>
                    {on ? <View style={styles.radioDot} /> : null}
                  </View>
                </Pressable>
              );
            })}

            {meta && String(meta.usedAdapter || '').indexOf('offline') === 0 && (
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

            <Pressable style={styles.againBtn} onPress={runPrimary}>
              <Text style={styles.againText}>{isSearch ? '다시 찾기' : '다시 추출하기'}</Text>
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
  modeRow: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: 16,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 36,
    borderRadius: radius.sm,
  },
  modeBtnOn: {
    backgroundColor: colors.white,
    ...cardShadow,
  },
  modeText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textSub,
  },
  modeTextOn: {
    color: colors.coralDark,
    fontWeight: '800',
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
  helper: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: 7,
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
    gap: 8,
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
  guideCard: {
    marginTop: 24,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  guideTitle: {
    ...typography.h3,
    fontSize: 14,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  guideNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideNumText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.coralDark,
  },
  guideTextWrap: { flex: 1 },
  guideText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  guideSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
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
  sourceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  sourceLineText: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '700',
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
    maxWidth: '78%',
  },
  heroName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  heroBadges: {
    marginTop: 5,
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
  candMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  candAddr: {
    flex: 1,
    fontSize: 11,
    color: colors.textSub,
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
