import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {sarifSmsHeadlessTask} from './src/automation/SmsHeadlessTask';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerHeadlessTask('SarifSmsHeadlessTask', () => sarifSmsHeadlessTask);
