export const BASE_URL = 'http://localhost:4000';
export const BALANCES_ENDPOINT = `${BASE_URL}/migrator/covalent`;
export const SAFE_TX_SERVICE_URL = 'https://safe-transaction-mainnet.safe.global'
export const BICONOMY_TX_SERVICE_URL = 'https://sdk-backend.prod.biconomy.io/v1'
export const PERMIT_FUNCTION_ABI = 'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)';
export const ETHEREUM_PROVIDER =
    'https://eth-mainnet.g.alchemy.com/v2/VFsqvAAgenvw98xGBsOGfogbZ5WFN17X';
export const PERMIT2_CONTRACT_ADDRESS =
    '0x000000000022D473030F116dDEE9F6B43aC78BA3';

export enum CHAIN_PROVIDERS {
    'https://eth-mainnet.alchemyapi.io/v2/VFsqvAAgenvw98xGBsOGfogbZ5WFN17X' = 1,
    'https://eth-goerli.g.alchemy.com/v2/JumlonOyBH3vkn70ZD6QlyR19I_73gNX' = 5,
}

export enum SAFE_TX_SERVICE_URLS {
    'https://safe-transaction-mainnet.safe.global' = 1,
    'https://safe-transaction-goerli.safe.global' = 5,
}
