import React from 'react';
import renderWithProvider from '../../../../../util/test/renderWithProvider';
import StakeConfirmationView from './StakeConfirmationView';
import { Image, ImageSize } from 'react-native';
import { createMockAccountsControllerState } from '../../../../../util/test/accountsControllerTestUtils';
import { backgroundState } from '../../../../../util/test/initial-root-state';
import configureMockStore from 'redux-mock-store';
import { Provider } from 'react-redux';
import { StakeConfirmationViewProps } from './StakeConfirmationView.types';
import { MOCK_POOL_STAKING_SDK } from '../../__mocks__/stakeMockData';

jest.mock('../../../../hooks/useIpfsGateway', () => jest.fn());

Image.getSize = jest.fn(
  (
    _uri: string,
    success?: (width: number, height: number) => void,
    _failure?: (error: Error) => void,
  ) => {
    if (success) {
      success(100, 100);
    }
    return Promise.resolve<ImageSize>({ width: 100, height: 100 });
  },
);
const MOCK_ADDRESS_1 = '0x0';
const MOCK_ADDRESS_2 = '0x1';

const MOCK_ACCOUNTS_CONTROLLER_STATE = createMockAccountsControllerState([
  MOCK_ADDRESS_1,
  MOCK_ADDRESS_2,
]);

const mockStore = configureMockStore();

const mockInitialState = {
  settings: {},
  engine: {
    backgroundState: {
      ...backgroundState,
      AccountsController: MOCK_ACCOUNTS_CONTROLLER_STATE,
    },
  },
};
const store = mockStore(mockInitialState);

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useSelector: jest
    .fn()
    .mockImplementation((callback) => callback(mockInitialState)),
}));

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      setOptions: jest.fn(),
    }),
  };
});

jest.mock('../../hooks/usePoolStakedDeposit', () => ({
  __esModule: true,
  default: () => ({
    attemptDepositTransaction: jest.fn(),
  }),
}));

jest.mock('../../hooks/useStakeContext', () => ({
  __esModule: true,
  useStakeContext: jest.fn(() => MOCK_POOL_STAKING_SDK),
}));

jest.mock('../../hooks/usePooledStakes', () => ({
  __esModule: true,
  default: () => ({
    refreshPooledStakes: jest.fn(),
  }),
}));

expect.addSnapshotSerializer({
  test: (val) =>
    val &&
    typeof val === 'object' &&
    (val.props?.source?.uri === '' ||
      val.props?.onLayout ||
      val.props?.onError ||
      val.props?.onLoadEnd),
  print: () => 'IGNORED_RANDOM_ELEMENT',
});

describe('StakeConfirmationView', () => {
  it('render matches snapshot', () => {
    const props: StakeConfirmationViewProps = {
      route: {
        key: '1',
        params: {
          amountWei: '10000000000000000',
          amountFiat: '26.21',
          annualRewardRate: '2.6%',
          annualRewardsETH: '0.00026 ETH',
          annualRewardsFiat: '$0.68',
          chainId: '1',
        },
        name: 'params',
      },
    };

    const { toJSON } = renderWithProvider(
      <Provider store={store}>
        <StakeConfirmationView {...props} />
      </Provider>,
    );

    expect(toJSON()).toMatchSnapshot();
  });
});
