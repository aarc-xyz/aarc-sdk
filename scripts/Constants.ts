import * as dotenv from 'dotenv';
dotenv.config();

export const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
export const RPC_URL = process.env.RPC_URL || "";
export const API_KEY = process.env.API_KEY || "";
export const GELATO_API_KEY = process.env.GELATO_API_KEY || "";
export const DAPP_API_KEY = process.env.DAPP_API_KEY || ""


export enum ChainID {
    POLYGON_MAINNET = 137,
    GOERLI = 5,
    MUMBAI = 80001,
    ARBITRUM_GOERLI = 421613,
}

interface TokenInfo {
    address: string;
    decimals: number;
}

export enum TokenName {
    USDA1 = 'USDA1',
    USDA2 = 'USDA2',
    USDB = 'USDB',
    USDC = 'USDC',
    USDT = 'USDT'
}

export const nativeTokenAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

export interface TokenAddresses {
    [ChainID.GOERLI]: Record<TokenName, TokenInfo>;
    [ChainID.MUMBAI]: Record<TokenName, TokenInfo>;
    [ChainID.ARBITRUM_GOERLI]: Record<TokenName, TokenInfo>;
    [ChainID.POLYGON_MAINNET]: Record<TokenName, TokenInfo>;
}

export const tokenAddresses: TokenAddresses = {
    [ChainID.GOERLI]: {
        [TokenName.USDA1]: { address: '0xbb8dB535d685F2742D6e84EC391c63e6a1Ce3593', decimals: 6 },
        [TokenName.USDA2]: { address: '0xf4Ca1a280ebCcdaEBf80E3C128e55DE01fAbD893', decimals: 6 },
        [TokenName.USDB]: { address: '0x2055b06Db421F17C19C655Fd4A1c325e8514aF67', decimals: 8 },
        [TokenName.USDC]: { address: '0xd2a94832CF0a4c1A793f630264E984389C3EF48F', decimals: 18 },
        [TokenName.USDT]: { address: '', decimals: 6 }
    },
    [ChainID.MUMBAI]: {
        [TokenName.USDA1]: { address: '0xbB8bb7E16d8F03969d49fd3ED0efd13E65C8f5B5', decimals: 6 },
        [TokenName.USDA2]: { address: '0x203fa10731d98444fD59DA46705321080bA99824', decimals: 6 },
        [TokenName.USDB]: { address: '0x2D6d85C69e92F3008d9f06Ddf8Bac054783687B4', decimals: 8 },
        [TokenName.USDC]: { address: '0xb18059aA6483bA71D6d3DfAbaD53616b00EA2ABA', decimals: 18 },
        [TokenName.USDT]: { address: '', decimals: 6 }
    },
    [ChainID.ARBITRUM_GOERLI]: {
        [TokenName.USDA1]: { address: '0x11900998de6b0C32F0bB148c6865635dfc28A528', decimals: 6 },
        [TokenName.USDA2]: { address: '0x889b795C64CdA1E9fAC1fA623E7F82A73306b690', decimals: 6 },
        [TokenName.USDB]: { address: '0x7C96ab4B90d59CE5e51f673242651018a4432672', decimals: 8 },
        [TokenName.USDC]: { address: '0xe47a4524ad3142dE28F2F8F88b4317a439Ea89a9', decimals: 18 },
        [TokenName.USDT]: { address: '', decimals: 6 }
    },
    [ChainID.POLYGON_MAINNET]: {
        [TokenName.USDA1]: { address: '', decimals: 6 },
        [TokenName.USDA2]: { address: '', decimals: 6 },
        [TokenName.USDB]: { address: '', decimals: 8 },
        [TokenName.USDC]: { address: '0x2791bcA1f2de4661ed88a30c99a7a9449AA84174', decimals: 6 },
        [TokenName.USDT]: { address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', decimals: 6 }
    }
};

export const nativeTokenAddresses = {
    [ChainID.GOERLI]: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    [ChainID.MUMBAI]: '0x0000000000000000000000000000000000001010',
    [ChainID.POLYGON_MAINNET]: '0x0000000000000000000000000000000000001010',
    [ChainID.ARBITRUM_GOERLI]: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',

}

export const MUMBAI_NFT_ADDRESS = '0x59195103c8d49caa6cfb85f0f0d43909eab9eba1'


export const validateEnvironmentVariables = () => {
    const missingVariables = [];

    if (!PRIVATE_KEY) missingVariables.push('PRIVATE_KEY');
    if (!RPC_URL) missingVariables.push('RPC_URL');
    if (!API_KEY) missingVariables.push('API_KEY');
    if (!GELATO_API_KEY) missingVariables.push('GELATO_API_KEY');

    if (missingVariables.length > 0) {
        throw new Error(`Missing environment variables: ${missingVariables.join(', ')}`);
    }
};