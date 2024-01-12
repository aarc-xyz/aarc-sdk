import SafeApiKit, { OwnerResponse } from '@safe-global/api-kit';
import { SafeFactory } from '@safe-global/protocol-kit';
import { SAFE_TX_SERVICE_URLS } from '../utils/Constants';
import { EthersAdapter } from '@safe-global/protocol-kit';
import { ethers } from 'ethers';
import { Logger } from '../utils/Logger';
import { DeployWalletDto } from '../utils/AarcTypes';

class Safe {
  ethAdapter!: EthersAdapter;

  constructor(rpcUrl: string) {
    this.ethAdapter = new EthersAdapter({
      ethers,
      signerOrProvider: new ethers.providers.JsonRpcProvider(rpcUrl),
    });
  }

  async getAllSafes(
    chainId: number,
    eoaAddress: string,
  ): Promise<OwnerResponse> {
    try {
      const safeService = new SafeApiKit({
        txServiceUrl: SAFE_TX_SERVICE_URLS[chainId],
        ethAdapter: this.ethAdapter,
      });
      const safes = await safeService.getSafesByOwner(eoaAddress);
      if (safes.safes.length === 0) {
        const newSafe = await this.generateSafeSCW({
          owners: [eoaAddress],
          threshold: 1,
        });
        safes.safes.push(newSafe);
      }
      return safes;
    } catch (error) {
      Logger.log('error while getting safes');
      throw error;
    }
  }

  async generateSafeSCW(
    config: { owners: string[]; threshold: number },
    saltNonce?: number,
  ): Promise<string> {
    // Create a SafeFactory instance using the EthersAdapter
    const safeFactory = await SafeFactory.create({
      ethAdapter: this.ethAdapter,
    });
    // Configure the Safe parameters and predict the Safe address
    const smartWalletAddress = await safeFactory.predictSafeAddress(
      config,
      saltNonce ? saltNonce.toString() : '0',
    );
    return smartWalletAddress;
  }

  async deploySafeSCW(deployWalletDto: DeployWalletDto): Promise<string> {
    try {
      const { owner, signer } = deployWalletDto;
      const saltNonce = deployWalletDto.deploymentWalletIndex || 0;
      this.ethAdapter = new EthersAdapter({
        ethers,
        signerOrProvider: signer,
      });

      const safeFactory = await SafeFactory.create({
        ethAdapter: this.ethAdapter,
      });

      const config = {
        owners: [owner],
        threshold: 1,
      };

      return await new Promise<string>((resolve, reject) => {
        const callback = (txHash: string): void => {
          Logger.log('txHash ', txHash);
          Logger.log('Safe Deployed Successfully');
          resolve(txHash); // Resolve the Promise with txHash when deployment is successful
        };

        safeFactory
          .deploySafe({
            saltNonce: saltNonce.toString(),
            safeAccountConfig: config,
            callback,
          })
          /* eslint-disable @typescript-eslint/no-explicit-any */
          .catch((error: any) => {
            if (
              error instanceof Error &&
              error.message.includes('execution reverted: Create2 call failed')
            ) {
              Logger.log('Safe is already deployed');
              resolve('Safe is already deployed'); // Resolve with message indicating the Safe is already deployed
            } else {
              Logger.error('An error occurred while deploying safe', error);
              reject('Error occurred while deploying safe'); // Reject the Promise with an error message
            }
          });
      });
    } catch (error) {
      Logger.error('An error occurred while creating SafeFactory', error);
      throw new Error('Error occurred while creating SafeFactory');
    }
  }
}
export default Safe;
