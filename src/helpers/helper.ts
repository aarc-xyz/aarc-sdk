import { MigrationResponse, TransferTokenDetails } from '../utils/AarcTypes';
import { Logger } from '../utils/Logger';

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
