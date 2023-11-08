# Aarc SDK

Aarc SDK is a typescript library that helps users to migrate their assets from EOA to smart wallets.

## Features

- Uniswap Permit2 support for batch transaction
- ERC20Permit support
- Gasless migration

## Support

- Safe smart wallet
- Biconomy smart wallet
- more coming soon

## Instalation
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

```typescript
let balances = await aarcSDK.fetchBalances(
  tokenAddress: string[] // Optional
);
```

### Execute migration

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
  GELATO_RELAYER_API_KEY // Use this link to get the gelato relayer key
})
```
