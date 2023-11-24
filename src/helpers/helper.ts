import { BigNumber } from 'ethers';
import { MigrationResponse, TokenData, TokenNftData, TransferTokenDetails } from '../utils/AarcTypes';
import { Logger } from '../utils/Logger';
import { BalancesResponse } from '../utils/AarcTypes';
import { COVALENT_TOKEN_TYPES } from '../utils/Constants';


export const delay = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const logError = (tokenInfo: any, error: any) => {
  Logger.error('Error transferring token', {
    tokenAddress: tokenInfo.token_address,
    amount: tokenInfo.balance,
    errorDetails: {
      name: error.name,
      message: error.message,
      code: error.code, // or any other relevant properties from the error object
    },
  });
};

export const removeDuplicateTokens = (transferTokenDetails: TransferTokenDetails[], response: MigrationResponse[]): TransferTokenDetails[] => {
  const transferTokenUniqueValues: TransferTokenDetails[] = transferTokenDetails.reduce((result: TransferTokenDetails[], current) => {
    const matchingToken = result.find(item => item.tokenAddress === current.tokenAddress);
    if (!matchingToken) {
      result.push(current);
    } else if (matchingToken && matchingToken.amount !== undefined && current.amount !== undefined){
      response.push({
        tokenAddress: current.tokenAddress,
        amount: current?.amount,
        message: 'Duplicate token address',
      });
    } else if (matchingToken && matchingToken.tokenIds !== undefined && current.tokenIds !== undefined){
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

export const processTransferTokenDetails = (transferTokenDetails: TransferTokenDetails[], response: MigrationResponse[], balancesList: BalancesResponse): TokenData[] => {
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
}

// process token data for allowance and balance
export const processTokenData = (balancesList: BalancesResponse, transferTokenDetails: TransferTokenDetails[] | undefined): TokenData[] => {
  let tokens = balancesList.data.filter((balances) => {
    return (
      balances.type === COVALENT_TOKEN_TYPES.STABLE_COIN ||
      balances.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY ||
      balances.type === COVALENT_TOKEN_TYPES.DUST
    );
  });

  tokens.map((element: TokenData) => {
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
}

export const processNftTransactions = (balancesList: BalancesResponse, transactions: any[], owner: string, receiverAddress: string) => {
  let nfts = balancesList.data.filter((balances) => {
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
          amount: 1,
          tokenId: nft.tokenId,
          type: COVALENT_TOKEN_TYPES.NFT,
        });
      }
    }
  }
}

export const processERC20TransferrableTokens = (erc20Tokens:TokenData[], transactions: any[], owner: string, receiverAddress: string) => {
  const erc20TransferableTokens = erc20Tokens.filter((balanceObj) =>
    BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(0)),
  );

  // Loop through tokens to perform normal transfers
  for (const token of erc20TransferableTokens) {
    transactions.push({
      from: owner,
      to: receiverAddress,
      tokenAddress: token.token_address,
      amount: token.balance,
      tokenId: null,
      type: COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY,
    });
  }
}
