import { Logger } from '../utils/Logger';
import { Signer } from 'ethers';
import { BICONOMY_TX_SERVICE_URL } from '../utils/Constants';
import {
  BiconomySmartAccountV2,
  DEFAULT_ENTRYPOINT_ADDRESS,
} from '@biconomy/account';
import {
  ECDSAOwnershipValidationModule,
  DEFAULT_ECDSA_OWNERSHIP_MODULE,
} from '@biconomy/modules';
import NodeClient from '@biconomy/node-client';
import { ISmartAccount } from '@biconomy/node-client';

class Biconomy {
  nodeClient: NodeClient;

  constructor() {
    this.nodeClient = new NodeClient({ txServiceUrl: BICONOMY_TX_SERVICE_URL });
  }

  async getAllBiconomySCWs(chainId: number, owner: string) {
    try {
      let accounts: ISmartAccount[] = [];
      let params = {
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
        accounts.push(...account.data);
        params.index += 1;
        account = await this.nodeClient.getSmartAccountsByOwner(params);
      }
      return accounts;
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

      let biconomySmartAccount = await BiconomySmartAccountV2.create({
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
}

export default Biconomy;
