import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import EnterAddress from './EnterAddress';
import Routes from '../../../../../../constants/navigation/Routes';
import renderDepositTestComponent from '../../utils/renderDepositTestComponent';
import { BasicInfoFormData } from '../BasicInfo/BasicInfo';
import { BuyQuote } from '@consensys/native-ramps-sdk';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockSetNavigationOptions = jest.fn();

const mockFormData: BasicInfoFormData = {
  firstName: 'John',
  lastName: 'Doe',
  mobileNumber: '+1234567890',
  dob: '01/01/1990',
  ssn: '123-45-6789',
};

const mockQuote = {
  quoteId: 'test-quote-id',
} as BuyQuote;

const mockUseDepositSdkMethodInitialState = {
  data: null,
  error: null as string | null,
  isFetching: false,
};

let mockKycFunction = jest.fn().mockResolvedValue(undefined);
let mockPurposeFunction = jest.fn().mockResolvedValue(undefined);
let mockSsnFunction = jest.fn().mockResolvedValue(undefined);
let mockKycValues = [mockUseDepositSdkMethodInitialState, mockKycFunction];
let mockPurposeValues = [
  mockUseDepositSdkMethodInitialState,
  mockPurposeFunction,
];
let mockSsnValues = [
  { ...mockUseDepositSdkMethodInitialState },
  mockSsnFunction,
];

jest.mock('../../hooks/useDepositSdkMethod', () => ({
  useDepositSdkMethod: jest.fn((config) => {
    if (config?.method === 'patchUser') {
      return mockKycValues;
    }
    if (config?.method === 'submitPurposeOfUsageForm') {
      return mockPurposeValues;
    }
    if (config?.method === 'submitSsnDetails') {
      return mockSsnValues;
    }
    return [mockUseDepositSdkMethodInitialState, jest.fn()];
  }),
}));

jest.mock('@react-navigation/native', () => {
  const actualReactNavigation = jest.requireActual('@react-navigation/native');
  return {
    ...actualReactNavigation,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
      setOptions: mockSetNavigationOptions.mockImplementation(
        actualReactNavigation.useNavigation().setOptions,
      ),
    }),
    useRoute: () => ({
      params: { formData: mockFormData, quote: mockQuote },
    }),
  };
});

function render(Component: React.ComponentType) {
  return renderDepositTestComponent(Component, Routes.DEPOSIT.ENTER_ADDRESS);
}

describe('EnterAddress Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKycFunction = jest.fn().mockResolvedValue(undefined);
    mockPurposeFunction = jest.fn().mockResolvedValue(undefined);
    mockSsnFunction = jest.fn().mockResolvedValue(undefined);
    mockKycValues = [
      { ...mockUseDepositSdkMethodInitialState },
      mockKycFunction,
    ];
    mockPurposeValues = [
      { ...mockUseDepositSdkMethodInitialState },
      mockPurposeFunction,
    ];
    mockSsnValues = [
      { ...mockUseDepositSdkMethodInitialState },
      mockSsnFunction,
    ];
  });

  it('render matches snapshot', () => {
    const { toJSON } = render(EnterAddress);
    expect(toJSON()).toMatchSnapshot();
  });

  it('displays form validation errors when continue is pressed with empty fields', () => {
    render(EnterAddress);
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.toJSON()).toMatchSnapshot();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('submits form data and navigates to next page when form is valid and continue is pressed', async () => {
    render(EnterAddress);

    // Fill form fields
    fireEvent.changeText(
      screen.getByTestId('address-line-1-input'),
      '123 Main St',
    );
    fireEvent.changeText(screen.getByTestId('city-input'), 'New York');
    fireEvent.changeText(screen.getByTestId('state-input'), 'NY');
    fireEvent.changeText(screen.getByTestId('postal-code-input'), '10001');
    fireEvent.changeText(screen.getByTestId('country-input'), 'US');

    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(Routes.DEPOSIT.KYC_PROCESSING, {
        quote: mockQuote,
      });
    });
  });

  it('does not navigate if form submission fails', async () => {
    mockKycFunction.mockResolvedValueOnce({ error: 'API error' });

    render(EnterAddress);

    // Fill form fields
    fireEvent.changeText(
      screen.getByTestId('address-line-1-input'),
      '123 Main St',
    );
    fireEvent.changeText(screen.getByTestId('city-input'), 'New York');
    fireEvent.changeText(screen.getByTestId('state-input'), 'NY');
    fireEvent.changeText(screen.getByTestId('postal-code-input'), '10001');
    fireEvent.changeText(screen.getByTestId('country-input'), 'US');

    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(mockKycFunction).toHaveBeenCalled();

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it('calls setOptions with correct title when the component mounts', () => {
    render(EnterAddress);
    expect(mockSetNavigationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Enter your address',
      }),
    );
  });

  it('calls submitSsnDetails with SSN if present and proceeds if successful', async () => {
    render(EnterAddress);
    fireEvent.changeText(
      screen.getByTestId('address-line-1-input'),
      '123 Main St',
    );
    fireEvent.changeText(screen.getByTestId('city-input'), 'New York');
    fireEvent.changeText(screen.getByTestId('state-input'), 'NY');
    fireEvent.changeText(screen.getByTestId('postal-code-input'), '10001');
    fireEvent.changeText(screen.getByTestId('country-input'), 'US');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(mockSsnFunction).toHaveBeenCalledWith('123-45-6789');
      expect(mockNavigate).toHaveBeenCalledWith(Routes.DEPOSIT.KYC_PROCESSING, {
        quote: mockQuote,
      });
    });
  });

  it('does not navigate if submitSsnDetails returns an error', async () => {
    mockSsnValues = [
      { ...mockUseDepositSdkMethodInitialState, error: 'SSN error' },
      mockSsnFunction,
    ];
    render(EnterAddress);
    fireEvent.changeText(
      screen.getByTestId('address-line-1-input'),
      '123 Main St',
    );
    fireEvent.changeText(screen.getByTestId('city-input'), 'New York');
    fireEvent.changeText(screen.getByTestId('state-input'), 'NY');
    fireEvent.changeText(screen.getByTestId('postal-code-input'), '10001');
    fireEvent.changeText(screen.getByTestId('country-input'), 'US');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(mockSsnFunction).toHaveBeenCalledWith('123-45-6789');
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it('disables the continue button if ssnIsFetching is true', () => {
    mockSsnValues = [
      { ...mockUseDepositSdkMethodInitialState, isFetching: true },
      mockSsnFunction,
    ];
    render(EnterAddress);
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button.props.disabled).toBe(true);
  });
});
