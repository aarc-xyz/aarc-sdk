import { ethers } from "ethers";

export const BASE_URL = 'http://localhost:4000';
export const BALANCES_ENDPOINT = `${BASE_URL}/migrator/covalent`;
export const SAFE_TX_SERVICE_URL = 'https://safe-transaction-mainnet.safe.global'
export const BICONOMY_TX_SERVICE_URL = 'https://sdk-backend.prod.biconomy.io/v1'
export const PERMIT_FUNCTION_ABI = 'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)';
export const ETHEREUM_PROVIDER =
    'https://eth-mainnet.g.alchemy.com/v2/VFsqvAAgenvw98xGBsOGfogbZ5WFN17X';
export const PERMIT2_CONTRACT_ADDRESS =
    '0x000000000022D473030F116dDEE9F6B43aC78BA3';

export const GELATO_RELAYER_ADDRESS = "0x75ba5af8effdcfca32e1e288806d54277d1fde99";
export const PERMIT2_DOMAIN_NAME = 'Permit2';

export enum COVALENT_TOKEN_TYPES {
    CRYPTO_CURRENCY = 'cryptocurrency',
    STABLE_COIN = 'stablecoin',
    NFT = 'nft',
    DUST = 'dust'
}

export enum CHAIN_PROVIDERS {
    'https://eth-mainnet.alchemyapi.io/v2/VFsqvAAgenvw98xGBsOGfogbZ5WFN17X' = 1,
    'https://eth-goerli.g.alchemy.com/v2/JumlonOyBH3vkn70ZD6QlyR19I_73gNX' = 5,
}

export enum SAFE_TX_SERVICE_URLS {
    'https://safe-transaction-mainnet.safe.global' = 1,
    'https://safe-transaction-goerli.safe.global' = 5,
}

export const PERMIT_BATCH_TRANSFER_FROM_TYPEHASH = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(
    "PermitBatchTransferFrom(TokenPermissions[] permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
    )
);

export const PERMIT_FUNCTION_TYPES = {
    Permit: [{
        name: "owner",
        type: "address"
    },
    {
        name: "spender",
        type: "address"
    },
    {
        name: "value",
        type: "uint256"
    },
    {
        name: "nonce",
        type: "uint256"
    },
    {
        name: "deadline",
        type: "uint256"
    },
    ],
};
