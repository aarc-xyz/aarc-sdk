import { Signer, ethers } from 'ethers';
import { ChainId } from './ChainTypes';
import { PermitTransferFrom, PermitBatchTransferFrom } from '../SignatureTransfer'
import { GelatoRelay } from "@gelatonetwork/relay-sdk";
import { BaseRelayParams } from "@gelatonetwork/relay-sdk/dist/lib/types";


export type Config = {
  rpcUrl: string,
  signer: Signer,
  apiKey: string
}

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
  balance: string;
  permit2Allowance: string;
  permit2Exist: boolean;
};

export type BalancesResponse = {
  code: number;
  data: TokenData[];
  message: string;
};


export type TokenAndAmount = {
  tokenAddress: string
  amount: string
}

export type ExecuteMigrationDto = {
  scwAddress: string;
  tokenAndAmount?: TokenAndAmount[]
}

export type ExecuteMigrationGaslessDto = {
  scwAddress: string;
  tokenAndAmount: TokenAndAmount[];
  gelatoApiKey: string;
}


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
}



export type PermitData = {
  permitTransferFrom: PermitTransferFrom;
  signature: string;
};

export type BatchPermitData = {
  permitBatchTransferFrom: PermitBatchTransferFrom;
  signature: string;
};

export type RelayTrxDto = {
  relayer: GelatoRelay
  requestData: BaseRelayParams
  gelatoApiKey: string
}

export type GelatoTxStatusDto = {
  relayer: GelatoRelay
  taskId: string
}

export type PermitDto = {
  chainId: ChainId
  eoaAddress: string
  tokenAddress: string
}

export type SingleTransferPermitDto = {
  provider: ethers.providers.JsonRpcProvider
  chainId: ChainId
  spenderAddress: string
  tokenData: TokenData
}

export type BatchTransferPermitDto = {
  provider: ethers.providers.JsonRpcProvider
  chainId: ChainId
  spenderAddress: string
  tokenData: TokenData[]
}

export type PermitDomainDto = {
  permit2Address: string
  chainId: number
}
