import {useColorScheme} from 'react-native';
import {palette} from '../core/theme';

export const useThemeColors = () => {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  return {
    dark,
    background: dark ? palette.darkBg : palette.lightBg,
    card: dark ? palette.darkCard : palette.lightCard,
    text: dark ? palette.darkText : palette.lightText,
    muted: palette.muted,
    border: dark ? '#32404F' : palette.border,
    primary: palette.primary,
    accent: palette.accent,
    success: palette.success,
    warning: palette.warning,
    danger: palette.danger,
  };
};
