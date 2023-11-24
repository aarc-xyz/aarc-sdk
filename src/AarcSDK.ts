import { Logger } from './utils/Logger';
import { BigNumber, Contract, ethers, Signer } from 'ethers';
import { sendRequest, HttpMethod } from './utils/HttpRequest'; // Import your HTTP module
import {
  BALANCES_ENDPOINT,
  PERMIT2_CONTRACT_ADDRESS,
  GELATO_RELAYER_ADDRESS,
  COVALENT_TOKEN_TYPES,
  nativeTokenAddresses,
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
  TransactionsResponse,
} from './utils/AarcTypes';
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
import { logError, removeDuplicateTokens } from './helpers';
import { calculateTotalGasNeeded } from './helpers/EstimatorHelper';
import { ChainId } from './utils/ChainTypes';
import { ISmartAccount } from '@biconomy/node-client';
import { OwnerResponse } from '@safe-global/api-kit';
import { TokenPermissions } from '@uniswap/permit2-sdk';

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

  async getAllBiconomySCWs(owner: string): Promise<ISmartAccount[]> {
    return this.biconomy.getAllBiconomySCWs(this.chainId, owner);
  }

  async generateBiconomySCW(signer: Signer): Promise<string> {
    return this.biconomy.generateBiconomySCW(signer);
  }

  // Forward the methods from Safe
  getAllSafes(owner: string): Promise<OwnerResponse> {
    return this.safe.getAllSafes(this.chainId, owner);
  }

  generateSafeSCW(
    config: { owners: string[]; threshold: number },
    saltNonce?: number,
  ): Promise<string> {
    return this.safe.generateSafeSCW(config, saltNonce);
  }

  deploySafeSCW(owner: string, saltNonce?: number): Promise<boolean> {
    return this.safe.deploySafeSCW(owner, saltNonce);
  }

  /**
   * @description this function will return balances of ERC-20, ERC-721 and native tokens
   * @param balancesDto
   * @returns
   */
  async fetchBalances(
    eoaAddress: string,
    tokenAddresses?: string[],
  ): Promise<BalancesResponse> {
    try {
      // Make the API call using the sendRequest function
      const response: BalancesResponse = await sendRequest({
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
    const transactions: TransactionsResponse[] = [];
    let remainingBalance = BigNumber.from(0);
    try {
      Logger.log('executeMigration ');

      const { receiverAddress, senderSigner } = executeMigrationDto;
      let { transferTokenDetails } = executeMigrationDto;
      const owner = await senderSigner.getAddress();

      const tokenAddresses = transferTokenDetails?.map(
        (token) => token.tokenAddress,
      );

      if (tokenAddresses && tokenAddresses.length > 0) {
        const isExist = tokenAddresses.find(
          (token) => token === nativeTokenAddresses[this.chainId as ChainId],
        );
        if (!isExist) {
          tokenAddresses.push(nativeTokenAddresses[this.chainId as ChainId]);
        }
      }

      const balancesList = await this.fetchBalances(owner, tokenAddresses);

      remainingBalance = BigNumber.from(
        balancesList.data?.find(
          (token) =>
            token.token_address.toLowerCase() ===
            nativeTokenAddresses[this.chainId as ChainId],
        )?.balance || BigNumber.from(0),
      );

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
        tandA.tokenAddress = tandA.tokenAddress.toLowerCase();
      });

      if (transferTokenDetails) {
        const updatedTokens: TokenData[] = [];

        const removeDuplicatesResult = removeDuplicateTokens(
          transferTokenDetails,
          response,
        );
        transferTokenDetails = removeDuplicatesResult.transferTokenDetails;

        for (const tokenInfo of balancesList.data) {
          const matchingToken = transferTokenDetails?.find(
            (token) =>
              token.tokenAddress.toLowerCase() ===
              tokenInfo.token_address.toLowerCase(),
          );

          if (
            matchingToken &&
            matchingToken.amount !== undefined &&
            matchingToken.tokenIds == undefined &&
            BigNumber.from(matchingToken.amount).gt(0) &&
            BigNumber.from(matchingToken.amount).gt(tokenInfo.balance)
          ) {
            response.push({
              tokenAddress: tokenInfo.token_address,
              amount: matchingToken?.amount,
              message: 'Supplied amount is greater than balance',
              txHash: '',
            });
          } else if (
            matchingToken &&
            matchingToken.tokenIds !== undefined &&
            tokenInfo.nft_data !== undefined
          ) {
            const nftTokenIds: TokenNftData[] = [];
            for (const tokenId of matchingToken.tokenIds) {
              const tokenExist = tokenInfo.nft_data.find(
                (nftData) => nftData.tokenId === tokenId,
              );
              if (tokenExist) {
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
          } else if (matchingToken) updatedTokens.push(tokenInfo);
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

      const nfts = balancesList.data.filter((balances) => {
        return balances.type === COVALENT_TOKEN_TYPES.NFT;
      });

      Logger.log('nfts ', nfts);

      // token address, tokenIds: array of tokenIds
      for (const collection of nfts) {
        if (collection.nft_data) {
          for (const nft of collection.nft_data) {
            transactions.push({
              from: owner,
              to: receiverAddress,
              tokenAddress: collection.token_address,
              amount: BigNumber.from(1),
              tokenId: nft.tokenId,
              type: COVALENT_TOKEN_TYPES.NFT,
            });
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
        transactions.push({
          from: owner,
          to: receiverAddress,
          tokenAddress: token.token_address,
          amount: token.balance,
          type: COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY,
        });
      }

      const permit2Contract = new Contract(
        PERMIT2_CONTRACT_ADDRESS,
        PERMIT2_BATCH_TRANSFER_ABI,
        senderSigner,
      );

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

      if (nativeToken.length > 0) {
        const matchingToken = transferTokenDetails?.find(
          (token) =>
            token.tokenAddress.toLowerCase() ===
            nativeTokenAddresses[this.chainId as ChainId],
        );

        let amountTransfer = BigNumber.from(0);

        if (
          matchingToken &&
          matchingToken.amount !== undefined &&
          BigNumber.from(matchingToken.amount).gt(0)
        ) {
          amountTransfer = matchingToken.amount;
        } else {
          const updatedNativeToken = await this.fetchBalances(owner, [
            nativeToken[0].token_address,
          ]);
          amountTransfer = BigNumber.from(updatedNativeToken.data[0].balance)
            .mul(BigNumber.from(80))
            .div(BigNumber.from(100));
        }

        transactions.push({
          from: owner,
          to: receiverAddress,
          tokenAddress: nativeToken[0].token_address,
          amount: amountTransfer,
          type: COVALENT_TOKEN_TYPES.DUST,
        });
      }
      Logger.log('all trx ', transactions);
      const { validTransactions, totalGasCost } = await calculateTotalGasNeeded(
        this.ethersProvider,
        transactions,
        this.chainId,
      );
      Logger.log('validTransactions ', validTransactions);
      Logger.log('totalGasCost ', totalGasCost);

      // Find permit-batch transaction
      const permitBatchTransaction = validTransactions.find(
        (tx: TransactionsResponse) => tx.type === 'permitbatch',
      );

      Logger.log('remainingBalance ', remainingBalance);

      Logger.log('permitBatchTransaction ', permitBatchTransaction);

      // Process permit-batch transaction if it exists and there's enough balance
      if (
        permitBatchTransaction &&
        remainingBalance !== undefined &&
        permitBatchTransaction.batchDto &&
        permitBatchTransaction.gasCost
      ) {
        if (permitBatchTransaction.gasCost.lte(remainingBalance)) {
          try {
            Logger.log('Doing Permit Batch Transaction');
            Logger.log(JSON.stringify(permitBatchTransaction));

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
                  message: 'Token transfer successful',
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

      // Sort other transactions (excluding permitbatch) by gasCost in ascending order
      const sortedTransactions = validTransactions.filter(
        (tx: TransactionsResponse) => tx !== permitBatchTransaction,
      );
      sortedTransactions.sort((a, b) => {
        const gasCostA = a.gasCost?.toNumber() || 0;
        const gasCostB = b.gasCost?.toNumber() || 0;
        return gasCostA - gasCostB;
      });

      Logger.log('sortedTransactions ', JSON.stringify(sortedTransactions));

      for (const tx of sortedTransactions) {
        Logger.log(' Managing sorted trx ');
        Logger.log(' tx ', tx);

        if (tx.gasCost?.gt(remainingBalance)) {
          Logger.log(
            `Transaction skipped. Insufficient balance for gas cost: ${tx.gasCost}`,
          );
          response.push({
            tokenAddress: tx.tokenAddress,
            amount: tx.amount,
            message: 'Insufficient balance for transaction',
            txHash: '',
          });
          continue; // Skip this transaction if gas cost exceeds available balance
        }
        if (tx.type === COVALENT_TOKEN_TYPES.NFT && tx.tokenId) {
          try {
            const txHash = await this.permitHelper.performNFTTransfer({
              senderSigner: senderSigner,
              recipientAddress: receiverAddress,
              tokenAddress: tx.tokenAddress,
              tokenId: tx.tokenId,
            });
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount,
              tokenId: tx.tokenId,
              message: 'Nft transfer successful',
              txHash: typeof txHash === 'string' ? txHash : '',
            });
            /* eslint-disable @typescript-eslint/no-explicit-any */
          } catch (error: any) {
            logError(tx, error);
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount,
              message: 'Nft transfer failed',
              txHash: '',
            });
          }
        }
        if (tx.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY) {
          try {
            const txHash = await this.permitHelper.performTokenTransfer({
              senderSigner: senderSigner,
              recipientAddress: receiverAddress,
              tokenAddress: tx.tokenAddress,
              amount: tx.amount,
            });
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount,
              message: 'Token transfer successful',
              txHash: typeof txHash === 'string' ? txHash : '',
            });
          } catch (error: any) {
            logError(tx, error);
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount,
              message: 'Token transfer failed',
              txHash: '',
            });
          }
        }
        if (tx.type === COVALENT_TOKEN_TYPES.DUST) {
          try {
            Logger.log('Transferring Native Tokens');
            Logger.log('tx ', tx);
            const txHash = await this.permitHelper.performNativeTransfer({
              senderSigner: senderSigner,
              recipientAddress: receiverAddress,
              amount: tx.amount,
            });

            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount,
              message: 'Native transfer successful',
              txHash: typeof txHash === 'string' ? txHash : '',
            });
          } catch (error: any) {
            logError(tx, error);
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount,
              message: 'Native transfer failed',
              txHash: '',
            });
          }
        }
        // Deduct the gas cost from the remaining balance after the transaction
        if (tx.gasCost) remainingBalance = remainingBalance.sub(tx.gasCost);
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
    let remainingBalance = BigNumber.from(0);
    const transactions: TransactionsResponse[] = [];

    try {
      const { senderSigner, receiverAddress, gelatoApiKey } =
        executeMigrationGaslessDto;
      let { transferTokenDetails } = executeMigrationGaslessDto;
      const owner = await senderSigner.getAddress();
      const tokenAddresses = transferTokenDetails?.map(
        (token) => token.tokenAddress,
      );

      if (tokenAddresses && tokenAddresses.length > 0) {
        const isExist = tokenAddresses.find(
          (token) => token === nativeTokenAddresses[this.chainId as ChainId],
        );
        if (!isExist) {
          tokenAddresses.push(nativeTokenAddresses[this.chainId as ChainId]);
        }
      }

      const balancesList = await this.fetchBalances(owner, tokenAddresses);
      remainingBalance = BigNumber.from(
        balancesList.data?.find(
          (token) =>
            token.token_address.toLowerCase() ===
            nativeTokenAddresses[this.chainId as ChainId],
        )?.balance || BigNumber.from(0),
      );

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
        tandA.tokenAddress = tandA.tokenAddress.toLowerCase();
      });

      if (transferTokenDetails) {
        const updatedTokens: TokenData[] = [];

        const removeDuplicatesResult = removeDuplicateTokens(
          transferTokenDetails,
          response,
        );
        transferTokenDetails = removeDuplicatesResult.transferTokenDetails;

        for (const tokenInfo of balancesList.data) {
          const matchingToken = transferTokenDetails?.find(
            (token) =>
              token.tokenAddress.toLowerCase() ===
              tokenInfo.token_address.toLowerCase(),
          );

          if (
            matchingToken &&
            matchingToken.amount !== undefined &&
            matchingToken.tokenIds == undefined &&
            BigNumber.from(matchingToken.amount).gt(0) &&
            BigNumber.from(matchingToken.amount).gt(tokenInfo.balance)
          ) {
            response.push({
              tokenAddress: tokenInfo.token_address,
              amount: matchingToken?.amount,
              message: 'Supplied amount is greater than balance',
              txHash: '',
            });
          } else if (
            matchingToken &&
            matchingToken.tokenIds !== undefined &&
            tokenInfo.nft_data !== undefined
          ) {
            const nftTokenIds: TokenNftData[] = [];
            for (const tokenId of matchingToken.tokenIds) {
              const tokenExist = tokenInfo.nft_data.find(
                (nftData) => nftData.tokenId === tokenId,
              );
              if (tokenExist) {
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
          } else if (matchingToken) updatedTokens.push(tokenInfo);
        }

        // Now, updatedTokens contains the filtered array without the undesired elements
        balancesList.data = updatedTokens;
      }

      const nfts = balancesList.data.filter((balances) => {
        return balances.type === COVALENT_TOKEN_TYPES.NFT;
      });

      Logger.log('nfts ', nfts);

      for (const collection of nfts) {
        if (collection.nft_data) {
          for (const nft of collection.nft_data) {
            transactions.push({
              from: owner,
              to: receiverAddress,
              tokenAddress: collection.token_address,
              amount: BigNumber.from(1),
              tokenId: nft.tokenId,
              type: COVALENT_TOKEN_TYPES.NFT,
            });
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
        transactions.push({
          from: owner,
          to: receiverAddress,
          tokenAddress: token.token_address,
          amount: token.balance,
          type: COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY,
        });
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
          logError(
            {
              tokenAddress: token.token_address,
              amount: token.balance,
            },
            error,
          );
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
              tokenAddress: permitTransferFrom.permitted.token,
              amount: permitTransferFrom.permitted.amount,
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
                tokenAddress: token.token,
                amount: token.amount,
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
        const matchingToken = transferTokenDetails?.find(
          (token) =>
            token.tokenAddress.toLowerCase() ===
            nativeTokenAddresses[this.chainId as ChainId],
        );

        let amountTransfer = BigNumber.from(0);

        if (
          matchingToken &&
          matchingToken.amount !== undefined &&
          BigNumber.from(matchingToken.amount).gt(0)
        ) {
          amountTransfer = matchingToken.amount;
        } else {
          const updatedNativeToken = await this.fetchBalances(owner, [
            nativeToken[0].token_address,
          ]);
          amountTransfer = BigNumber.from(updatedNativeToken.data[0].balance)
            .mul(BigNumber.from(80))
            .div(BigNumber.from(100));
        }

        transactions.push({
          from: owner,
          to: receiverAddress,
          tokenAddress: nativeToken[0].token_address,
          amount: amountTransfer,
          type: COVALENT_TOKEN_TYPES.DUST,
        });
      }

      Logger.log('all trx ', transactions);
      const { validTransactions, totalGasCost } = await calculateTotalGasNeeded(
        this.ethersProvider,
        transactions,
        this.chainId,
      );
      Logger.log('validTransactions ', validTransactions);
      Logger.log('totalGasCost ', totalGasCost);

      validTransactions.sort((a, b) => {
        const gasCostA = a.gasCost?.toNumber() || 0;
        const gasCostB = b.gasCost?.toNumber() || 0;
        return gasCostA - gasCostB;
      });

      for (const tx of validTransactions) {
        Logger.log(' Managing sorted trx ');
        Logger.log(' tx ', tx);

        if (tx.gasCost?.gt(remainingBalance)) {
          Logger.log(
            `Transaction skipped. Insufficient balance for gas cost: ${tx.gasCost}`,
          );
          response.push({
            tokenAddress: tx.tokenAddress,
            amount: tx.amount,
            message: 'Insufficient balance for transaction',
            txHash: '',
          });
          continue; // Skip this transaction if gas cost exceeds available balance
        }
        if (tx.type === COVALENT_TOKEN_TYPES.NFT && tx.tokenId) {
          try {
            const txHash = await this.permitHelper.performNFTTransfer({
              senderSigner: senderSigner,
              recipientAddress: receiverAddress,
              tokenAddress: tx.tokenAddress,
              tokenId: tx.tokenId,
            });
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount,
              tokenId: tx.tokenId,
              message: 'Nft transfer successful',
              txHash: typeof txHash === 'string' ? txHash : '',
            });
          } catch (error: any) {
            logError(tx, error);
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount,
              message: 'Nft transfer failed',
              txHash: '',
            });
          }
        }
        if (tx.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY) {
          try {
            const txHash = await this.permitHelper.performTokenTransfer({
              senderSigner: senderSigner,
              recipientAddress: receiverAddress,
              tokenAddress: tx.tokenAddress,
              amount: tx.amount,
            });
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount,
              message: 'Token transfer successful',
              txHash: typeof txHash === 'string' ? txHash : '',
            });
          } catch (error: any) {
            logError(tx, error);
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount,
              message: 'Token transfer failed',
              txHash: '',
            });
          }
        }
        if (tx.type === COVALENT_TOKEN_TYPES.DUST) {
          try {
            Logger.log('Transferring Native Tokens');
            Logger.log('tx ', tx);
            const txHash = await this.permitHelper.performNativeTransfer({
              senderSigner: senderSigner,
              recipientAddress: receiverAddress,
              amount: tx.amount,
            });

            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount,
              message: 'Native transfer successful',
              txHash: typeof txHash === 'string' ? txHash : '',
            });
          } catch (error: any) {
            logError(tx, error);
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount,
              message: 'Native transfer failed',
              txHash: '',
            });
          }
        }
        // Deduct the gas cost from the remaining balance after the transaction
        if (tx.gasCost) remainingBalance = remainingBalance.sub(tx.gasCost);
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
