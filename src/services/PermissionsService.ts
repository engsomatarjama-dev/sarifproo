import {Platform} from 'react-native';
import {PERMISSIONS, RESULTS, requestMultiple} from 'react-native-permissions';

const POST_NOTIFICATIONS = 'android.permission.POST_NOTIFICATIONS' as never;

const androidPermissions = [
  PERMISSIONS.ANDROID.RECEIVE_SMS,
  PERMISSIONS.ANDROID.READ_SMS,
  PERMISSIONS.ANDROID.CALL_PHONE,
  POST_NOTIFICATIONS,
];

export const permissionsService = {
  async ensureCriticalPermissions() {
    if (Platform.OS !== 'android') {
      return true;
    }
    const result = await requestMultiple(androidPermissions);
    return Object.values(result).every(value => value === RESULTS.GRANTED);
  },
};
