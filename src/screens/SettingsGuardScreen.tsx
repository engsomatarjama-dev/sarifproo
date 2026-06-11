import React, {useCallback} from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Screen} from '../components/Screen';
import {securityPinService} from '../services/SecurityPinService';
import {RootStackParamList} from '../navigation/AppNavigator';
import {useThemeColors} from '../hooks/useThemeColors';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export const SettingsGuardScreen = () => {
  const navigation = useNavigation<NavProp>();
  const colors = useThemeColors();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void securityPinService.hasPin().then(hasPin => {
        if (!active) {
          return;
        }
        if (!hasPin) {
          navigation.replace('CreateSecurityPin');
          return;
        }
        if (securityPinService.isUnlocked()) {
          navigation.replace('SettingsContent');
          return;
        }
        navigation.replace('SettingsUnlock');
      });
      return () => {
        active = false;
      };
    }, [navigation]),
  );

  return (
    <Screen scroll={false}>
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
