import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {AlertTriangle, CheckCircle2, Wallet} from 'lucide-react-native';
import {useThemeColors} from '../hooks/useThemeColors';

interface SummaryItem {
  title: 'Processed' | 'Successful' | 'Failed';
  value: string;
  subtitle: string;
  tone: 'green' | 'blue' | 'red';
}

interface Props {
  items: SummaryItem[];
  cardWidth: number;
}

const iconMap = {
  Processed: Wallet,
  Successful: CheckCircle2,
  Failed: AlertTriangle,
};

const toneMap = {
  green: '#16A34A',
  blue: '#2563EB',
  red: '#CB1A40',
};

export const SummaryCards = ({items, cardWidth}: Props) => {
  const colors = useThemeColors();

  return (
    <View style={styles.section}>
      <Text numberOfLines={1} style={[styles.heading, {color: colors.text}]}>
        Today's Summary
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.grid}>
        {items.map(item => {
          const Icon = iconMap[item.title];
          const color = toneMap[item.tone];
          return (
            <View
              key={item.title}
              style={[
                styles.card,
                {
                  width: cardWidth,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  shadowColor: colors.dark ? '#000000' : '#253858',
                },
              ]}>
              <View style={[styles.iconWrap, {backgroundColor: `${color}20`}]}>
                <Icon color={color} size={20} strokeWidth={2.6} />
              </View>
              <Text numberOfLines={1} style={[styles.title, {color: colors.muted}]}>
                {item.title}
              </Text>
              <Text numberOfLines={2} adjustsFontSizeToFit style={[styles.value, {color: colors.text}]}>
                {item.value}
              </Text>
              {item.subtitle ? (
                <Text numberOfLines={1} style={[styles.subtitle, {color}]}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
          );
        })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  heading: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
  },
  grid: {
    flexDirection: 'row',
    gap: 10,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    elevation: 3,
    minHeight: 122,
    padding: 11,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.07,
    shadowRadius: 14,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    marginBottom: 8,
    width: 38,
  },
  title: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 5,
  },
  value: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0,
    minHeight: 22,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: 7,
  },
});
