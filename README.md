# Aarc SDK

The Aarc SDK is a TypeScript library that makes it easy for developers to transfer assets from Externally Owned Accounts (EOA) to any destination address. It simplifies the asset transfer process by supporting various token standards, such as ERC20 and ERC721, and offering custom flows like batched transactions, gasless transactions, and paying gas fees with the same asset being moved. Additionally, it enables custom contract interaction within the same transaction using permit2(), allowing for direct swaps and bridge functionality.

## Features of the SDK

- Batch transactions on EoA with Uniswap’s Permit2 contract.
- ERC20Permit support for streamlined token approvals.
- Gasless transactions using Relayers (EIP2771).

## Prerequisites
- Node.js (v12.x or later)
- Basic understanding of Ethereum and smart contracts.

## Installation
Install ethers.js and Aarc SDK using npm:
```bash
npm install ethers@5.7.2 aarc-sdk
```

# Getting Started

## Get the API Key

To use Aarc SDK, an API key is required. Fill out [this form](https://rebrand.ly/aarc-api) to get the API Key on your email instantly!

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

## Fetching token balances

Retrieve balances of all tokens in an EOA wallet:

```typescript
let balances = await aarcSDK.fetchBalances(
  eoaAddress: string,
  fetchBalancesOnly: true,
  tokenAddress: string[] // Optional: Array of specific token addresses
);
```

## Moving Assets

Transfer tokens from EOA to any receiver wallet address:

```typescript
await aarcSDK.executeMigration({
  senderSigner: signer, // ethers.signer object
  receiverAddress:'RECEIVER_WALLET_ADDRESS',
  transferTokenDetails: // Optional. If not passed, the SDK will migrate all the tokens of the wallet
  [   
    {
      tokenAddress:TOKEN1_ADDRESS,
      amount?:TOKEN1_AMOUNT, // ethers.BigNumber in case of erc20 and native token
      tokenIds?: string[] // tokenIds for nfts
    },
    ...
  ]
})
// Returns the response given below
```

Output:
```bash
[
  {
    tokenAddress,
    amount,
    message,
    txHash,
    tokenId
  },
  ...
]
```

### Moving Assets without gas

Transfer tokens from EOA to any receiver wallet address without gas fees. Please note that we use Gelato Relayer to provide the gasless functionality. Please get the Gelato [API Key](https://docs.gelato.network/developer-services/relay/payment-and-fees/1balance-and-relay) to use the gasless functionality.

```typescript
await aarcSDK.executeMigrationGasless({
  senderSigner: signer, // ethers.signer object
  receiverAddress:RECEIVER_WALLET_ADDRESS,
  transferTokenDetails: // Optional. If not passed, the SDK will migrate all the tokens of the wallet
  [   
    {
      tokenAddress:TOKEN1_ADDRESS,
      amount?:TOKEN1_AMOUNT, // ethers.BigNumber in case of erc20 and native token
      tokenIds?: string[] // tokenIds for nfts
    },
    ...
  ],
  gelatoApiKey: GELATO_RELAYER_API_KEY // Use the link above to get the gelato relayer key
})
// Returns the response given below
```

Output:
```bash
[
  {
    tokenAddress,
    amount,
    message,
    txHash,
    tokenId
  },
  ...
]
```

### Wallet Deployment

You have the capability to deploy Biconomy or Safe wallets by utilizing the provided code snippets.

The code snippet above showcases how to deploy a wallet using the aarcSDK. It involves specifying essential parameters such as the owner's address (EOA_ADDRESS), the type of wallet to deploy (WALLET_TYPE), the signer (ethers.signer object), and an optional index for deploying multiple wallets under the same EOA.

## NOTE
If the wallet corresponding to the provided owner address (EOA_ADDRESS) and index (deploymentWalletIndex) is already deployed, the deployment process will not occur.


```typescript
import { WALLET_TYPE } from ''

export enum WALLET_TYPE {
  BICONOMY,
  SAFE,
}

await aarcSDK.deployWallet({
  owner: EOA_ADDRESS,
  walletType: WALLET_TYPE.SAFE,
  signer: signer, // ethers.signer object
  deploymentWalletIndex: 0 // Optional -- Number: Since an EOA, can be used to deploy multiple wallets. you can supply any index and it will deploy wallet for you
})
```


## Moving Native Tokens and Wallet Deployment

The following code snippet demonstrates a method to transfer native tokens while simultaneously deploying a wallet using the aarcSDK.

This code snippet illustrates a process to transfer native tokens and deploy a wallet concurrently using the aarcSDK. Essential parameters such as the owner's address (EOA_ADDRESS), the type of wallet to deploy (WALLET_TYPE), the signer (ethers.signer object), the receiver's wallet address (RECEIVER_WALLET_ADDRESS), an optional amount of tokens to transfer (amount), and an index for deploying multiple wallets under the same EOA (deploymentWalletIndex) are included.

## NOTE
If the wallet corresponding to the provided owner address (EOA_ADDRESS) and index (deploymentWalletIndex) is already deployed, the deployment process will not occur, and only the token transfer will be executed.



```typescript
import { WALLET_TYPE } from ''

export enum WALLET_TYPE {
  BICONOMY,
  SAFE,
}

await aarcSDK.transferNativeAndDeploy({
  owner: EOA_ADDRESS,
  walletType: WALLET_TYPE.SAFE,
  signer: signer, // ethers.signer object
  receiverAddress: RECEIVER_WALLET_ADDRESS,
  amount: BigNumber, // Optional. if not paseed 80% of native tokens will get transferred.
  deploymentWalletIndex: 0 // Optional -- Number: Since an EOA, can be used to deploy multiple wallets. you can supply any index and it will deploy wallet for you
})
// Returns the response given below
```

## Smart Wallet Integration
The Aarc SDK seamlessly integrates with different smart wallets. It currently supports Safe and Biconomy smart wallets and will add more options in the future.

### Safe smart wallet

Fetching Existing Safes:

Retrieve a list of all Safe smart wallets associated with the user's EOA:
```typescript
const safes = await aarcSDK.getAllSafes(owner: string); // owner's eoaAddress
// This returns an array of Safe wallet addresses
```

Creating a New Safe Wallet:

Generate a new Safe smart wallet. The address returned is a counterfactual address, and the wallet needs to be deployed later. Asset migration can be directed to this address even before deployment.
```typescript
const newSafeAddress = await aarcSDK.generateSafeSCW(
  config: {owners: string[], threshold: number},
  saltNonce?: number // default value is 0
);
// Returns a counterfactual address for the new Safe wallet
```

### Biconomy Smart Wallet

Fetching Biconomy Smart Wallets:

Retrieve a list of all Biconomy smart wallets associated with the user's EOA:
```typescript
const biconomySWs = await aarcSDK.getAllBiconomySCWs(owner: string); // owner's eoaAddress
// This returns an array of Biconomy wallet addresses
```

Creating a New Biconomy Wallet:

Similar to the Safe wallet, you can create a Biconomy smart wallet. The address provided is also a counterfactual address, requiring later deployment. The migration process can target this address immediately.
```typescript
const newBiconomySCWAddress = await aarcSDK.generateBiconomySCW(
  signer // wallet owner's ethers.signer object
);
// Returns a counterfactual address for the new Biconomy wallet
```

#### More coming soon

## License
This project is licensed under the MIT License - see the [LICENSE](./LICENSE.md) for details.

## Support and Feedback
For support or to share feedback, please schedule a call with us [here](https://calendly.com/d/3f7-9gt-4pr/session-with-aarc-team). You can also share your ideas and feedback on our [community forum](https://aarc.featurebase.app/).
