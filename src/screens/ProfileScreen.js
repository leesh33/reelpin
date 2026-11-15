import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { FREE_PIN_LIMIT } from '../data/seedPins';
import { buildShareUrl, canNativeShare, nativeShare, shareMessage } from '../utils/shareMap';
import { OAUTH_PROVIDERS } from '../services/cloudSync';
import { SUPABASE_SETUP_HINT } from '../services/supabase';
import {
  CATEGORY_MAX_LENGTH,
  allCategories,
  getCategoryColor,
  isDefaultCategory,
  pinsInCategory,
} from '../utils/categories';
import { cardShadow, colors, radius, typography } from '../theme';

const RADIUS_OPTIONS = [
  { value: 300, label: '300m', hint: '골목 단위' },
  { value: 500, label: '500m', hint: '동네 한 바퀴' },
  { value: 1000, label: '1km', hint: '여행지에서' },
];

const PRO_FEATURES = [
  '핀 저장 무제한 (무료는 월 10건)',
  '전 지역 · 반경 300m / 500m / 1km 알림',
  '친구와 함께 쓰는 공동 편집 지도',
];

/**
 * v2.1 — 계정 · 클라우드 동기화 카드.
 *
 *   · 비로그인: 이메일/비밀번호 로그인·회원가입 전환 + 매직링크 + 소셜(카카오·구글·Apple)
 *   · 로그인  : 이메일 · `클라우드 동기화 켜짐 · N개 저장됨` · [지금 동기화] · [로그아웃]
 *   · Supabase 설정이 없으면 입력은 그대로 보이되, 누르면 안내 토스트만 뜨고 아무 것도 보내지 않습니다.
 */
function AccountCard({
  cloudConfigured,
  cloudUser,
  cloudPinCount,
  cloudBusy,
  cloudSyncing,
  cloudMessage,
  onSignIn,
  onSignUp,
  onMagicLink,
  onOAuth,
  onSignOut,
  onSyncNow,
  onToast,
}) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signedIn = !!(cloudUser && (cloudUser.email || cloudUser.id));
  const busy = !!cloudBusy;
  const toast = (m) => onToast && onToast(m);

  const guardOffline = () => {
    if (cloudConfigured) return false;
    toast('Supabase 설정이 아직 없어요 — 지금은 기기에만 저장됩니다');
    return true;
  };

  const submit = () => {
    if (busy) return;
    if (guardOffline()) return;
    if (!email.trim()) {
      toast('이메일을 먼저 적어 주세요');
      return;
    }
    if (!password) {
      toast('비밀번호를 적어 주세요');
      return;
    }
    const fn = mode === 'signup' ? onSignUp : onSignIn;
    if (fn) fn(email.trim(), password);
  };

  const magic = () => {
    if (busy) return;
    if (guardOffline()) return;
    if (!email.trim()) {
      toast('매직링크를 받을 이메일을 적어 주세요');
      return;
    }
    if (onMagicLink) onMagicLink(email.trim());
  };

  const social = (provider) => {
    if (busy) return;
    if (guardOffline()) return;
    if (onOAuth) onOAuth(provider);
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>계정 · 클라우드 동기화</Text>
        <View style={[styles.syncChip, signedIn && styles.syncChipOn]}>
          <Ionicons
            name={signedIn ? 'cloud-done' : 'cloud-offline-outline'}
            size={11}
            color={signedIn ? colors.coralDark : colors.textMuted}
          />
          <Text style={[styles.syncChipText, signedIn && styles.syncChipTextOn]}>
            {signedIn ? '켜짐' : '꺼짐'}
          </Text>
        </View>
      </View>

      {signedIn ? (
        <>
          <View style={styles.accountRow}>
            <View style={styles.accountAvatar}>
              <Ionicons name="person" size={16} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountEmail} numberOfLines={1}>
                {cloudUser.email || '로그인됨'}
              </Text>
              <Text style={styles.accountSub}>
                클라우드 동기화 켜짐 · {cloudPinCount || 0}개 저장됨
              </Text>
            </View>
          </View>
          <View style={styles.accountBtnRow}>
            <Pressable
              style={[styles.syncBtn, cloudSyncing && styles.syncBtnBusy]}
              onPress={() => !cloudSyncing && onSyncNow && onSyncNow()}
              accessibilityRole="button"
            >
              {cloudSyncing ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="sync" size={14} color={colors.white} />
              )}
              <Text style={styles.syncBtnText}>{cloudSyncing ? '동기화 중…' : '지금 동기화'}</Text>
            </Pressable>
            <Pressable
              style={styles.signOutBtn}
              onPress={() => !busy && onSignOut && onSignOut()}
              accessibilityRole="button"
            >
              <Text style={styles.signOutBtnText}>{busy ? '로그아웃 중…' : '로그아웃'}</Text>
            </Pressable>
          </View>
          <Text style={styles.cardHint}>
            다른 기기에서 저장한 핀도 로그인하면 이 지도에 합쳐져요. 기기에 저장된 핀은 로그아웃해도 그대로 남습니다.
          </Text>
        </>
      ) : (
        <>
          <View style={styles.authToggle}>
            {['signin', 'signup'].map((key) => {
              const on = mode === key;
              return (
                <Pressable
                  key={key}
                  style={[styles.authToggleItem, on && styles.authToggleItemOn]}
                  onPress={() => setMode(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.authToggleText, on && styles.authToggleTextOn]}>
                    {key === 'signin' ? '로그인' : '회원가입'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="이메일 (you@example.com)"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            editable={!busy}
            accessibilityLabel="이메일"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={mode === 'signup' ? '비밀번호 (6자 이상)' : '비밀번호'}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            onSubmitEditing={submit}
            accessibilityLabel="비밀번호"
          />

          <Pressable
            style={[styles.authPrimary, busy && styles.authPrimaryBusy]}
            onPress={submit}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.authPrimaryText}>{mode === 'signup' ? '회원가입' : '로그인'}</Text>
            )}
          </Pressable>

          <Pressable onPress={magic} hitSlop={6} accessibilityRole="button">
            <Text style={styles.magicLink}>비밀번호 없이 매직링크(이메일 인증 링크) 받기</Text>
          </Pressable>

          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>또는</Text>
            <View style={styles.orLine} />
          </View>

          <View style={styles.socialRow}>
            {OAUTH_PROVIDERS.map((p) => (
              <Pressable
                key={p.id}
                style={[styles.socialBtn, { backgroundColor: p.color }]}
                onPress={() => social(p.id)}
                accessibilityRole="button"
                accessibilityLabel={p.label + ' 로 로그인'}
              >
                <Ionicons
                  name={p.icon}
                  size={15}
                  color={p.id === 'kakao' ? colors.kakaoText : p.id === 'apple' ? colors.white : colors.textSub}
                />
                <Text
                  style={[
                    styles.socialLabel,
                    p.id === 'kakao' && { color: colors.kakaoText },
                    p.id === 'apple' && { color: colors.white },
                  ]}
                >
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.cardHint}>
            {cloudConfigured
              ? '로그인하면 핀이 클라우드에 저장돼 아이폰·아이패드 어디서든 같은 지도를 봅니다. 비밀번호는 앱에 저장하지 않아요.'
              : SUPABASE_SETUP_HINT}
          </Text>
        </>
      )}

      {cloudMessage ? <Text style={styles.cloudMessage}>{cloudMessage}</Text> : null}
    </View>
  );
}

/**
 * v2.2 — 분류 관리 카드 (만들기 · 이름 바꾸기 · 지우기)
 *
 *   · 기본 3개(맛집·카페·가볼곳)는 **자물쇠**로 표시하고 지우기·수정 버튼을 주지 않습니다
 *   · 커스텀 분류는 [수정] → 이름 입력 → [저장] / [삭제] → 한 번 더 확인 → 핀을 맛집으로 옮김
 *   · 이름 검사·핀 일괄 반영은 상위(App)의 핸들러가 하고, 여기서는 돌려받은 안내를 그대로 보여 줍니다
 */
function CategoryManager({
  categories,
  pins,
  onAddCategory,
  onRenameCategory,
  onRemoveCategory,
  onToast,
}) {
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState('');
  const [confirming, setConfirming] = useState(null);

  const list = allCategories(categories);
  const countOf = (category) => pinsInCategory(pins, category).length;

  const submitAdd = () => {
    if (typeof onAddCategory !== 'function') return;
    const result = onAddCategory(newName);
    if (!result || !result.ok) {
      setAddError((result && result.message) || '분류를 추가하지 못했어요');
      return;
    }
    setNewName('');
    setAddError('');
  };

  const startEdit = (category) => {
    setConfirming(null);
    setEditing(category);
    setEditValue(category);
    setEditError('');
  };

  const submitEdit = () => {
    if (!editing || typeof onRenameCategory !== 'function') return;
    const result = onRenameCategory(editing, editValue);
    if (!result || !result.ok) {
      setEditError((result && result.message) || '이름을 바꾸지 못했어요');
      return;
    }
    setEditing(null);
    setEditValue('');
    setEditError('');
  };

  const removeConfirmed = (category) => {
    if (typeof onRemoveCategory !== 'function') return;
    const result = onRemoveCategory(category);
    if (!result || !result.ok) {
      if (onToast && result && result.message) onToast(result.message);
      return;
    }
    setConfirming(null);
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>분류 관리</Text>
        <View style={styles.catCountChip}>
          <Text style={styles.catCountChipText}>{list.length}개</Text>
        </View>
      </View>
      <Text style={styles.cardHint}>
        지도 필터와 저장할 때 쓰는 분류예요. 기본 3개는 잠겨 있고, 내가 만든 분류는 이름을 바꾸거나 지울 수 있어요.
      </Text>

      {list.map((category) => {
        const isDefault = isDefaultCategory(category);
        const count = countOf(category);
        if (!isDefault && editing === category) {
          return (
            <View key={category} style={styles.catEditBox}>
              <View style={styles.catRowTop}>
                <TextInput
                  style={styles.catInput}
                  value={editValue}
                  onChangeText={(t) => {
                    setEditValue(t);
                    setEditError('');
                  }}
                  maxLength={CATEGORY_MAX_LENGTH}
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={submitEdit}
                  accessibilityLabel={'분류 이름 수정 ' + category}
                />
                <Pressable
                  style={styles.catSaveBtn}
                  onPress={submitEdit}
                  accessibilityRole="button"
                  accessibilityLabel={category + ' 이름 저장'}
                >
                  <Text style={styles.catSaveText}>저장</Text>
                </Pressable>
                <Pressable
                  style={styles.catCancelBtn}
                  onPress={() => {
                    setEditing(null);
                    setEditValue('');
                    setEditError('');
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.catCancelText}>취소</Text>
                </Pressable>
              </View>
              {!!editError && <Text style={styles.catError}>{editError}</Text>}
            </View>
          );
        }
        return (
          <View key={category}>
            <View style={styles.catRow}>
              <View
                style={[styles.catDot, { backgroundColor: getCategoryColor(category, list) }]}
                testID={'category-dot-' + category}
              />
              <Text style={styles.catName} numberOfLines={1}>
                {category}
              </Text>
              <Text style={styles.catPinCount}>{'핀 ' + count + '개'}</Text>
              {isDefault ? (
                <View style={styles.catLock}>
                  <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
                  <Text style={styles.catLockText}>기본</Text>
                </View>
              ) : (
                <View style={styles.catActions}>
                  <Pressable
                    style={styles.catActionBtn}
                    onPress={() => startEdit(category)}
                    accessibilityRole="button"
                    accessibilityLabel={category + ' 이름 수정'}
                  >
                    <Text style={styles.catActionText}>수정</Text>
                  </Pressable>
                  <Pressable
                    style={styles.catActionBtn}
                    onPress={() => setConfirming(confirming === category ? null : category)}
                    accessibilityRole="button"
                    accessibilityLabel={category + ' 삭제'}
                  >
                    <Text style={[styles.catActionText, styles.catDeleteText]}>삭제</Text>
                  </Pressable>
                </View>
              )}
            </View>
            {confirming === category && (
              <View style={styles.catConfirm}>
                <Ionicons name="alert-circle" size={13} color={colors.coralDark} />
                <Text style={styles.catConfirmText}>
                  {count > 0
                    ? '지울까요? 핀 ' + count + '개는 맛집으로 옮겨요'
                    : '지울까요? 이 분류를 쓰는 핀은 없어요'}
                </Text>
                <Pressable
                  style={styles.catConfirmBtn}
                  onPress={() => removeConfirmed(category)}
                  accessibilityRole="button"
                  accessibilityLabel={category + ' 삭제 확인'}
                >
                  <Text style={styles.catConfirmBtnText}>삭제</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}

      <View style={styles.catAddRow}>
        <TextInput
          style={styles.catInput}
          value={newName}
          onChangeText={(t) => {
            setNewName(t);
            setAddError('');
          }}
          placeholder="새 분류 이름 (예: 아이랑)"
          placeholderTextColor={colors.textMuted}
          maxLength={CATEGORY_MAX_LENGTH}
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={submitAdd}
          accessibilityLabel="새 분류 이름"
        />
        <Pressable
          style={styles.catAddBtn}
          onPress={submitAdd}
          accessibilityRole="button"
          accessibilityLabel="새 분류 추가"
        >
          <Ionicons name="add" size={13} color={colors.white} />
          <Text style={styles.catAddText}>추가</Text>
        </Pressable>
      </View>
      {!!addError && <Text style={styles.catError}>{addError}</Text>}
    </View>
  );
}

export default function ProfileScreen({
  name,
  handle,
  pins,
  categories,
  onAddCategory,
  onRenameCategory,
  onRemoveCategory,
  radiusMeters,
  onChangeRadius,
  isPro,
  onStartPro,
  onGoPaste,
  onToast,
  cloudConfigured,
  cloudUser,
  cloudPinCount,
  cloudBusy,
  cloudSyncing,
  cloudMessage,
  onSignIn,
  onSignUp,
  onMagicLink,
  onOAuth,
  onSignOut,
  onSyncNow,
}) {
  const [copied, setCopied] = useState(false);
  const count = pins.length;
  const limit = isPro ? 0 : FREE_PIN_LIMIT;
  const ratio = isPro ? 1 : Math.min(1, count / FREE_PIN_LIMIT);

  const shareMap = async () => {
    if (!pins.length) {
      onToast('공유할 핀이 아직 없어요');
      return;
    }
    // v2.0 — 핀을 압축·Base64URL 로 담은 `?share=` 링크 (서버 DB 없이 동작)
    const url = buildShareUrl(pins);
    const text = shareMessage(pins);
    if (canNativeShare()) {
      const result = await nativeShare(url, { title: text, text });
      if (result.shared) {
        onToast('공유 시트를 열었어요');
        return;
      }
      if (result.cancelled) return;
    }
    try {
      await Clipboard.setStringAsync(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      onToast('내 지도 공유 링크를 복사했어요 · ' + text);
    } catch (e) {
      onToast('복사에 실패했어요. 다시 시도해 주세요');
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>내 정보</Text>
        <Text style={styles.headerCount}>{count}개 저장됨</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 프로필 카드 */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{name ? name.slice(0, 1) : '나'}</Text>
          </View>
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{name || '사용자'}</Text>
            <Text style={styles.profileHandle}>@{handle} · {isPro ? '프로 플랜' : '무료 플랜'}</Text>
          </View>
          <View style={[styles.planChip, isPro && styles.planChipPro]}>
            <Ionicons
              name={isPro ? 'sparkles' : 'leaf-outline'}
              size={12}
              color={isPro ? colors.white : colors.textSub}
            />
            <Text style={[styles.planChipText, isPro && styles.planChipTextPro]}>
              {isPro ? 'PRO' : 'FREE'}
            </Text>
          </View>
        </View>

        {/* 계정 · 클라우드 동기화 (v2.1) — v2.1.3 에서 '내 정보' 맨 아래로 이동 */}

        {/* 저장한 핀 카운터 */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>저장한 핀</Text>
            <Pressable onPress={onGoPaste} hitSlop={8}>
              <Text style={styles.linkText}>+ 핀 추가</Text>
            </Pressable>
          </View>
          <View style={styles.counterRow}>
            <Text style={styles.counterValue}>{count}</Text>
            <Text style={styles.counterLimit}>{isPro ? '/ 무제한' : `/ ${FREE_PIN_LIMIT} 무료`}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: Math.round(ratio * 100) + '%' }]} />
          </View>
          <Text style={styles.cardHint}>
            {isPro
              ? '프로 플랜이라 저장 개수 제한이 없어요.'
              : count >= FREE_PIN_LIMIT
              ? '무료 한도를 다 채웠어요. 프로로 전환하면 계속 저장할 수 있어요.'
              : `무료로 ${FREE_PIN_LIMIT - count}건 더 저장할 수 있어요.`}
          </Text>
        </View>

        {/* v2.2 — 분류 관리 (만들기 · 이름 바꾸기 · 지우기) */}
        <CategoryManager
          categories={categories}
          pins={pins}
          onAddCategory={onAddCategory}
          onRenameCategory={onRenameCategory}
          onRemoveCategory={onRemoveCategory}
          onToast={onToast}
        />

        {/* 지도 공유 */}
        <Pressable style={styles.shareCard} onPress={shareMap} accessibilityRole="button">
          <View style={styles.shareIcon}>
            <Ionicons name={copied ? 'checkmark' : 'share-social'} size={18} color={colors.coral} />
          </View>
          <View style={styles.shareText}>
            <Text style={styles.shareTitle}>{copied ? '링크를 복사했어요!' : '내 지도 공유하기'}</Text>
            <Text style={styles.shareSub}>
              {count}곳을 담은 링크 하나로 건네줘요 · 받는 사람은 바로 지도로 열립니다
            </Text>
          </View>
          <Ionicons name="copy-outline" size={17} color={colors.textMuted} />
        </Pressable>

        {/* 지오펜스 반경 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>지오펜스 알림 반경</Text>
          <Text style={styles.cardHint}>
            저장한 곳 반경 {radiusMeters >= 1000 ? '1km' : radiusMeters + 'm'} 안에 들어가면 알려드려요.
          </Text>
          <View style={styles.segment}>
            {RADIUS_OPTIONS.map((opt) => {
              const on = radiusMeters === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.segmentItem, on && styles.segmentItemOn]}
                  onPress={() => onChangeRadius(opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.segmentLabel, on && styles.segmentLabelOn]}>{opt.label}</Text>
                  <Text style={[styles.segmentHint, on && styles.segmentHintOn]}>{opt.hint}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.noticeRow}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.noticeText}>
              iOS는 앱당 감시 가능한 구역이 20개라, 가까운 핀 20개만 등록하고 회전합니다.
            </Text>
          </View>
        </View>

        {/* 프로 안내 */}
        <View style={styles.proCard}>
          <View style={styles.proHead}>
            <View style={styles.proBadge}>
              <Ionicons name="sparkles" size={12} color={colors.navy} />
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
            <Text style={styles.proTitle}>릴스핀 프로</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.price}>월 2,900원</Text>
            <Text style={styles.priceSub}>연 24,900원 (28% 할인)</Text>
          </View>
          {PRO_FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Ionicons name="checkmark" size={15} color={colors.coral} />
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
          <Pressable
            style={[styles.proBtn, isPro && styles.proBtnOn]}
            onPress={onStartPro}
            accessibilityRole="button"
          >
            <Text style={styles.proBtnText}>{isPro ? '프로 플랜 사용 중' : '프로 시작하기'}</Text>
          </Pressable>
        </View>

        {/* 앱 정보 */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>앱 버전</Text>
            <Text style={styles.infoValue}>릴스핀 v2.7.0</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>번들 ID</Text>
            <Text style={styles.infoValue}>com.odol.reelpin</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>데이터 저장</Text>
            <Text style={styles.infoValue}>
              {cloudUser && (cloudUser.email || cloudUser.id) ? '기기 + 클라우드(Supabase)' : '기기 내부 (AsyncStorage)'}
            </Text>
          </View>
        </View>

        {/* 계정 · 클라우드 동기화 (v2.1) — 자주 쓰는 설정이 먼저 보이도록 맨 아래에 둡니다 */}
        <AccountCard
          cloudConfigured={cloudConfigured}
          cloudUser={cloudUser}
          cloudPinCount={cloudPinCount}
          cloudBusy={cloudBusy}
          cloudSyncing={cloudSyncing}
          cloudMessage={cloudMessage}
          onSignIn={onSignIn}
          onSignUp={onSignUp}
          onMagicLink={onMagicLink}
          onOAuth={onOAuth}
          onSignOut={onSignOut}
          onSyncNow={onSyncNow}
          onToast={onToast}
        />

        <Text style={styles.footer}>기획 이상훈 · 개발 오돌</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
  },
  title: { ...typography.h1, fontSize: 24 },
  headerBadge: {
    backgroundColor: colors.coralSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  headerCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  headerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.coralDark,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 12,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    ...cardShadow,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
  },
  profileText: { flex: 1 },
  profileName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  profileHandle: {
    ...typography.sub,
    fontSize: 12,
    marginTop: 3,
  },
  planChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.lineSoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  planChipPro: {
    backgroundColor: colors.coral,
  },
  planChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSub,
  },
  planChipTextPro: {
    color: colors.white,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
    ...cardShadow,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: { ...typography.h3 },
  linkText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.coral,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  counterValue: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
  },
  counterLimit: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.lineSoft,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.coral,
  },
  cardHint: {
    fontSize: 12,
    color: colors.textSub,
    lineHeight: 17,
  },
  // ── v2.2 분류 관리 카드 ──────────────────────
  catCountChip: {
    backgroundColor: colors.coralSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  catCountChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.coralDark,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  catDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  catName: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.text,
  },
  catPinCount: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  catLock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.lineSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  catLockText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.textMuted,
  },
  catActions: {
    flexDirection: 'row',
    gap: 4,
  },
  catActionBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.lineSoft,
  },
  catActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSub,
  },
  catDeleteText: {
    color: colors.coralDark,
  },
  catEditBox: {
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  catRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  catInput: {
    flex: 1,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  catSaveBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catSaveText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.white,
  },
  catCancelBtn: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catCancelText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.textSub,
  },
  catConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 9,
    paddingVertical: 7,
    marginBottom: 6,
  },
  catConfirmText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: colors.coralDark,
  },
  catConfirmBtn: {
    height: 28,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catConfirmBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
  },
  catAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  catAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 38,
    paddingHorizontal: 13,
    borderRadius: radius.sm,
    backgroundColor: colors.navy,
  },
  catAddText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.white,
  },
  catError: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.coralDark,
    marginTop: 5,
  },
  // ── v2.1 계정 · 클라우드 동기화 카드 ──────────────────────
  syncChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.mutedBadge,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  syncChipOn: {
    backgroundColor: colors.coralSoft,
  },
  syncChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.mutedBadgeText,
  },
  syncChipTextOn: {
    color: colors.coralDark,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 12,
  },
  accountAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountEmail: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  accountSub: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSub,
    marginTop: 2,
  },
  accountBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  syncBtn: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.coral,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  syncBtnBusy: {
    backgroundColor: colors.coralSoft2,
  },
  syncBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.white,
  },
  signOutBtn: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSub,
  },
  authToggle: {
    flexDirection: 'row',
    backgroundColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  authToggleItem: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  authToggleItemOn: {
    backgroundColor: colors.card,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  authToggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
  },
  authToggleTextOn: {
    color: colors.text,
  },
  input: {
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  authPrimary: {
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authPrimaryBusy: {
    backgroundColor: colors.navyCard,
  },
  authPrimaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  magicLink: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.coral,
    textAlign: 'center',
    paddingVertical: 2,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
  orText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 8,
  },
  socialBtn: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  socialLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSub,
  },
  cloudMessage: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.coralDark,
    lineHeight: 16,
  },
  segment: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentItem: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  segmentItemOn: {
    borderColor: colors.coral,
    backgroundColor: colors.coralSoft,
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textSub,
  },
  segmentLabelOn: {
    color: colors.coralDark,
  },
  segmentHint: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  segmentHintOn: {
    color: colors.coralDark,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  noticeText: {
    flex: 1,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
  },
  proCard: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: 18,
    gap: 9,
    shadowColor: '#0F172A',
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  proHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.coral,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  proBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.white,
  },
  proTitle: {
    ...typography.h3,
    color: colors.white,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  price: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.5,
  },
  priceSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8FA0BC',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  featureText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D5DCEA',
    flex: 1,
  },
  proBtn: {
    marginTop: 4,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proBtnOn: {
    backgroundColor: '#2A3B5A',
  },
  proBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  shareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 14,
    ...cardShadow,
  },
  shareIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareText: { flex: 1 },
  shareTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  shareSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 6,
    ...cardShadow,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  infoKey: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSub,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  infoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
  },
});
