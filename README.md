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

To use Aarc SDK, an API key is required. Fill out this form to request the API key.

## Initialise the SDK

Import and initialise the Aarc SDK in your project.

```typescript
import { ethers } from "ethers";
import { AarcSDK } from AarcSDK;

let aarcSDK = new AarcSDK.default({
  rpcUrl: rpcUrl,
  signer: signer, // the user's ethers.signer object
  apiKey: "YOUR_API_KEY",
});

await aarcSDK.init();
```

# Usage

## Fetching token balances

Retrieve balances of all tokens in an EOA wallet:

```typescript
let balances = await aarcSDK.fetchBalances(
  tokenAddress: string[] // Optional: Array of specific token addresses
);
```

## Moving Assets

Transfer tokens from EOA to any receiver wallet address:

```typescript
await aarcSDK.executeMigration({
  receiverAddress:'RECEIVER_WALLET_ADDRESS',
  tokenAndAmount: // Optional. If not passed, the SDK will migrate all the tokens of the wallet
  [   
    {
      tokenAddress:TOKEN1_ADDRESS,
      amount:TOKEN1_AMOUNT // ethers.BigNumber
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
await aarcSDK.executeMigration({
  receiverAddress:RECEIVER_WALLET_ADDRESS,
  tokenAndAmount: // Optional. If not passed, the SDK will migrate all the tokens of the wallet
  [   
    {
      tokenAddress:TOKEN1_ADDRESS,
      amount:TOKEN1_AMOUNT // ethers.BigNumber
    },
    ...
  ],
  GELATO_RELAYER_API_KEY // Use the link above to get the gelato relayer key
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

## Smart Wallet Integration
The Aarc SDK seamlessly integrates with different smart wallets. It currently supports Safe and Biconomy smart wallets and will add more options in the future.

### Safe smart wallet

Fetching Existing Safes:

Retrieve a list of all Safe smart wallets associated with the user's EOA:
```typescript
const safes = await aarcSDK.getAllSafes();
// This returns an array of Safe wallet addresses
```

Creating a New Safe Wallet:

Generate a new Safe smart wallet. The address returned is a counterfactual address, and the wallet needs to be deployed later. Asset migration can be directed to this address even before deployment.
```typescript
const newSafeAddress = await aarcSDK.generateSafeSCW();
// Returns a counterfactual address for the new Safe wallet
```

### Biconomy Smart Wallet
Creating a New Biconomy Wallet:

Similar to the Safe wallet, you can create a Biconomy smart wallet. The address provided is also a counterfactual address, requiring later deployment. The migration process can target this address immediately.
```typescript
const newBiconomySCWAddress = await aarcSDK.generateBiconomySCW();
// Returns a counterfactual address for the new Biconomy wallet
```

#### More coming soon

## License
This project is licensed under the MIT License - see the [LICENSE](./LICENSE.md) for details.

## Support and Feedback
For support or to share feedback, please schedule a meet here. You can also share your ideas and feedback on the community forum.
