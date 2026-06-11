import {AnonymousAppMetadata} from '../types';

export class LoggingApiService {
  async enqueueAnonymousAppMetadata(_metadata: AnonymousAppMetadata) {
    return {
      ok: false as const,
      message:
        'Remote transaction and automation log sync is disabled. Only anonymous app metadata may be sent by a future backend integration.',
    };
  }
}

export const loggingApiService = new LoggingApiService();
