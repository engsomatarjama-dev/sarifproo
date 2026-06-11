import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {LockKeyhole} from 'lucide-react-native';
import {AppTextInput} from './AppTextInput';
import {Card} from './Card';
import {PrimaryButton} from './PrimaryButton';
import {useThemeColors} from '../hooks/useThemeColors';

interface Props {
  title: string;
  description: string;
  pinLabel?: string;
  pin: string;
  confirmPin?: string;
  currentPin?: string;
  password?: string;
  showConfirm?: boolean;
  showCurrent?: boolean;
  showPassword?: boolean;
  message?: string;
  error?: string;
  submitLabel: string;
  loading?: boolean;
  onPinChange: (value: string) => void;
  onConfirmPinChange?: (value: string) => void;
  onCurrentPinChange?: (value: string) => void;
  onPasswordChange?: (value: string) => void;
  onSubmit: () => void;
  footer?: React.ReactNode;
}

const pinValue = (value: string) => value.replace(/\D/g, '').slice(0, 6);

export const SecurityPinForm = ({
  title,
  description,
  pinLabel = 'Security PIN',
  pin,
  confirmPin,
  currentPin,
  password,
  showConfirm,
  showCurrent,
  showPassword,
  message,
  error,
  submitLabel,
  loading,
  onPinChange,
  onConfirmPinChange,
  onCurrentPinChange,
  onPasswordChange,
  onSubmit,
  footer,
}: Props) => {
  const colors = useThemeColors();

  return (
    <Card>
      <View style={styles.header}>
        <View style={[styles.icon, {backgroundColor: colors.primary}]}>
          <LockKeyhole color="#FFFFFF" size={24} strokeWidth={2.5} />
        </View>
        <Text style={[styles.title, {color: colors.text}]}>{title}</Text>
        <Text style={[styles.description, {color: colors.muted}]}>{description}</Text>
      </View>

      {showPassword ? (
        <AppTextInput
          label="Supabase account password"
          value={password}
          onChangeText={onPasswordChange}
          secureTextEntry
          autoCapitalize="none"
          textContentType="password"
        />
      ) : null}

      {showCurrent ? (
        <AppTextInput
          label="Current PIN"
          value={currentPin}
          onChangeText={value => onCurrentPinChange?.(pinValue(value))}
          secureTextEntry
          keyboardType="number-pad"
          maxLength={6}
        />
      ) : null}

      <AppTextInput
        label={pinLabel}
        value={pin}
        onChangeText={value => onPinChange(pinValue(value))}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
        helper="Use 4 to 6 digits."
      />

      {showConfirm ? (
        <AppTextInput
          label="Confirm PIN"
          value={confirmPin}
          onChangeText={value => onConfirmPinChange?.(pinValue(value))}
          secureTextEntry
          keyboardType="number-pad"
          maxLength={6}
        />
      ) : null}

      {message ? <Text style={[styles.message, {color: colors.muted}]}>{message}</Text> : null}
      {error ? <Text style={[styles.message, {color: colors.danger}]}>{error}</Text> : null}

      <PrimaryButton label={submitLabel} onPress={onSubmit} loading={loading} />
      {footer}
    </Card>
  );
};

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  icon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
