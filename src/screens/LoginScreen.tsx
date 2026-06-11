import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Card} from '../components/Card';
import {AppTextInput} from '../components/AppTextInput';
import {PrimaryButton} from '../components/PrimaryButton';
import {Screen} from '../components/Screen';
import {RootStackParamList} from '../navigation/AppNavigator';
import {appStartupService} from '../services/AppStartupService';
import {supabaseAuthService} from '../services/SupabaseAuthService';
import {useThemeColors} from '../hooks/useThemeColors';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export const LoginScreen = ({navigation}: Props) => {
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setMessage('');
    setLoading(true);
    try {
      const {error} = await supabaseAuthService.signInWithPassword(email, password);
      if (error) {
        setMessage(
          supabaseAuthService.isEmailNotConfirmedError(error)
            ? 'Please confirm your email first. Check your inbox.'
            : 'Login failed. Check your email and password, then try again.',
        );
        return;
      }
      await appStartupService.bootstrapAuthenticated();
    } catch {
      setMessage('Login failed. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.brand, {color: colors.text}]}>SarifPro</Text>
        <Text style={[styles.subtitle, {color: colors.muted}]}>Sign in to manage automation and subscription access.</Text>
      </View>

      <Card title="Sign In">
        <AppTextInput label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <AppTextInput label="Password" value={password} onChangeText={setPassword} secureTextEntry />
        {message ? <Text style={[styles.message, {color: colors.danger}]}>{message}</Text> : null}
        <PrimaryButton label="Login" onPress={login} loading={loading} disabled={!email || !password} />
        <Pressable onPress={() => navigation.navigate('ForgotPassword')}>
          <Text style={[styles.link, {color: colors.primary}]}>Forgot password?</Text>
        </Pressable>
      </Card>

      <PrimaryButton label="Create New Account" onPress={() => navigation.navigate('Register')} tone="neutral" />
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
  },
  header: {
    gap: 8,
  },
  brand: {
    fontSize: 34,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  link: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
