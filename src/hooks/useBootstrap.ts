import {useEffect, useState} from 'react';
import {appStartupService} from '../services/AppStartupService';

export const useBootstrap = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    appStartupService
      .bootstrap()
      .catch(() => undefined)
      .finally(() => {
        if (mounted) {
          setReady(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  return {ready};
};
