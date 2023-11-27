import { ethers } from 'ethers';
import { ChainId } from './ChainTypes';

export const BASE_URL = 'https://migrator.aarc.xyz';
export const BALANCES_ENDPOINT = `${BASE_URL}/migrator/balances`;
export const BICONOMY_TX_SERVICE_URL =
  'https://sdk-backend.prod.biconomy.io/v1';
export const PERMIT_FUNCTION_ABI =
  'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)';

interface NativeTokenAddresses {
  [ChainId.GOERLI]: string;
  [ChainId.POLYGON_MUMBAI]: string;
  [ChainId.MAINNET]: string;
  [ChainId.POLYGON_MAINNET]: string;
  [ChainId.ARBITRUM]: string;
  [ChainId.BASE]: string;
  [ChainId.BASE_TESTNET]: string;
  [ChainId.OPTIMISM]: string;
  [ChainId.POLYGON_ZKEVM]: string;
}

// Update nativeTokenAddresses object with specific ChainId keys
export const nativeTokenAddresses: NativeTokenAddresses = {
  [ChainId.MAINNET]: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  [ChainId.POLYGON_MAINNET]: '0x0000000000000000000000000000000000001010',
  [ChainId.GOERLI]: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  [ChainId.POLYGON_MUMBAI]: '0x0000000000000000000000000000000000001010',
  [ChainId.ARBITRUM]: '0x0000000000000000000000000000000000001010',
  [ChainId.BASE]: '0x0000000000000000000000000000000000001010',
  [ChainId.BASE_TESTNET]: '0x0000000000000000000000000000000000001010',
  [ChainId.OPTIMISM]: '0x0000000000000000000000000000000000001010',
  [ChainId.POLYGON_ZKEVM]: '0x0000000000000000000000000000000000001010',
};
export const PERMIT2_CONTRACT_ADDRESS =
  '0x000000000022D473030F116dDEE9F6B43aC78BA3';

export const GELATO_RELAYER_ADDRESS =
  '0x75ba5af8effdcfca32e1e288806d54277d1fde99';
export const PERMIT2_DOMAIN_NAME = 'Permit2';

export enum COVALENT_TOKEN_TYPES {
  CRYPTO_CURRENCY = 'cryptocurrency',
  STABLE_COIN = 'stablecoin',
  NFT = 'nft',
  DUST = 'dust',
}

export enum SAFE_TX_SERVICE_URLS {
  'https://safe-transaction-mainnet.safe.global' = 1,
  'https://safe-transaction-goerli.safe.global' = 5,
  'https://safe-transaction-arbitrum.safe.global' = 42161,
  'https://safe-transaction-aurora.safe.global' = 1313161554,
  'https://safe-transaction-avalanche.safe.global' = 43114,
  'https://safe-transaction-base.safe.global' = 8453,
  'https://safe-transaction-base-testnet.safe.global' = 84531,
  'https://safe-transaction-bsc.safe.global' = 56,
  'https://safe-transaction-celo.safe.global' = 42220,
  'https://safe-transaction-gnosis-chain.safe.global' = 100,
  'https://safe-transaction-optimism.safe.global' = 10,
  'https://safe-transaction-polygon.safe.global' = 137,
  'https://safe-transaction-zkevm.safe.global' = 1101,
  'https://safe-transaction-zksync.safe.global' = 324,
}

export const PERMIT_BATCH_TRANSFER_FROM_TYPEHASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(
    'PermitBatchTransferFrom(TokenPermissions[] permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)',
  ),
);

export const PERMIT_FUNCTION_TYPES = {
  Permit: [
    {
      name: 'owner',
      type: 'address',
    },
    {
      name: 'spender',
      type: 'address',
    },
    {
      name: 'value',
      type: 'uint256',
    },
    {
      name: 'nonce',
      type: 'uint256',
    },
    {
      name: 'deadline',
      type: 'uint256',
    },
  ],
};

export const enum GAS_UNITS {
  cryptocurrency = 25000,
  stablecoin = cryptocurrency,
  dust = 21000,
  nft = 60000,
  APPROVE = 46271,
}
