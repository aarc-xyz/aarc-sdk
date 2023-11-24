import { MigrationResponse, TransferTokenDetails } from '../utils/AarcTypes';
import { Logger } from '../utils/Logger';

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
): {
  transferTokenDetails: TransferTokenDetails[];
  response: MigrationResponse[];
} => {
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

  return {
    transferTokenDetails: transferTokenUniqueValues,
    response: response,
  };
};
