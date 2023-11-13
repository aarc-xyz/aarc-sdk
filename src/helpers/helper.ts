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
