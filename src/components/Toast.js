import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

/** 화면 하단에 잠깐 떠오르는 알림 (Alert 대신 — 웹에서도 동일하게 보임) */
export default function Toast({ message, tone = 'dark' }) {
  if (!message) return null;
  const isPro = tone === 'pro';
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={[styles.pill, isPro && styles.pillPro]}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 96,
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 50,
  },
  pill: {
    backgroundColor: 'rgba(17,24,39,0.94)',
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 999,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  pillPro: {
    backgroundColor: colors.coral,
  },
  text: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
