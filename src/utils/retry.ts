export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function retryOperation<T>(
  action: () => Promise<T>,
  retries = 3,
  waitMs = 1200,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await delay(waitMs * attempt);
      }
    }
  }
  throw lastError;
}
