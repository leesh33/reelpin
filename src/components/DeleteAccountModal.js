/**
 * src/components/DeleteAccountModal.js — 🗑️ 회원탈퇴(계정 삭제) 2단계 확인 (v2.40.0)
 * ─────────────────────────────────────────────────────────────
 * App Store 심사 지침 **5.1.1(v)** — 계정을 만들 수 있는 앱은 **앱 안에서 계정을 지울 수 있어야**
 * 합니다. `내 정보` › `회원탈퇴` 행을 누르면 이 확인 창이 뜹니다.
 *
 * 두 단계로 나눈 이유 — 되돌릴 수 없는 일이라 **한 번 더 읽고 누르게** 합니다.
 *   ① 경고 : 무엇이 지워지는지(계정·클라우드 핀·제보·공유 링크)를 숫자와 함께 보여 주고
 *            `취소` / `탈퇴 계속`
 *   ② 최종 : 마지막 확인 — `취소` / `탈퇴하기`(빨강). 누르면 실제로 지웁니다(`busy` 동안 잠금)
 *
 * 지우는 일 자체는 서버(Supabase `delete_my_account`)가 합니다 — 이 창은 **확인과 안내**만 맡고,
 * 결과 문구는 부모(App)가 토스트로 알려 줍니다. 실패하면 `error` 문구를 창 안에도 보여 줍니다.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from './AppText';
import { colors, radius } from '../theme';

export default function DeleteAccountModal({
  visible = false,
  email = '',
  pinCount = 0,
  busy = false,
  error = '',
  onCancel,
  onConfirm,
  // 검사용 — 'final' 로 열면 마지막 확인 단계부터 보입니다 (기본 'warn')
  initialStep = 'warn',
}) {
  // 'warn' = 첫 경고 · 'final' = 마지막 확인
  const [step, setStep] = useState(initialStep === 'final' ? 'final' : 'warn');

  // 창을 닫으면 다음에 열 때는 항상 첫 경고부터
  useEffect(() => {
    if (!visible) setStep('warn');
  }, [visible]);

  if (!visible) return null;

  const close = () => {
    if (busy) return; // 탈퇴 요청 중에는 닫지 않습니다(중복 요청 방지)
    if (typeof onCancel === 'function') onCancel();
  };

  const final = step === 'final';
  const account = String(email || '').trim() || '로그인한 계정';

  return (
    <View style={styles.overlay} testID="delete-account-overlay">
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="회원탈퇴 창 닫기" />
      <View style={styles.card} testID="delete-account-modal">
        <View style={[styles.badge, final && styles.badgeDanger]}>
          <Ionicons name={final ? 'warning' : 'person-remove-outline'} size={20} color={final ? colors.white : '#B91C1C'} />
        </View>

        <Text style={styles.title} testID="delete-account-title">
          {final ? '정말 탈퇴할까요?' : '회원탈퇴'}
        </Text>

        {final ? (
          <>
            <Text style={styles.lead} testID="delete-account-step2">
              마지막 확인이에요. 탈퇴하면 같은 계정으로 다시 로그인할 수 없고, 지운 데이터는 되돌릴 수 없어요.
            </Text>
            <View style={styles.warnBox}>
              <Ionicons name="alert-circle" size={14} color="#B91C1C" style={styles.warnIcon} />
              {/* 긴 이메일이 상자 밖으로 넘치지 않게 계정은 자기 줄에서 말줄임(…) 처리 */}
              <View style={styles.warnBody}>
                <Text style={styles.warnText}>지금 탈퇴하면 아래 계정이 사라집니다.</Text>
                <Text style={styles.warnAccount} numberOfLines={1} testID="delete-account-final-email">
                  {account}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.lead} testID="delete-account-step1">
              탈퇴하면 계정과 클라우드에 저장한 데이터가 모두 지워져요. 되돌릴 수 없습니다.
            </Text>
            <View style={styles.list}>
              <Row icon="person-outline" label="계정" value={account} />
              <Row icon="pin-outline" label="클라우드에 저장한 핀" value={pinCount > 0 ? pinCount + '개' : '없음'} />
              <Row icon="chatbubble-ellipses-outline" label="제안 · 버그 제보" value="내 이메일로 남긴 글" />
              <Row icon="link-outline" label="공유한 컬렉션 링크" value="받는 사람도 못 엽니다" />
            </View>
            <View style={styles.noteRow}>
              <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
              <Text style={styles.note}>
                이 기기에 저장된 핀은 그대로 남아요. 필요하면 탈퇴 전에 내 지도 공유 링크로 백업해 두세요.
              </Text>
            </View>
          </>
        )}

        {error ? (
          <Text style={styles.error} testID="delete-account-error">
            {error}
          </Text>
        ) : null}

        <View style={styles.btnRow}>
          <Pressable
            style={[styles.btn, styles.btnGhost, busy && styles.btnDisabled]}
            onPress={close}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="회원탈퇴 취소"
            testID="delete-account-cancel"
          >
            <Text style={styles.btnGhostText}>취소</Text>
          </Pressable>

          {final ? (
            <Pressable
              style={[styles.btn, styles.btnDanger, busy && styles.btnDisabled]}
              onPress={() => !busy && typeof onConfirm === 'function' && onConfirm()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="회원탈퇴 실행"
              testID="delete-account-final"
            >
              {busy ? (
                <View style={styles.busyRow} testID="delete-account-busy">
                  <ActivityIndicator size="small" color={colors.white} />
                  <Text style={styles.btnDangerText}>탈퇴 중…</Text>
                </View>
              ) : (
                <Text style={styles.btnDangerText}>탈퇴하기</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[styles.btn, styles.btnContinue, busy && styles.btnDisabled]}
              onPress={() => !busy && setStep('final')}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="회원탈퇴 계속"
              testID="delete-account-continue"
            >
              <Text style={styles.btnContinueText}>탈퇴 계속</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

/** 경고 목록의 한 줄 — 아이콘 · 이름 · 값 */
function Row({ icon, label, value }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={14} color={colors.textSub} />
      {/* 라벨은 줄이지 않고(잘리면 무슨 항목인지 모름), 값만 남는 폭에서 말줄임 */}
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    // 내 정보 시트(45) · 제보 게시판(48) · 토스트(50) 위
    zIndex: 52,
    paddingHorizontal: 22,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.58)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.25,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  badgeDanger: { backgroundColor: '#DC2626' },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  lead: { marginTop: 8, fontSize: 13, lineHeight: 19, fontWeight: '500', color: colors.textSub },
  list: { marginTop: 14, backgroundColor: colors.bg, borderRadius: radius.md, paddingVertical: 4, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  rowLabel: { flexShrink: 0, fontSize: 12, fontWeight: '600', color: colors.textSub },
  rowValue: { flex: 1, minWidth: 0, textAlign: 'right', fontSize: 12, fontWeight: '600', color: colors.text },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12 },
  note: { flex: 1, fontSize: 11, lineHeight: 16, fontWeight: '500', color: colors.textMuted },
  warnBox: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warnIcon: { marginTop: 2 },
  warnBody: { flex: 1, minWidth: 0 },
  warnText: { fontSize: 12, lineHeight: 17, fontWeight: '700', color: '#B91C1C' },
  warnAccount: { marginTop: 2, fontSize: 12, lineHeight: 17, fontWeight: '800', color: '#B91C1C' },
  error: { marginTop: 12, fontSize: 12, lineHeight: 17, fontWeight: '600', color: '#B91C1C' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  btn: { flex: 1, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnGhost: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  btnGhostText: { fontSize: 14, fontWeight: '700', color: colors.textSub },
  btnContinue: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  btnContinueText: { fontSize: 14, fontWeight: '800', color: '#B91C1C' },
  btnDanger: { backgroundColor: '#DC2626' },
  btnDangerText: { fontSize: 14, fontWeight: '800', color: colors.white },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
