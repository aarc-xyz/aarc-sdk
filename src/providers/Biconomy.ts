import { Logger } from '../utils/Logger';
import { Signer } from 'ethers';
import { BICONOMY_TX_SERVICE_URL } from '../utils/Constants';
import { BiconomySmartAccountV2, DEFAULT_ENTRYPOINT_ADDRESS } from "@biconomy/account";
import { ECDSAOwnershipValidationModule, DEFAULT_ECDSA_OWNERSHIP_MODULE } from '@biconomy/modules'
import NodeClient from '@biconomy/node-client';

class Biconomy{
  signer: Signer;
  nodeClient: NodeClient;

  constructor(_signer: Signer) {
    Logger.log('Biconomy initiated');
    this.signer = _signer;
    this.nodeClient = new NodeClient({ txServiceUrl: BICONOMY_TX_SERVICE_URL });
  }

  async getAllBiconomySCWs(){
    try{
        const params = {
            chainId: await this.signer.getChainId(), //or any chain id of your choice
            owner: await this.signer.getAddress(),
            index: 0
        }
        const accounts = await this.nodeClient.getSmartAccountsByOwner(params);
        return accounts;
    } catch (error){
        Logger.error('error while getting biconomy smart accounts');
        throw error;
    }
  }

  async generateBiconomySCW(): Promise<string> {
    try{
      const module = await ECDSAOwnershipValidationModule.create({
          signer: this.signer,
          moduleAddress: DEFAULT_ECDSA_OWNERSHIP_MODULE
      });
      
      let biconomySmartAccount = await BiconomySmartAccountV2.create({
          chainId: await this.signer.getChainId(), 
          entryPointAddress: DEFAULT_ENTRYPOINT_ADDRESS,
          defaultValidationModule: module,
          activeValidationModule: module
      });
  
      return await biconomySmartAccount.getAccountAddress();
    } catch(error){
      Logger.error('error while generating biconomy smart account');
      throw error;
    }
  }
}

export default Biconomy;
