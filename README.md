# Aarc SDK

The Aarc SDK is a TypeScript library that makes it easy for developers to transfer assets from Externally Owned Accounts (EOA) to any destination address. It simplifies the asset transfer process by supporting various token standards, such as ERC20 and ERC721, and offering custom flows like batched transactions, gasless transactions, and paying gas fees with the same asset being moved. Additionally, it enables custom contract interaction within the same transaction using permit2(), allowing for direct swaps and bridge functionality.

## Features of the SDK

- Batch transactions on EoA with Uniswap’s Permit2 contract.
- ERC20Permit support for streamlined token approvals.
- Gasless transactions using Relayers (EIP2771).

# Getting Started

## Prerequisites
- Node.js (v12.x or later)
- Basic understanding of Ethereum and smart contracts.

## Installation
Install ethers.js and Aarc SDK using npm:
```bash
npm install ethers@5.7.2 aarc-sdk
```

## Get the API Key

To use Aarc SDK, an API key is required. Get the **API Key** from the [Dashboard](https://dashboard.aarc.xyz/).
You can learn about getting the API Key from [here](https://docs.aarc.xyz/developer-docs/integration-guide/setup-and-installation).

![Dashboard Image](https://github.com/megabyte0x/megabyte0x/blob/main/dashboard-ss-for-sdk.png?raw=true)

> [!NOTE] 
We only accept funds on **Polygon Mainnet** & **Polygon Mumbai Testnet**.  However, these funds can be transacted on any supported mainnet or testnet.

## Initialise the SDK

Import and initialise the Aarc SDK in your project.

```typescript
import { AarcSDK } from "aarc-sdk";

let aarcSDK = new AarcSDK({
  rpcUrl: rpcUrl,
  chainId: chainId,
  apiKey: "YOUR_API_KEY",
});
```

# Usage
- [Fetching Token Balances](#fetching-token-balances)
- [Migrate Assets](#migrate-assets)
- [Migrate Assets \[With Gasless Flow\]](#migrate-assets-with-gasless-flow)
- [Migrate Assets \[Pay Gas with Stables\]](#migrate-assets-pay-gas-with-stables)
- [Smart Wallet Integration](#smart-wallet-integration)
  - [Smart Wallet Deployment](#smart-wallet-deployment)
  - [Get Smart Wallet Addresss](#get-smart-wallet-address)
  - [Migrate Native Tokens and Wallet Deployment](#migrate-native-tokens-and-wallet-deployment)
  
## Fetching Token Balances

Retrieve balances of all tokens in an EOA wallet:

```typescript
let balances = await aarcSDK.fetchBalances(
  eoaAddress: string,
  fetchBalancesOnly: true,
  tokenAddress: string[] // Optional: Array of specific token addresses
);
```


## Migrate Assets

Transfer tokens from EOA to any receiver wallet address:

```typescript
await aarcSDK.executeMigration({
  senderSigner: signer, // ethers.signer object
  receiverAddress:'RECEIVER_WALLET_ADDRESS',
  transferTokenDetails: // Optional. If not passed, the SDK will migrate all the tokens of the wallet
  [   
    {
      tokenAddress:TOKEN1_ADDRESS,
      amount?:TOKEN1_AMOUNT.toString(16),  // Vaule in HEX as String
      tokenIds?: string[] // tokenIds for nfts
    },
    ...
  ]
})
// Returns the response given below
```

### Output:
```bash
[
  {
  tokenAddress: string;
  taskId?: string;
  amount?: string;
  message: string;
  txHash?: string;
  tokenId?: string;
  },
]
```

## Migrate Assets [With Gasless Flow]

Transfer tokens from EOA to any receiver wallet address **without paying gas fees**.

```typescript
await aarcSDK.executeMigrationGasless({
  senderSigner: signer, // ethers.signer object
  receiverAddress:RECEIVER_WALLET_ADDRESS,
  transferTokenDetails: // Optional. If not passed, the SDK will migrate all the tokens of the wallet
  [   
    {
      tokenAddress:TOKEN1_ADDRESS,
      amount?:TOKEN1_AMOUNT.toString(16), // Vaule in HEX as String
      tokenIds?: string[] // tokenIds for nfts
    },
    ...
  ]
})
// Returns the response given below
```

### Output:
```bash
[
  {
  tokenAddress: string;
  taskId?: string;
  amount?: string;
  message: string;
  txHash?: string;
  tokenId?: string;
  },
]
```

## Migrate Assets [Pay Gas with Stables]

Transfer tokens from EOA to any receiver wallet address by **paying gas in Stable Coins.**

```typescript
await aarcSDK.executeForwardTransaction({
    senderSigner: signer,
    receiverAddress:"0x786E6045eacb96cAe0259cd761e151b68B85bdA7"
  });
```

> [!NOTE]
AARC SDK currently supports a few of the Stable Tokens on different networks. You can check about them [here](https://docs.aarc.xyz/developer-docs/integration-guide/usage/assets-migration/user-pays-gas-with-erc20-tokens-forwarder-flow#supported-networks-and-tokens).



## Smart Wallet Integration
The Aarc SDK seamlessly integrates with different smart wallets. 

Aarc SDk currently supports the following Smart Wallet Providers:
- Safe
- Biconomy
- Alchemy
- ZeroDev

```typescript
enum WALLET_TYPE {
  BICONOMY,
  SAFE,
  ALCHEMY,
  ZERODEV,
}
```

### Smart Wallet Deployment

You have the capability to deploy Smart Wallets by utilizing the provided code snippets.

The code snippet below showcases how to deploy a wallet using the AarcSDK. It involves specifying essential parameters such as the owner's address (`EOA_ADDRESS`), the type of wallet (`WALLET_TYPE`) to deploy, the `signer` (ethers.signer object), and an optional index for deploying multiple wallets under the same EOA.

> [!NOTE]
If the wallet corresponding to the provided owner address (`EOA_ADDRESS`) and index (`deploymentWalletIndex`) is already deployed, the deployment process will not occur.


```typescript
import { WALLET_TYPE } from "aarc-sdk/dist/utils/AarcTypes";

await aarcSDK.deployWallet({
  owner: EOA_ADDRESS,
  walletType: WALLET_TYPE.SAFE, // Smart Contract Wallet Provider.SAFE, // Smart Contract Wallet Provider
  signer: signer, // ethers.signer object
  deploymentWalletIndex: 0 // Optional -- Number: Since an EOA, can be used to deploy multiple wallets. you can supply any index and it will deploy wallet for you
})
```

### Get Smart Wallet Address

To get the address of your Smart Wallet you can use the following code snippet:

The code snippet below showcases how to get a **smart wallet address** using the AarcSDK. It involves specifying essential parameters such as the owner's address (`EOA_ADDRESS`) and the type of wallet (`WALLET_TYPE`).

```typescript
import { WALLET_TYPE } from "aarc-sdk/dist/utils/AarcTypes";

await aarcSDK.getSmartWalletAddresses({
  walletType: WALLET_TYPE.SAFE, // Smart Contract Wallet Provider
  owner: OWNER_ADDRESS // Smart Wallet Owner's address
});
```

### Migrate Native Tokens and Wallet Deployment

The following code snippet demonstrates a method to transfer native tokens while simultaneously deploying a wallet using the aarcSDK.

This code snippet illustrates a process to transfer native tokens and deploy a wallet concurrently using the `aarcSDK`. Essential parameters such as the owner's address (`EOA_ADDRESS`), the type of wallet to deploy (`WALLET_TYPE`), the `signer` (ethers.signer object), the receiver's wallet address (`RECEIVER_WALLET_ADDRESS`), an optional amount of tokens to transfer (`amount`), and an index for deploying multiple wallets under the same EOA (`deploymentWalletIndex`) are included.

> [!NOTE]
> - If the wallet corresponding to the provided owner address (`EOA_ADDRESS`) and index (`deploymentWalletIndex`) is already deployed, the deployment process will not occur, and only the token transfer will be executed.
> - Get the `receiverAddress` for Smart Wallet for the owner address using the [getSmartWalletAddresses](#get-smart-wallet-address).
> - If `amount` not mentioned, then sdk will transfer 80% of the balance to the receiverAddress.


```typescript
import { WALLET_TYPE } from "aarc-sdk/dist/utils/AarcTypes";

await aarcSDK.transferNativeAndDeploy({
  owner: EOA_ADDRESS,
  walletType: WALLET_TYPE, // Smart Contract Wallet Provider
  signer: signer, // ethers.signer object
  receiverAddress: RECEIVER_WALLET_ADDRESS,
  amount?: TOKEN_AMOUNT.toString(16), // Optional. Vaule in HEX as String. If not paseed 80% of native tokens will get transferred.
  deploymentWalletIndex: 0 // Optional -- Number: Since an EOA, can be used to deploy multiple wallets. you can supply any index and it will deploy wallet for you
})
// Returns the response given below
```

### More coming soon 👀

## License
This project is licensed under the MIT License - see the [LICENSE](./LICENSE.md) for details.

## Support and Feedback
For support or to share feedback, please schedule a call with us [here](https://calendly.com/d/3f7-9gt-4pr/session-with-aarc-team). You can also share your ideas and feedback on our [community forum](https://aarc.featurebase.app/).
