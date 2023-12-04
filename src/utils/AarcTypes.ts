import { BigNumber, BigNumberish, Signer } from 'ethers';
import { ChainId } from './ChainTypes';
import {
  PermitTransferFrom,
  PermitBatchTransferFrom,
  TokenPermissions,
} from '@uniswap/permit2-sdk';
import { GelatoRelay } from '@gelatonetwork/relay-sdk';
import { BaseRelayParams } from '@gelatonetwork/relay-sdk/dist/lib/types';

export type Config = {
  chainId: number;
  rpcUrl: string;
  apiKey: string;
};

export type GetSafeDto = {
  chainId: ChainId;
  address: string;
};

export enum WALLET_TYPE {
  BICONOMY,
  SAFE,
}

export type DeployWalletDto = {
  walletType: WALLET_TYPE;
  owner: string;
  receiver: string;
  amount?: BigNumber;
  signer: Signer;
  deploymentWalletIndex?: number;
};

export type GetBalancesDto = {
  tokenAddresses?: string[];
};

export type TokenData = {
  decimals: number;
  native_token: boolean;
  name: string;
  symbol: string;
  token_address: string;
  balance: BigNumber;
  type: string;
  permit2Allowance: BigNumber;
  permitExist: boolean;
  nft_data: TokenNftData[];
};

export type TokenNftData = {
  image: string;
  tokenId: string;
};

export type BalancesResponse = {
  code: number;
  data: TokenData[];
  message: string;
};

export type TransferTokenDetails = {
  tokenAddress: string;
  amount?: BigNumber; // for ERC20
  tokenIds?: string[]; // for ERC721
};

export type ExecuteMigrationDto = {
  senderSigner: Signer;
  receiverAddress: string;
  transferTokenDetails?: TransferTokenDetails[];
};

export type ExecuteMigrationGaslessDto = {
  senderSigner: Signer;
  receiverAddress: string;
  transferTokenDetails?: TransferTokenDetails[];
  gelatoApiKey: string;
};

export type TokenTransferDto = {
  senderSigner: Signer;
  recipientAddress: string;
  tokenAddress: string;
  amount: BigNumber;
};

export type NftTransferDto = {
  senderSigner: Signer;
  recipientAddress: string;
  tokenAddress: string;
  tokenId: string;
};

export type NativeTransferDto = {
  senderSigner: Signer;
  recipientAddress: string;
  amount: BigNumber;
};

export interface SafeInfoResponse {
  address: string;
  nonce: number;
  threshold: number;
  owners: string[];
  masterCopy: string;
  modules: string[];
  fallbackHandler: string;
  guard: string;
  version: string;
}

export type OwnerResponse = {
  safes: string[];
};

export type PermitData = {
  permitTransferFrom: PermitTransferFrom;
  signature: string;
};

export type BatchPermitData = {
  permitBatchTransferFrom: PermitBatchTransferFrom;
  signature: string;
};

export type RelayTrxDto = {
  relayer: GelatoRelay;
  requestData: BaseRelayParams;
  gelatoApiKey: string;
};

export type GelatoTxStatusDto = {
  relayer: GelatoRelay;
  taskId: string;
};

export type PermitDto = {
  signer: Signer;
  chainId: ChainId;
  eoaAddress: string;
  tokenAddress: string;
};

export type SingleTransferPermitDto = {
  signer: Signer;
  chainId: ChainId;
  spenderAddress: string;
  tokenData: TokenData;
};

export type BatchTransferPermitDto = {
  signer: Signer;
  chainId: ChainId;
  spenderAddress: string;
  tokenData: TokenData[];
};

export type PermitDomainDto = {
  permit2Address: string;
  chainId: number;
};

export type MigrationResponse = {
  tokenAddress: string;
  amount?: BigNumber | BigNumberish;
  message: string;
  txHash?: string;
  tokenId?: string;
};

export type TransactionsResponse = {
  from: string;
  to: string;
  tokenAddress: string;
  amount: BigNumber;
  tokenId?: string;
  type: string;
  tokenPermissions?: { to: string; requestedAmount: BigNumberish }[];
  batchDto?: {
    permitted: TokenPermissions[];
    spender: string;
    nonce: BigNumberish;
    deadline: BigNumberish;
  };
  signature?: string;
  data?: string;
  gasCost?: BigNumber;
};
