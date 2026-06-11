import dayjs from 'dayjs';

export const formatCurrency = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);

export const formatNumber = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(amount);

export const formatDateTime = (timestamp: number | string) =>
  dayjs(timestamp).format('MMM D, YYYY h:mm A');

export const formatShortTime = (timestamp: number | string) =>
  dayjs(timestamp).format('Today, h:mm A');

export const maskAccount = (value?: string) => {
  const normalized = String(value ?? '').replace(/\s+/g, '');
  if (!normalized) {
    return '';
  }
  if (normalized.length <= 7) {
    return `${normalized.slice(0, 2)}****${normalized.slice(-1)}`;
  }
  return `${normalized.slice(0, 5)}****${normalized.slice(-3)}`;
};

export const daysUntil = (isoDate?: string) => {
  if (!isoDate) {
    return 0;
  }
  const end = dayjs(isoDate).endOf('day');
  const now = dayjs();
  const diff = end.diff(now, 'day');
  return diff < 0 ? 0 : diff;
};

export const formatGraceRemaining = (milliseconds?: number) => {
  if (milliseconds === undefined || milliseconds <= 0) {
    return 'Verification required: connect internet';
  }
  const hours = Math.ceil(milliseconds / (60 * 60 * 1000));
  return `Offline grace active: ${hours} hours remaining`;
};

export const formatSubscriptionVerificationState = (
  verificationStatus: 'online' | 'offline_grace' | 'verification_required',
  subscriptionStatus?: string,
  graceRemainingMs?: number,
) => {
  if (subscriptionStatus === 'expired') {
    return 'Subscription expired';
  }
  if (subscriptionStatus === 'blocked') {
    return 'Account blocked';
  }
  if (verificationStatus === 'online') {
    return 'Online verified';
  }
  if (verificationStatus === 'offline_grace') {
    return formatGraceRemaining(graceRemainingMs);
  }
  return 'Verification required: connect internet';
};
