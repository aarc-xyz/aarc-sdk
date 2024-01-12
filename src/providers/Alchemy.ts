import { Contract, providers } from 'ethers';
import { Provider } from '@ethersproject/providers';
import { getAlchemySimpleAccountFactoryAddress } from '../utils/Constants';
import { ALCHEMY_FACTORY_ABI } from '../utils/abis/AlchemyFactory.abi';
import { Logger } from '../utils/Logger';
import { DeployWalletDto, SmartAccountResponse } from '../utils/AarcTypes';

class Alchemy {
  provider: Provider;
  chainId: number;

  constructor(chainId: number, rpcUrl: string) {
    this.chainId = chainId;
    this.provider = new providers.JsonRpcProvider(rpcUrl);
  }

  async getAllAlchemySCWs(owner: string): Promise<SmartAccountResponse[]> {
    try {
      let index = 0;
      const accounts: SmartAccountResponse[] = [];
      let account = await this.getAlchemySCW(owner, index);
      while (account && account.address && account.isDeployed) {
        account = await this.getAlchemySCW(owner, index);
        accounts.push(account);
        index += 1;
      }
      return accounts;
    } catch (error) {
      Logger.error('error while getting alchemy smart accounts');
      throw error;
    }
  }

  async getAlchemySCW(
    owner: string,
    index: number,
  ): Promise<SmartAccountResponse> {
    try {
      const alchemyFactoryInstance = new Contract(
        getAlchemySimpleAccountFactoryAddress(this.chainId),
        ALCHEMY_FACTORY_ABI,
        this.provider,
      );
      const alchemySCWAddress = await alchemyFactoryInstance.getAllAccounts(
        owner,
        index,
      );
      console.log('alchemySCWAddress ', alchemySCWAddress);
      const code = await this.provider.getCode(alchemySCWAddress);
      if (code === '0x') {
        return {
          address: alchemySCWAddress,
          isDeployed: false,
        };
      } else {
        return {
          address: alchemySCWAddress,
          isDeployed: true,
        };
      }
    } catch (error) {
      Logger.error(
        `error while getting alchemy smart account of owner ${owner} and index ${index}`,
      );
      throw error;
    }
  }

  async deployAlchemySCW(deployWalletDto: DeployWalletDto): Promise<string> {
    try {
      const { signer, owner } = deployWalletDto;
      const nonce = deployWalletDto.deploymentWalletIndex || 0;
      const alchemyFactoryInstance = new Contract(
        getAlchemySimpleAccountFactoryAddress(this.chainId),
        ALCHEMY_FACTORY_ABI,
        signer,
      );
      const alchemySCWAddress = await alchemyFactoryInstance.createAccount(
        owner,
        nonce,
      );
      return alchemySCWAddress;
    } catch (error) {
      Logger.error('error while generating alchemy smart account');
      throw error;
    }
  }
}

export default Alchemy;
