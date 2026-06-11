import React, {useState} from 'react';
import {Alert} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Screen} from '../components/Screen';
import {SecurityPinForm} from '../components/SecurityPinForm';
import {securityPinService} from '../services/SecurityPinService';
import {RootStackParamList} from '../navigation/AppNavigator';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export const CreateSecurityPinScreen = () => {
  const navigation = useNavigation<NavProp>();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError('');
    if (!securityPinService.isValidPin(pin)) {
      setError('Security PIN must be 4 to 6 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PIN confirmation does not match.');
      return;
    }
    setSaving(true);
    try {
      await securityPinService.createPin(pin);
      navigation.replace('SettingsContent');
    } catch (submitError) {
      Alert.alert('Create Security PIN', submitError instanceof Error ? submitError.message : 'Could not create PIN.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <SecurityPinForm
        title="Create Security PIN"
        description="Protect Settings before editing account numbers, automation PINs, bank PIN, and USSD codes."
        pinLabel="New PIN"
        pin={pin}
        confirmPin={confirmPin}
        showConfirm
        error={error}
        submitLabel="Create PIN"
        loading={saving}
        onPinChange={setPin}
        onConfirmPinChange={setConfirmPin}
        onSubmit={submit}
      />
    </Screen>
  );
};
