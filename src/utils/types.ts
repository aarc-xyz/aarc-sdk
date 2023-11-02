import { Signer } from 'ethers';
import { ChainId } from './ChainTypes';
import { PermitTransferFrom, PermitBatchTransferFrom } from '@uniswap/Permit2-sdk'


export type Config = {
  signer: Signer,
  apiKey: string
}

export type GetSafeDto = {
  chainId: ChainId;
  address: string;
};

export type GetBalancesDto = {
  chainId: ChainId;
  eoaAddress: string;
  tokenAddresses?: string[];
};

export type TokenData = {
  contract_decimals: number;
  contract_name: string;
  contract_ticker_symbol: string;
  contract_address: string;
  balance: string;
  permit2Allowance: number;
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
  tokenAndAmount: TokenAndAmount[]
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
