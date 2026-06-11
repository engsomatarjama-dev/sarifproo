import type {Session} from '@supabase/supabase-js';

export type SubscriptionStatus = 'active' | 'expired' | 'blocked' | 'trial' | 'pending';
export type PlanType = 'trial' | 'monthly' | 'quarterly' | 'yearly';
export type TransactionType = 'sms_exchange' | 'balance_transfer';
export type TransactionStatus =
  | 'pending'
  | 'running'
  | 'awaiting_confirmation'
  | 'completed'
  | 'failed'
  | 'unknown_result'
  | 'duplicate'
  | 'ignored';
export type SmsClassification = 'RECEIVED_USD' | 'EXCHANGED_USD' | 'UNKNOWN';
export type TransferMethod = 'DIRECT_TRANSFER' | 'DARA_SALAAM_BANK';
export type UssdAutomationSpeed = 'FAST' | 'SAFE';
export type BalanceCheckStatus = 'checked' | 'completed' | 'triggered_transfer' | 'below_threshold' | 'failed';
export type BalanceCheckSource = 'periodic_balance_checker';
export type LogType =
  | 'sms_received'
  | 'sms_parsed'
  | 'balance_detected'
  | 'ussd_dialed'
  | 'pin_entered'
  | 'transaction_completed'
  | 'transaction_failed'
  | 'subscription_checked'
  | 'subscription_expired'
  | 'system';

export interface AppSettings {
  accountNumber: string;
  pin1: string;
  pin2: string;
  bankPin: string;
  shortcode: string;
  transferMethod: TransferMethod;
  ussdAutomationSpeed: UssdAutomationSpeed;
  automationEnabled: boolean;
  monitoring898Enabled: boolean;
  periodicBalanceCheckerEnabled: boolean;
  balanceCheckIntervalMinutes: 0 | 1 | 2 | 5 | 10;
  minimumBalanceThreshold: number;
  maxTransferAmount: number;
}

export interface SmsPayload {
  sender: string;
  body: string;
  timestamp: number;
}

export interface ExchangeParseResult {
  amount: number;
  receivedAmount?: number;
  balanceAmount?: number;
  amountSource?: 'received' | 'balance';
  classification: SmsClassification;
  phone: string;
  reference: string;
  raw: string;
}

export interface BalanceParseResult {
  balance: number;
  raw: string;
}

export interface Transaction {
  id?: number;
  type: TransactionType;
  transactionType?: 'balance_check' | 'direct_transfer' | 'bank_deposit' | 'unknown';
  amount: number;
  phone: string;
  reference: string;
  status: TransactionStatus;
  smsBody: string;
  timestamp: number;
  resultMessage?: string;
  failureReason?: string;
  completedAt?: number;
  confirmationSource?: '898_sms';
  confirmedAmount?: number;
  confirmationReference?: string;
  receiverName?: string;
  receiverPhone?: string;
  bankAccount?: string;
  transactionDate?: string;
  confirmationNote?: string;
  confirmationStartedAt?: number;
  confirmationExpiresAt?: number;
  source?: string;
  sourceReference?: string;
  dedupeKey?: string;
  relatedEventId?: string;
  transferDestination?: string;
}

export interface ConfirmationParseResult {
  transactionType: 'direct_transfer' | 'bank_deposit';
  amount: number;
  reference?: string;
  receiverName?: string;
  receiverPhone?: string;
  bankAccount?: string;
  transactionDate?: string;
  raw: string;
}

export interface UssdFinalResult {
  classification?: 'DIRECT_TRANSFER_SUCCESS' | 'BANK_DEPOSIT_SUCCESS' | 'FAILED_RESULT' | 'UNKNOWN_RESULT';
  status: 'completed' | 'failed' | 'unknown_result';
  transactionType: 'direct_transfer' | 'bank_deposit' | 'unknown';
  message: string;
  amount?: number;
  receiverName?: string;
  receiverPhone?: string;
  bankAccount?: string;
  failureReason?: string;
  dismissed: boolean;
  timestamp: number;
}

export interface Subscription {
  id?: number;
  planType: PlanType;
  startDate: string;
  expiryDate: string;
  status: SubscriptionStatus;
  paymentReference: string;
  createdAt: string;
}

export interface Payment {
  id?: number;
  amount: number;
  reference: string;
  status: 'pending' | 'verified' | 'rejected';
  timestamp: number;
}

export interface BalanceCheck {
  id?: number;
  balance: number;
  transferAmount: number;
  status: BalanceCheckStatus;
  source: BalanceCheckSource;
  timestamp: number;
}

export interface LogEntry {
  id?: number;
  type: LogType;
  message: string;
  timestamp: number;
}

export interface AnonymousAppMetadata {
  appVersion: string;
  automationEnabled: boolean;
  monitoring898Enabled: boolean;
  lastActiveAt: number;
}

export interface RemoteSubscriptionSnapshot {
  userId?: string;
  planType: PlanType;
  startDate: string;
  expiryDate: string;
  status: SubscriptionStatus;
  paymentReference: string;
  createdAt: string;
  accountStatus: 'active' | 'blocked' | 'pending';
  deviceBound: boolean;
  serverVerifiedAt?: number;
}

export interface DashboardMetrics {
  automationEnabled: boolean;
  monitoring898Enabled: boolean;
  lastTransaction?: Transaction;
  lastDetectedBalance?: number;
  totalTransactionsToday: number;
  totalTransferredAmount: number;
  subscriptionStatus: SubscriptionStatus;
  expiryDate?: string;
  daysRemaining: number;
  periodicBalanceCheckerEnabled: boolean;
  balanceCheckIntervalMinutes: AppSettings['balanceCheckIntervalMinutes'];
  ussdAutomationSpeed: AppSettings['ussdAutomationSpeed'];
  lastBalanceCheck?: BalanceCheck;
  lastBalanceTransfer?: BalanceCheck;
  nextScheduledBalanceCheck?: number;
  subscriptionVerificationStatus: 'online' | 'offline_grace' | 'verification_required';
  lastSubscriptionVerifiedAt?: number;
  offlineGraceRemainingMs?: number;
}

export interface AuthState {
  initialized: boolean;
  session?: Session;
  userEmail?: string;
}

export interface SubscriptionIntegrityRecord {
  deviceId: string;
  payloadHash: string;
  lastValidatedAt: number;
  lastKnownNow: number;
}

export interface SubscriptionCacheRecord {
  userId?: string;
  status: SubscriptionStatus;
  expiryDate: string;
  lastVerifiedAt: number;
  deviceId: string;
  deviceValid: boolean;
  validationSource: 'online';
}

export interface AutomationPreview {
  kind: 'exchange' | 'balance' | 'unknown';
  parsed: Record<string, string | number | boolean | undefined>;
  ussdPreview?: string;
  canAutomate: boolean;
  reason?: string;
}
