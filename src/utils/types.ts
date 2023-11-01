import { ChainId } from './ChainTypes';

export type GetSafeDto = {
  chainId: ChainId;
  address: string;
};

export type GetBalancesDto = {
  chainId: ChainId;
  eoaAddress: string;
  tokenAddresses?: [];
};

export type TokenData = {
  contract_decimals: number;
  contract_name: string;
  contract_ticker_symbol: string;
  contract_address: string;
  balance: string;
  allowance: number;
  permitExist: boolean;
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
  chainId: ChainId;
  eoaAddress: string;
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
