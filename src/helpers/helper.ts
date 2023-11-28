import { BigNumber } from 'ethers';
import {
  MigrationResponse,
  TokenData,
  TokenNftData,
  TransactionsResponse,
  TransferTokenDetails,
} from '../utils/AarcTypes';
import { Logger } from '../utils/Logger';
import { BalancesResponse } from '../utils/AarcTypes';
import { COVALENT_TOKEN_TYPES, nativeTokenAddresses } from '../utils/Constants';
import { ChainId } from '../utils/ChainTypes';
import AarcSDK from '../AarcSDK';

export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
export const logError = (
  tokenInfo: { tokenAddress: string; amount: any },
  error: any,
): void => {
  Logger.error('Error transferring token', {
    tokenAddress: tokenInfo.tokenAddress,
    amount: tokenInfo.amount,
    errorDetails: {
      name: error.name,
      message: error.message,
    },
  });
};

export const removeDuplicateTokens = (
  transferTokenDetails: TransferTokenDetails[],
  response: MigrationResponse[],
): TransferTokenDetails[] => {
  const transferTokenUniqueValues: TransferTokenDetails[] =
    transferTokenDetails.reduce((result: TransferTokenDetails[], current) => {
      const matchingToken = result.find(
        (item) => item.tokenAddress === current.tokenAddress,
      );
      if (!matchingToken) {
        result.push(current);
      } else if (
        matchingToken &&
        matchingToken.amount !== undefined &&
        current.amount !== undefined
      ) {
        response.push({
          tokenAddress: current.tokenAddress,
          amount: current?.amount,
          message: 'Duplicate token address',
        });
      } else if (
        matchingToken &&
        matchingToken.tokenIds !== undefined &&
        current.tokenIds !== undefined
      ) {
        for (const tokenId of current.tokenIds) {
          response.push({
            tokenAddress: current.tokenAddress,
            tokenId: tokenId,
            message: 'Duplicate token address',
          });
        }
      }
      return result;
    }, []);

  return transferTokenUniqueValues;
};

export const processTransferTokenDetails = (
  transferTokenDetails: TransferTokenDetails[],
  response: MigrationResponse[],
  balancesList: BalancesResponse,
): TokenData[] => {
  const updatedTokens: TokenData[] = [];

  transferTokenDetails = removeDuplicateTokens(transferTokenDetails, response);

  for (const tokenInfo of balancesList.data) {
    const matchingToken = transferTokenDetails?.find(
      (token) =>
        token.tokenAddress.toLowerCase() ===
        tokenInfo.token_address.toLowerCase(),
    );

    if (
      matchingToken &&
      matchingToken.amount !== undefined &&
      matchingToken.tokenIds == undefined &&
      BigNumber.from(matchingToken.amount).gt(0) &&
      BigNumber.from(matchingToken.amount).gt(tokenInfo.balance)
    ) {
      response.push({
        tokenAddress: tokenInfo.token_address,
        amount: matchingToken?.amount,
        message: 'Supplied amount is greater than balance',
        txHash: '',
      });
    } else if (
      matchingToken &&
      matchingToken.tokenIds !== undefined &&
      tokenInfo.nft_data !== undefined
    ) {
      const nftTokenIds: TokenNftData[] = [];
      for (const tokenId of matchingToken.tokenIds) {
        const tokenExist = tokenInfo.nft_data.find(
          (nftData) => nftData.tokenId === tokenId,
        );
        if (tokenExist) {
          nftTokenIds.push(tokenExist);
        } else {
          response.push({
            tokenAddress: tokenInfo.token_address,
            tokenId: tokenId,
            message: 'Supplied NFT does not exist',
          });
        }
      }
      tokenInfo.nft_data = nftTokenIds;
      updatedTokens.push(tokenInfo);
    } else if (matchingToken) updatedTokens.push(tokenInfo);
  }
  return updatedTokens;
};

// process token data for allowance and balance
export const processTokenData = (
  balancesList: BalancesResponse,
  transferTokenDetails: TransferTokenDetails[] | undefined,
): TokenData[] => {
  let tokens = balancesList.data.filter((balances) => {
    return (
      balances.type === COVALENT_TOKEN_TYPES.STABLE_COIN ||
      balances.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY ||
      balances.native_token === true
    );
  });

  tokens = tokens.map((element: TokenData) => {
    const matchingToken = transferTokenDetails?.find(
      (token) =>
        token.tokenAddress.toLowerCase() ===
        element.token_address.toLowerCase(),
    );

    if (
      matchingToken &&
      matchingToken.amount !== undefined &&
      BigNumber.from(matchingToken.amount).gt(0)
    ) {
      element.balance = matchingToken.amount;
    }

    // Case: transferTokenDetails contains amount for token but it's greater than the given allowance
    // Then we assign the allowance amount 0 to perform normal token transfer
    if (
      element.type === COVALENT_TOKEN_TYPES.STABLE_COIN &&
      COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY &&
      BigNumber.from(element.permit2Allowance).gte(BigNumber.from(0)) &&
      BigNumber.from(element.balance).gt(element.permit2Allowance)
    ) {
      element.permit2Allowance = BigNumber.from(0);
    }

    return element;
  });
  return tokens;
};

/* eslint-disable @typescript-eslint/explicit-function-return-type */
export const processNftTransactions = (
  balancesList: BalancesResponse,
  transactions: TransactionsResponse[],
  owner: string,
  receiverAddress: string,
) => {
  const nfts = balancesList.data.filter((balances) => {
    return balances.type === COVALENT_TOKEN_TYPES.NFT;
  });

  Logger.log('nfts ', nfts);

  // token address, tokenIds: array of tokenIds
  for (const collection of nfts) {
    if (collection.nft_data) {
      for (const nft of collection.nft_data) {
        transactions.push({
          from: owner,
          to: receiverAddress,
          tokenAddress: collection.token_address,
          amount: BigNumber.from(1),
          tokenId: nft.tokenId,
          type: COVALENT_TOKEN_TYPES.NFT,
        });
      }
    }
  }
};

export const processERC20TransferrableTokens = (
  erc20Tokens: TokenData[],
  transactions: TransactionsResponse[],
  owner: string,
  receiverAddress: string,
  isGasless = false,
) => {
  let erc20TransferableTokens: TokenData[]

  if (isGasless)
    erc20TransferableTokens = erc20Tokens.filter((balanceObj) =>
      !balanceObj.permitExist &&
      BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(0)),
    );
  else
    erc20TransferableTokens = erc20Tokens.filter((balanceObj) =>
      BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(0)),
    );

  // Loop through tokens to perform normal transfers
  for (const token of erc20TransferableTokens) {
    transactions.push({
      from: owner,
      to: receiverAddress,
      tokenAddress: token.token_address,
      amount: token.balance,
      type: COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY,
    });
  }
};

export const processNativeTransfer = async (
  tokens: TokenData[],
  transferTokenDetails: TransferTokenDetails[] | undefined,
  transactions: TransactionsResponse[],
  sdkObject: AarcSDK,
  owner: string,
  receiverAddress: string,
) => {
  const nativeToken = tokens.filter((token) => token.native_token === true);

  if (nativeToken.length > 0) {
    const matchingToken = transferTokenDetails?.find(
      (token) =>
        token.tokenAddress.toLowerCase() ===
        nativeTokenAddresses[sdkObject.chainId as ChainId],
    );

    let amountTransfer = BigNumber.from(0);

    if (
      matchingToken &&
      matchingToken.amount !== undefined &&
      BigNumber.from(matchingToken.amount).gt(0)
    ) {
      amountTransfer = matchingToken.amount;
    } else {
      const updatedNativeToken = await sdkObject.fetchBalances(owner, true, [
        nativeToken[0].token_address,
      ]);
      amountTransfer = BigNumber.from(updatedNativeToken.data[0].balance)
        .mul(BigNumber.from(80))
        .div(BigNumber.from(100));
    }

    transactions.push({
      from: owner,
      to: receiverAddress,
      tokenAddress: nativeToken[0].token_address,
      amount: amountTransfer,
      type: COVALENT_TOKEN_TYPES.DUST,
    });
  }
};
