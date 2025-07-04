import type { ThemeColors, ThemeTypography } from '@metamask/design-tokens';
import { TextStyle } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import {
  getFontFamily,
  TextVariant,
} from '../../../../component-library/components/Texts/Text';

const getSharedStyles = (
  colors: ThemeColors,
  typography: ThemeTypography,
  _safeAreaInsets: EdgeInsets,
) =>
  ({
    icon: {
      height: 24,
      width: 24,
      borderRadius: 12,
      borderWidth: 1,
    },
    iconText: {
      ...typography.sBodyMD,
      fontFamily: getFontFamily(TextVariant.BodyMD),
      textAlign: 'center',
    } as TextStyle,
    dappName: {
      flexShrink: 1,
      flexGrow: 1,
      marginLeft: 5,
      marginRight: 5,
      flexWrap: 'wrap',
    },
    disconnectContainer: {
      borderColor: colors.error.default,
      alignItems: 'center',
      height: 24,
      width: 120,
      paddingLeft: 10,
      paddingRight: 10,
    },
    disconnectFont: {
      ...typography.sBodyMD,
      fontFamily: getFontFamily(TextVariant.BodyMD),
      color: colors.error.default,
    } as TextStyle,
  } as const);

export default getSharedStyles;
