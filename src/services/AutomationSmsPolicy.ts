import {normalizeSms} from '../utils/sms';

export const is898Sender = (sender: string) => {
  const normalized = sender.trim().toLowerCase();
  const digits = normalized.replace(/[^\d]/g, '');
  return normalized === '898' || digits === '898' || digits.endsWith('898');
};

const normalizeBody = (body: string) => normalizeSms(body).toLowerCase();

export const looksLikeBalanceMessage = (body: string) => {
  const normalized = normalizeBody(body);
  return normalized.includes('hadhaag') || normalized.includes('balance');
};

export const looksLikeIncomingBalanceTrigger = (body: string) => {
  const normalized = normalizeBody(body);
  return (
    normalized.includes('ka heshay') ||
    normalized.includes('xisaabtaada') ||
    normalized.includes('hadhaageedu waa') ||
    normalized.includes('hadhaagaagu waa') ||
    normalized.includes('hadhaagaaga:')
  );
};

export const looksLikeOutgoingTransferConfirmation = (body: string) => {
  const normalized = normalizeBody(body);
  return (
    normalized.includes('u dirtay') ||
    normalized.includes('ayaad u dirtay') ||
    normalized.includes('u sariftay') ||
    normalized.includes('you have exchanged')
  );
};
