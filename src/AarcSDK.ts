import { EthersAdapter } from '@safe-global/protocol-kit';
import { Logger } from './utils/Logger';
import { BigNumber, Contract, ethers, Signer } from 'ethers';
import { sendRequest, HttpMethod } from './utils/HttpRequest'; // Import your HTTP module
import {
  BALANCES_ENDPOINT,
  PERMIT2_CONTRACT_ADDRESS,
  GELATO_RELAYER_ADDRESS,
  COVALENT_TOKEN_TYPES,
} from './utils/Constants';
import {
  BatchTransferPermitDto,
  BalancesResponse,
  Config,
  ExecuteMigrationDto,
  ExecuteMigrationGaslessDto,
  GelatoTxStatusDto,
  MigrationResponse,
  PermitDto,
  RelayTrxDto,
  SingleTransferPermitDto,
  TokenData,
  TokenNftData,
} from './utils/Types';
import { PERMIT2_BATCH_TRANSFER_ABI } from './utils/abis/Permit2BatchTransfer.abi';
import { PERMIT2_SINGLE_TRANSFER_ABI } from './utils/abis/Permit2SingleTransfer.abi';
import { GelatoRelay } from '@gelatonetwork/relay-sdk';
import Biconomy from './providers/Biconomy';
import Safe from './providers/Safe';
import { PermitHelper } from './helpers/PermitHelper';
import {
  getGelatoTransactionStatus,
  relayTransaction,
} from './helpers/GelatoHelper';
import { logError } from './helpers';
import { ChainId } from './utils/ChainTypes';

class AarcSDK {
  biconomy: Biconomy;
  safe: Safe;
  chainId: number;
  apiKey: string;
  relayer: GelatoRelay;
  ethersProvider!: ethers.providers.JsonRpcProvider;
  permitHelper: PermitHelper;

  constructor(config: Config) {
    const { rpcUrl, apiKey, chainId } = config;
    Logger.log('Aarc SDK initiated');

    this.biconomy = new Biconomy();
    this.safe = new Safe(rpcUrl);

    if (Object.values(ChainId).includes(chainId)) {
      this.chainId = chainId;
    } else {
      throw new Error('Invalid chain id');
    }
    this.apiKey = apiKey;
    this.ethersProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // instantiating Gelato Relay SDK
    this.relayer = new GelatoRelay();
    this.permitHelper = new PermitHelper(rpcUrl);
  }

  async getAllBiconomySCWs(owner: string) {
    return await this.biconomy.getAllBiconomySCWs(this.chainId, owner);
  }

  async generateBiconomySCW(signer: Signer) {
    return await this.biconomy.generateBiconomySCW(signer);
  }

  // Forward the methods from Safe
  getAllSafes(eoaAddress: string) {
    return this.safe.getAllSafes(this.chainId, eoaAddress);
  }

  generateSafeSCW(config: {owners: string[], threshold: number}, saltNonce?: number) {
    return this.safe.generateSafeSCW(config, saltNonce);
  }

  deploySafeSCW(owner: string, saltNonce?:number) {
    return this.safe.deploySafeSCW(owner, saltNonce);
  }

  /**
   * @description this function will return balances of ERC-20, ERC-721 and native tokens
   * @param balancesDto
   * @returns
   */
  async fetchBalances(eoaAddress: string, tokenAddresses?: string[]): Promise<BalancesResponse> {
    try {
      // Make the API call using the sendRequest function
      let response: BalancesResponse = await sendRequest({
        url: BALANCES_ENDPOINT,
        method: HttpMethod.POST,
        headers: {
          'x-api-key': this.apiKey,
        },
        body: {
          chainId: String(this.chainId),
          address: eoaAddress,
          tokenAddresses: tokenAddresses,
        },
      });

      Logger.log('Fetching API Response:', response);
      return response;
    } catch (error) {
      // Handle any errors that may occur during the API request
      Logger.error('Error making Covalent API call:', error);
      throw error;
    }
  }

  async executeMigration(
    executeMigrationDto: ExecuteMigrationDto,
  ): Promise<MigrationResponse[]> {
    const response: MigrationResponse[] = [];
    try {
      Logger.log('executeMigration ');

      const { transferTokenDetails, receiverAddress, senderSigner } = executeMigrationDto;
      const owner = await senderSigner.getAddress();
      const tokenAddresses = transferTokenDetails?.map((token) => token.tokenAddress);

      let balancesList = await this.fetchBalances(owner, tokenAddresses);

      transferTokenDetails?.map((tandA) => {
        const matchingToken = balancesList.data.find(
          (mToken) =>
            mToken.token_address.toLowerCase() ===
            tandA.tokenAddress.toLowerCase(),
        );
        if (!matchingToken) {
          response.push({
            tokenAddress: tandA.tokenAddress,
            amount: tandA?.amount,
            message: 'Supplied token does not exist',
          });
        }
      });

      if (transferTokenDetails){
        const updatedTokens: TokenData[] = [];
        for (const tokenInfo of balancesList.data) {
          const matchingToken = transferTokenDetails?.find(
            (token) =>
              token.tokenAddress.toLowerCase() ===
              tokenInfo.token_address.toLowerCase(),
          );

          if (
            matchingToken &&
            matchingToken.amount !== undefined &&
            BigNumber.from(matchingToken.amount).gt(0) &&
            BigNumber.from(matchingToken.amount).gt(tokenInfo.balance)
          ) {
            response.push({
              tokenAddress: tokenInfo.token_address,
              amount: matchingToken?.amount,
              message: 'Supplied amount is greater than balance',
            });
          } else if (
            matchingToken &&
            matchingToken.tokenIds !== undefined &&
            tokenInfo.nft_data !== undefined
          ){
            const nftTokenIds: TokenNftData[] = [];
            for (const tokenId of matchingToken.tokenIds) {
              const tokenExist = tokenInfo.nft_data.find((nftData) => nftData.tokenId === tokenId);
              if(tokenExist){
                nftTokenIds.push(tokenExist);
              } else {
                response.push({
                  tokenAddress: tokenInfo.token_address,
                  tokenId: tokenId,
                  message: 'Supplied NFT does not exist',
                });
              }
            }
            tokenInfo.nft_data = nftTokenIds;
            updatedTokens.push(tokenInfo);
          } else if(matchingToken) updatedTokens.push(tokenInfo);
        }

        // Now, updatedTokens contains the filtered array without the undesired elements
        balancesList.data = updatedTokens;
      }

      let tokens = balancesList.data.filter((balances) => {
        return (
          balances.type === COVALENT_TOKEN_TYPES.STABLE_COIN ||
          balances.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY ||
          balances.type === COVALENT_TOKEN_TYPES.DUST
        );
      });

      Logger.log(' filtered tokens ', tokens);

      tokens = tokens.map((element: TokenData) => {
        const matchingToken = transferTokenDetails?.find(
          (token) =>
            token.tokenAddress.toLowerCase() ===
            element.token_address.toLowerCase(),
        );

        if (
          matchingToken &&
          matchingToken.amount !== undefined &&
          BigNumber.from(matchingToken.amount).gt(0)
        ) {
          element.balance = matchingToken.amount;
        }

        // Case: transferTokenDetails contains amount for token but it's greater than the given allowance
        // Then we assign the allowance amount 0 to perform normal token transfer
        if (
          element.type === COVALENT_TOKEN_TYPES.STABLE_COIN &&
          COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY &&
          BigNumber.from(element.permit2Allowance).gte(BigNumber.from(0)) &&
          BigNumber.from(element.balance).gt(element.permit2Allowance)
        ) {
          element.permit2Allowance = BigNumber.from(0);
        }

        return element;
      });

      Logger.log('tokens ', tokens);

      let nfts = balancesList.data.filter((balances) => {
        return balances.type === COVALENT_TOKEN_TYPES.NFT;
      });

      Logger.log('nfts ', nfts);

      // token address, tokenIds: array of tokenIds
      for (const collection of nfts) {
        if (collection.nft_data) {
          for (const nft of collection.nft_data) {
            try {
              const txHash = await this.permitHelper.performNFTTransfer({
                senderSigner: senderSigner,
                recipientAddress: receiverAddress,
                tokenAddress: collection.token_address,
                tokenId: nft.tokenId,
              }
              );
              response.push({
                tokenAddress: collection.token_address,
                amount: 1,
                tokenId: nft.tokenId,
                message: 'Nft transfer successful',
                txHash: typeof txHash === 'string' ? txHash : '',
              });
            } catch (error: any) {
              logError(collection, error);
              response.push({
                tokenAddress: collection.token_address,
                amount: 1,
                message: 'Nft transfer failed',
                txHash: '',
              });
            }
          }
        }
      }

      const erc20Tokens = tokens.filter(
        (token) =>
          token.type === COVALENT_TOKEN_TYPES.STABLE_COIN ||
          token.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY,
      );
      Logger.log('erc20Tokens ', erc20Tokens);

      const erc20TransferableTokens = erc20Tokens.filter((balanceObj) =>
        BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(0)),
      );
      const permit2TransferableTokens = erc20Tokens.filter(
        (balanceObj) =>
          BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(-1)) ||
          BigNumber.from(balanceObj.permit2Allowance).gt(BigNumber.from(0)),
      );

      const nativeToken = tokens.filter(
        (token) => token.type === COVALENT_TOKEN_TYPES.DUST,
      );

      Logger.log(' erc20TransferableTokens ', erc20TransferableTokens);
      Logger.log(' permit2TransferableTokens ', permit2TransferableTokens);
      Logger.log(' nativeToken ', nativeToken);

      // Loop through tokens to perform normal transfers
      for (const token of erc20TransferableTokens) {
        try {
          const txHash = await this.permitHelper.performTokenTransfer({
            senderSigner: senderSigner,
            recipientAddress: receiverAddress,
            tokenAddress: token.token_address,
            amount: token.balance,
          }
          );
          response.push({
            tokenAddress: token.token_address,
            amount: token.balance,
            message: 'Token transfer successful',
            txHash: typeof txHash === 'string' ? txHash : '',
          });
        } catch (error: any) {
          logError(token, error);
          response.push({
            tokenAddress: token.token_address,
            amount: token.balance,
            message: 'Token transfer failed',
            txHash: '',
          });
        }
      }

      const permit2Contract = new Contract(
        PERMIT2_CONTRACT_ADDRESS,
        PERMIT2_BATCH_TRANSFER_ABI,
        senderSigner,
      );

      if (permit2TransferableTokens.length === 1) {
        const token = permit2TransferableTokens[0];
        try {
          const txHash = await this.permitHelper.performTokenTransfer({
            senderSigner: senderSigner,
            recipientAddress: receiverAddress,
            tokenAddress: token.token_address,
            amount: token.balance,
          }
          );
          response.push({
            tokenAddress: token.token_address,
            amount: token.balance,
            message: 'Token transfer successful',
            txHash: typeof txHash === 'string' ? txHash : '',
          });
        } catch (error: any) {
          logError(token, error);
          response.push({
            tokenAddress: token.token_address,
            amount: token.balance,
            message: 'Token transfer failed',
            txHash: '',
          });
        }
      }

      if (permit2TransferableTokens.length > 1) {
        const batchTransferPermitDto: BatchTransferPermitDto = {
          signer: senderSigner,
          chainId: this.chainId,
          spenderAddress: owner,
          tokenData: permit2TransferableTokens,
        };
        const permitData = await this.permitHelper.getBatchTransferPermitData(
          batchTransferPermitDto,
        );
        const { permitBatchTransferFrom, signature } = permitData;

        const tokenPermissions = permitBatchTransferFrom.permitted.map(
          (batchInfo) => ({
            to: receiverAddress,
            requestedAmount: batchInfo.amount,
          }),
        );

        try {
          const txInfo = await permit2Contract.permitTransferFrom(
            permitData.permitBatchTransferFrom,
            tokenPermissions,
            owner,
            signature,
          );
          permitBatchTransferFrom.permitted.map((token) => {
            response.push({
              tokenAddress: token.token,
              amount: token.amount,
              message: 'Token transfer successful',
              txHash: txInfo.hash,
            });
          });
        } catch (error: any) {
          permitBatchTransferFrom.permitted.map((token) => {
            logError(
              {
                token_address: token.token,
                balance: token.amount,
              },
              error,
            );
            response.push({
              tokenAddress: token.token,
              amount: token.amount,
              message: 'Token transfer Failed',
              txHash: '',
            });
          });
        }
      }

      if (nativeToken.length > 0) {
        const updatedNativeToken = await this.fetchBalances(owner, 
          [nativeToken[0].token_address,]
        );
        const amountTransfer = BigNumber.from(
          updatedNativeToken.data[0].balance,
        )
          .mul(BigNumber.from(80))
          .div(BigNumber.from(100));
        try {
          const txHash = await this.permitHelper.performNativeTransfer({
            senderSigner: senderSigner,
            recipientAddress: receiverAddress,
            amount: amountTransfer,
          }
          );

          response.push({
            tokenAddress: nativeToken[0].token_address,
            amount: amountTransfer,
            message: 'Native transfer successful',
            txHash: typeof txHash === 'string' ? txHash : '',
          });
          // await delay(5000)
        } catch (error: any) {
          logError(nativeToken[0], error);
          response.push({
            tokenAddress: nativeToken[0].token_address,
            amount: amountTransfer,
            message: 'Native transfer failed',
            txHash: '',
          });
        }
      }
    } catch (error) {
      // Handle any errors that occur during the migration process
      Logger.error('Migration Error:', error);
      throw error;
    }
    Logger.log(JSON.stringify(response));
    return response;
  }

  async executeMigrationGasless(
    executeMigrationGaslessDto: ExecuteMigrationGaslessDto,
  ): Promise<MigrationResponse[]> {
    const response: MigrationResponse[] = [];
    try {
      const { senderSigner, transferTokenDetails, receiverAddress, gelatoApiKey } =
        executeMigrationGaslessDto;
      const owner = await senderSigner.getAddress();
      const tokenAddresses = transferTokenDetails?.map((token) => token.tokenAddress);

      const balancesList = await this.fetchBalances(owner, tokenAddresses);

      transferTokenDetails?.map((tandA) => {
        const matchingToken = balancesList.data.find(
          (mToken) =>
            mToken.token_address.toLowerCase() ===
            tandA.tokenAddress.toLowerCase(),
        );
        if (!matchingToken) {
          response.push({
            tokenAddress: tandA.tokenAddress,
            amount: tandA?.amount,
            message: 'Supplied token does not exist',
          });
        }
      });

      const updatedTokens: TokenData[] = [];
      for (const tokenInfo of balancesList.data) {
        const matchingToken = transferTokenDetails?.find(
          (token) =>
            token.tokenAddress.toLowerCase() ===
            tokenInfo.token_address.toLowerCase(),
        );

        if (
          matchingToken &&
          matchingToken.amount !== undefined &&
          matchingToken.amount.gt(0) &&
          BigNumber.from(matchingToken.amount).gt(tokenInfo.balance)
        ) {
          response.push({
            tokenAddress: tokenInfo.token_address,
            amount: matchingToken?.amount,
            message: 'Supplied amount is greater than balance',
          });
        } else updatedTokens.push(tokenInfo);
      }

      // Now, updatedTokens contains the filtered array without the undesired elements
      balancesList.data = updatedTokens;

      let nfts = balancesList.data.filter((balances) => {
        return balances.type === COVALENT_TOKEN_TYPES.NFT;
      });

      Logger.log('nfts ', nfts);

      for (const collection of nfts) {
        if (collection.nft_data) {
          for (const nft of collection.nft_data) {
            try {
              const txHash = await this.permitHelper.performNFTTransfer({
                senderSigner: senderSigner,
                recipientAddress: receiverAddress,
                tokenAddress: collection.token_address,
                tokenId: nft.tokenId,
              }
              );
              response.push({
                tokenAddress: collection.token_address,
                amount: 1,
                tokenId: nft.tokenId,
                message: 'Nft transfer successful',
                txHash: typeof txHash === 'string' ? txHash : '',
              });
            } catch (error: any) {
              logError(collection, error);
              response.push({
                tokenAddress: collection.token_address,
                amount: 1,
                message: 'Nft transfer failed',
                txHash: '',
              });
            }
          }
        }
      }

      let tokens = balancesList.data.filter((balances) => {
        return (
          balances.type === COVALENT_TOKEN_TYPES.STABLE_COIN ||
          balances.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY ||
          balances.type === COVALENT_TOKEN_TYPES.DUST
        );
      });

      Logger.log(' filtered tokens ', tokens);

      tokens = tokens.map((element: TokenData) => {
        const matchingToken = transferTokenDetails?.find(
          (token) =>
            token.tokenAddress.toLowerCase() ===
            element.token_address.toLowerCase(),
        );

        if (
          matchingToken &&
          matchingToken.amount !== undefined &&
          matchingToken.amount.gt(0)
        ) {
          element.balance = matchingToken.amount;
        }

        // Case: transferTokenDetails contains amount for token but it's greater than the given allowance
        // Then we assign the allowance amount 0 to perform normal token transfer
        if (
          element.type === COVALENT_TOKEN_TYPES.STABLE_COIN &&
          COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY &&
          element.permit2Allowance.gte(BigNumber.from(0)) &&
          element.balance.gt(element.permit2Allowance)
        ) {
          element.permit2Allowance = BigNumber.from(0);
        }

        return element;
      });

      Logger.log('tokens ', tokens);

      const erc20Tokens = tokens.filter(
        (token) =>
          token.type === COVALENT_TOKEN_TYPES.STABLE_COIN ||
          token.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY,
      );
      Logger.log('erc20Tokens ', erc20Tokens);

      const nativeToken = tokens.filter(
        (token) => token.type === COVALENT_TOKEN_TYPES.DUST,
      );

      const erc20TransferableTokens = erc20Tokens.filter(
        (balanceObj) =>
          !balanceObj.permitExist &&
          balanceObj.permit2Allowance.eq(BigNumber.from(0)),
      );

      Logger.log('erc20TransferableTokens ', erc20TransferableTokens);
      // Loop through tokens to perform normal transfers

      for (const token of erc20TransferableTokens) {
        const tokenAddress = token.token_address;
        try {
          const txHash = await this.permitHelper.performTokenTransfer({
            senderSigner: senderSigner,
            recipientAddress: receiverAddress,
            tokenAddress: tokenAddress,
            amount: token.balance,
          }
          );
          response.push({
            tokenAddress: token.token_address,
            amount: token.balance,
            message: 'Token transfer successful',
            txHash: typeof txHash === 'string' ? txHash : '',
          });
        } catch (error: any) {
          logError(token, error);
          response.push({
            tokenAddress: token.token_address,
            amount: token.balance,
            message: 'Token transfer failed',
            txHash: '',
          });
        }
      }

      // Filtering out tokens to do permit transaction
      const permittedTokens = erc20Tokens.filter(
        (balanceObj) =>
          balanceObj.permitExist &&
          BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(0)),
      );
      Logger.log('permittedTokens ', permittedTokens);
      permittedTokens.map(async (token) => {
        const permitDto: PermitDto = {
          signer: senderSigner,
          chainId: this.chainId,
          eoaAddress: owner,
          tokenAddress: token.token_address,
        };
        try {
          const resultSet = await this.permitHelper.performPermit(permitDto);
          const relayTrxDto: RelayTrxDto = {
            relayer: this.relayer,
            requestData: resultSet,
            gelatoApiKey,
          };
          const taskId = await relayTransaction(relayTrxDto);
          const gelatoTxStatusDto: GelatoTxStatusDto = {
            relayer: this.relayer,
            taskId,
          };
          const txStatus = await getGelatoTransactionStatus(gelatoTxStatusDto);
          if (txStatus) {
            permit2TransferableTokens.push(token);
          }
          response.push({
            tokenAddress: token.token_address,
            amount: token.balance,
            message:
              typeof txStatus === 'string'
                ? 'Token Permit Successful'
                : 'Token Permit Failed',
            txHash: typeof txStatus === 'string' ? txStatus : '',
          });
        } catch (error: any) {
          logError(token, error);
          response.push({
            tokenAddress: token.token_address,
            amount: token.balance,
            message: 'Permit token failed',
            txHash: '',
          });
        }
      });

      // filter out tokens that have already given allowance
      const permit2TransferableTokens = erc20Tokens.filter(
        (balanceObj) =>
          BigNumber.from(balanceObj.permit2Allowance).gt(BigNumber.from(0)) ||
          BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(-1)),
      );

      // Merge permittedTokens and permit2TransferableTokens
      const batchPermitTransaction = permittedTokens.concat(
        permit2TransferableTokens,
      );

      if (batchPermitTransaction.length === 1) {
        const singleTransferPermitDto: SingleTransferPermitDto = {
          signer: senderSigner,
          chainId: this.chainId,
          spenderAddress: GELATO_RELAYER_ADDRESS,
          tokenData: batchPermitTransaction[0],
        };
        const permit2SingleContract = new Contract(
          PERMIT2_CONTRACT_ADDRESS,
          PERMIT2_SINGLE_TRANSFER_ABI,
          senderSigner,
        );
        const permitData = await this.permitHelper.getSingleTransferPermitData(
          singleTransferPermitDto,
        );
        const { permitTransferFrom, signature } = permitData;

        const { data } =
          await permit2SingleContract.populateTransaction.permitTransferFrom(
            permitTransferFrom,
            {
              to: receiverAddress,
              requestedAmount: permitTransferFrom.permitted.amount,
            },
            owner,
            signature,
          );
        if (!data) {
          throw new Error('unable to get data');
        }
        const relayTrxDto: RelayTrxDto = {
          relayer: this.relayer,
          requestData: {
            chainId: BigInt(this.chainId),
            target: PERMIT2_CONTRACT_ADDRESS,
            data,
          },
          gelatoApiKey,
        };
        try {
          const taskId = await relayTransaction(relayTrxDto);
          const txStatus = await getGelatoTransactionStatus({
            relayer: this.relayer,
            taskId,
          });
          response.push({
            tokenAddress: permitTransferFrom.permitted.token,
            amount: permitTransferFrom.permitted.amount,
            message:
              typeof txStatus === 'string'
                ? 'Transactions Successful'
                : 'Transactions Failed',
            txHash: typeof txStatus === 'string' ? txStatus : '',
          });
        } catch (error: any) {
          logError(
            {
              token_address: permitTransferFrom.permitted.token,
              balance: permitTransferFrom.permitted.amount,
            },
            error,
          );
        }
      } else if (batchPermitTransaction.length > 1) {
        const permit2BatchContract = new Contract(
          PERMIT2_CONTRACT_ADDRESS,
          PERMIT2_BATCH_TRANSFER_ABI,
          senderSigner,
        );

        const batchTransferPermitDto: BatchTransferPermitDto = {
          signer: senderSigner,
          chainId: this.chainId,
          spenderAddress: GELATO_RELAYER_ADDRESS,
          tokenData: batchPermitTransaction,
        };
        const permitData = await this.permitHelper.getBatchTransferPermitData(
          batchTransferPermitDto,
        );

        const { permitBatchTransferFrom, signature } = permitData;

        const tokenPermissions = permitBatchTransferFrom.permitted.map(
          (batchInfo) => ({
            to: receiverAddress,
            requestedAmount: batchInfo.amount,
          }),
        );

        const { data } =
          await permit2BatchContract.populateTransaction.permitTransferFrom(
            permitBatchTransferFrom,
            tokenPermissions,
            owner,
            signature,
          );
        if (!data) {
          throw new Error('unable to get data');
        }

        const relayTrxDto: RelayTrxDto = {
          relayer: this.relayer,
          requestData: {
            chainId: BigInt(this.chainId),
            target: PERMIT2_CONTRACT_ADDRESS,
            data,
          },
          gelatoApiKey,
        };
        try {
          const taskId = await relayTransaction(relayTrxDto);
          const txStatus = await getGelatoTransactionStatus({
            relayer: this.relayer,
            taskId,
          });
          permitBatchTransferFrom.permitted.map((token) => {
            response.push({
              tokenAddress: token.token,
              amount: token.amount,
              message:
                typeof txStatus === 'string'
                  ? 'Transaction Successful'
                  : 'Transaction Failed',
              txHash: typeof txStatus === 'string' ? txStatus : '',
            });
          });
        } catch (error: any) {
          permitBatchTransferFrom.permitted.map((token) => {
            logError(
              {
                token_address: token.token,
                balance: token.amount,
              },
              error,
            );
            response.push({
              tokenAddress: token.token,
              amount: token.amount,
              message: 'Transaction Failed',
              txHash: '',
            });
          });
        }
      }

      if (nativeToken.length > 0) {
        const updatedNativeToken = await this.fetchBalances(owner, [
          nativeToken[0].token_address,
        ]);
        const amountTransfer = BigNumber.from(
          updatedNativeToken.data[0].balance,
        )
          .mul(BigNumber.from(80))
          .div(BigNumber.from(100));
        try {
          const txHash = await this.permitHelper.performNativeTransfer({
            senderSigner: senderSigner,
            recipientAddress: receiverAddress,
            amount: amountTransfer,
          }
          );

          response.push({
            tokenAddress: nativeToken[0].token_address,
            amount: amountTransfer,
            message: 'Native transfer successful',
            txHash: typeof txHash === 'string' ? txHash : '',
          });
        } catch (error: any) {
          logError(nativeToken[0], error);
          response.push({
            tokenAddress: nativeToken[0].token_address,
            amount: amountTransfer,
            message: 'Native transfer failed',
            txHash: '',
          });
        }
      }
    } catch (error) {
      // Handle any errors that occur during the migration process
      Logger.error('Migration Error:', error);
      throw error;
    }
    Logger.log(JSON.stringify(response));
    return response;
  }
}

export default AarcSDK;
