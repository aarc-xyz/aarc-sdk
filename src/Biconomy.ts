import { Logger } from './utils/Logger';
import { ethers, Signer } from 'ethers';
import { BICONOMY_TX_SERVICE_URL } from './utils/Constants';
import { BiconomySmartAccountV2, DEFAULT_ENTRYPOINT_ADDRESS } from "@biconomy/account";
import { ECDSAOwnershipValidationModule, DEFAULT_ECDSA_OWNERSHIP_MODULE } from '@biconomy/modules'
import NodeClient from '@biconomy/node-client';

class Biconomy{
  signer!: Signer;

  constructor(_signer: Signer) {
    Logger.log('Biconomy initiated');
    this.signer = _signer;
  }

  async getAllBiconomySCWs(){
    try{
        const nodeClient = new NodeClient({ txServiceUrl: BICONOMY_TX_SERVICE_URL });
        const params = {
            chainId: await this.signer.getChainId(), //or any chain id of your choice
            owner: await this.signer.getAddress(),
            index: 0
        }
        const accounts = await nodeClient.getSmartAccountsByOwner(params);
        return accounts;
    } catch (error){
        Logger.log('error while getting biconomy smart accounts');
        throw error;
    }
  }

  async generateBiconomySCW(): Promise<string> {
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
  }
}

export default Biconomy;
