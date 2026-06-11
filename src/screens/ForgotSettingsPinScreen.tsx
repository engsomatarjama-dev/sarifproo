import React, {useState} from 'react';
import {Alert} from 'react-native';
import {CommonActions, useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Screen} from '../components/Screen';
import {SecurityPinForm} from '../components/SecurityPinForm';
import {securityPinService} from '../services/SecurityPinService';
import {RootStackParamList} from '../navigation/AppNavigator';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export const ForgotSettingsPinScreen = () => {
  const navigation = useNavigation<NavProp>();
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError('');
    if (!password) {
      setError('Enter your Supabase account password.');
      return;
    }
    if (!securityPinService.isValidPin(pin)) {
      setError('New PIN must be 4 to 6 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PIN confirmation does not match.');
      return;
    }
    setSaving(true);
    try {
      await securityPinService.resetAfterPassword(password, pin);
      Alert.alert('Security PIN', 'Security PIN reset.');
      navigation.dispatch(CommonActions.reset({index: 0, routes: [{name: 'SettingsContent'}]}));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not reset Security PIN.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <SecurityPinForm
        title="Reset Security PIN"
        description="Verify your account password before creating a new Settings Security PIN."
        pinLabel="New PIN"
        password={password}
        pin={pin}
        confirmPin={confirmPin}
        showPassword
        showConfirm
        error={error}
        submitLabel="Reset PIN"
        loading={saving}
        onPasswordChange={setPassword}
        onPinChange={setPin}
        onConfirmPinChange={setConfirmPin}
        onSubmit={submit}
      />
    </Screen>
  );
};
