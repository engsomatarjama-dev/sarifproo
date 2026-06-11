import React, {useState} from 'react';
import {StyleSheet, Text} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Card} from '../components/Card';
import {AppTextInput} from '../components/AppTextInput';
import {PrimaryButton} from '../components/PrimaryButton';
import {Screen} from '../components/Screen';
import {RootStackParamList} from '../navigation/AppNavigator';
import {supabaseAuthService} from '../services/SupabaseAuthService';
import {useThemeColors} from '../hooks/useThemeColors';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

export const ForgotPasswordScreen = ({navigation}: Props) => {
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const resetPassword = async () => {
    setMessage('');
    setLoading(true);
    try {
      const {error} = await supabaseAuthService.resetPasswordForEmail(email);
      setMessage(error ? error.message : 'Password reset link sent. Please check your email.');
    } catch {
      setMessage('Password reset failed. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Card title="Reset Password">
        <AppTextInput label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        {message ? <Text style={[styles.message, {color: message.includes('sent') ? colors.success : colors.danger}]}>{message}</Text> : null}
        <PrimaryButton label="Send Reset Email" onPress={resetPassword} loading={loading} disabled={!email} />
      </Card>
      <PrimaryButton label="Back to Login" onPress={() => navigation.navigate('Login')} tone="neutral" />
    </Screen>
  );
};

const styles = StyleSheet.create({
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
});
