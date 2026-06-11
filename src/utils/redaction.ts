const maskDigits = (value: string) => {
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length <= 6) {
    return '*'.repeat(Math.max(digits.length, 4));
  }
  return `${digits.slice(0, 5)}****${digits.slice(-3)}`;
};

export const redactPhone = (value: string) => maskDigits(value);

export const redactReference = (value: string) => (value.length <= 6 ? '***' : `${value.slice(0, 3)}***${value.slice(-3)}`);

export const redactUssd = (value: string) => {
  if (!value.startsWith('*')) {
    return value;
  }
  const parts = value.replace(/#$/, '').split('*');
  if (parts.length < 5) {
    return '*USSD_REDACTED#';
  }
  return `*${parts[1]}*ACCOUNT*AMOUNT****#`;
};

export const redactLogMessage = (message: string) =>
  message
    .replace(/\*[0-9*#.]+#/g, match => redactUssd(match))
    .replace(/\b(?:pin1|pin2|pin|password|token|access_token|refresh_token)\b\s*[:=]?\s*[\w.-]+/gi, match =>
      match.replace(/[:=]?\s*[\w.-]+$/g, ': ****'),
    )
    .replace(/\b\d{10,15}\b/g, match => redactPhone(match))
    .replace(/\b(?:Ref|Tix|Tixraac|reference)\s*[:=]\s*(\d{6,})/gi, (_match, ref) => `reference: ${redactReference(ref)}`);
