import { Logger } from '../utils/Logger';
import { Signer, Contract } from 'ethers';
import { BICONOMY_TX_SERVICE_URL } from '../utils/Constants';
import {
  BiconomySmartAccountV2,
  DEFAULT_ENTRYPOINT_ADDRESS,
} from '@biconomy/account';
import {
  ECDSAOwnershipValidationModule,
  DEFAULT_ECDSA_OWNERSHIP_MODULE,
} from '@biconomy/modules';
import NodeClient, { SmartAccountsResponse } from '@biconomy/node-client';
import { BICONOMY_FACTORY_ABI } from '../utils/abis/BiconomyFactory.abi';

class Biconomy {
  nodeClient: NodeClient;

  constructor() {
    this.nodeClient = new NodeClient({ txServiceUrl: BICONOMY_TX_SERVICE_URL });
  }

  async getAllBiconomySCWs(
    chainId: number,
    owner: string,
    index: number = 0,
  ): Promise<SmartAccountsResponse> {
    try {
      const params = {
        chainId: chainId,
        owner: owner,
        index,
      };
      const account = await this.nodeClient.getSmartAccountsByOwner(params);
      // Logger.log('fetch account ', account)
      // while (
      //   account &&
      //   account.data &&
      //   account.data.length > 0
      // ) {
      //   accounts.push(...account.data);
      //   params.index += 1;
      //   account = await this.nodeClient.getSmartAccountsByOwner(params);
      // }
      // Logger.log('return account ', accounts)
      return account;
    } catch (error) {
      Logger.error('error while getting biconomy smart accounts');
      throw error;
    }
  }

  async generateBiconomySCW(signer: Signer): Promise<string> {
    try {
      const module = await ECDSAOwnershipValidationModule.create({
        signer: signer,
        moduleAddress: DEFAULT_ECDSA_OWNERSHIP_MODULE,
      });

      const biconomySmartAccount = await BiconomySmartAccountV2.create({
        chainId: await signer.getChainId(),
        entryPointAddress: DEFAULT_ENTRYPOINT_ADDRESS,
        defaultValidationModule: module,
        activeValidationModule: module,
      });

      return await biconomySmartAccount.getAccountAddress();
    } catch (error) {
      Logger.error('error while generating biconomy smart account');
      throw error;
    }
  }

  async deployBiconomyScw(
    signer: Signer,
    chainId: number,
    owner: string,
    nonce: number = 0,
  ): Promise<string> {
    // Input validation
    if (!(signer instanceof Signer)) {
      throw new Error('Invalid signer');
    }

    if (typeof chainId !== 'number' || chainId <= 0) {
      throw new Error('Invalid chainId');
    }

    if (typeof owner !== 'string' || owner.trim() === '') {
      throw new Error('Invalid owner address');
    }

    const accountInfo = await this.getAllBiconomySCWs(chainId, owner, nonce);
    Logger.log('accountInfo ', accountInfo);

    // Validate response from getSmartAccountsByOwner
    if (
      accountInfo.code !== 200 ||
      !Array.isArray(accountInfo.data) ||
      accountInfo.data.length === 0
    ) {
      throw new Error(
        'Invalid or empty response from getSmartaccountInfosByOwner',
      );
    }

    if (!accountInfo) {
      throw new Error(
        'Invalid or empty response from getSmartaccountInfosByOwner',
      );
    }

    const factoryAddress = accountInfo.data[0].factoryAddress;
    const isDeployed = accountInfo.data[0].isDeployed;

    if (isDeployed) {
      Logger.log('Biconomy wallet is already deployed');
      return 'Biconomy wallet is already deployed';
    }

    // Validate factoryAddress
    if (typeof factoryAddress !== 'string' || factoryAddress.trim() === '') {
      throw new Error('Invalid factoryAddress');
    }

    const factoryInstance = new Contract(
      factoryAddress,
      BICONOMY_FACTORY_ABI,
      signer,
    );
    const tx = await factoryInstance.deployCounterFactualAccount(owner, nonce);
    Logger.log('Wallet deployment tx sent with hash', tx.hash);
    return tx.hash;
  }
}

export default Biconomy;
