import { WalletDevice } from '@metamask/transaction-controller';
import { NavigationContainerRef } from '@react-navigation/native';
import { IWalletKit, WalletKitTypes } from '@reown/walletkit';
import { SessionTypes } from '@walletconnect/types';
import { ImageSourcePropType, Linking, Platform } from 'react-native';

import { CaipChainId, Hex } from '@metamask/utils';
import Routes from '../../../app/constants/navigation/Routes';
import ppomUtil from '../../../app/lib/ppom/ppom-util';
import { selectEvmChainId, selectEvmNetworkConfigurationsByChainId, selectNetworkConfigurationsByCaipChainId } from '../../selectors/networkController';
import { store } from '../../store';
import Device from '../../util/device';
import Logger from '../../util/Logger';
import { getGlobalNetworkClientId } from '../../util/networks/global-network';
import { addTransaction } from '../../util/transaction-controller';
import BackgroundBridge from '../BackgroundBridge/BackgroundBridge';
import { Minimizer } from '../NativeModules';
import { getPermittedAccounts } from '../Permissions';
import getRpcMethodMiddleware from '../RPCMethods/RPCMethodMiddleware';
import DevLogger from '../SDKConnect/utils/DevLogger';
import { ERROR_MESSAGES } from './WalletConnectV2';
import METHODS_TO_REDIRECT from './wc-config';
import {
  checkWCPermissions,
  getHostname,
  getScopedPermissions,
  hideWCLoadingState,
} from './wc-utils';
import Engine from '../Engine/Engine';
import { isPerDappSelectedNetworkEnabled } from '../../util/networks';
import { selectPerOriginChainId } from '../../selectors/selectedNetworkController';

const ERROR_CODES = {
  USER_REJECT_CODE: 5000,
};

const RPC_WALLET_SWITCHETHEREUMCHAIN = 'wallet_switchEthereumChain';
const RPC_WALLET_ADDETHEREUMCHAIN = 'wallet_addEthereumChain';

interface BackgroundBridgeFactory {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create: (options: any) => BackgroundBridge;
}

class WalletConnect2Session {
  private backgroundBridge: BackgroundBridge;
  private navigation?: NavigationContainerRef;
  private web3Wallet: IWalletKit;
  private deeplink: boolean;
  // timeoutRef is used on android to prevent automatic redirect on switchChain and wait for wallet_addEthereumChain.
  // If addEthereumChain is not received after 3 seconds, it will redirect.
  private timeoutRef: NodeJS.Timeout | null = null;
  private requestsToRedirect: { [request: string]: boolean } = {};
  private topicByRequestId: { [requestId: string]: string } = {};
  private requestByRequestId: {
    [requestId: string]: WalletKitTypes.SessionRequest;
  } = {};
  private lastChainId: Hex;
  private isHandlingChainChange = false;
  private _isHandlingRequest = false;

  public session: SessionTypes.Struct;

  constructor({
    web3Wallet,
    session,
    navigation,
    channelId,
    deeplink,
    backgroundBridgeFactory = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: (options: any) => new BackgroundBridge(options),
    },
  }: {
    web3Wallet: IWalletKit;
    channelId: string;
    session: SessionTypes.Struct;
    deeplink: boolean;
    navigation?: NavigationContainerRef;
    backgroundBridgeFactory?: BackgroundBridgeFactory;
  }) {
    this.web3Wallet = web3Wallet;
    this.deeplink = deeplink;
    this.session = session;
    this.navigation = navigation;

    DevLogger.log(
      `WalletConnect2Session::constructor channelId=${channelId} deeplink=${deeplink}`,
      navigation,
    );

    const url = session.peer.metadata.url;
    const name = session.peer.metadata.name;
    const icons = session.peer.metadata.icons;

    DevLogger.log(
      `WalletConnect2Session::constructor topic=${session.topic} pairingTopic=${session.pairingTopic} url=${url} name=${name} icons=${icons}`,
    );

    this.backgroundBridge = backgroundBridgeFactory.create({
      webview: null,
      url,
      isWalletConnect: true,
      channelId,
      wcRequestActions: {
        approveRequest: this.approveRequest.bind(this),
        rejectRequest: this.rejectRequest.bind(this),
        updateSession: this.updateSession.bind(this),
        emitEvent: this.emitEvent.bind(this),
      },
      getRpcMethodMiddleware: ({
        getProviderState,
      }: {
        hostname: string;
        // TODO: Replace 'any' with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getProviderState: any;
      }) =>
        getRpcMethodMiddleware({
          hostname: this.hostname,
          getProviderState,
          channelId,
          analytics: {},
          isMMSDK: false,
          isHomepage: () => false,
          fromHomepage: { current: false },
          injectHomePageScripts: () => false,
          navigation: this.navigation,
          url: { current: url },
          title: { current: name },
          icon: { current: icons?.[0] as ImageSourcePropType },
          toggleUrlModal: () => null,
          wizardScrollAdjusted: { current: false },
          tabId: '',
          isWalletConnect: true,
        }),
      isMMSDK: false,
      isMainFrame: true,
      getApprovedHosts: undefined,
      isRemoteConn: false,
      sendMessage: undefined,
      remoteConnHost: undefined,
    });

    this.checkPendingRequests();
    this.lastChainId = this.getCurrentChainId()
    // Subscribe to store changes to detect chain switches
    store.subscribe(this.onStoreChange.bind(this));
  }

  private get origin() {
    return this.session.peer.metadata.url;
  }

  private get hostname() {
    return getHostname(this.origin);
  }

  private onStoreChange() {
    const newChainId = this.getCurrentChainId();
    if (newChainId !== this.lastChainId && !this.isHandlingChainChange) {
      this.lastChainId = newChainId;
      const decimalChainId = Number.parseInt(newChainId, 16);
      this.handleChainChange(decimalChainId).catch((error) => {
        console.warn(
          'WC2::store.subscribe Error handling chain change:',
          error,
        );
      });
    }
  }

  private getCurrentChainId() {
    const providerConfigChainId = selectEvmChainId(store.getState());
    if (isPerDappSelectedNetworkEnabled()) {
      const perOriginChainId = selectPerOriginChainId(
        store.getState(),
        this.hostname,
      );
      return perOriginChainId;
    }
    return providerConfigChainId;
  }

  private getChainIdForCaipChainId(caipChainId: CaipChainId) {
    const caipNetworkConfiguration = selectNetworkConfigurationsByCaipChainId(store.getState());
    const { chainId } = caipNetworkConfiguration[caipChainId];
    //TODO: Remove this cast when caipNetworkConfiguration is fixed, duplicate types for chainId
    return chainId as Hex;
  }

  private getNetworkClientIdForCaipChainId(caipChainId: CaipChainId) {
    const networkConfigurationsByChainId = selectEvmNetworkConfigurationsByChainId(store.getState());
    const chainId = this.getChainIdForCaipChainId(caipChainId);
    //Casting is required, because caipnetwork config has duplicate types and we assume the correct one is Hex
    const { rpcEndpoints: [{ networkClientId }] } = networkConfigurationsByChainId[chainId as Hex];
    return networkClientId;
  }

  /** Check for pending unresolved requests */
  private checkPendingRequests = async () => {
    const pendingSessionRequests = this.web3Wallet.getPendingSessionRequests();
    if (pendingSessionRequests) {
      for (const request of pendingSessionRequests) {
        DevLogger.log(
          `WC2::constructor pendingSessionRequests requestId=${request.id}`,
        );
        try {
          if (request.topic === this.session.topic) {
            await this.handleRequest(request);
          } else {
            console.warn(
              `WC2::constructor invalid request topic=${request.topic}`,
            );
          }
        } catch (error) {
          Logger.error(
            error as Error,
            'WC2::constructor error while handling request',
          );
        }
      }
    }
  };

  setDeeplink = (deeplink: boolean) => {
    this.deeplink = deeplink;
  };

  redirect = (context?: string) => {
    DevLogger.log(
      `WC2::redirect context=${context} isDeeplink=${this.deeplink
      } navigation=${this.navigation !== undefined}`,
    );
    if (!this.deeplink) return;

    const navigation = this.navigation;

    const showReturnModal = () => {
      navigation?.navigate(Routes.MODAL.ROOT_MODAL_FLOW, {
        screen: Routes.SHEET.RETURN_TO_DAPP_MODAL,
      });
    };

    setTimeout(() => {
      if (Device.isIos() && parseInt(Platform.Version as string) >= 17) {
        const redirect = this.session.peer.metadata.redirect;
        const peerLink = redirect?.native || redirect?.universal;
        if (peerLink) {
          Linking.openURL(peerLink).catch((error) => {
            DevLogger.log(
              `WC2::redirect error while opening ${peerLink} with error ${error}`,
            );
            showReturnModal();
          });
        } else {
          showReturnModal();
        }
      } else {
        Minimizer.goBack();
      }
    }, 100);
  };

  needsRedirect = (id: string) => {
    if (this.requestsToRedirect[id]) {
      delete this.requestsToRedirect[id];
      this.redirect(`needsRedirect_${id}`);
    }
  };

  isHandlingRequest = () => this._isHandlingRequest;

  emitEvent = async (eventName: string, data: unknown) => {
    await this.web3Wallet.emitSessionEvent({
      topic: this.session.topic,
      event: { name: eventName, data },
      chainId: `eip155:${data}`,
    });
  };

  /** Handle chain change by updating session namespaces and emitting event */
  private async handleChainChange(chainIdDecimal: number) {
    if (this.isHandlingChainChange) return;
    this.isHandlingChainChange = true;

    try {
      // Update session namespaces
      const currentNamespaces = this.session.namespaces;
      const newChainId = `eip155:${chainIdDecimal}`;
      const updatedChains = [
        ...new Set([...(currentNamespaces?.eip155?.chains || []), newChainId]),
      ];

      const accounts = [...new Set((currentNamespaces?.eip155?.accounts || []).map((acc) => acc.split(':')[2]))].map((account) => `${newChainId}:${account}`);

      const updatedAccounts = [
        ...new Set([...(currentNamespaces?.eip155?.accounts || []), ...accounts]),
      ];

      const updatedNamespaces = {
        ...currentNamespaces,
        eip155: {
          ...(currentNamespaces?.eip155 || {}),
          chains: updatedChains,
          methods: currentNamespaces?.eip155?.methods || [],
          events: currentNamespaces?.eip155?.events || [],
          accounts: updatedAccounts,
        },
      };

      DevLogger.log(
        `WC2::handleChainChange updating session with namespaces`,
        updatedNamespaces,
      );

      await this.web3Wallet.updateSession({
        topic: this.session.topic,
        namespaces: updatedNamespaces,
      });
      // await acknowledged();

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Emit chainChanged event
      await this.emitEvent('chainChanged', chainIdDecimal);
    } catch (error) {
      DevLogger.log(
        `WC2::handleChainChange error while updating session`,
        error,
      );
      throw error;
    } finally {
      this.isHandlingChainChange = false;
    }
  }

  approveRequest = async ({ id, result }: { id: string; result: unknown }) => {
    const topic = this.topicByRequestId[id];
    const initialRequest = this.requestByRequestId[id];
    const method = initialRequest?.params.request.method;

    if (
      method === RPC_WALLET_ADDETHEREUMCHAIN ||
      method === RPC_WALLET_SWITCHETHEREUMCHAIN
    ) {
      const chainIdHex = initialRequest.params.request.params[0].chainId;
      const chainIdDecimal = parseInt(chainIdHex, 16);
      await this.handleChainChange(chainIdDecimal);
    }

    try {
      await this.web3Wallet.respondSessionRequest({
        topic,
        response: {
          id: parseInt(id),
          jsonrpc: '2.0',
          result,
        },
      });
      this._isHandlingRequest = false;
    } catch (err) {
      console.warn(
        `WC2::approveRequest error while approving request id=${id} topic=${topic}`,
        err,
      );
    }

    const requests = this.web3Wallet.getPendingSessionRequests() || [];
    const hasPendingSignRequest =
      requests[0]?.params?.request?.method === 'personal_sign';

    if (!hasPendingSignRequest) {
      this.needsRedirect(id);
    }
  };

  rejectRequest = async ({ id, error }: { id: string; error: unknown }) => {
    const topic = this.topicByRequestId[id];

    let errorMsg = '';
    if (error instanceof Error) {
      errorMsg = error.message;
    } else if (typeof error === 'string') {
      errorMsg = error;
    } else {
      errorMsg = JSON.stringify(error);
    }

    const errorResponse = {
      code: ERROR_CODES.USER_REJECT_CODE,
      message: errorMsg,
    };

    try {
      await this.web3Wallet.respondSessionRequest({
        topic,
        response: {
          id: parseInt(id),
          jsonrpc: '2.0',
          error: errorResponse,
        },
      });
      this._isHandlingRequest = false;
    } catch (err) {
      console.warn(
        `WC2::rejectRequest error while rejecting request id=${id} topic=${topic}`,
        err,
      );
    }

    this.needsRedirect(id);
  };

  updateSession = async ({ chainId, accounts }: { chainId: number; accounts?: string[]; }) => {
    try {
      if (!accounts) {
        DevLogger.log(
          `Invalid accounts --- skip ${typeof chainId} chainId=${chainId} accounts=${accounts})`,
        );
        return;
      }

      DevLogger.log(
        `WC2::updateSession origin=${this.origin} hostname=${this.hostname} - chainId=${chainId} - accounts=${accounts}`,
      );

      if (accounts.length === 0) {
        const approvedAccounts = getPermittedAccounts(this.hostname);
        if (approvedAccounts.length > 0) {
          DevLogger.log(
            `WC2::updateSession found approved accounts`,
            approvedAccounts,
          );
          accounts = approvedAccounts;
        } else {
          console.warn(
            `WC2::updateSession no permitted accounts found for topic=${this.session.topic} origin=${this.origin}`,
          );
          return;
        }
      }

      if (chainId === 0) {
        DevLogger.log(
          `WC2::updateSession invalid chainId --- skip ${typeof chainId} chainId=${chainId} accounts=${accounts})`,
        );
        chainId = parseInt(selectEvmChainId(store.getState()), 16);
        DevLogger.log(
          `WC2::updateSession overwrite invalid chain Id with selectedChainId=${chainId}`,
        );
      }

      const namespaces = await getScopedPermissions({ origin: this.origin });
      DevLogger.log(
        `🔴🔴 WC2::updateSession updating with namespaces`,
        namespaces,
      );

      await this.web3Wallet.updateSession({
        topic: this.session.topic,
        namespaces,
      });

      await this.emitEvent('chainChanged', chainId);
    } catch (err) {
      console.warn(
        `WC2::updateSession can't update session topic=${this.session.topic}`,
        err,
      );
    }
  };

  handleRequest = async (requestEvent: WalletKitTypes.SessionRequest) => {
    DevLogger.log(
      'WC2::handleRequest requestEvent',
      JSON.stringify(requestEvent, null, 2),
    );
    this.topicByRequestId[requestEvent.id] = requestEvent.topic;
    this.requestByRequestId[requestEvent.id] = requestEvent;

    if (this.timeoutRef) {
      // Always clear the timeout ref on new message, it is only used for wallet_switchEthereumChain auto reject on android
      clearTimeout(this.timeoutRef);
    }

    // Set this to true before handling the request
    // So we know whether to show the loading state
    this._isHandlingRequest = true;

    hideWCLoadingState({ navigation: this.navigation });

    const verified = requestEvent.verifyContext?.verified;
    const origin = verified?.origin ?? this.origin;
    const method = requestEvent.params.request.method;
    const isSwitchingChain = method === 'wallet_switchEthereumChain';
    const caip2ChainId = (isSwitchingChain ? `eip155:${parseInt(requestEvent.params.request.params[0].chainId, 16)}` : requestEvent.params.chainId) as CaipChainId;
    const methodParams = requestEvent.params.request.params;

    DevLogger.log(
      `WalletConnect2Session::handleRequest caip2ChainId=${caip2ChainId} method=${method} origin=${origin}`,
    );

    try {
      const allowed = await checkWCPermissions({ origin, caip2ChainId, allowSwitchingToNewChain: isSwitchingChain });
      DevLogger.log(
        `WC2::handleRequest caip2ChainId=${caip2ChainId} is allowed=${allowed}`,
      );

      if (!allowed) {
        DevLogger.log(
          `WC2::handleRequest caip2ChainId=${caip2ChainId} is not allowed`,
        );
        await this.web3Wallet.respondSessionRequest({
          topic: this.session.topic,
          response: {
            id: requestEvent.id,
            jsonrpc: '2.0',
            error: { code: 4902, message: ERROR_MESSAGES.INVALID_CHAIN },
          },
        });
        return;
      }
    } catch (error) {
      DevLogger.log(
        `WC2::handleRequest caip2ChainId=${caip2ChainId} is not allowed`,
      );
      await this.web3Wallet.respondSessionRequest({
        topic: this.session.topic,
        response: {
          id: requestEvent.id,
          jsonrpc: '2.0',
          error: { code: 4902, message: ERROR_MESSAGES.INVALID_CHAIN },
        },
      });
      return;
    }


    if (isPerDappSelectedNetworkEnabled()) {
      const chainId = this.getChainIdForCaipChainId(caip2ChainId);
      const currentChainId = this.getCurrentChainId();
      if (currentChainId !== chainId) {
        const networkClientId = this.getNetworkClientIdForCaipChainId(caip2ChainId)
        Engine.context.SelectedNetworkController.setNetworkClientIdForDomain(
          this.hostname,
          networkClientId
        )
      }
    }

    if (METHODS_TO_REDIRECT[method]) {
      this.requestsToRedirect[requestEvent.id] = true;
    }

    if (method === 'wallet_switchEthereumChain') {
      const chainId = this.getChainIdForCaipChainId(caip2ChainId);
      this.handleChainChange(Number.parseInt(chainId, 16));
      // respond to the request as successful
      await this.approveRequest({ id: requestEvent.id + '', result: true });
      return;
    }

    if (method === 'eth_sendTransaction') {
      await this.handleSendTransaction(caip2ChainId, requestEvent, methodParams, origin);
      return;
    }

    if (method === 'eth_signTypedData') {
      this.backgroundBridge.onMessage({
        name: 'walletconnect-provider',
        data: {
          id: requestEvent.id,
          topic: requestEvent.topic,
          method: 'eth_signTypedData_v3',
          params: methodParams,
        },
        origin,
      });
      return;
    }

    this.backgroundBridge.onMessage({
      name: 'walletconnect-provider',
      data: {
        id: requestEvent.id,
        topic: requestEvent.topic,
        method,
        params: methodParams,
      },
      origin,
    });
  };

  removeListeners = async () => {
    this.backgroundBridge.onDisconnect();
  };

  private async handleSendTransaction(
    caip2ChainId: CaipChainId,
    requestEvent: WalletKitTypes.SessionRequest,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    methodParams: any,
    origin: string
  ) {
    try {

      const networkClientId = isPerDappSelectedNetworkEnabled() ?
        this.getNetworkClientIdForCaipChainId(caip2ChainId) :
        getGlobalNetworkClientId();

      const trx = await addTransaction(methodParams[0], {
        deviceConfirmedOn: WalletDevice.MM_MOBILE,
        networkClientId,
        origin,
        securityAlertResponse: undefined,
      });

      const reqObject = {
        id: requestEvent.id,
        jsonrpc: '2.0',
        method: 'eth_sendTransaction',
        origin,
        params: [
          {
            from: methodParams[0].from,
            to: methodParams[0].to,
            value: methodParams[0]?.value,
            data: methodParams[0]?.data,
          },
        ],
      };

      ppomUtil.validateRequest(reqObject, {
        transactionMeta: trx.transactionMeta,
      });
      const hash = await trx.result;

      await this.approveRequest({ id: requestEvent.id + '', result: hash });
    } catch (error) {
      await this.rejectRequest({ id: requestEvent.id + '', error });
    }
  }
}

export default WalletConnect2Session;
