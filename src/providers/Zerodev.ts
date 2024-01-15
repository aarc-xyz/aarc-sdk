import { Contract, ethers, providers } from 'ethers';
import { Provider } from '@ethersproject/providers';
import {
  DeployWalletDto,
  DeployWalletReponse,
  SmartAccountResponse,
} from '../utils/AarcTypes';
import { Logger } from '../utils/Logger';
import {
  KERNEL_ECDSA_VALIDATOR_ADDRESS,
  KERNEL_IMPLEMENTATION_ADDRESS,
  ZERODEV_ENTRY_POINT_ADDRESS,
  ZERODEV_KERNEL_FACTORY_ADDRESS,
} from '../utils/Constants';
import { ZERODEV_KERNEL_FACTORY_ABI } from '../utils/abis/ZerodevFactory.abi';
import { KERNEL_ACCOUNT_ABI } from '../utils/abis/KernelAccount.abi';
import { ZERODEV_ENTRY_POINT_ABI } from '../utils/abis/ZerodevEntryPoint.abi';

class Zerodev {
  provider: Provider;
  chainId: number;

  constructor(chainId: number, rpcUrl: string) {
    this.chainId = chainId;
    this.provider = new providers.JsonRpcProvider(rpcUrl);
  }

  async getAllZerodevSCWs(owner: string): Promise<SmartAccountResponse[]> {
    try {
      let index = 0;
      const accounts: SmartAccountResponse[] = [];
      let account = await this.getZerodevSCW(owner, index);
      accounts.push(account);
      while (account && account.address && account.isDeployed) {
        index += 1;
        account = await this.getZerodevSCW(owner, index);
        accounts.push(account);
      }
      return accounts;
    } catch (error) {
      Logger.error('error while getting zerodev smart accounts');
      throw error;
    }
  }

  async getZerodevSCW(
    owner: string,
    index: number,
  ): Promise<SmartAccountResponse> {
    try {
      let zerodevSCWAddress: string;
      try {
        const zerodevEntryInstance = new Contract(
          ZERODEV_ENTRY_POINT_ADDRESS,
          ZERODEV_ENTRY_POINT_ABI,
          this.provider,
        );
        const initCode = this.getAccountInitCode(owner, index);
        await zerodevEntryInstance.callStatic.getSenderAddress(initCode);
        /* eslint-disable @typescript-eslint/no-explicit-any */
      } catch (err: any) {
        Logger.log(
          '[BaseSmartContractAccount](getAddress) entrypoint.getSenderAddress result: ',
          err.errorName,
        );
        if (err.errorName === 'SenderAddressResult') {
          zerodevSCWAddress = err.errorArgs[0] as string;
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
        }
      }
      throw new Error('getCounterFactualAddress failed');
    } catch (error) {
      Logger.error(
        `error while getting zerodev smart account of owner ${owner} and index ${index}`,
      );
      throw error;
    }
  }

  async deployZerodevSCW(
    deployWalletDto: DeployWalletDto,
  ): Promise<DeployWalletReponse> {
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
        KERNEL_ACCOUNT_ABI,
        this.provider,
      );
      const data = kernelAccountInstance.interface.encodeFunctionData(
        'initialize',
        [KERNEL_ECDSA_VALIDATOR_ADDRESS, owner],
      );
      const deploymentResponse = await zerodevFactoryInstance.createAccount(
        KERNEL_IMPLEMENTATION_ADDRESS,
        data,
        nonce,
      );
      if (deploymentResponse.hash) {
        return {
          smartWalletOwner: owner,
          deploymentWalletIndex: nonce,
          txHash: deploymentResponse.hash,
          chainId: this.chainId,
        };
      }
      throw new Error(
        'error while deploying zerodev smart account, txHash is missing',
      );
    } catch (error) {
      Logger.error('error while deploying zerodev smart account');
      throw error;
    }
  }

  getAccountInitCode(owner: string, index: number): string {
    return ethers.utils.hexConcat([
      ZERODEV_KERNEL_FACTORY_ADDRESS,
      this.getFactoryInitCode(owner, index),
    ]);
  }

  getFactoryInitCode(owner: string, index: number): string {
    try {
      const zerodevFactoryInstance = new Contract(
        ZERODEV_KERNEL_FACTORY_ADDRESS,
        ZERODEV_KERNEL_FACTORY_ABI,
        this.provider,
      );
      const kernelAccountInstance = new Contract(
        KERNEL_IMPLEMENTATION_ADDRESS,
        KERNEL_ACCOUNT_ABI,
        this.provider,
      );
      const data = kernelAccountInstance.interface.encodeFunctionData(
        'initialize',
        [KERNEL_ECDSA_VALIDATOR_ADDRESS, owner],
      );
      const initCode = zerodevFactoryInstance.interface.encodeFunctionData(
        'createAccount',
        [KERNEL_IMPLEMENTATION_ADDRESS, data, index],
      );
      return initCode;
    } catch (error) {
      Logger.error('error while getting zerodev factory init code');
      throw error;
    }
  }
}
export default Zerodev;
