import { Contract, providers } from 'ethers';
import { Provider } from '@ethersproject/providers';
import { DeployWalletDto, SmartAccountResponse } from '../utils/AarcTypes';
import { Logger } from '../utils/Logger';
import {
  KERNEL_ECDSA_VALIDATOR_ADDRESS,
  KERNEL_IMPLEMENTATION_ADDRESS,
  ZERODEV_KERNEL_FACTORY_ADDRESS,
} from '../utils/Constants';
import { ZERODEV_KERNEL_FACTORY_ABI } from '../utils/abis/ZerodevFactory.abi';
import { KernelAccountAbi } from '../utils/abis/KernelAccount.abi';

class Zerodev {
  provider: Provider;
  chainId: number;

  constructor(chainId: number, rpcUrl: string) {
    console.log('Zerodev provider');
    this.chainId = chainId;
    this.provider = new providers.JsonRpcProvider(rpcUrl);
  }

  async getAllZerodevSCWs(owner: string): Promise<SmartAccountResponse[]> {
    try {
      let index = 0;
      const accounts: SmartAccountResponse[] = [];
      let account = await this.getZerodevSCW(owner, index);
      while (account && account.address && account.isDeployed) {
        account = await this.getZerodevSCW(owner, index);
        accounts.push(account);
        index += 1;
      }
      return accounts;
    } catch (error) {
      Logger.error('error while getting alchemy smart accounts');
      throw error;
    }
  }

  async getZerodevSCW(
    owner: string,
    index: number,
  ): Promise<SmartAccountResponse> {
    try {
      const zerodevFactoryInstance = new Contract(
        ZERODEV_KERNEL_FACTORY_ADDRESS,
        ZERODEV_KERNEL_FACTORY_ABI,
        this.provider,
      );
      const zerodevSCWAddress = await zerodevFactoryInstance.getAllAccounts(
        owner,
        index,
      );
      console.log('zerodevSCWAddress ', zerodevSCWAddress);
      const code = await this.provider.getCode(zerodevSCWAddress);
      if (code === '0x') {
        return {
          address: zerodevSCWAddress,
          isDeployed: false,
        };
      } else {
        return {
          address: zerodevSCWAddress,
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

  async deployZerodevSCW(deployWalletDto: DeployWalletDto): Promise<string> {
    try {
      const { signer, owner } = deployWalletDto;
      const nonce = deployWalletDto.deploymentWalletIndex || 0;
      const zerodevFactoryInstance = new Contract(
        ZERODEV_KERNEL_FACTORY_ADDRESS,
        ZERODEV_KERNEL_FACTORY_ABI,
        signer,
      );
      const kernelAccountInstance = new Contract(
        KERNEL_IMPLEMENTATION_ADDRESS,
        KernelAccountAbi,
        this.provider,
      );
      const zerodevSCWAddress = await zerodevFactoryInstance.createAccount(
        KERNEL_IMPLEMENTATION_ADDRESS,
        kernelAccountInstance.interface.encodeFunctionData('initialize', [
          KERNEL_ECDSA_VALIDATOR_ADDRESS,
          owner,
        ]),
        nonce,
      );
      return zerodevSCWAddress;
    } catch (error) {
      Logger.error('error while generating zerodev smart account');
      throw error;
    }
  }
}
export default Zerodev;
