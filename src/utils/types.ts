import { BigNumber, BigNumberish, Signer, ethers } from 'ethers';
import { ChainId } from './ChainTypes';
import {
  PermitTransferFrom,
  PermitBatchTransferFrom,
} from '../SignatureTransfer';
import { GelatoRelay } from '@gelatonetwork/relay-sdk';
import { BaseRelayParams } from '@gelatonetwork/relay-sdk/dist/lib/types';

export type Config = {
  rpcUrl: string;
  signer: Signer;
  apiKey: string;
};

export type GetSafeDto = {
  chainId: ChainId;
  address: string;
};

export type GetBalancesDto = {
  tokenAddresses?: string[];
};

export type TokenData = {
  decimals: number;
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

export type TokenAndAmount = {
  tokenAddress: string;
  amount?: BigNumber;
};

export type ExecuteMigrationDto = {
  receiverAddress: string;
  tokenAndAmount?: TokenAndAmount[];
};

export type ExecuteMigrationGaslessDto = {
  receiverAddress: string;
  tokenAndAmount?: TokenAndAmount[];
  gelatoApiKey: string;
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
  chainId: ChainId;
  eoaAddress: string;
  tokenAddress: string;
};

export type SingleTransferPermitDto = {
  provider: ethers.providers.JsonRpcProvider;
  chainId: ChainId;
  spenderAddress: string;
  tokenData: TokenData;
};

export type BatchTransferPermitDto = {
  provider: ethers.providers.JsonRpcProvider;
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
