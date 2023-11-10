# Aarc SDK

Aarc SDK is a typescript library that helps users migrate their assets from EOA to smart wallets.

## Features

- Uniswap Permit2 support for batch transaction
- ERC20Permit support
- Gasless migration

## Installation
Instal ethers.js v5.7.2 as a peer dependency.

```bash
npm install ethers@5.7.2 aarc-sdk
```

## Grab the API Key

API key procedure

## Quick start

Import and initialise the Aarc SDK client.

```typescript
import { ethers } from "ethers";
import {AarcSDK} from AarcSDK;

let aarcSDK = new AarcSDK.default({
  signer: signer, // the user's ethers.signer object
  apiKey: API_KEY,
});

await aarcSDK.init();
```

### Fetch the balances of user tokens

This function returns the balances of all the tokens in the EOA wallet(extracted from the signer provided while initialising the SDK), which includes ERC20, ERC721, ERC1155 and native tokens. Note that if the tokenAddress is provided, then only the balance of those addresses gets returned.

```typescript
let balances = await aarcSDK.fetchBalances(
  tokenAddress: string[] // Optional
);
```

### Execute migration

This function executes the token transfer from the EOA to the smart wallet address. If the EOA has provided allowance to the Permit2 contract, we will use Permit2's batch transfer functionality to transfer the assets.

```typescript
await aarcSDK.executeMigration({
  scwAddress:RECEIVER_WALLET_ADDRESS,
  tokenAndAmount: // Optional. If not passed, the SDK will migrate all the tokens of the wallet
  [   
    {
      tokenAddress:TOKEN1_ADDRESS,
      amount:TOKEN1_AMOUNT
    },
    {
      tokenAddress:TOKEN2_ADDRESS,
      amount:TOKEN2_AMOUNT
    },
    {
      tokenAddress:TOKEN3_ADDRESS,
      amount:TOKEN3_AMOUNT
    },
    ...
  ]
})
```

### Execute gasless migration

This function executes the token transfer from the EOA to the smart wallet address in a gasless manner. If the token has the ERC20 Permit function, we will use it to give the token allowance to the Permit2 contract. Please note that we use Gelato Relayer to provide the gasless functionality. Please get the Gelato [API Key](https://docs.gelato.network/developer-services/relay/payment-and-fees/1balance-and-relay) to use the gasless functionality.

```typescript
await aarcSDK.executeMigration({
  scwAddress:RECEIVER_WALLET_ADDRESS,
  tokenAndAmount: // Optional. If not passed, the SDK will migrate all the tokens of the wallet
  [   
    {
      tokenAddress:TOKEN1_ADDRESS,
      amount:TOKEN1_AMOUNT
    },
    {
      tokenAddress:TOKEN2_ADDRESS,
      amount:TOKEN2_AMOUNT
    },
    {
      tokenAddress:TOKEN3_ADDRESS,
      amount:TOKEN3_AMOUNT
    },
    ...
  ],
  GELATO_RELAYER_API_KEY // Use the link above to get the gelato relayer key
})
```

## In-built Smart Wallet support

### Safe smart wallet
Get all the safes generated from the EOA.
```typescript
const safes = await aarcSDK.getAllSafes();
```

Create a new Safe wallet. Please note that the returned address is the counterfactual address and the safe needs to be deployed later. The migration can happen to the counterfactual address.
```typescript
const newSafeAddress = await aarcSDK.generateSafeSCW();
```

### Biconomy smart wallet
Create a new Biconomy smart wallet. Please note that the returned address is the counterfactual address and the smart wallet needs to be deployed later. The migration can happen to the counterfactual address.
```typescript
const newBiconomySCWAddress = await aarcSDK.generateBiconomySCW();
```

#### More coming soon

## License
Distributed under an MIT License. See [LICENSE](./LICENSE.md) for more information.

## Contact and feedback
Contact us at {}. Please use this link{} to provide us with feedback.
