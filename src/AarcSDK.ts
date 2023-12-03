import { Logger } from './utils/Logger';
import { BigNumber, Contract, ethers, Signer } from 'ethers';
import { sendRequest, HttpMethod } from './utils/HttpRequest'; // Import your HTTP module
import {
  BALANCES_ENDPOINT,
  PERMIT2_CONTRACT_ADDRESS,
  GELATO_RELAYER_ADDRESS,
  COVALENT_TOKEN_TYPES,
  gasTokenAddresses,
  ETHEREUM_ADDRESS_PATTERN,
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
  TransactionsResponse,
  WALLET_TYPE,
  DeployWalletDto,
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
import {
  logError,
  processERC20TransferrableTokens,
  processNativeTransfer,
  processNftTransactions,
  processTokenData,
  processTransferTokenDetails,
} from './helpers';
import { calculateTotalGasNeeded } from './helpers/EstimatorHelper';
import { ChainId } from './utils/ChainTypes';
import { SmartAccountsResponse } from '@biconomy/node-client';
import { OwnerResponse } from '@safe-global/api-kit';

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
      throw new Error('Unsupported chain id');
    }
    this.apiKey = apiKey;
    this.ethersProvider = new ethers.providers.JsonRpcProvider(rpcUrl);

    // instantiating Gelato Relay SDK
    this.relayer = new GelatoRelay();
    this.permitHelper = new PermitHelper(rpcUrl, chainId);
  }

  async getAllBiconomySCWs(owner: string): Promise<SmartAccountsResponse> {
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

  deploySafeSCW(owner: string, saltNonce?: number): Promise<string> {
    return this.safe.deploySafeSCW(owner, saltNonce);
  }

  async deployBiconomyScw(
    signer: Signer,
    owner: string,
    nonce: number = 0,
  ): Promise<string> {
    return this.biconomy.deployBiconomyScw(signer, this.chainId, owner, nonce);
  }

  async transferNativeAndDeploy(
    deployWalletDto: DeployWalletDto,
  ): Promise<MigrationResponse[]> {
    const response: MigrationResponse[] = [];
    try {
      const { receiver, amount, owner, signer } = deployWalletDto;
      let amountToTransfer = BigNumber.from(0);

      if (!signer) {
        throw Error('signer is required');
      }

      if (amount && BigNumber.from(amount).gt(0)) {
        amountToTransfer = amount;
      } else {
        amountToTransfer = BigNumber.from(
          await this.ethersProvider.getBalance(owner),
        );

        if (BigNumber.from(amountToTransfer).gt(0)) {
          amountToTransfer = amountToTransfer
            .mul(BigNumber.from(80))
            .div(BigNumber.from(100));
        }
      }

      try {
        const walletDeploymentResponse =
          await this.deployWallet(deployWalletDto);
        response.push({
          tokenAddress: '',
          amount: BigNumber.from(0),
          message: ETHEREUM_ADDRESS_PATTERN.test(walletDeploymentResponse)
            ? 'Deployment tx sent'
            : walletDeploymentResponse,
          txHash: ETHEREUM_ADDRESS_PATTERN.test(walletDeploymentResponse)
            ? walletDeploymentResponse
            : '',
        });
        /* eslint-disable @typescript-eslint/no-explicit-any */
      } catch (error: any) {
        Logger.error(error);
        response.push({
          tokenAddress: '',
          amount: amountToTransfer,
          message: 'Deployment Tx Failed',
          txHash: '',
        });
      }

      const txHash = await this.permitHelper.performNativeTransfer({
        senderSigner: signer,
        recipientAddress: receiver,
        amount: amountToTransfer,
      });

      response.push({
        tokenAddress: '',
        amount: amountToTransfer,
        message:
          typeof txHash === 'string'
            ? 'Token transfer tx sent'
            : 'Token transfer tx failed',
        txHash: typeof txHash === 'string' ? txHash : '',
      });

      Logger.log(JSON.stringify(response));
      return response;
    } catch (error) {
      Logger.error('transferNativeAndDeploy Error:', error);
      throw error;
    }
  }

  deployWallet(deployWalletDto: DeployWalletDto): Promise<string> {
    const { walletType, owner, signer, nonce } = deployWalletDto;

    if (walletType === WALLET_TYPE.SAFE) {
      return this.deploySafeSCW(owner, nonce);
    } else {
      if (!signer) {
        throw Error('signer is required');
      }
      return this.deployBiconomyScw(signer, owner, nonce);
    }
  }

  /**
   * @description this function will return balances of ERC-20, ERC-721 and native tokens
   * @param balancesDto
   * @returns
   */
  async fetchBalances(
    eoaAddress: string,
    fetchBalancesOnly: boolean = true,
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
          onlyBalances: fetchBalancesOnly,
          tokenAddresses: tokenAddresses,
        },
      });

      Logger.log('Fetching API Response:', response);
      return response;
    } catch (error) {
      // Handle any errors that may occur during the API request
      Logger.error('Error making backend API call:', error);
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
      const { transferTokenDetails } = executeMigrationDto;
      const owner = await senderSigner.getAddress();

      const tokenAddresses = transferTokenDetails?.map(
        (token) => token.tokenAddress,
      );

      if (tokenAddresses && tokenAddresses.length > 0) {
        const isExist = tokenAddresses.find(
          (token) => token === gasTokenAddresses[this.chainId as ChainId],
        );
        if (!isExist) {
          tokenAddresses.push(gasTokenAddresses[this.chainId as ChainId]);
        }
      }

      const balancesList = await this.fetchBalances(
        owner,
        false,
        tokenAddresses,
      );

      remainingBalance = BigNumber.from(
        balancesList.data?.find((token) => token.native_token === true)
          ?.balance || BigNumber.from(0),
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
        // Now, updatedTokens contains the filtered array without the undesired elements
        balancesList.data = processTransferTokenDetails(
          transferTokenDetails,
          response,
          balancesList,
        );
      }

      const tokens = processTokenData(balancesList, transferTokenDetails);

      Logger.log('tokens ', tokens);

      processNftTransactions(
        balancesList,
        transactions,
        owner,
        receiverAddress,
      );

      const erc20Tokens = tokens.filter(
        (token) =>
          (token.type === COVALENT_TOKEN_TYPES.STABLE_COIN ||
            token.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY) &&
          token.native_token === false,
      );
      Logger.log('erc20Tokens ', erc20Tokens);

      processERC20TransferrableTokens(
        erc20Tokens,
        transactions,
        owner,
        receiverAddress,
      );

      await this.permitHelper.processPermit2Tokens(
        erc20Tokens,
        transactions,
        senderSigner,
        receiverAddress,
      );

      await processNativeTransfer(
        tokens,
        transferTokenDetails,
        transactions,
        this,
        owner,
        receiverAddress,
      );

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
      if (permitBatchTransaction)
        await this.permitHelper.processPermit2BatchTransactions(
          permitBatchTransaction,
          senderSigner,
          response,
          remainingBalance,
        );

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

        if (BigNumber.from(tx.gasCost)?.gt(remainingBalance)) {
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
              message: 'Nft transfer tx sent',
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
              message: 'Token transfer tx sent',
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
              message: 'Native transfer tx sent',
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
      const { transferTokenDetails } = executeMigrationGaslessDto;
      const owner = await senderSigner.getAddress();
      const tokenAddresses = transferTokenDetails?.map(
        (token) => token.tokenAddress,
      );

      if (tokenAddresses && tokenAddresses.length > 0) {
        const isExist = tokenAddresses.find(
          (token) => token === gasTokenAddresses[this.chainId as ChainId],
        );
        if (!isExist) {
          tokenAddresses.push(gasTokenAddresses[this.chainId as ChainId]);
        }
      }

      const balancesList = await this.fetchBalances(
        owner,
        false,
        tokenAddresses,
      );
      remainingBalance = BigNumber.from(
        balancesList.data?.find((token) => token.native_token === true)
          ?.balance || BigNumber.from(0),
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
        // Now, updatedTokens contains the filtered array without the undesired elements
        balancesList.data = processTransferTokenDetails(
          transferTokenDetails,
          response,
          balancesList,
        );
      }

      processNftTransactions(
        balancesList,
        transactions,
        owner,
        receiverAddress,
      );

      const tokens = processTokenData(balancesList, transferTokenDetails);

      Logger.log('tokens ', tokens);

      const erc20Tokens = tokens.filter(
        (token) =>
          (token.type === COVALENT_TOKEN_TYPES.STABLE_COIN ||
            token.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY) &&
          token.native_token === false,
      );
      Logger.log('erc20Tokens ', erc20Tokens);

      processERC20TransferrableTokens(
        erc20Tokens,
        transactions,
        owner,
        receiverAddress,
        true,
      );

      // filter out tokens that have already given allowance
      const permit2TransferableTokens = erc20Tokens.filter(
        (balanceObj) =>
          BigNumber.from(balanceObj.permit2Allowance).gt(BigNumber.from(0)) ||
          BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(-1)),
      );

      // Filtering out tokens to do permit transaction
      const permittedTokens = erc20Tokens.filter(
        (balanceObj) =>
          balanceObj.permitExist &&
          BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(0)),
      );
      Logger.log('permittedTokens ', permittedTokens);
      const permitResponse = permittedTokens.map(async (token) => {
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
          if (typeof txStatus === 'string') {
            permit2TransferableTokens.push(token);
          }
          response.push({
            tokenAddress: token.token_address,
            amount: token.balance,
            message:
              typeof txStatus === 'string'
                ? 'Token Permit tx Sent'
                : 'Token Permit Tx Failed',
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

      await Promise.all(permitResponse);

      if (permit2TransferableTokens.length === 1) {
        const singleTransferPermitDto: SingleTransferPermitDto = {
          signer: senderSigner,
          chainId: this.chainId,
          spenderAddress: GELATO_RELAYER_ADDRESS,
          tokenData: permit2TransferableTokens[0],
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
                ? 'Transaction sent'
                : 'Transaction Failed',
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
      } else if (permit2TransferableTokens.length > 1) {
        const permit2BatchContract = new Contract(
          PERMIT2_CONTRACT_ADDRESS,
          PERMIT2_BATCH_TRANSFER_ABI,
          senderSigner,
        );

        const batchTransferPermitDto: BatchTransferPermitDto = {
          signer: senderSigner,
          chainId: this.chainId,
          spenderAddress: GELATO_RELAYER_ADDRESS,
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
                  ? 'Transaction sent'
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

      await processNativeTransfer(
        tokens,
        transferTokenDetails,
        transactions,
        this,
        owner,
        receiverAddress,
      );

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

        if (BigNumber.from(tx.gasCost)?.gt(remainingBalance)) {
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
              message: 'Nft transfer tx sent',
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
              message: 'Token transfer tx sent',
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
              message: 'Native transfer tx sent',
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
