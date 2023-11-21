import SafeApiKit, { OwnerResponse } from '@safe-global/api-kit';
import { SafeFactory } from '@safe-global/protocol-kit';
import { SAFE_TX_SERVICE_URLS } from '../utils/Constants';
import { EthersAdapter } from '@safe-global/protocol-kit';
import { ethers } from 'ethers';
import { Logger } from '../utils/Logger';

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

  async deploySafeSCW(owner: string, saltNonce?: number): Promise<boolean> {
    // Create a SafeFactory instance using the EthersAdapter
    const safeFactory = await SafeFactory.create({
      ethAdapter: this.ethAdapter,
    });
    const config = {
      owners: [owner],
      threshold: 1,
    };

    const callback = (txHash: string): void => {
      Logger.log('txHash ', txHash);
      Logger.log('Safe Deployed Sucessfully');
    };
    try {
      await safeFactory.deploySafe({
        saltNonce: saltNonce ? saltNonce.toString() : '0',
        safeAccountConfig: config,
        callback,
      });
    } catch (error: any) {
      if (
        error instanceof Error &&
        error.message.includes('execution reverted: Create2 call failed')
      ) {
        // Handle the specific error message here
        Logger.log('Safe is already deployed');
        // Perform specific actions or additional logging based on this error
        return true;
      } else {
        // Handle other errors if needed
        Logger.error('An error occurred while deploying safe', error);
        return false;
      }
    }
    return true;
  }
}
export default Safe;
