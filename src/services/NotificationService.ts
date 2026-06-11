import {notificationNative} from '../native/SarifNative';

class NotificationService {
  async show(title: string, message: string, channel = 'sarifpro_general') {
    try {
      await notificationNative.showNotification(title, message, channel);
    } catch {
      // noop on devices where local notifications are unavailable
    }
  }
}

export const notificationService = new NotificationService();
