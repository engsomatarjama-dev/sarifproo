import React, {useState} from 'react';
import {Alert} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Screen} from '../components/Screen';
import {SecurityPinForm} from '../components/SecurityPinForm';
import {securityPinService} from '../services/SecurityPinService';
import {RootStackParamList} from '../navigation/AppNavigator';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export const ChangeSecurityPinScreen = () => {
  const navigation = useNavigation<NavProp>();
  const [currentPin, setCurrentPin] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError('');
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
      const result = await securityPinService.changePin(currentPin, pin);
      if (result.ok) {
        Alert.alert('Security PIN', 'Security PIN changed.');
        navigation.goBack();
        return;
      }
      if (result.reason === 'locked') {
        setError('Too many failed attempts. Try again in 15 minutes.');
      } else if (result.reason === 'incorrect') {
        setError(`Incorrect current PIN. Attempts remaining: ${result.attemptsRemaining}`);
      } else {
        setError('Create a security PIN first.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <SecurityPinForm
        title="Change PIN"
        description="Enter your current PIN, then choose a new 4 to 6 digit Security PIN."
        pinLabel="New PIN"
        currentPin={currentPin}
        pin={pin}
        confirmPin={confirmPin}
        showCurrent
        showConfirm
        error={error}
        submitLabel="Change PIN"
        loading={saving}
        onCurrentPinChange={setCurrentPin}
        onPinChange={setPin}
        onConfirmPinChange={setConfirmPin}
        onSubmit={submit}
      />
    </Screen>
  );
};
