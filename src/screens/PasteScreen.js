import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DIRECT_PRESETS,
  MAX_DIRECT_CANDIDATES,
  extractFromImage,
  extractPlaces,
  isSupportedUrl,
  isWebPlatform,
  parseUrl,
  pickImageFile,
  searchPlacesDirect,
  splitSharedText,
} from '../services/extractor';
import OverlayHeader from '../components/OverlayHeader';
import ProviderBadges from '../components/ProviderBadge';
import ExtractedTitleNote from '../components/ExtractedTitleNote';
import CategoryPicker from '../components/CategoryPicker';
import { buildPin } from '../utils/pins';
import { DEFAULT_CATEGORIES, getCategoryColor, mapLegacyCategory } from '../utils/categories';
import { cardShadow, colors, radius, tabBar, typography } from '../theme';

const EMOJI_BY_CATEGORY = {
  베이커리: '🥐',
  디저트: '🍰',
  카페: '☕️',
  맛집: '🍜',
  가볼곳: '🌳',
};

const TILE_BG = ['#FFF0EA', '#EDF6F2', '#F2F1FA', '#FFF7E6'];

// v2.9 — 마지막 단계는 Gemini 영상 분석(음성·화면 자막). 실제로 그 단계로 갈 때만 문구가 바뀝니다.
const LINK_STAGES = ['링크 확인', '캡션 분석', '좌표 매칭', 'AI 영상 분석'];
const SEARCH_STAGES = ['지도 조회', '중복 정리', '후보 정렬'];
// v2.13 — 📸 사진은 올린 뒤 'AI 사진 분석 중…' 이 곧바로 보입니다.
const PHOTO_STAGES = ['사진 확인', 'AI 사진 분석', '지도 좌표 매칭'];

export default function PasteScreen({
  pinCount,
  categories = DEFAULT_CATEGORIES,
  onAddCategory,
  onSaved,
  onSavedMany,
  onClose,
  onToast,
  initialMode = 'link',
  // v2.18 — 헤더가 OverlayHeader 로 바뀌면서 상단 아이콘(🔍🔔☰) 묶음은 쓰지 않습니다.
  //          (다른 탭에서 그대로 쓸 수 있게 prop 은 받아 두되 그리지 않습니다)
  header = null,
  request = null,
}) {
  // 웹(배포 앱)에서만 Gemini 사진 분석 프록시를 부를 수 있습니다. (키는 서버에만)
  const canUsePhoto = isWebPlatform();
  /**
   * v2.14 — 저장 화면 상단을 3개 탭으로 나눕니다: `🔗 릴스 링크` · `📸 사진으로 찾기` · `🔍 가게명 찾기`.
   *   · 사진 탭은 Gemini 서버 프록시(웹 전용)로 동작하므로, 웹에서는 3개 탭이 모두 보이고
   *     네이티브(`Platform.OS !== 'web'`)에서는 예전처럼 2개 탭만 보입니다.
   *   · 네이티브에서 `initialMode="photo"` 로 들어와도 사진 탭이 없으니 링크 탭으로 엽니다.
   */
  const [mode, setMode] = useState(() => {
    const want = initialMode === 'search' ? 'search' : initialMode === 'photo' ? 'photo' : 'link';
    return want === 'photo' && !canUsePhoto ? 'link' : want;
  }); // 'link' | 'photo' | 'search'
  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [stage, setStage] = useState(0);
  const [candidates, setCandidates] = useState([]);
  // v2.0 — 후보마다 체크박스. 한 곳이든 여러 곳이든 '선택한 N곳'을 한 번에 저장합니다.
  const [selectedIds, setSelectedIds] = useState([]);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  // v2.2 — 저장하기 전에 분류를 직접 고르기 (고르지 않았다면 자동 분류 결과를 씁니다)
  const [pickedCategory, setPickedCategory] = useState('');
  const [categoryTouched, setCategoryTouched] = useState(false);
  // v2.10 — 📝 저장 전에 미리 적어 두는 한줄 메모 (선택)
  const [memo, setMemo] = useState('');
  // v2.20 — 🤖 AI 가 채운 초안인지 (사용자가 한 글자라도 고치면 false → 안내 문구가 바뀝니다)
  const [memoAutoFilled, setMemoAutoFilled] = useState(false);
  // v2.13 — 📸 사진을 읽고 있는 동안 (버튼 자체가 'AI 사진 분석 중…' 으로 바뀝니다)
  const [photoBusy, setPhotoBusy] = useState(false);
  const scrollRef = useRef(null);

  /**
   * v2.16 — 🔍 검색 팝업에서 [저장 탭에서 ‘가게명’ 찾기] 로 넘어올 때:
   * 상위(App)가 `request={{ id, mode:'search', query }}` 를 주고, **id 가 바뀔 때만** 적용합니다.
   * (탭을 전환해도 화면은 계속 마운트되어 있으므로 initialMode·initialQuery 로는 반영되지 않습니다.)
   */
  const requestRef = useRef(0);
  useEffect(() => {
    if (!request || !request.id || requestRef.current === request.id) return;
    requestRef.current = request.id;
    if (request.mode === 'photo' && !canUsePhoto) setMode('link');
    else setMode(request.mode === 'search' ? 'search' : 'link');
    setQuery(String(request.query == null ? '' : request.query));
    setError('');
    setCandidates([]);
    setSelectedIds([]);
    setMeta(null);
  }, [request, canUsePhoto]);
  /**
   * v2.14 — 분석이 도는 동안 다른 탭으로 옮겨 갈 수 있습니다(탭은 잠그지 않습니다).
   *   그래서 `runSeq` 로 '지금 화면의 요청'만 결과를 반영하고, 늦게 도착한 이전 탭의 결과는 버립니다.
   */
  const runSeq = useRef(0);

  const isSearch = mode === 'search';
  const isPhoto = mode === 'photo';
  const stageLabels = photoBusy || isPhoto ? PHOTO_STAGES : isSearch ? SEARCH_STAGES : LINK_STAGES;
  // v2.18 — 첫 탭 이름을 `릴스·쇼츠로 찾기` 로 (상훈 님 요청)
  // 웹에서는 3탭(릴스·쇼츠·사진·가게명), 네이티브에서는 2탭(릴스·쇼츠·가게명)
  // 390px 한 줄에 긴 이름이 들어가도록 3탭일 때는 아이콘을 빼고 글자만 씁니다.
  const tabs = canUsePhoto
    ? [
        { key: 'link', label: '릴스·쇼츠로 찾기', icon: 'link-outline' },
        { key: 'photo', label: '사진으로 찾기', icon: 'image-outline' },
        { key: 'search', label: '가게명 찾기', icon: 'search' },
      ]
    : [
        { key: 'link', label: '릴스·쇼츠로 찾기', icon: 'link-outline' },
        { key: 'search', label: '가게명으로 찾기', icon: 'search' },
      ];

  // v2.18 — [클립보드에서 붙여넣기] 버튼을 없애면서 자동 클립보드 읽기도 함께 걷어냈습니다.
  //          (상훈 님 요청 · 아이폰 사파리의 붙여넣기 허용 팝업도 더 뜨지 않습니다)
  //          붙여넣기는 입력창을 길게 눌러 하는 iOS 기본 동작을 그대로 씁니다.

  /**
   * 모드를 바꾸면 이전 결과는 지웁니다. (링크 결과를 검색 결과처럼 저장하는 실수 방지)
   *   · 진행 중이던 분석은 `runSeq` 로 무효화해, 늦게 도착해도 새 탭에 결과·에러를 흘리지 않습니다.
   *   · 네이티브에서 사진 탭은 없으므로 눌러도 무시합니다.
   */
  const changeMode = (next) => {
    if (next === mode) return;
    if (next === 'photo' && !canUsePhoto) return;
    runSeq.current += 1;
    setMode(next);
    setError('');
    setCandidates([]);
    setSelectedIds([]);
    setMeta(null);
    setStage(0);
    setCategoryTouched(false);
    setPickedCategory('');
    setMemo('');
    setMemoAutoFilled(false);
    setExtracting(false);
    setPhotoBusy(false);
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
    const seq = runSeq.current + 1;
    runSeq.current = seq;
    setError('');
    setExtracting(true);
    setCandidates([]);
    setSelectedIds([]);
    setCategoryTouched(false);
    setPickedCategory('');

    const stageTimer = startProgress();

    try {
      const result = await extractPlaces(value, {
        // v2.18 — 샘플(원탭 테스트) 링크를 지우면서 프리셋 캡션 대입도 함께 걷어냈습니다.
        caption: '',
        // 1차(제목·설명글·지도)로 실매장을 못 찾았을 때 Gemini 분석으로 넘어가면 진행 문구를 바꿉니다.
        onStage: (s) => setStage(s),
      });
      // 최소 로딩 시간을 줘서 '분석 중' 단계가 눈에 보이게 합니다.
      await new Promise((resolve) => setTimeout(resolve, 520));
      clearInterval(stageTimer);
      if (seq !== runSeq.current) return; // 다른 탭으로 옮겼으면 이전 결과는 버립니다
      setExtracting(false);
      if (!result.ok) {
        setError(result.reason || '링크를 읽지 못했어요.');
        return;
      }
      setCandidates(result.candidates || []);
      // 여러 곳이면 매칭된 후보를 모두 선택해 두고(바로 저장), 한 곳이면 1순위만 선택합니다.
      const firstList = result.candidates || [];
      setSelectedIds(
        result.mode === 'multi' ? firstList.map((c) => c.id) : firstList[0] ? [firstList[0].id] : []
      );
      setMeta({
        mode: 'link',
        multi: result.mode === 'multi',
        unmatched: result.unmatched || [],
        platform: result.platformLabel || '링크',
        platformKey: result.platform,
        usedAdapter: result.usedAdapter,
        query: result.query || '',
        sources: result.providersUsed || [],
        sourceTitle: result.sourceTitle || '',
        thumbnail: result.sourceThumbnail || '',
        titleStatus: result.titleStatus || 'none',
        titleNotice: result.titleNotice || '',
        suggestedQuery: result.suggestedQuery || '',
        // v2.9 — Gemini 가 영상 속 말·자막을 읽어 찾은 경우의 한 줄 근거
        aiNote: result.aiNote || '',
      });
      // v2.20 — AI·설명글에서 확인된 추천 메뉴·주차·아기/웨이팅 → 한줄 메모 초안을 미리 채웁니다.
      //         (확인된 값이 없으면 빈 문자열 → 메모는 그대로 비어 있습니다)
      const draft = String(result.memoDraft || '').trim().slice(0, 120);
      setMemo(draft);
      setMemoAutoFilled(Boolean(draft));
      setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 120);
    } catch (e) {
      clearInterval(stageTimer);
      if (seq !== runSeq.current) return;
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
    const seq = runSeq.current + 1;
    runSeq.current = seq;
    setError('');
    setExtracting(true);
    setCandidates([]);
    setSelectedIds([]);
    setCategoryTouched(false);
    setPickedCategory('');
    if (targetQuery != null) setQuery(targetQuery);

    const stageTimer = startProgress();
    try {
      const result = await searchPlacesDirect(value, { limit: MAX_DIRECT_CANDIDATES });
      await new Promise((resolve) => setTimeout(resolve, 420));
      clearInterval(stageTimer);
      if (seq !== runSeq.current) return;
      setExtracting(false);
      if (!result.ok) {
        setCandidates([]);
        setMeta(null);
        setError(result.message || '검색 결과를 찾지 못했어요.');
        return;
      }
      setCandidates(result.candidates || []);
      setSelectedIds(result.candidates && result.candidates[0] ? [result.candidates[0].id] : []);
      // 가게명 검색에는 설명글·사진이 없어 메모 초안도 없습니다. (이전 초안이 남지 않게 비웁니다)
      setMemo('');
      setMemoAutoFilled(false);
      setMeta({
        mode: 'search',
        multi: false,
        unmatched: [],
        platform: '직접 검색',
        platformKey: 'search',
        usedAdapter: result.usedAdapter,
        query: result.query,
        sources: result.providersUsed || [],
      });
      setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 120);
    } catch (e) {
      clearInterval(stageTimer);
      if (seq !== runSeq.current) return;
      setExtracting(false);
      setError('검색 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
    }
  };

  /**
   * v2.14 — 📸 사진으로 찾기 탭.
   *   · 버튼을 누른 **그 순간** 사진 보관함/파일 선택창을 엽니다. (iOS 는 사용자 동작에서만 허용)
   *   · 사진은 웹에서 1280px · JPEG 0.82 로 줄여 `/api/gemini` 로 보내고(Gemini 키는 서버에만),
   *     AI 가 읽은 상호를 기존 지도 파이프라인(카카오·네이버 · v2.12 주소 보강)으로 다시 찾습니다.
   *   · 결과는 링크로 찾은 것과 같은 카드·썸네일(올린 사진)·분류·한줄 메모·저장 버튼으로 이어집니다.
   */
  const runPhoto = async () => {
    if (extracting || photoBusy) return;
    const file = await pickImageFile();
    if (!file) return; // 사용자가 취소 — 화면은 그대로 둡니다
    const seq = runSeq.current + 1;
    runSeq.current = seq;
    if (mode !== 'photo') setMode('photo');
    setError('');
    setCandidates([]);
    setSelectedIds([]);
    setMeta(null);
    setCategoryTouched(false);
    setPickedCategory('');
    setMemo('');
    setStage(1); // 'AI 사진 분석'
    setPhotoBusy(true);
    try {
      const result = await extractFromImage(file, { onStage: (s) => setStage(s) });
      if (seq !== runSeq.current) return; // 다른 탭으로 옮겼으면 이전 결과는 버립니다
      if (!result.ok) {
        setError(result.message || '사진에서 가게를 찾지 못했어요. 다시 시도해 주세요.');
        return;
      }
      const list = result.candidates || [];
      setCandidates(list);
      // 여러 곳(목록형 캡처)이면 모두 선택, 한 곳이면 1순위만 — 링크 추출과 같은 규칙
      setSelectedIds(result.mode === 'multi' ? list.map((c) => c.id) : list[0] ? [list[0].id] : []);
      setMeta({
        mode: 'photo',
        multi: result.mode === 'multi',
        unmatched: result.unmatched || [],
        platform: '사진',
        platformKey: 'photo',
        usedAdapter: result.usedAdapter,
        query: result.query || '',
        sources: result.providersUsed || [],
        sourceTitle: '',
        // 올린 사진을 히어로 카드 배경으로 — 링크의 영상 썸네일과 같은 자리
        thumbnail: result.sourceThumbnail || '',
        titleStatus: 'photo',
        titleNotice: '',
        suggestedQuery: result.suggestedQuery || '',
        aiNote: result.aiNote || '',
      });
      // v2.20 — 사진에서 읽은 추천 메뉴·주차·아기/웨이팅으로 한줄 메모 초안을 채웁니다.
      const photoDraft = String(result.memoDraft || '').trim().slice(0, 120);
      setMemo(photoDraft);
      setMemoAutoFilled(Boolean(photoDraft));
      setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 120);
    } catch (e) {
      if (seq !== runSeq.current) return;
      setError('사진을 분석하는 중 문제가 생겼어요. 다시 시도해 주세요.');
    } finally {
      if (seq === runSeq.current) setPhotoBusy(false);
    }
  };

  const runPrimary = () => (isPhoto ? runPhoto() : isSearch ? runSearch() : runExtract());

  /**
   * 제목을 못 읽어온 링크에서 [가게명으로 찾기] 한 번으로 검색 모드로 넘어가고,
   * 추출해 둔 '동네 + 키워드'로 바로 조회합니다. (v1.2)
   */
  const switchToSearch = (suggested) => {
    const nextQuery = String(suggested || '').trim();
    setMode('search');
    setError('');
    setCandidates([]);
    setSelectedIds([]);
    setMeta(null);
    setStage(0);
    setQuery(nextQuery);
    if (nextQuery.length >= 2) runSearch(nextQuery);
  };

  const selectedCandidates = candidates.filter((c) => selectedIds.indexOf(c.id) >= 0);
  const heroCandidate = selectedCandidates[0] || null;
  /**
   * v2.8 — 히어로 카드 배경 사진.
   *   1순위: 고른 후보 자체의 사진(coverImage·thumbnail)
   *   2순위: 링크에서 읽어 온 영상 썸네일(유튜브 hqdefault 등)
   *   없으면(가게명 직접 검색 등) **큰 배너를 그리지 않습니다**(v2.20.2 — 빈 이모지 타일 미노출).
   */
  const heroThumbnail = String(
    (heroCandidate && (heroCandidate.coverImage || heroCandidate.thumbnail)) ||
      (meta && meta.thumbnail) ||
      ''
  ).trim();
  const allSelected = candidates.length > 0 && selectedCandidates.length === candidates.length;

  /**
   * v2.2 — 저장할 분류의 기본값은 **자동 분류 결과**입니다.
   *   · 베이커리·디저트는 지도 칩과 같은 '맛집'으로 보여 줍니다 (예전 핀과 호환)
   *   · 사용자가 칩을 탭하면 그 분류로 저장됩니다. (선택이 바뀌어도 사용자가 고른 값은 유지)
   */
  const autoCategory = mapLegacyCategory(heroCandidate ? heroCandidate.category : '맛집') || '맛집';
  const saveCategory = categoryTouched && pickedCategory ? pickedCategory : autoCategory;

  const pickCategory = (name) => {
    setPickedCategory(name);
    setCategoryTouched(true);
  };

  const toggleSelected = (id) => {
    setSelectedIds((cur) => (cur.indexOf(id) >= 0 ? cur.filter((x) => x !== id) : cur.concat(id)));
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : candidates.map((c) => c.id));
  };

  const resetInputs = () => {
    setUrl('');
    setQuery('');
    setCandidates([]);
    setSelectedIds([]);
    setMeta(null);
    setCategoryTouched(false);
    setPickedCategory('');
    setMemo('');
    setMemoAutoFilled(false);
  };

  /** 선택한 후보를 핀으로 만들어 저장합니다. (1곳이든 N곳이든 같은 버튼) */
  const savePins = () => {
    if (!selectedCandidates.length) return;
    const searchMode = meta ? meta.mode === 'search' : isSearch;
    // v2.13 — 📸 사진으로 저장한 핀은 원본 링크가 없습니다. (상세 시트에 [원본 열기] 대신 '사진에서 저장')
    const photoMode = meta ? meta.mode === 'photo' : false;
    // 붙여넣은 게 '문구 + 링크' 덩어리여도 핀에는 링크만 저장합니다. (상세 시트의 [원본 열기]가 깨지지 않게)
    const sourceUrl = searchMode || photoMode ? '' : splitSharedText(url).url;
    const platform = photoMode
      ? 'photo'
      : searchMode
      ? 'search'
      : parseUrl(sourceUrl).platform || 'instagram';
    const built = selectedCandidates
      .map((candidate) =>
        buildPin({ ...candidate, category: saveCategory }, { sourceUrl, platform, memo })
      )
      .filter(Boolean);
    if (!built.length) {
      setError('저장할 장소 정보가 비어 있어요. 후보를 다시 골라 주세요.');
      return;
    }
    if (typeof onSavedMany === 'function') onSavedMany(built);
    else if (typeof onSaved === 'function') built.forEach((pin) => onSaved(pin));
    resetInputs();
  };

  const sourceLabel = (meta && meta.sources ? meta.sources : [])
    .map((id) => ({ kakao: '카카오', naver: '네이버', google: '구글' }[id] || ''))
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.root}>
      {/* 헤더 — v2.18: 저장 화면은 🔍 장소 검색(SearchOverlayModal)과 **같은 다크 차콜 헤더**를 씁니다.
          (OverlayHeader 한 컴포넌트 → 색·높이·✕ 버튼이 어긋날 수 없습니다. 풀페이지 모달 형태는 그대로.) */}
      <OverlayHeader
        icon="add"
        title="저장"
        sub={
          canUsePhoto
            ? '릴스·쇼츠 링크 · 사진 · 가게명으로 찾아 내 지도에 꽂기'
            : '릴스·쇼츠 링크 · 가게명으로 찾아 내 지도에 꽂기'
        }
        onClose={onClose}
        closeLabel="닫기"
        testID="paste-header"
        closeTestID="paste-header-close"
      />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 입력 방식 전환: 🔗 릴스 링크 ↔ 📸 사진으로 찾기 ↔ 🔍 가게명으로 찾기 */}
        <View style={styles.modeRow}>
          {tabs.map((m) => {
            const on = mode === m.key;
            return (
              <Pressable
                key={m.key}
                style={[styles.modeBtn, on && styles.modeBtnOn]}
                onPress={() => changeMode(m.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={m.label + ' 탭'}
                testID={'paste-tab-' + m.key}
              >
                {tabs.length > 2 ? null : <Ionicons name={m.icon} size={13} color={on ? colors.coralDark : colors.textSub} />}
                <Text
                  style={[styles.modeText, tabs.length > 2 && styles.modeTextTight, on && styles.modeTextOn]}
                  numberOfLines={1}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* v2.1.1 — 자동 클립보드 감지 배너는 없앴습니다.
            아이폰 사파리에서 탭 진입만으로 붙여넣기 허용 팝업이 뜨지 않게 하기 위함입니다. */}

        {isPhoto ? (
          <>
            {/* 📸 사진 업로드 카드 — 점선 테두리 카드를 눌러도 바로 사진 고르기가 열립니다. */}
            <Pressable
              style={[styles.photoDrop, photoBusy && styles.photoDropBusy]}
              onPress={runPhoto}
              disabled={extracting || photoBusy}
              accessibilityRole="button"
              accessibilityLabel="인스타 캡처·스크린샷 올리기"
              testID="paste-photo-card"
            >
              <View style={styles.photoDropIcon}>
                {photoBusy ? (
                  <ActivityIndicator color={colors.coralDark} size="small" />
                ) : (
                  <Text style={styles.photoDropEmoji}>📸</Text>
                )}
              </View>
              <Text style={styles.photoDropTitle}>인스타 캡처·스크린샷 올리기</Text>
              <Text style={styles.photoDropDesc}>
                사진 속 가게 이름과 동네를 AI가 읽어 카카오·네이버 지도에서 찾아드려요.
              </Text>
              <View style={styles.photoDropHintRow}>
                <Ionicons name="images-outline" size={12} color={colors.textMuted} />
                <Text style={styles.photoDropHint}>JPG · PNG · 아이폰 스크린샷 그대로</Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.primaryBtn, (extracting || photoBusy) && styles.primaryBtnDisabled]}
              onPress={runPhoto}
              disabled={extracting || photoBusy}
              accessibilityRole="button"
              accessibilityLabel="사진·캡처 고르기"
              testID="paste-photo-button"
            >
              {photoBusy ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.white} size="small" />
                  <Text style={styles.primaryBtnText}>{(PHOTO_STAGES[stage] || 'AI 사진 분석') + ' 중…'}</Text>
                </View>
              ) : (
                <View style={styles.loadingRow}>
                  <Ionicons name="camera" size={16} color={colors.white} />
                  <Text style={styles.primaryBtnText}>사진·캡처 고르기</Text>
                </View>
              )}
            </Pressable>
          </>
        ) : isSearch ? (
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
              {/* v2.21 — 입력값이 있으면 맨 우측 ✕ 로 한 번에 지웁니다. (상훈 님 요청) */}
              {url ? (
                <Pressable
                  style={styles.inputIconBtn}
                  onPress={() => {
                    setUrl('');
                    setError('');
                    setStage(0);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="링크 지우기"
                  testID="url-clear"
                >
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            {/* v2.18 — `클립보드에서 붙여넣기` 버튼과 입력창 안의 클립보드 아이콘을 없앴습니다
                (상훈 님 요청). 붙여넣기는 아이폰 키보드의 길게 눌러 붙여넣기로 합니다. */}
            <Text style={styles.helper}>
              공유할 때 복사된 문구를 통째로 붙여넣어도 돼요. (예: “성수동 소금빵 맛집 베통
              https://...”) 유튜브는 제목을, 네이버 블로그는 페이지 제목을 읽어 가게를 찾아요.
            </Text>
          </>
        )}

        {/* 📸 사진으로 찾기 — 사진 탭이 이미 메인 CTA 를 갖고 있으므로 링크·검색 탭에서만 공통 버튼을 그립니다. */}
        {!isPhoto && (
          <Pressable
            style={[styles.primaryBtn, (extracting || photoBusy) && styles.primaryBtnDisabled]}
            onPress={runPrimary}
            disabled={extracting || photoBusy}
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
        )}

        {!!error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={15} color={colors.coralDark} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* v2.18 — `원탭 테스트`(샘플 링크) 영역은 지웠습니다.
            가게명 탭의 `이렇게 찾아보세요` 추천 검색어만 남깁니다. */}
        {isSearch && (
          <>
            <View style={styles.presetHead}>
              <Text style={styles.sectionTitle}>이렇게 찾아보세요</Text>
              <Text style={styles.sectionHint}>한 번 눌러 바로 검색</Text>
            </View>
            <View style={styles.presetRow}>
              {DIRECT_PRESETS.map((q) => (
                <Pressable key={q} style={styles.presetChip} onPress={() => runSearch(q)}>
                  <Text style={styles.presetText} numberOfLines={1}>
                    {q}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* 안내 카드 */}
        {candidates.length === 0 && !extracting && !photoBusy && (
          <View style={styles.guideCard}>
            <Text style={styles.guideTitle}>
              {isPhoto ? '사진 한 장이면 충분해요' : isSearch ? '이름만 알 때는 이렇게' : '저장은 3초면 끝나요'}
            </Text>
            {(isPhoto
              ? [
                  ['인스타 캡처·스크린샷', '위치 태그나 가게 이름이 보이게'],
                  ['[사진·캡처 고르기]', 'AI 가 사진 속 상호·동네를 읽어요'],
                  ['후보 확인 후 [지도에 핀 꽂기]', '여러 곳이면 한 번에 저장'],
                ]
              : isSearch
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
                {meta && meta.multi
                  ? (meta.mode === 'photo' ? '사진에서 찾은 가게 ' : '설명글에서 찾은 가게 ') + candidates.length + '곳'
                  : (meta && meta.mode === 'search' ? '찾은 가게 ' : '추출된 장소 ') + candidates.length + '곳'}
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

            {/* v2.9 — Gemini 가 영상 속 말·자막을 읽어 찾은 경우의 한 줄 근거 */}
            {meta && meta.aiNote ? (
              <View style={styles.aiLine}>
                <Ionicons name="sparkles" size={12} color={colors.coralDark} />
                <Text style={styles.aiLineText} numberOfLines={2}>
                  {meta.aiNote}
                </Text>
              </View>
            ) : null}

            {/* 읽어온 제목 · 인스타처럼 못 읽은 경우의 원탭 안내 (v1.2) */}
            <ExtractedTitleNote
              title={meta && meta.mode === 'link' ? meta.sourceTitle : ''}
              notice={meta && meta.mode === 'link' ? meta.titleNotice : ''}
              onSearchByName={() => switchToSearch(meta && meta.suggestedQuery)}
            />

            {/*
              v2.20.2 — 상훈 님 요청: "저 국수그림 나오는 큰 영역 … 없다면 그냥 미노출하는건 어떨까"
              실제 사진(유튜브 영상 썸네일 · 사진으로 찾기에서 올린 사진)이 **있을 때만** 큰 배너를 그립니다.
              가게명 직접 검색처럼 사진이 없는 결과에서는 베이지 타일 + 큰 분류 이모지(🍜)만 남던
              빈 배너 자리를 아예 렌더링하지 않아, 결과 목록이 화면 위쪽부터 바로 시작합니다.
            */}
            {!!heroThumbnail && (
              <View style={styles.heroCard}>
                <Image
                  source={{ uri: heroThumbnail }}
                  style={styles.heroImage}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
                <View style={styles.heroScrim} pointerEvents="none" />
                <View style={[styles.heroOverlay, styles.heroOverlayOnPhoto]}>
                  <Text style={styles.heroName} numberOfLines={1}>
                    {heroCandidate ? heroCandidate.name : '저장할 곳을 골라 주세요'}
                  </Text>
                  {heroCandidate ? <ProviderBadges item={heroCandidate} size="sm" style={styles.heroBadges} /> : null}
                </View>
              </View>
            )}

            {/* v2.0 — 전체 선택 토글 + 선택 개수 */}
            <View style={styles.selectRow}>
              <Pressable
                style={styles.selectAllBtn}
                onPress={toggleAll}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: allSelected }}
                accessibilityLabel={allSelected ? '전체 해제' : '전체 선택'}
              >
                <View style={[styles.checkbox, allSelected && styles.checkboxOn]}>
                  {allSelected ? <Ionicons name="checkmark" size={12} color={colors.white} /> : null}
                </View>
                <Text style={styles.selectAllText}>{allSelected ? '전체 해제' : '전체 선택'}</Text>
              </Pressable>
              <Text style={styles.selectCount}>선택 {selectedCandidates.length}곳</Text>
            </View>

            {candidates.map((c, i) => {
              const on = selectedIds.indexOf(c.id) >= 0;
              return (
                <Pressable
                  key={c.id}
                  style={[styles.candCard, on && styles.candCardOn]}
                  onPress={() => toggleSelected(c.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={c.name + ' 선택'}
                >
                  <View style={[styles.checkbox, on && styles.checkboxOn]}>
                    {on ? <Ionicons name="checkmark" size={12} color={colors.white} /> : null}
                  </View>
                  <View style={[styles.candTile, { backgroundColor: TILE_BG[i % TILE_BG.length] }]}>
                    <Text style={styles.candEmoji}>{EMOJI_BY_CATEGORY[c.category] || '📍'}</Text>
                  </View>
                  <View style={styles.candTextWrap}>
                    <Text style={styles.candName} numberOfLines={1}>
                      {i + 1}. {c.name}
                    </Text>
                    <View style={styles.candMetaRow}>
                      <ProviderBadges item={c} size="sm" />
                      {/* v2.4 — 이 후보의 분류 색 (지도 핀·분류 칩과 같은 색) */}
                      <View
                        style={[styles.candCatDot, { backgroundColor: getCategoryColor(c.category, categories) }]}
                      />
                      <Text style={styles.candAddr} numberOfLines={1}>
                        {c.address} · {mapLegacyCategory(c.category)}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}

            {meta && meta.unmatched && meta.unmatched.length > 0 ? (
              <Text style={styles.unmatchedNote}>
                못 찾은 항목: {meta.unmatched.map((u) => u.label || u.name).join(' · ')}
              </Text>
            ) : null}

            {meta && String(meta.usedAdapter || '').indexOf('offline') === 0 && (
              <Text style={styles.adapterNote}>
                오프라인 추출기로 찾은 후보예요. API 키를 연결하면 실제 가게·좌표로 정확도가 올라갑니다.
              </Text>
            )}

            {/* v2.2 — 저장 전에 분류를 직접 고르거나, 새 분류를 그 자리에서 만듭니다 */}
            <View style={styles.categoryCard}>
              <CategoryPicker
                value={saveCategory}
                onChange={pickCategory}
                categories={categories}
                onAddCategory={onAddCategory}
                label={'저장할 분류'}
                hint={
                  categoryTouched
                    ? '고른 분류로 저장해요'
                    : '자동 분류: ' + autoCategory + ' · 다른 칩을 누르면 바뀝니다'
                }
              />
            </View>

            {/* v2.10 — 📝 저장 전에 한줄 메모를 미리 적어 둡니다 (입력하지 않아도 저장됩니다)
                v2.20 — AI 가 읽은 추천 메뉴·주차·아기/웨이팅으로 **자동으로 채워** 둡니다.
                        그대로 [저장]만 눌러도 되고, 한 글자 고쳐도 됩니다. */}
            {memoAutoFilled && !!memo.trim() && (
              <View style={styles.memoAutoLine} testID="paste-memo-auto-line">
                <Ionicons name="sparkles" size={12} color={colors.coralDark} />
                <Text style={styles.memoAutoText} numberOfLines={2}>
                  AI가 한줄 메모 초안을 채웠어요 · 그대로 저장해도 되고, 고쳐도 돼요
                </Text>
              </View>
            )}
            <View style={styles.memoCard}>
              <View style={styles.memoHead}>
                <Ionicons
                  name={memoAutoFilled ? 'sparkles-outline' : 'create-outline'}
                  size={13}
                  color={colors.coralDark}
                />
                <Text style={styles.memoLabel}>한줄 메모</Text>
                <Text style={styles.memoHint}>
                  {memo.trim() ? memo.trim().length + '/120' : '선택 입력'}
                </Text>
              </View>
              <TextInput
                style={styles.memoInput}
                value={memo}
                onChangeText={(text) => {
                  setMemo(text);
                  // 사용자가 직접 고친 뒤에는 'AI 초안' 안내를 끕니다.
                  if (memoAutoFilled) setMemoAutoFilled(false);
                }}
                placeholder="추천 메뉴, 아기의자, 웨이팅 팁 등을 적어두세요"
                placeholderTextColor={colors.textMuted}
                maxLength={120}
                returnKeyType="done"
                accessibilityLabel="한줄 메모 (선택)"
                testID="paste-memo-input"
              />
            </View>

            <Pressable
              style={[styles.primaryBtn, styles.saveBtn, !selectedCandidates.length && styles.saveBtnOff]}
              onPress={savePins}
              disabled={!selectedCandidates.length}
              accessibilityRole="button"
              testID="paste-save-button"
            >
              <Ionicons name="location" size={16} color={colors.white} />
              <Text style={styles.primaryBtnText}>
                {selectedCandidates.length > 1
                  ? '선택한 ' + selectedCandidates.length + '곳 한 번에 저장'
                  : '선택한 ' + selectedCandidates.length + '곳 저장'}
              </Text>
            </Pressable>

            <Pressable style={styles.againBtn} onPress={runPrimary}>
              <Text style={styles.againText}>
                {isPhoto ? '다른 사진으로 찾기' : isSearch ? '다시 찾기' : '다시 추출하기'}
              </Text>
            </Pressable>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>{'저장된 장소 ' + pinCount + '곳'}</Text>
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
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    // 다크 헤더 바로 아래에서 첫 항목이 붙어 보이지 않게 살짝 띄웁니다.
    paddingTop: 12,
    // v2.18 — 플로팅 탭바(70px) 아래로 마지막 안내·저장 버튼이 가리지 않게 여유를 둡니다.
    paddingBottom: 36 + tabBar.floatTop,
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
  // v2.14 — 3탭(릴스·사진·가게명)을 390px 한 줄에 넣기 위한 조금 작은 라벨
  modeTextTight: {
    fontSize: 11.5,
    letterSpacing: -0.2,
  },
  // v2.14 — 📸 사진으로 찾기 탭: 점선 업로드 카드 (카드를 눌러도 사진 고르기가 열립니다)
  photoDrop: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.coralSoft2,
    borderStyle: 'dashed',
    paddingHorizontal: 18,
    paddingVertical: 22,
    gap: 6,
  },
  photoDropBusy: {
    borderColor: colors.coral,
    backgroundColor: colors.coralSoft,
  },
  photoDropIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  photoDropEmoji: {
    fontSize: 26,
  },
  photoDropTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  photoDropDesc: {
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.textSub,
    textAlign: 'center',
  },
  photoDropHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  photoDropHint: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textMuted,
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
  aiLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.coralSoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 10,
  },
  aiLineText: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.coralDark,
  },
  heroCard: {
    height: 132,
    borderRadius: radius.lg,
    backgroundColor: '#E9E4DE',
    overflow: 'hidden',
    marginBottom: 12,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  /** 사진 아래쪽을 살짝 어둡게 — 흰 라벨 칩이 어떤 사진 위에서도 도드라지게 */
  heroScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 62,
    backgroundColor: 'rgba(20, 16, 12, 0.28)',
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
  heroOverlayOnPhoto: {
    ...cardShadow,
  },
  heroName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  heroBadges: {
    marginTop: 5,
  },
  candCatDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
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
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 4,
    paddingRight: 8,
  },
  selectAllText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.textSub,
  },
  selectCount: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.coralDark,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#D8D8E0',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    borderColor: colors.coral,
    backgroundColor: colors.coral,
  },
  unmatchedNote: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSub,
    marginTop: 2,
    marginBottom: 4,
  },
  saveBtnOff: {
    opacity: 0.5,
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
  categoryCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  saveBtn: {
    flexDirection: 'row',
    gap: 7,
  },
  // v2.10 — 📝 저장 전 한줄 메모 (선택)
  // v2.20 — AI 초안 안내 줄 (한줄 메모 카드 바로 위)
  memoAutoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF3EE',
    borderRadius: radius.sm,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginTop: 4,
  },
  memoAutoText: {
    flex: 1,
    fontSize: 11,
    color: colors.coralDark,
    fontWeight: '600',
  },
  memoCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 11,
    paddingTop: 9,
    paddingBottom: 10,
    marginTop: 4,
    marginBottom: 6,
  },
  memoHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  memoLabel: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.coralDark,
  },
  memoHint: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  memoInput: {
    marginTop: 6,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.text,
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
