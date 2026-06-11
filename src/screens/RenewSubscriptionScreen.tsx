import React, {useMemo, useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {Screen} from '../components/Screen';
import {Card} from '../components/Card';
import {PrimaryButton} from '../components/PrimaryButton';
import {AppTextInput} from '../components/AppTextInput';
import {PlanType} from '../types';
import {paymentRepository} from '../repositories/PaymentRepository';
import {subscriptionApiService} from '../services/SubscriptionApiService';
import {loggingService} from '../services/LoggingService';
import {useThemeColors} from '../hooks/useThemeColors';

const plans: {key: PlanType; label: string; amount: number}[] = [
  {key: 'monthly', label: 'Monthly', amount: 20},
  {key: 'quarterly', label: 'Quarterly', amount: 50},
  {key: 'yearly', label: 'Yearly', amount: 180},
];

export const RenewSubscriptionScreen = () => {
  const colors = useThemeColors();
  const [planType, setPlanType] = useState<PlanType>('monthly');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedPlan = useMemo(() => plans.find(item => item.key === planType) ?? plans[0], [planType]);

  const submit = async () => {
    if (!reference.trim()) {
      return;
    }
    setSubmitting(true);
    try {
      await paymentRepository.create({
        amount: selectedPlan.amount,
        reference: reference.trim(),
        status: 'pending',
        timestamp: Date.now(),
      });
      const result = await subscriptionApiService.submitRenewalRequest(reference.trim(), planType, selectedPlan.amount);
      if (!result.ok) {
        await loggingService.log('system', `Renewal request failed: ${result.reason}`);
        Alert.alert('Renewal Not Submitted', result.reason);
        return;
      }
      await loggingService.log('system', `Renewal request submitted for ${planType}: ${reference.trim()}`);
      Alert.alert('Renewal Submitted', 'Your payment reference was sent for admin verification.');
      setReference('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown renewal submission error';
      await loggingService.log('system', `Renewal request failed: ${message}`);
      Alert.alert('Renewal Not Submitted', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <Card title="Payment Instructions">
        <Text style={{color: colors.text}}>1. Choose a plan.</Text>
        <Text style={{color: colors.text}}>2. Pay the amount using your agreed business payment channel.</Text>
        <Text style={{color: colors.text}}>3. Enter the payment reference below.</Text>
        <Text style={{color: colors.text}}>4. Admin verifies the payment and the subscription is activated.</Text>
      </Card>

      <Card title="Choose Plan">
        <View style={styles.planList}>
          {plans.map(plan => (
            <PrimaryButton
              key={plan.key}
              label={`${plan.label} - $${plan.amount}`}
              onPress={() => setPlanType(plan.key)}
              tone={planType === plan.key ? 'primary' : 'neutral'}
            />
          ))}
        </View>
      </Card>

      <Card title="Submit Payment Reference">
        <Text style={{color: colors.muted}}>Selected plan: {selectedPlan.label}</Text>
        <Text style={{color: colors.muted}}>Expected amount: ${selectedPlan.amount}</Text>
        <AppTextInput label="Payment reference" value={reference} onChangeText={setReference} autoCapitalize="characters" />
        <PrimaryButton label="Submit for Verification" onPress={submit} loading={submitting} />
      </Card>
    </Screen>
  );
};

const styles = StyleSheet.create({
  planList: {
    gap: 12,
  },
});
