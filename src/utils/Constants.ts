import { BigNumber, ethers } from 'ethers';
import { ChainId } from './ChainTypes';

export const BASE_URL = 'https://migrator.aarc.xyz';
export const BALANCES_ENDPOINT = `${BASE_URL}/migrator/balances`;
export const MIGRATE_ENDPOINT = `${BASE_URL}/migrator/migrate/gasless`;
export const TRX_STATUS_ENDPOINT = `${BASE_URL}/migrator/tx/status`;
export const PRICE_ENDPOINT = `${BASE_URL}/migrator/price`;
export const GAS_PRICE_ENDPOINT = `${BASE_URL}/migrator/gas-price`;
export const FORWARD_ENDPOINT = `${BASE_URL}/migrator/migrate/forward`;
export const BICONOMY_TX_SERVICE_URL =
  'https://sdk-backend.prod.biconomy.io/v1';
export const PERMIT_FUNCTION_ABI =
  'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)';

export const TREASURY_ADDRESS = '0xfa59d56b4bb6bdbd28883eef1b7bdf504a124f64';
export const PERMIT_GAS_UNITS = 220000;
export const PERMIT_PER_TRX_UNITS = 70000;
// export const GWEI_UNITS = BigNumber.from(10).pow(9);
export const ETH_UNITS = BigNumber.from(10).pow(18);

interface GAS_TOKEN_ADDRESSES {
  [ChainId.GOERLI]: string;
  [ChainId.SEPOLIA]: string;
  [ChainId.POLYGON_MUMBAI]: string;
  [ChainId.MAINNET]: string;
  [ChainId.POLYGON_MAINNET]: string;
  [ChainId.ARBITRUM]: string;
  [ChainId.ARBITRUM_GOERLI]: string;
  [ChainId.BASE]: string;
  [ChainId.BASE_GOERLI]: string;
  [ChainId.OPTIMISM]: string;
  [ChainId.POLYGON_ZKEVM]: string;
}

// Update nativeTokenAddresses object with specific ChainId keys
export const GAS_TOKEN_ADDRESSES: GAS_TOKEN_ADDRESSES = {
  [ChainId.MAINNET]: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  [ChainId.POLYGON_MAINNET]: '0x0000000000000000000000000000000000001010',
  [ChainId.GOERLI]: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  [ChainId.SEPOLIA]: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  [ChainId.POLYGON_MUMBAI]: '0x0000000000000000000000000000000000001010',
  [ChainId.ARBITRUM]: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  [ChainId.ARBITRUM_GOERLI]: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  [ChainId.BASE]: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  [ChainId.BASE_GOERLI]: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  [ChainId.OPTIMISM]: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  [ChainId.POLYGON_ZKEVM]: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
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

export enum PERMIT_TX_TYPES {
  PERMIT = 'PERMIT',
  PERMIT2_SINGLE = 'PERMIT2_SINGLE',
  PERMIT2_BATCH = 'PERMIT2_BATCH',
}

export enum SAFE_TX_SERVICE_URLS {
  'https://safe-transaction-mainnet.safe.global' = 1,
  'https://safe-transaction-goerli.safe.global' = 5,
  'https://safe-transaction-sepolia.safe.global' = 11155111,
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

export interface Domain {
  name: string;
  version: string;
  chainId?: number;
  verifyingContract: string;
  salt?: string; // Making salt an optional property
}

type SupportedTokens = Record<string, string>;
export const SUPPORTED_STABLE_TOKENS: Partial<
  Record<ChainId, SupportedTokens>
> = {
  [ChainId.MAINNET]: {
    USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    BUSD: '0x4fabb145d64652a948d72533023f6e7a623c7c53',
    DAI: '0x6b175474e89094c44da98b954eedeac495271d0f',
    UNI: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
  },
  [ChainId.POLYGON_MAINNET]: {
    USDC: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
    USDT: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
    BUSD: '0x9c9e5fd8bbc25984b178fdce6117defa39d2db39',
    DAI: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
    UNI: '0xb33eaad8d922b1083446dc23f610c2567fb5180f',
  },
  [ChainId.ARBITRUM]: {
    USDC: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
    USDT: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    DAI: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
    UNI: '0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0',
  },
  [ChainId.OPTIMISM]: {
    USDC: '0x7f5c764cbc14f9669b88837ca1490cca17c31607',
    USDT: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
    DAI: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
  },
};

export const ZERODEV_KERNEL_FACTORY_ADDRESS =
  '0x5de4839a76cf55d0c90e2061ef4386d962E15ae3';
export const KERNEL_IMPLEMENTATION_ADDRESS =
  '0x0DA6a956B9488eD4dd761E59f52FDc6c8068E6B5';
export const KERNEL_ECDSA_VALIDATOR_ADDRESS =
  '0xd9AB5096a832b9ce79914329DAEE236f8Eea0390';
export const ZERODEV_ENTRY_POINT_ADDRESS =
  '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

/**
 * Utility method returning the default simple account factory address given a {@link Chain} object
 *
 * @param chain - a {@link Chain} object
 * @returns a {@link abi.Address} for the given chain
 * @throws if the chain doesn't have an address currently deployed
 */
export const getAlchemySimpleAccountFactoryAddress = (
  chain: number,
): string => {
  switch (chain) {
    case ChainId.MAINNET:
    case ChainId.POLYGON_MAINNET:
    case ChainId.OPTIMISM:
    case ChainId.ARBITRUM:
    case ChainId.BASE:
    case ChainId.BASE_GOERLI:
      return '0x15Ba39375ee2Ab563E8873C8390be6f2E2F50232';
    case ChainId.SEPOLIA:
    case ChainId.GOERLI:
    case ChainId.POLYGON_MUMBAI:
    case ChainId.ARBITRUM_GOERLI:
      return '0x9406Cc6185a346906296840746125a0E44976454';
  }

  throw new Error(
    `no default simple account factory contract exists for ${chain}`,
  );
};
