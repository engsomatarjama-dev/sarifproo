import {AppSettings} from '../types';

export const defaultSettings: AppSettings = {
  accountNumber: '',
  pin1: '',
  pin2: '',
  bankPin: '',
  shortcode: '806',
  transferMethod: 'DIRECT_TRANSFER',
  ussdAutomationSpeed: 'FAST',
  automationEnabled: true,
  monitoring898Enabled: true,
  periodicBalanceCheckerEnabled: false,
  balanceCheckIntervalMinutes: 5,
  minimumBalanceThreshold: 0,
  maxTransferAmount: 1000,
};
