import { BigNumber, ethers } from 'ethers';
import { Logger } from '../utils/Logger';
import { ETHEREUM_ADDRESS, GAS_UNITS } from '../utils/Constants';
import { ERC20_ABI } from '../utils/abis/ERC20.abi';
import { PERMIT2_BATCH_TRANSFER_ABI } from '../utils/abis/Permit2BatchTransfer.abi';

// Function to calculate total gas needed for all transactions
export const calculateTotalGasNeeded = async (
  provider: ethers.providers.JsonRpcProvider,
  transactions: any[],
): Promise<{ validTransactions: any[]; totalGasCost: BigNumber }> => {
  let totalGasCost = BigNumber.from(0);
  const validTransactions = [];

  for (const transaction of transactions) {
    try {
      if (transaction.to !== ETHEREUM_ADDRESS) {
        if (transaction.type === 'permitbatch') {
          const contract = new ethers.Contract(
            transaction.tokenAddress,
            PERMIT2_BATCH_TRANSFER_ABI,
            provider,
          );
          transaction.data = (
            await contract.populateTransaction.permitTransferFrom(
              transaction.batchDto,
              transaction.tokenPermissions,
              transaction.from,
              transaction.signature,
            )
          ).data;
        } else if (
          transaction.type === 'cryptocurrency' ||
          transaction.type === 'stablecoin'
        ) {
          const contract = new ethers.Contract(
            transaction.tokenAddress,
            ERC20_ABI,
            provider,
          );
          transaction.data = (
            await contract.populateTransaction.transfer(
              transaction.to,
              transaction.amount,
            )
          ).data;
        }
      } else {
        transaction.data = '0x';
      }
      Logger.log('estimating trx ', transaction);
      const tx = {
        from: transaction.from,
        to:
          transaction.to !== ETHEREUM_ADDRESS
            ? transaction.tokenAddress
            : transaction.to,
        data: transaction.data,
      };
      Logger.log('actual estimating trx ', tx);

      let gasCost = BigNumber.from(0);

      if (transaction.type === 'nft') {
        gasCost = BigNumber.from(GAS_UNITS['nft']);
      } else if (transaction.type === 'dust') {
        gasCost = BigNumber.from(GAS_UNITS['nft']);
      } else if (
        transaction.type === 'cryptocurrency' ||
        transaction.type === 'stablecoin'
      ) {
        gasCost = BigNumber.from(GAS_UNITS['cryptocurrency']);
      } else {
        gasCost = await estimateGasForTransaction(provider, tx);
      }
      totalGasCost = totalGasCost.add(gasCost);
      transaction.gasCost = gasCost;
      validTransactions.push(transaction);
    } catch (error: any) {
      Logger.error(error);
    }
  }

  return { validTransactions, totalGasCost };
};

// Function to estimate gas for a single transaction
export const estimateGasForTransaction = async (
  provider: ethers.providers.JsonRpcProvider,
  transaction: any,
): Promise<BigNumber> => {
  let estimatedGas = BigNumber.from(0);
  try {
    estimatedGas = await provider.estimateGas(transaction);
    Logger.log('estimatedGas ', estimatedGas);
  } catch (error: any) {
    Logger.error('gas estimation error ');
    Logger.error(error);
    throw error;
  }
  return estimatedGas; // Replace with actual gas estimation
};
