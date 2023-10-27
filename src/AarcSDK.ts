import { EthersAdapter, SafeFactory } from '@safe-global/protocol-kit';
import { Logger } from './utils/Logger';
import { ethers, Signer } from 'ethers';
import { sendRequest, HttpMethod } from './utils/HttpRequest'; // Import your HTTP module
import { BALANCES_ENDPOINT } from './utils/Constants';
import { GetBalancesDto } from './utils/types';

class AarcSDK {
  safeFactory!: SafeFactory;
  owner!: string;
  smartWalletAddress!: string;
  saltNonce = 0;
  ethAdapter!: EthersAdapter;
  isInited = false;

  constructor(signer: Signer) {
    Logger.log('SDK initiated');

    // Create an EthersAdapter using the provided signer or provider
    this.ethAdapter = new EthersAdapter({
      ethers,
      signerOrProvider: signer,
    });
  }

  /**
   *
   * @param _owner
   */
  async init(_owner: string) {
    try {
      this.owner = _owner;

      // Create a SafeFactory instance using the EthersAdapter
      this.safeFactory = await SafeFactory.create({
        ethAdapter: this.ethAdapter,
      });
      const config = {
        owners: [this.owner],
        threshold: 1,
      };
      // Configure the Safe parameters and predict the Safe address
      this.smartWalletAddress = await this.safeFactory.predictSafeAddress(
        config,
        this.saltNonce.toString(),
      );
    } catch (err) {
      Logger.error('Error creating safe');
    }
    this.isInited = true;
  }

  /**
   * @description this function will return computer smart wallet address
   * @returns
   */
  getSafe() {
    return this.smartWalletAddress;
  }

  /**
   * @description this function will return balances of ERC-20, ERC-721 and native tokens
   * @param balancesDto
   * @returns
   */
  async fetchBalances(balancesDto: GetBalancesDto) {
    try {
      // Make the API call using the sendRequest function
      const response = await sendRequest({
        url: BALANCES_ENDPOINT,
        method: HttpMethod.Post,
        body: balancesDto,
      });

      // Handle the response here, logging the result
      Logger.log('Fetching API Response:', response);
      return response;
    } catch (error) {
      // Handle any errors that may occur during the API request
      Logger.error('Error making Covalent API call:', error);
      throw error;
    }
  }
}

export default AarcSDK;
