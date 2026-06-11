import React, {useCallback} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Screen} from '../components/Screen';
import {Card} from '../components/Card';
import {Badge} from '../components/Badge';
import {KeyValueRow} from '../components/KeyValueRow';
import {PrimaryButton} from '../components/PrimaryButton';
import {RootStackParamList} from '../navigation/AppNavigator';
import {useAppStore} from '../store/useAppStore';
import {appStartupService} from '../services/AppStartupService';
import {subscriptionGuardService} from '../services/SubscriptionGuardService';
import {formatDateTime, formatSubscriptionVerificationState} from '../utils/format';
import {useThemeColors} from '../hooks/useThemeColors';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export const SubscriptionScreen = () => {
  const navigation = useNavigation<NavProp>();
  const colors = useThemeColors();
  const subscription = useAppStore(state => state.subscription);
  const dashboard = useAppStore(state => state.dashboard);
  const verificationLabel = formatSubscriptionVerificationState(
    dashboard.subscriptionVerificationStatus,
    subscription?.status ?? dashboard.subscriptionStatus,
    dashboard.offlineGraceRemainingMs,
  );

  const refresh = useCallback(() => {
    void appStartupService.refreshAll();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <Screen>
      <Card
        title="Current Subscription"
        rightSlot={
          <Badge
            label={(subscription?.status ?? 'expired').toUpperCase()}
            tone={
              subscription?.status === 'active' || subscription?.status === 'trial'
                ? 'success'
                : subscription?.status === 'blocked'
                  ? 'warning'
                  : 'danger'
            }
          />
        }>
        <KeyValueRow label="Plan" value={subscription?.planType ?? '-'} />
        <KeyValueRow label="Start date" value={subscription?.startDate ? formatDateTime(subscription.startDate) : '-'} />
        <KeyValueRow label="Expiry date" value={subscription?.expiryDate ? formatDateTime(subscription.expiryDate) : '-'} />
        <KeyValueRow label="Last verification" value={dashboard.lastSubscriptionVerifiedAt ? formatDateTime(dashboard.lastSubscriptionVerifiedAt) : '-'} />
        <KeyValueRow label="Verification" value={verificationLabel} />
        <KeyValueRow label="Payment reference" value={subscription?.paymentReference ?? '-'} />
      </Card>

      <Card title="Feature Access">
        <Text style={{color: colors.text}}>Locked when expired:</Text>
        <View style={styles.featureList}>
          <Text style={{color: colors.muted}}>• SMS automation</Text>
          <Text style={{color: colors.muted}}>• 898 balance monitoring</Text>
          <Text style={{color: colors.muted}}>• USSD automation</Text>
          <Text style={{color: colors.muted}}>• PIN automation</Text>
        </View>
        <Text style={{color: colors.text}}>Still available when expired:</Text>
        <View style={styles.featureList}>
          <Text style={{color: colors.muted}}>• Dashboard</Text>
          <Text style={{color: colors.muted}}>• Settings</Text>
          <Text style={{color: colors.muted}}>• Transaction history</Text>
          <Text style={{color: colors.muted}}>• Renew subscription</Text>
        </View>
      </Card>

      <PrimaryButton label="Renew Subscription" onPress={() => navigation.navigate('RenewSubscription')} />
      <PrimaryButton label="Revalidate Now" onPress={() => void subscriptionGuardService.validateSubscription().then(refresh)} tone="neutral" />
    </Screen>
  );
};

const styles = StyleSheet.create({
  featureList: {
    gap: 4,
  },
});
