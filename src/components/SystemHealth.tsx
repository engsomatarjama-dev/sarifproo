import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {CheckCircle2} from 'lucide-react-native';
import {useThemeColors} from '../hooks/useThemeColors';

interface Props {
  items: string[];
}

export const SystemHealth = ({items}: Props) => {
  const colors = useThemeColors();

  return (
    <View style={[styles.card, {backgroundColor: colors.card, borderColor: colors.border}]}>
      <View style={styles.wrap}>
        {items.slice(0, 5).map(item => (
          <View key={item} style={[styles.chip, {backgroundColor: colors.dark ? '#1E2A38' : '#F3F7FB', borderColor: colors.border}]}>
            <CheckCircle2 color={colors.success} size={16} strokeWidth={2.6} />
            <Text numberOfLines={1} style={[styles.text, {color: colors.text}]}>
              {item}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    maxHeight: 120,
    padding: 8,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 28,
    paddingHorizontal: 8,
  },
  text: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
});
