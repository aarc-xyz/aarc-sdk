import SafeApiKit, { OwnerResponse } from '@safe-global/api-kit';
import { SafeFactory } from '@safe-global/protocol-kit';
import { SAFE_TX_SERVICE_URLS } from '../utils/Constants';
import { EthersAdapter } from '@safe-global/protocol-kit';
import { Signer } from 'ethers';
import { Logger } from '../utils/Logger';

class Safe {
  ethAdapter!: EthersAdapter;
  signer: Signer;
  saltNonce = 0;

  constructor(_signer: Signer, _ethAdapter: EthersAdapter) {
    this.signer = _signer;
    this.ethAdapter = _ethAdapter;
  }

  async getAllSafes(): Promise<OwnerResponse> {
    try {
      const safeService = new SafeApiKit({
        txServiceUrl: SAFE_TX_SERVICE_URLS[await this.signer.getChainId()],
        ethAdapter: this.ethAdapter,
      });
      const safes = await safeService.getSafesByOwner(
        await this.signer.getAddress(),
      );
      return safes;
    } catch (error) {
      Logger.log('error while getting safes');
      throw error;
    }
  }

  async generateSafeSCW(): Promise<string> {
    // Create a SafeFactory instance using the EthersAdapter
    const safeFactory = await SafeFactory.create({
      ethAdapter: this.ethAdapter,
    });
    const config = {
      owners: [await this.signer.getAddress()],
      threshold: 1,
    };
    // Configure the Safe parameters and predict the Safe address
    const smartWalletAddress = await safeFactory.predictSafeAddress(
      config,
      this.saltNonce.toString(),
    );
    return smartWalletAddress;
  }

  async deploySafeSCW(): Promise<boolean> {
    // Create a SafeFactory instance using the EthersAdapter
    const safeFactory = await SafeFactory.create({
      ethAdapter: this.ethAdapter,
    });
    const config = {
      owners: [await this.signer.getAddress()],
      threshold: 1,
    };

    const callback = (txHash: string): void => {
      Logger.log('txHash ', txHash);
      Logger.log('Safe Deployed Sucessfully');
    };
    try {
      await safeFactory.deploySafe({
        saltNonce: this.saltNonce.toString(),
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
