import React, {useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Screen} from '../components/Screen';
import {SecurityPinForm} from '../components/SecurityPinForm';
import {securityPinService} from '../services/SecurityPinService';
import {RootStackParamList} from '../navigation/AppNavigator';
import {useThemeColors} from '../hooks/useThemeColors';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const lockMessage = (lockedUntil: number) => {
  const minutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
  return `Too many failed attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
};

export const SettingsUnlockScreen = () => {
  const navigation = useNavigation<NavProp>();
  const colors = useThemeColors();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  const initialMessage = useMemo(() => {
    const remaining = securityPinService.getLockRemainingMs();
    if (remaining > 0) {
      return `Too many failed attempts. Try again in ${Math.ceil(remaining / 60000)} minutes.`;
    }
    return '';
  }, []);

  const unlock = async () => {
    setError('');
    setMessage('');
    setUnlocking(true);
    try {
      const result = await securityPinService.verifyPin(pin);
      if (result.ok) {
        navigation.replace('SettingsContent');
        return;
      }
      if (result.reason === 'locked') {
        setMessage(lockMessage(result.lockedUntil));
      } else if (result.reason === 'incorrect') {
        setError(`Incorrect PIN. Attempts remaining: ${result.attemptsRemaining}`);
      } else {
        navigation.replace('CreateSecurityPin');
      }
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <Screen>
      <SecurityPinForm
        title="Enter Security PIN"
        description="Settings contains sensitive financial automation configuration."
        pin={pin}
        message={message || initialMessage}
        error={error}
        submitLabel="Unlock"
        loading={unlocking}
        onPinChange={setPin}
        onSubmit={unlock}
        footer={
          <Pressable onPress={() => navigation.navigate('ForgotSettingsPin')} style={styles.forgot}>
            <Text style={[styles.forgotText, {color: colors.primary}]}>Forgot PIN?</Text>
          </Pressable>
        }
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  forgot: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
