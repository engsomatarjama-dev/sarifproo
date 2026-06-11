import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {AuthLoadingScreen} from '../screens/AuthLoadingScreen';
import {DashboardScreen} from '../screens/DashboardScreen';
import {ForgotPasswordScreen} from '../screens/ForgotPasswordScreen';
import {LoginScreen} from '../screens/LoginScreen';
import {RegisterScreen} from '../screens/RegisterScreen';
import {SettingsScreen} from '../screens/SettingsScreen';
import {SettingsGuardScreen} from '../screens/SettingsGuardScreen';
import {SettingsUnlockScreen} from '../screens/SettingsUnlockScreen';
import {CreateSecurityPinScreen} from '../screens/CreateSecurityPinScreen';
import {ChangeSecurityPinScreen} from '../screens/ChangeSecurityPinScreen';
import {ForgotSettingsPinScreen} from '../screens/ForgotSettingsPinScreen';
import {TransactionHistoryScreen} from '../screens/TransactionHistoryScreen';
import {TransactionDetailsScreen} from '../screens/TransactionDetailsScreen';
import {SubscriptionScreen} from '../screens/SubscriptionScreen';
import {RenewSubscriptionScreen} from '../screens/RenewSubscriptionScreen';
import {TestModeScreen} from '../screens/TestModeScreen';
import {LogsScreen} from '../screens/LogsScreen';
import {useAppStore} from '../store/useAppStore';
import {useThemeColors} from '../hooks/useThemeColors';

export type RootStackParamList = {
  AuthLoading: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Dashboard: undefined;
  Settings: undefined;
  Transactions: undefined;
  TransactionDetails: {reference: string};
  Subscription: undefined;
  RenewSubscription: undefined;
  TestMode: undefined;
  Logs: undefined;
  SettingsContent: undefined;
  SettingsUnlock: undefined;
  CreateSecurityPin: undefined;
  ChangeSecurityPin: undefined;
  ForgotSettingsPin: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator = () => {
  const auth = useAppStore(state => state.auth);
  const colors = useThemeColors();

  if (!auth.initialized) {
    return (
      <Stack.Navigator>
        <Stack.Screen name="AuthLoading" component={AuthLoadingScreen} options={{headerShown: false}} />
      </Stack.Navigator>
    );
  }

  if (!auth.session) {
    return (
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen name="Login" component={LoginScreen} options={{headerShown: false}} />
        <Stack.Screen name="Register" component={RegisterScreen} options={{title: 'Create Account'}} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{title: 'Reset Password'}} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName="Dashboard"
      screenOptions={{
        headerStyle: {backgroundColor: colors.background},
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: {fontWeight: '900'},
        contentStyle: {backgroundColor: colors.background},
      }}>
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{headerShown: false}} />
      <Stack.Screen name="Settings" component={SettingsGuardScreen} options={{title: 'Settings'}} />
      <Stack.Screen name="SettingsContent" component={SettingsScreen} options={{title: 'Settings'}} />
      <Stack.Screen name="SettingsUnlock" component={SettingsUnlockScreen} options={{title: 'Unlock Settings'}} />
      <Stack.Screen name="CreateSecurityPin" component={CreateSecurityPinScreen} options={{title: 'Create Security PIN'}} />
      <Stack.Screen name="ChangeSecurityPin" component={ChangeSecurityPinScreen} options={{title: 'Change Security PIN'}} />
      <Stack.Screen name="ForgotSettingsPin" component={ForgotSettingsPinScreen} options={{title: 'Reset Security PIN'}} />
      <Stack.Screen name="Transactions" component={TransactionHistoryScreen} options={{title: 'Transaction History'}} />
      <Stack.Screen name="TransactionDetails" component={TransactionDetailsScreen} options={{title: 'Transaction Details'}} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen name="RenewSubscription" component={RenewSubscriptionScreen} options={{title: 'Renew Subscription'}} />
      <Stack.Screen name="TestMode" component={TestModeScreen} options={{title: 'Test Mode'}} />
      <Stack.Screen name="Logs" component={LogsScreen} />
    </Stack.Navigator>
  );
};
