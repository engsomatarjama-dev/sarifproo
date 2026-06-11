export const normalizePhone = (value: string) => value.replace(/[^\d]/g, '');

export const normalizeSms = (value: string) =>
  value
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

export const makeDeterministicHash = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return `sms_${(hash >>> 0).toString(16)}`;
};
