import { RootState } from '../reducers';
import { createSelector } from 'reselect';

const selectSettings = (state: RootState) => state.settings;

export const selectShowFiatInTestnets = createSelector(
  selectSettings,
  (settingsState: Record<string, unknown>) =>
    settingsState.showFiatOnTestnets as boolean,
);

export const selectPrimaryCurrency = createSelector(
  selectSettings,
  (settingsState: Record<string, unknown>) => settingsState.primaryCurrency,
);
export const selectShowCustomNonce = createSelector(
  selectSettings,
  (settingsState: Record<string, unknown>) => settingsState.showCustomNonce,
);

export const selectBasicFunctionalityEnabled = createSelector(
  selectSettings,
  (settingsState: Record<string, unknown>) =>
    settingsState.basicFunctionalityEnabled as boolean,
);

export const selectHideZeroBalanceTokens = createSelector(
  selectSettings,
  (settingsState: Record<string, unknown>) =>
    Boolean(settingsState.hideZeroBalanceTokens),
);

export const selectDeepLinkModalDisabled = createSelector(
  selectSettings,
  (settingsState: Record<string, unknown>) =>
    Boolean(settingsState.deepLinkModalDisabled),
);
