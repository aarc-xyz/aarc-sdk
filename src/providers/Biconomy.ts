import { Logger } from '../utils/Logger';
import { Contract } from 'ethers';
import { BICONOMY_TX_SERVICE_URL } from '../utils/Constants';
import NodeClient from '@biconomy/node-client';
import { BICONOMY_FACTORY_ABI } from '../utils/abis/BiconomyFactory.abi';
import { DeployWalletDto, SmartAccountResponse } from '../utils/AarcTypes';

class Biconomy {
  nodeClient: NodeClient;
  chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.nodeClient = new NodeClient({ txServiceUrl: BICONOMY_TX_SERVICE_URL });
  }

  async getAllBiconomySCWs(
    chainId: number,
    owner: string,
  ): Promise<SmartAccountResponse[]> {
    try {
      const accounts: SmartAccountResponse[] = [];
      const params = {
        chainId: chainId,
        owner: owner,
        index: 0,
      };
      let account = await this.nodeClient.getSmartAccountsByOwner(params);
      while (
        account &&
        account.data &&
        account.data.length > 0 &&
        account.data[0].isDeployed
      ) {
        accounts.push({
          address: account.data[0].smartAccountAddress,
          isDeployed: account.data[0].isDeployed,
        });
        params.index += 1;
        account = await this.nodeClient.getSmartAccountsByOwner(params);
      }
      return accounts;
    } catch (error) {
      Logger.error('error while getting biconomy smart accounts');
      throw error;
    }
  }

  async deployBiconomySCW(deployWalletDto: DeployWalletDto): Promise<string> {
    // Input validation
    const { owner, signer } = deployWalletDto;
    const nonce = deployWalletDto.deploymentWalletIndex || 0;
    const chainId = this.chainId;
    if (typeof chainId !== 'number' || chainId <= 0) {
      throw new Error('Invalid chainId');
    }

    if (typeof owner !== 'string' || owner.trim() === '') {
      throw new Error('Invalid owner address');
    }

    const accountInfo = await this.nodeClient.getSmartAccountsByOwner({
      chainId: chainId,
      owner: owner,
      index: nonce,
    });

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
