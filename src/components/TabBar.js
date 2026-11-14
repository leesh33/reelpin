import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '../theme';

const TABS = [
  { key: 'map', label: '지도', icon: 'map-outline', iconOn: 'map' },
  { key: 'paste', label: '저장', icon: 'add-circle-outline', iconOn: 'add-circle' },
  { key: 'profile', label: '내 정보', icon: 'person-outline', iconOn: 'person' },
];

export default function TabBar({ active, onChange }) {
  return (
    <View style={styles.wrap}>
      {TABS.map((tab) => {
        const on = active === tab.key;
        const isCenter = tab.key === 'paste';
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={styles.item}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: on }}
          >
            {isCenter ? (
              <View style={[styles.centerIcon, on && styles.centerIconOn]}>
                <Ionicons name={on ? 'add' : 'add'} size={24} color={colors.white} />
              </View>
            ) : (
              <Ionicons
                name={on ? tab.iconOn : tab.icon}
                size={22}
                color={on ? colors.coral : colors.textMuted}
              />
            )}
            <Text style={[styles.label, on && styles.labelOn, isCenter && styles.labelCenter]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 18 : 10,
    paddingHorizontal: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 3,
  },
  label: {
    ...typography.tiny,
    color: colors.textMuted,
    fontSize: 11,
  },
  labelOn: {
    color: colors.coral,
    fontWeight: '700',
  },
  labelCenter: {
    color: colors.textMuted,
  },
  centerIcon: {
    width: 38,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text,
  },
  centerIconOn: {
    backgroundColor: colors.coral,
  },
});
