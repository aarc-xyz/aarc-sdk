import { ERC20_ABI } from '../utils/abis/ERC20.abi';
import { ERC721_ABI } from '../utils/abis/ERC721.abi';
import { BigNumber, Contract, ethers, Signer } from 'ethers';
import {
  SignatureTransfer,
  TokenPermissions,
  PermitBatchTransferFrom,
} from '@uniswap/permit2-sdk';
import {
  PERMIT2_CONTRACT_ADDRESS,
  PERMIT_FUNCTION_TYPES,
  PERMIT_FUNCTION_ABI,
  PERMIT2_DOMAIN_NAME,
  COVALENT_TOKEN_TYPES,
} from '../utils/Constants';
import {
  PermitData,
  BatchPermitData,
  PermitDto,
  SingleTransferPermitDto,
  BatchTransferPermitDto,
  PermitDomainDto,
  TokenTransferDto,
  NftTransferDto,
  NativeTransferDto,
  TokenData,
  TransactionsResponse,
  MigrationResponse,
} from '../utils/AarcTypes';
import {
  TypedDataDomain,
  TypedDataSigner,
} from '@ethersproject/abstract-signer';
import { Logger } from '../utils/Logger';
import { PERMIT2_SINGLE_TRANSFER_ABI } from '../utils/abis/Permit2SingleTransfer.abi';
import { uint256, uint8 } from 'solidity-math';
import { PERMIT2_BATCH_TRANSFER_ABI } from '../utils/abis/Permit2BatchTransfer.abi';
import { logError } from './helper';

export class PermitHelper {
  ethAdapter: ethers.providers.JsonRpcProvider;
  chainId: number;

  constructor(rpcUrl: string, chainId: number) {
    this.ethAdapter = new ethers.providers.JsonRpcProvider(rpcUrl);
    this.chainId = chainId;
  }

  async performTokenTransfer(
    tokenTransferDto: TokenTransferDto,
  ): Promise<boolean> {
    const { senderSigner, recipientAddress, tokenAddress, amount } =
      tokenTransferDto;
    Logger.log(`Transferring token ${tokenAddress} with amount ${amount}`);
    // Create a contract instance with the ABI and contract address.
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      senderSigner,
    );

    const gasEstimated = await tokenContract.estimateGas.transfer(
      recipientAddress,
      amount,
    );
    Logger.log('gasEstimated', gasEstimated);

    // Perform the token transfer.
    const tx = await tokenContract.transfer(recipientAddress, amount, {
      gasLimit: gasEstimated.mul(130).div(100),
    });
    return tx.hash;
  }

  async performNFTTransfer(nftTransferDto: NftTransferDto): Promise<boolean> {
    const { senderSigner, recipientAddress, tokenAddress, tokenId } =
      nftTransferDto;
    Logger.log(`Transferring NFT ${tokenAddress} with tokenId ${tokenId}`);

    // Create a contract instance with the ABI and contract address.
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC721_ABI,
      senderSigner,
    );

    const gasEstimated = await tokenContract.estimateGas.safeTransferFrom(
      await senderSigner.getAddress(),
      recipientAddress,
      BigNumber.from(tokenId),
    );
    Logger.log('gasEstimated', gasEstimated);

    // Perform the token transfer.
    const tx = await tokenContract.safeTransferFrom(
      await senderSigner.getAddress(),
      recipientAddress,
      tokenId,
      {
        gasLimit: gasEstimated.mul(130).div(100),
      },
    );

    return tx.hash;
  }

  async performNativeTransfer(
    nativeTransferDto: NativeTransferDto,
  ): Promise<boolean | string> {
    const { senderSigner, recipientAddress, amount } = nativeTransferDto;
    const tx = await senderSigner.sendTransaction({
      to: recipientAddress,
      value: amount,
    });
    return tx.hash;
  }

  async signPermitMessage(permitDto: PermitDto): Promise<{
    r: string;
    s: string;
    v: number;
    nonce: number;
    deadline: number;
  }> {
    try {
      const { signer, chainId, eoaAddress, tokenAddress } = permitDto;
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      // Create a contract instance with the ABI and contract address.
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        signer,
      );
      const nonce = await tokenContract.nonces(eoaAddress);

      // set the domain parameters
      const domain = {
        name: await tokenContract.name(),
        version: '1', //        await tokenContract.EIP712_VERSION(),
        chainId: chainId,
        verifyingContract: tokenContract.address,
      };

      // set the Permit type values
      const values = {
        owner: eoaAddress,
        spender: PERMIT2_CONTRACT_ADDRESS,
        value: ethers.constants.MaxUint256,
        nonce: nonce,
        deadline: deadline,
      };

      // Sign the EIP-712 message
      const signature = await (
        signer as Signer & TypedDataSigner
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

  async performPermit(permitDto: PermitDto): Promise<{
    chainId: bigint;
    data: string;
    target: string;
  }> {
    try {
      const { signer, chainId, eoaAddress, tokenAddress } = permitDto;
      const { r, s, v, deadline } = await this.signPermitMessage(permitDto);

      // Create a contract instance with the ABI and contract address.
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [PERMIT_FUNCTION_ABI],
        signer,
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
    const { signer, chainId, spenderAddress, tokenData } =
      singleTransferPermitDto;
    const nonce = await this.getPermit2Nonce(spenderAddress);

    const permitTransferFrom = {
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

    const signature = await (signer as Signer & TypedDataSigner)._signTypedData(
      permitData.domain,
      permitData.types,
      permitData.values,
    );

    return {
      permitTransferFrom,
      signature,
    };
  }

  async getBatchTransferPermitData(
    batchTransferPermitDto: BatchTransferPermitDto,
  ): Promise<BatchPermitData> {
    const { signer, chainId, spenderAddress, tokenData } =
      batchTransferPermitDto;
    const nonce = await this.getPermit2Nonce(spenderAddress);

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

    const permitData = SignatureTransfer.getPermitData(
      permitBatchTransferFrom,
      PERMIT2_CONTRACT_ADDRESS,
      chainId,
    );

    Logger.log(
      'getBatchTransferPermitData permitData ',
      JSON.stringify(permitData),
    );

    const signature = await (signer as Signer & TypedDataSigner)._signTypedData(
      permitData.domain,
      permitData.types,
      permitData.values,
    );

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
      this.ethAdapter,
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
  /* eslint-disable @typescript-eslint/explicit-module-boundary-types */
  /* eslint-disable @typescript-eslint/explicit-function-return-type */
  async processPermit2Tokens(
    erc20Tokens: TokenData[],
    transactions: TransactionsResponse[],
    senderSigner: Signer,
    receiverAddress: string,
  ) {
    const owner = await senderSigner.getAddress();
    const permit2TransferableTokens = erc20Tokens.filter(
      (balanceObj) =>
        BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(-1)) ||
        BigNumber.from(balanceObj.permit2Allowance).gt(BigNumber.from(0)),
    );

    Logger.log(' permit2TransferableTokens ', permit2TransferableTokens);

    if (permit2TransferableTokens.length === 1) {
      const token = permit2TransferableTokens[0];
      transactions.push({
        from: owner,
        to: receiverAddress,
        tokenAddress: token.token_address,
        amount: token.balance,
        type: COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY,
      });
    }

    if (permit2TransferableTokens.length > 1) {
      const batchTransferPermitDto: BatchTransferPermitDto = {
        signer: senderSigner,
        chainId: this.chainId,
        spenderAddress: owner,
        tokenData: permit2TransferableTokens,
      };

      const { permitBatchTransferFrom, signature } =
        await this.getBatchTransferPermitData(batchTransferPermitDto);

      const tokenPermissions = permitBatchTransferFrom.permitted.map(
        (batchInfo) => ({
          to: receiverAddress,
          requestedAmount: batchInfo.amount,
        }),
      );
      transactions.push({
        tokenAddress: PERMIT2_CONTRACT_ADDRESS,
        from: owner,
        amount: BigNumber.from(0),
        to: receiverAddress,
        tokenPermissions,
        batchDto: permitBatchTransferFrom,
        signature,
        type: 'permitbatch',
      });
    }
  }

  async processPermit2BatchTransactions(
    permitBatchTransaction: TransactionsResponse,
    senderSigner: Signer,
    response: MigrationResponse[],
    remainingBalance: BigNumber,
  ) {
    if (
      permitBatchTransaction &&
      remainingBalance !== undefined &&
      permitBatchTransaction.batchDto &&
      permitBatchTransaction.gasCost
    ) {
      if (
        permitBatchTransaction.gasCost &&
        permitBatchTransaction.gasCost.lte(remainingBalance)
      ) {
        try {
          Logger.log('Doing Permit Batch Transaction');
          Logger.log(JSON.stringify(permitBatchTransaction));

          const permit2Contract = new Contract(
            PERMIT2_CONTRACT_ADDRESS,
            PERMIT2_BATCH_TRANSFER_ABI,
            senderSigner,
          );

          const txInfo = await permit2Contract.permitTransferFrom(
            permitBatchTransaction.batchDto,
            permitBatchTransaction.tokenPermissions,
            permitBatchTransaction.from,
            permitBatchTransaction.signature,
          );

          permitBatchTransaction.batchDto.permitted.map(
            (token: TokenPermissions) => {
              response.push({
                tokenAddress: token.token,
                amount: token.amount,
                message: 'Token transfer tx sent',
                txHash: txInfo.hash,
              });
            },
          );

          remainingBalance = remainingBalance.sub(
            BigNumber.from(permitBatchTransaction.gasCost),
          );
        } catch (error) {
          Logger.log('error ', error);
          permitBatchTransaction.batchDto.permitted.map(
            (token: TokenPermissions) => {
              logError(
                {
                  tokenAddress: token.token,
                  amount: token.amount,
                },
                error,
              );
              response.push({
                tokenAddress: token.token,
                amount: token.amount,
                message: 'Token transfer failed',
                txHash: '',
              });
            },
          );
        }
      } else {
        permitBatchTransaction.batchDto.permitted.map(
          (token: TokenPermissions) => {
            response.push({
              tokenAddress: token.token,
              amount: token.amount,
              message: 'Token transfer failed',
              txHash: '',
            });
          },
        );
      }
    }
  }
}
