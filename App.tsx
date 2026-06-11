import React, {useEffect} from 'react';
import {NavigationContainer, DefaultTheme, DarkTheme} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {AppState, StatusBar, useColorScheme} from 'react-native';
import {AppNavigator} from './src/navigation/AppNavigator';
import {useBootstrap} from './src/hooks/useBootstrap';
import {appStartupService} from './src/services/AppStartupService';
import {useAppStore} from './src/store/useAppStore';
import {securityPinService} from './src/services/SecurityPinService';

const App = (): React.JSX.Element | null => {
  const colorScheme = useColorScheme();
  const {ready} = useBootstrap();
  const session = useAppStore(state => state.auth.session);

  useEffect(() => {
    if (session) {
      void appStartupService.bootstrapAuthenticated();
    }
  }, [session]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        securityPinService.lock();
      }
    });
    return () => subscription.remove();
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default App;
