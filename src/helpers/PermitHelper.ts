import { ERC20_ABI } from '../utils/abis/ERC20.abi';
import { ERC721_ABI } from '../utils/abis/ERC721.abi';
import { BigNumber, Contract, ethers, Signer } from 'ethers';
import {
  PermitTransferFrom,
  SignatureTransfer,
  TokenPermissions,
  PermitBatchTransferFrom,
} from '@uniswap/permit2-sdk';
import { ChainId } from '../utils/ChainTypes';
import {
  PERMIT2_CONTRACT_ADDRESS,
  PERMIT_FUNCTION_TYPES,
  PERMIT_FUNCTION_ABI,
  PERMIT2_DOMAIN_NAME,
} from '../utils/Constants';
import {
  PermitData,
  BatchPermitData,
  PermitDto,
  SingleTransferPermitDto,
  BatchTransferPermitDto,
  PermitDomainDto,
} from '../utils/Types';
import {
  TypedDataDomain,
  TypedDataSigner,
} from '@ethersproject/abstract-signer';
import { Logger } from '../utils/Logger';
import { PERMIT2_SINGLE_TRANSFER_ABI } from '../utils/abis/Permit2SingleTransfer.abi';
import { uint256, uint8 } from 'solidity-math';

export class PermitHelper {
  signer: Signer;
  constructor(_signer: Signer) {
    this.signer = _signer;
  }

  async performTokenTransfer(
    recipient: string,
    tokenAddress: string,
    amount: BigNumber,
  ): Promise<boolean> {
    Logger.log(`Transferring token ${tokenAddress} with amount ${amount}`);
    // Create a contract instance with the ABI and contract address.
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      this.signer,
    );

    // Convert the amount to the appropriate units (e.g., wei for ERC-20 tokens).
    // const amountWei = ethers.utils.parseUnits(amount, 'ether');

    const gasEstimated = await tokenContract.estimateGas.transfer(
      recipient,
      amount,
    );
    Logger.log('gasEstimated', gasEstimated);

    // Perform the token transfer.
    const tx = await tokenContract.transfer(recipient, amount, {
      gasLimit: gasEstimated.mul(130).div(100),
    });
    return tx.hash;
  }

  async performNFTTransfer(
    recipient: string,
    tokenAddress: string,
    tokenId: string,
  ): Promise<boolean> {
    Logger.log(`Transferring NFT ${tokenAddress} with tokenId ${tokenId}`);

    // Create a contract instance with the ABI and contract address.
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC721_ABI,
      this.signer,
    );

    const gasEstimated = await tokenContract.estimateGas.safeTransferFrom(
      await this.signer.getAddress(),
      recipient,
      BigNumber.from(tokenId),
    );
    Logger.log('gasEstimated', gasEstimated);

    // Perform the token transfer.
    const tx = await tokenContract.safeTransferFrom(
      await this.signer.getAddress(),
      recipient,
      tokenId,
      {
        gasLimit: gasEstimated.mul(130).div(100),
      },
    );

    return tx.hash;
  }

  async performNativeTransfer(
    recipient: string,
    amount: BigNumber,
  ): Promise<boolean | string> {
    const tx = await this.signer.sendTransaction({
      to: recipient,
      value: amount,
    });
    return tx.hash;
  }

  async signPermitMessage(
    owner: string,
    chainId: ChainId,
    eoaAddress: string,
    tokenAddress: string,
  ): Promise<{
    r: string;
    s: string;
    v: number;
    nonce: number;
    deadline: number;
  }> {
    try {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      // Create a contract instance with the ABI and contract address.
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        this.signer,
      );
      const nonce = await tokenContract.nonces(eoaAddress);

      // set the domain parameters
      const domain = {
        name: await tokenContract.name(),
        version: '1',
        chainId: chainId,
        verifyingContract: tokenContract.address,
      };

      // set the Permit type values
      const values = {
        owner: owner,
        spender: PERMIT2_CONTRACT_ADDRESS,
        value: ethers.constants.MaxUint256,
        nonce: nonce,
        deadline: deadline,
      };

      // Sign the EIP-712 message
      const signature = await (
        this.signer as Signer & TypedDataSigner
      )._signTypedData(domain, PERMIT_FUNCTION_TYPES, values);
      const sig = ethers.utils.splitSignature(signature);
      return {
        r: sig.r,
        s: sig.s,
        v: sig.v,
        nonce,
        deadline,
      };
    } catch (error) {
      Logger.error(`Token transfer error: ${error}`);
      throw error;
    }
  }

  async performPermit(permitDto: PermitDto) {
    try {
      const { chainId, eoaAddress, tokenAddress } = permitDto;
      const { r, s, v, deadline } = await this.signPermitMessage(
        eoaAddress,
        chainId,
        eoaAddress,
        tokenAddress,
      );

      // Create a contract instance with the ABI and contract address.
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [PERMIT_FUNCTION_ABI],
        this.signer,
      );

      // Call the permit function
      const { data } = await tokenContract.populateTransaction.permit(
        eoaAddress,
        PERMIT2_CONTRACT_ADDRESS,
        ethers.constants.MaxUint256,
        deadline,
        v,
        r,
        s,
      );

      if (!data) {
        throw new Error('unable to get data');
      }

      return {
        chainId: BigInt(chainId),
        data,
        target: tokenAddress,
      };
    } catch (error) {
      Logger.error(`permit transaction error: ${error}`);
      throw error;
    }
  }

  toDeadline(expiration: number): number {
    return Math.floor((Date.now() + expiration) / 1000);
  }

  async getSingleTransferPermitData(
    singleTransferPermitDto: SingleTransferPermitDto,
  ): Promise<PermitData> {
    const { provider, chainId, spenderAddress, tokenData } =
      singleTransferPermitDto;
    const nonce = await this.getPermit2Nonce(spenderAddress);
    let permitTransferFrom: PermitTransferFrom;

    permitTransferFrom = {
      permitted: {
        token: tokenData.token_address,
        amount: tokenData.balance, // TODO: Verify transferrable amount
      },
      spender: spenderAddress,
      deadline: this.toDeadline(1000 * 60 * 60 * 24 * 1),
      nonce,
    };

    const permitData = SignatureTransfer.getPermitData(
      permitTransferFrom,
      PERMIT2_CONTRACT_ADDRESS,
      chainId,
    );

    Logger.log(
      'getSingleTransferPermitData permitData ',
      JSON.stringify(permitData),
    );

    const signature = await (
      this.signer as Signer & TypedDataSigner
    )._signTypedData(permitData.domain, permitData.types, permitData.values);

    return {
      permitTransferFrom,
      signature,
    };
  }

  async getBatchTransferPermitData(
    batchTransferPermitDto: BatchTransferPermitDto,
  ): Promise<BatchPermitData> {
    const { provider, chainId, spenderAddress, tokenData } =
      batchTransferPermitDto;
    const nonce = await this.getPermit2Nonce(spenderAddress);

    let permitData;

    if (tokenData.length < 2) {
      throw new Error('Invalid token data length');
    }

    const tokenPermissions: TokenPermissions[] = tokenData.map((token) => ({
      token: token.token_address,
      amount: token.balance,
    }));

    const permitBatchTransferFrom: PermitBatchTransferFrom = {
      permitted: tokenPermissions,
      spender: spenderAddress,
      deadline: this.toDeadline(1000 * 60 * 60 * 24 * 1),
      nonce,
    };

    permitData = SignatureTransfer.getPermitData(
      permitBatchTransferFrom,
      PERMIT2_CONTRACT_ADDRESS,
      chainId,
    );

    Logger.log(
      'getBatchTransferPermitData permitData ',
      JSON.stringify(permitData),
    );

    const signature = await (
      this.signer as Signer & TypedDataSigner
    )._signTypedData(permitData.domain, permitData.types, permitData.values);

    return {
      permitBatchTransferFrom,
      signature,
    };
  }

  permit2Domain(permitDomainDto: PermitDomainDto): TypedDataDomain {
    const { chainId, permit2Address } = permitDomainDto;
    return {
      name: PERMIT2_DOMAIN_NAME,
      chainId,
      verifyingContract: permit2Address,
    };
  }
  async getPermit2Nonce(owner: string): Promise<number> {
    const permit2Contract = new Contract(
      PERMIT2_CONTRACT_ADDRESS,
      PERMIT2_SINGLE_TRANSFER_ABI,
      this.signer,
    );
    let nonce = Math.floor(1000 + Math.random() * 9000);
    let bitmapValue = 69;
    while (bitmapValue != 0) {
      bitmapValue = await permit2Contract.nonceBitmap(
        owner,
        uint256(nonce).cast(uint8).toString(),
      );
      nonce++;
    }
    return nonce;
  }
}
