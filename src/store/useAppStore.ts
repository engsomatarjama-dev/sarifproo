import {create} from 'zustand';
import {AppSettings, AuthState, DashboardMetrics, LogEntry, Subscription, Transaction} from '../types';
import {defaultSettings} from '../models/defaults';

interface AppState {
  settings: AppSettings;
  subscription?: Subscription;
  auth: AuthState;
  dashboard: DashboardMetrics;
  transactions: Transaction[];
  logs: LogEntry[];
  lastDetectedBalance?: number;
  accessibilityEnabled: boolean;
  backgroundRunning: boolean;
  setSettings: (settings: AppSettings) => void;
  setSubscription: (subscription?: Subscription) => void;
  setAuth: (auth: AuthState) => void;
  setDashboard: (dashboard: DashboardMetrics) => void;
  setTransactions: (transactions: Transaction[]) => void;
  setLogs: (logs: LogEntry[]) => void;
  setLastDetectedBalance: (value?: number) => void;
  setAccessibilityEnabled: (value: boolean) => void;
  setBackgroundRunning: (value: boolean) => void;
}

export const useAppStore = create<AppState>(set => ({
  settings: defaultSettings,
  subscription: undefined,
  auth: {
    initialized: false,
    session: undefined,
    userEmail: undefined,
  },
  dashboard: {
    automationEnabled: defaultSettings.automationEnabled,
    monitoring898Enabled: defaultSettings.monitoring898Enabled,
    totalTransactionsToday: 0,
    totalTransferredAmount: 0,
    subscriptionStatus: 'trial',
    daysRemaining: 0,
    periodicBalanceCheckerEnabled: defaultSettings.periodicBalanceCheckerEnabled,
    balanceCheckIntervalMinutes: defaultSettings.balanceCheckIntervalMinutes,
    ussdAutomationSpeed: defaultSettings.ussdAutomationSpeed,
    subscriptionVerificationStatus: 'verification_required',
  },
  transactions: [],
  logs: [],
  lastDetectedBalance: undefined,
  accessibilityEnabled: false,
  backgroundRunning: false,
  setSettings: settings => set({settings}),
  setSubscription: subscription => set({subscription}),
  setAuth: auth => set({auth}),
  setDashboard: dashboard => set({dashboard}),
  setTransactions: transactions => set({transactions}),
  setLogs: logs => set({logs}),
  setLastDetectedBalance: value => set({lastDetectedBalance: value}),
  setAccessibilityEnabled: value => set({accessibilityEnabled: value}),
  setBackgroundRunning: value => set({backgroundRunning: value}),
}));
