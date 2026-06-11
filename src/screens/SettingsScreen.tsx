import React, {useEffect, useState} from 'react';
import {Alert, Modal, Pressable, StyleSheet, Switch, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Screen} from '../components/Screen';
import {Card} from '../components/Card';
import {AppTextInput} from '../components/AppTextInput';
import {PrimaryButton} from '../components/PrimaryButton';
import {useAppStore} from '../store/useAppStore';
import {AppSettings} from '../types';
import {settingsService} from '../services/SettingsService';
import {accessibilityAutomationService} from '../services/AccessibilityAutomationService';
import {dashboardService} from '../services/DashboardService';
import {useThemeColors} from '../hooks/useThemeColors';
import {supabaseAuthService} from '../services/SupabaseAuthService';
import {appStartupService} from '../services/AppStartupService';
import {automationService} from '../services/AutomationService';
import {securityPinService} from '../services/SecurityPinService';
import {RootStackParamList} from '../navigation/AppNavigator';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const SENSITIVE_FIELDS: Array<keyof AppSettings> = ['accountNumber', 'pin1', 'pin2', 'bankPin', 'shortcode'];

export const SettingsScreen = () => {
  const navigation = useNavigation<NavProp>();
  const colors = useThemeColors();
  const current = useAppStore(state => state.settings);
  const setSettings = useAppStore(state => state.setSettings);
  const [form, setForm] = useState<AppSettings>(current);
  const [saving, setSaving] = useState(false);
  const [sensitiveUnlocked, setSensitiveUnlocked] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmPin, setConfirmPin] = useState('');
  const [confirmError, setConfirmError] = useState('');

  useEffect(() => {
    setForm(current);
  }, [current]);

  const updateField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setForm(prev => ({...prev, [key]: value}));
  };

  const requestSensitiveUnlock = () => {
    setConfirmPin('');
    setConfirmError('');
    setConfirmVisible(true);
  };

  const confirmSensitiveUnlock = async () => {
    const result = await securityPinService.verifyPin(confirmPin);
    if (result.ok) {
      setSensitiveUnlocked(true);
      setConfirmVisible(false);
      setConfirmPin('');
      return;
    }
    if (result.reason === 'locked') {
      setConfirmError('Too many failed attempts. Try again in 15 minutes.');
      return;
    }
    if (result.reason === 'incorrect') {
      setConfirmError(`Incorrect PIN. Attempts remaining: ${result.attemptsRemaining}`);
      return;
    }
    setConfirmError('Create a Security PIN before editing sensitive settings.');
  };

  const guardedUpdate = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (SENSITIVE_FIELDS.includes(key) && !sensitiveUnlocked) {
      requestSensitiveUnlock();
      return;
    }
    updateField(key, value);
  };

  const save = async () => {
    setSaving(true);
    try {
      await settingsService.save(form);
      setSettings(form);
      await accessibilityAutomationService.syncAutomationSettings(form);
      await accessibilityAutomationService.refreshStatus();
      if (form.automationEnabled && (form.periodicBalanceCheckerEnabled || form.monitoring898Enabled)) {
        await automationService.startBackgroundMonitoring();
      } else if (!form.periodicBalanceCheckerEnabled && !form.monitoring898Enabled) {
        await automationService.stopBackgroundMonitoring();
      }
      await dashboardService.refresh();
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    appStartupService.resetAuthenticatedBootstrap();
    await supabaseAuthService.signOut();
  };

  return (
    <Screen>
      <Card title="Automation Credentials">
        {!sensitiveUnlocked ? (
          <PrimaryButton label="Unlock Sensitive Fields" onPress={requestSensitiveUnlock} tone="neutral" />
        ) : null}
        <AppTextInput
          label="Account number"
          value={form.accountNumber}
          onChangeText={value => guardedUpdate('accountNumber', value)}
          onPressIn={sensitiveUnlocked ? undefined : requestSensitiveUnlock}
          keyboardType="number-pad"
          editable={sensitiveUnlocked}
          helper={sensitiveUnlocked ? undefined : 'Confirm Security PIN to edit.'}
        />
        <AppTextInput
          label="PIN1"
          value={form.pin1}
          onChangeText={value => guardedUpdate('pin1', value)}
          onPressIn={sensitiveUnlocked ? undefined : requestSensitiveUnlock}
          secureTextEntry
          keyboardType="number-pad"
          editable={sensitiveUnlocked}
        />
        <AppTextInput
          label="PIN2"
          value={form.pin2}
          onChangeText={value => guardedUpdate('pin2', value)}
          onPressIn={sensitiveUnlocked ? undefined : requestSensitiveUnlock}
          secureTextEntry
          keyboardType="number-pad"
          editable={sensitiveUnlocked}
        />
        <AppTextInput
          label="Bank PIN"
          value={form.bankPin}
          onChangeText={value => guardedUpdate('bankPin', value.replace(/\D/g, '').slice(0, 6))}
          onPressIn={sensitiveUnlocked ? undefined : requestSensitiveUnlock}
          secureTextEntry
          keyboardType="number-pad"
          maxLength={6}
          editable={sensitiveUnlocked}
          helper="Required only for Dara-Salaam Bank deposits. Must be 6 digits."
        />
        <AppTextInput
          label="Shortcode"
          value={form.shortcode}
          onChangeText={value => guardedUpdate('shortcode', value)}
          onPressIn={sensitiveUnlocked ? undefined : requestSensitiveUnlock}
          keyboardType="number-pad"
          editable={sensitiveUnlocked}
        />
        <AppTextInput
          label="Minimum balance threshold"
          value={`${form.minimumBalanceThreshold}`}
          onChangeText={value => updateField('minimumBalanceThreshold', Number(value || 0))}
          keyboardType="decimal-pad"
          helper="Transfers run only when detected balance is above this value."
        />
        <AppTextInput
          label="Maximum transfer amount"
          value={`${form.maxTransferAmount}`}
          onChangeText={value => updateField('maxTransferAmount', Number(value || 0))}
          keyboardType="decimal-pad"
          helper="Automation rejects any transfer above this limit."
        />
      </Card>

      <Card title="Transfer Method">
        <View style={[styles.segmented, {borderColor: colors.border}]}>
          {([
            ['DIRECT_TRANSFER', 'Direct Transfer'],
            ['DARA_SALAAM_BANK', 'Dara-Salaam Bank'],
          ] as const).map(([method, label]) => {
            const selected = form.transferMethod === method;
            return (
              <Pressable
                key={method}
                onPress={() => updateField('transferMethod', method)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: selected ? colors.primary : colors.card,
                    borderColor: colors.border,
                  },
                ]}>
                <Text style={[styles.segmentText, {color: selected ? '#FFFFFF' : colors.text}]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.helper, {color: colors.muted}]}>
          Direct Transfer uses the configured account USSD flow. Dara-Salaam Bank uses *800# and enters the processed USD amount.
        </Text>
      </Card>

      <Card title="USSD Automation Speed">
        <View style={[styles.segmented, {borderColor: colors.border}]}>
          {([
            ['FAST', 'Fast Mode'],
            ['SAFE', 'Safe Mode'],
          ] as const).map(([speed, label]) => {
            const selected = form.ussdAutomationSpeed === speed;
            return (
              <Pressable
                key={speed}
                onPress={() => updateField('ussdAutomationSpeed', speed)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: selected ? colors.primary : colors.card,
                    borderColor: colors.border,
                  },
                ]}>
                <Text style={[styles.segmentText, {color: selected ? '#FFFFFF' : colors.text}]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.helper, {color: colors.muted}]}>
          Fast Mode enters and confirms each USSD screen as soon as it is detected. Safe Mode keeps the existing slower pacing.
        </Text>
      </Card>

      <Card title="Feature Toggles">
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={[styles.title, {color: colors.text}]}>Enable automation</Text>
            <Text style={[styles.helper, {color: colors.muted}]}>Process exchange messages and trigger transfer flows.</Text>
          </View>
          <Switch value={form.automationEnabled} onValueChange={value => updateField('automationEnabled', value)} />
        </View>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={[styles.title, {color: colors.text}]}>Enable 898 monitoring</Text>
            <Text style={[styles.helper, {color: colors.muted}]}>Watch every SMS from sender 898 and automate balance transfers.</Text>
          </View>
          <Switch value={form.monitoring898Enabled} onValueChange={value => updateField('monitoring898Enabled', value)} />
        </View>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={[styles.title, {color: colors.text}]}>Enable periodic balance checker</Text>
            <Text style={[styles.helper, {color: colors.muted}]}>Fallback balance check when SMS notifications are delayed or missed.</Text>
          </View>
          <Switch value={form.periodicBalanceCheckerEnabled} onValueChange={value => updateField('periodicBalanceCheckerEnabled', value)} />
        </View>
        <View style={styles.intervalGroup}>
          <Text style={[styles.title, {color: colors.text}]}>Balance check interval</Text>
          <View style={[styles.segmented, {borderColor: colors.border}]}>
            {([0, 1, 2, 5, 10] as const).map(interval => {
              const selected = form.balanceCheckIntervalMinutes === interval;
              return (
                <Pressable
                  key={interval}
                  onPress={() => updateField('balanceCheckIntervalMinutes', interval)}
                  style={[
                    styles.segment,
                    {
                      backgroundColor: selected ? colors.primary : colors.card,
                      borderColor: colors.border,
                    },
                  ]}>
                  <Text style={[styles.segmentText, {color: selected ? '#FFFFFF' : colors.text}]}>
                    {interval === 0 ? 'Continuous' : `${interval} min`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.helper, {color: colors.muted}]}>
            Continuous mode starts the next balance check as soon as the previous cycle is fully idle.
          </Text>
        </View>
      </Card>

      <Card title="Privacy">
        <Text style={[styles.privacyText, {color: colors.text}]}>
          Transaction data, SMS content, customer phone numbers, PINs, and USSD data remain on your device and are never uploaded.
        </Text>
        <Text style={[styles.helper, {color: colors.muted}]}>
          Transaction amounts, customer phone numbers, SMS contents, references, balance transfer history, and automation logs are stored locally on this device only.
        </Text>
      </Card>

      <Card title="Security">
        <Text style={[styles.helper, {color: colors.muted}]}>
          Settings access is protected by a local Security PIN stored with encrypted secure storage.
        </Text>
        <PrimaryButton label="Change Security PIN" onPress={() => navigation.navigate('ChangeSecurityPin')} tone="neutral" />
      </Card>

      <PrimaryButton label="Save Settings" onPress={save} loading={saving} />
      <PrimaryButton label="Logout" onPress={logout} tone="danger" />

      <Modal transparent visible={confirmVisible} animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, {backgroundColor: colors.card, borderColor: colors.border}]}>
            <Text style={[styles.modalTitle, {color: colors.text}]}>Confirm Security PIN</Text>
            <Text style={[styles.helper, {color: colors.muted}]}>
              Required before changing account number, automation PINs, bank PIN, or USSD codes.
            </Text>
            <AppTextInput
              label="Security PIN"
              value={confirmPin}
              onChangeText={value => setConfirmPin(value.replace(/\D/g, '').slice(0, 6))}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
            />
            {confirmError ? <Text style={[styles.error, {color: colors.danger}]}>{confirmError}</Text> : null}
            <View style={styles.modalActions}>
              <PrimaryButton label="Cancel" onPress={() => setConfirmVisible(false)} tone="neutral" />
              <PrimaryButton label="Confirm" onPress={confirmSensitiveUnlock} />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

const styles = StyleSheet.create({
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  switchText: {
    flex: 1,
    gap: 4,
  },
  intervalGroup: {
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  helper: {
    fontSize: 12,
  },
  segmented: {
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  segment: {
    alignItems: 'center',
    borderRightWidth: 1,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  privacyText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 8,
  },
  modalOverlay: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  modalActions: {
    gap: 10,
  },
  error: {
    fontSize: 13,
    fontWeight: '700',
  },
});
