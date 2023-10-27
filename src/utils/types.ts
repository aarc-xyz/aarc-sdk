import { ChainId } from './ChainTypes';

export type GetSafeDto = {
  chainId: ChainId;
  address: string;
};

export type GetBalancesDto = {
  chainId: ChainId;
  address: string;
  tokenAddresses?: [];
};
