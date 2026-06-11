import React, {useState} from 'react';
import {StyleSheet, Text} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Card} from '../components/Card';
import {AppTextInput} from '../components/AppTextInput';
import {PrimaryButton} from '../components/PrimaryButton';
import {Screen} from '../components/Screen';
import {RootStackParamList} from '../navigation/AppNavigator';
import {appStartupService} from '../services/AppStartupService';
import {supabaseAuthService} from '../services/SupabaseAuthService';
import {useThemeColors} from '../hooks/useThemeColors';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export const RegisterScreen = ({navigation}: Props) => {
  const colors = useThemeColors();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'danger' | 'success'>('danger');
  const [loading, setLoading] = useState(false);

  const register = async () => {
    setMessage('');
    setMessageTone('danger');
    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const result = await supabaseAuthService.registerWithPassword({
        email,
        password,
        fullName,
        phone,
      });
      if (result.requiresEmailConfirmation) {
        setMessageTone('success');
        setMessage(result.message ?? 'Please check your email to confirm your account before logging in.');
        setPassword('');
        setConfirmPassword('');
        return;
      }
      const {error} = result;
      if (error) {
        setMessage(error.message.includes('Trial already used') ? error.message : 'Registration failed. Check the details and try again.');
        return;
      }
      await appStartupService.bootstrapAuthenticated();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Registration failed.';
      setMessage(text.includes('Trial already used') ? text : 'Registration failed. Check the details and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Card title="Create Account">
        <AppTextInput label="Full name" value={fullName} onChangeText={setFullName} />
        <AppTextInput label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <AppTextInput label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <AppTextInput label="Password" value={password} onChangeText={setPassword} secureTextEntry />
        <AppTextInput label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
        <Text style={[styles.helper, {color: colors.muted}]}>A 3-day trial is created for this user and device after registration.</Text>
        {message ? <Text style={[styles.message, {color: messageTone === 'success' ? colors.success : colors.danger}]}>{message}</Text> : null}
        <PrimaryButton
          label="Register and Start Trial"
          onPress={register}
          loading={loading}
          disabled={!fullName || !phone || !email || password.length < 6 || !confirmPassword}
        />
      </Card>
      <PrimaryButton label="Back to Login" onPress={() => navigation.navigate('Login')} tone="neutral" />
    </Screen>
  );
};

const styles = StyleSheet.create({
  helper: {
    fontSize: 13,
    lineHeight: 18,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
});
