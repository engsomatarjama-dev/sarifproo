import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useThemeColors} from '../hooks/useThemeColors';

interface Props {
  title: string;
  statusLabel: string;
  description: string;
  enabled: boolean;
  accessibilityLabel: string;
  serviceLabel: string;
  blocked?: boolean;
  onToggle: () => void;
}

export const StatusCard = ({
  title,
  statusLabel,
  description,
  enabled,
  accessibilityLabel,
  serviceLabel,
  blocked,
  onToggle,
}: Props) => {
  const colors = useThemeColors();
  const statusColor = blocked ? colors.danger : enabled ? '#27C46A' : colors.warning;

  return (
    <View style={[styles.card, {shadowColor: colors.dark ? '#000' : '#0B3A71'}]}>
      <View style={styles.botPanel}>
        <View style={styles.botCircle}>
          <Text style={styles.botIcon}>SP</Text>
        </View>
        <View style={styles.checkBubble}>
          <Text style={styles.checkText}>{blocked ? '!' : enabled ? 'OK' : '-'}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          <View style={[styles.statusPill, {backgroundColor: statusColor}]}>
            <Text style={styles.statusDot}>•</Text>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        </View>
        <Text style={styles.description}>{description}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>✓ {accessibilityLabel}</Text>
          <View style={styles.divider} />
          <Text style={styles.meta}>✓ {serviceLabel}</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{checked: enabled, disabled: blocked}}
        disabled={blocked}
        onPress={onToggle}
        style={[styles.toggle, {backgroundColor: enabled ? '#22B967' : 'rgba(255,255,255,0.28)', opacity: blocked ? 0.55 : 1}]}>
        <View style={[styles.knob, enabled ? styles.knobOn : styles.knobOff]} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: '#1C55F5',
    borderRadius: 8,
    elevation: 8,
    flexDirection: 'row',
    gap: 18,
    minHeight: 170,
    overflow: 'hidden',
    padding: 22,
    shadowOffset: {width: 0, height: 16},
    shadowOpacity: 0.24,
    shadowRadius: 28,
  },
  botPanel: {
    alignItems: 'center',
    height: 112,
    justifyContent: 'center',
    width: 112,
  },
  botCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(199, 251, 255, 0.18)',
    borderColor: '#8EF8D0',
    borderRadius: 56,
    borderWidth: 7,
    height: 108,
    justifyContent: 'center',
    width: 108,
  },
  botIcon: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  checkBubble: {
    alignItems: 'center',
    backgroundColor: '#25C56C',
    borderColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 4,
    bottom: 2,
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: 3,
    width: 44,
  },
  checkText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  body: {
    flex: 1,
    gap: 12,
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
  },
  statusPill: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusDot: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 18,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  description: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    opacity: 0.94,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  meta: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  divider: {
    backgroundColor: 'rgba(255,255,255,0.45)',
    height: 18,
    width: 1,
  },
  toggle: {
    borderRadius: 999,
    height: 62,
    justifyContent: 'center',
    padding: 5,
    width: 112,
  },
  knob: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    height: 52,
    width: 52,
  },
  knobOn: {
    alignSelf: 'flex-end',
  },
  knobOff: {
    alignSelf: 'flex-start',
  },
});
