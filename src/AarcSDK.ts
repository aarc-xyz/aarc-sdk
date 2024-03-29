import { Logger } from './utils/Logger';
import { BigNumber, Contract, ethers } from 'ethers';
import { sendRequest, HttpMethod } from './utils/HttpRequest'; // Import your HTTP module
import {
  PERMIT2_CONTRACT_ADDRESS,
  GELATO_RELAYER_ADDRESS,
  COVALENT_TOKEN_TYPES,
  GAS_TOKEN_ADDRESSES,
  PERMIT_TX_TYPES,
  TRX_STATUS_ENDPOINT,
  TREASURY_ADDRESS,
  SUPPORTED_STABLE_TOKENS,
} from './utils/Constants';
import {
  BatchTransferPermitDto,
  BalancesResponse,
  Config,
  ExecuteMigrationDto,
  ExecuteMigrationGaslessDto,
  MigrationResponse,
  PermitDto,
  RelayTrxDto,
  SingleTransferPermitDto,
  TransactionsResponse,
  WALLET_TYPE,
  DeployWalletDto,
  RelayTokenInfo,
  NativeTransferDeployWalletDto,
  RelayedTxListDto,
  TrxStatusResponse,
  TokenData,
  ExecuteMigrationForwardDto,
  TransferTokenDetails,
  SmartAccountResponse,
  DeployWalletReponse,
} from './utils/AarcTypes';
import { PERMIT2_BATCH_TRANSFER_ABI } from './utils/abis/Permit2BatchTransfer.abi';
import { PERMIT2_SINGLE_TRANSFER_ABI } from './utils/abis/Permit2SingleTransfer.abi';
import Biconomy from './providers/Biconomy';
import Safe from './providers/Safe';
import Alchemy from './providers/Alchemy';
import Zerodev from './providers/Zerodev';
import { PermitHelper } from './helpers/PermitHelper';
import {
  logError,
  makeForwardCall,
  makeGaslessCall,
  processERC20TransferrableTokens,
  processGasFeeAndTokens,
  processNativeTransfer,
  processNftTransactions,
  processPermit2TransferableTokens,
  processTokenData,
  processTransferTokenDetails,
} from './helpers';
import { calculateTotalGasNeeded } from './helpers/EstimatorHelper';
import { ChainId } from './utils/ChainTypes';
import {
  fetchBalances,
  fetchGasPrice,
  fetchNativeToUsdPrice,
} from './helpers/HttpHelper';

class AarcSDK {
  biconomy: Biconomy;
  safe: Safe;
  alchemy: Alchemy;
  zerodev: Zerodev;
  chainId: number;
  apiKey: string;
  ethersProvider!: ethers.providers.JsonRpcProvider;
  permitHelper: PermitHelper;

  constructor(config: Config) {
    const { rpcUrl, apiKey, chainId } = config;
    Logger.log('Aarc SDK initiated');

    this.biconomy = new Biconomy(chainId);
    this.safe = new Safe(chainId, rpcUrl);
    this.alchemy = new Alchemy(chainId, rpcUrl);
    this.zerodev = new Zerodev(chainId, rpcUrl);

    if (Object.values(ChainId).includes(chainId)) {
      this.chainId = chainId;
    } else {
      throw new Error('Unsupported chain id');
    }
    this.apiKey = apiKey;
    this.ethersProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
    this.permitHelper = new PermitHelper(rpcUrl, chainId);
  }

  /**
   * Function to get the address of the Smart Wallet by different Wallet Providers.
   * @param walletType Type of Wallet Provider
   * @param owner The address of the EOA that owns the wallet
   * @returns Reponse including the address of the wallet, the wallet index and whether it is deployed or not
   */
  async getSmartWalletAddresses(
    walletType: WALLET_TYPE,
    owner: string,
  ): Promise<SmartAccountResponse[]> {
    if (walletType === WALLET_TYPE.SAFE) {
      return this.safe.getAllSafes(owner);
    } else if (walletType == WALLET_TYPE.ALCHEMY) {
      return this.alchemy.getAllAlchemySCWs(owner);
    } else if (walletType == WALLET_TYPE.BICONOMY) {
      return this.biconomy.getAllBiconomySCWs(owner);
    } else if (walletType == WALLET_TYPE.ZERODEV) {
      return this.zerodev.getAllZerodevSCWs(owner);
    } else {
      throw new Error('Unsupported wallet type');
    }
  }

  /**
   * Function to deploy the Smart Wallet on the chosen Wallet Provider.
   * @param deployWalletDto Parameters to deploy a Smart Wallet. Those include owner address, signer, and wallet provider type.
   * @returns Reponse including the Smart Wallet deployment Index, txnHash, chainId and message.
   */
  deployWallet(deployWalletDto: DeployWalletDto): Promise<DeployWalletReponse> {
    const { walletType } = deployWalletDto;

    if (walletType === WALLET_TYPE.SAFE) {
      return this.safe.deploySafeSCW(deployWalletDto);
    } else if (walletType == WALLET_TYPE.ALCHEMY) {
      return this.alchemy.deployAlchemySCW(deployWalletDto);
    } else if (walletType == WALLET_TYPE.BICONOMY) {
      return this.biconomy.deployBiconomySCW(deployWalletDto);
    } else if (walletType == WALLET_TYPE.ZERODEV) {
      return this.zerodev.deployZerodevSCW(deployWalletDto);
    } else {
      throw new Error('Unsupported wallet type');
    }
  }

  /**
   * Function to deploy the Smart Wallet on the chosen Wallet Provider and transfer native tokens.
   * @param nativeTransferDeployWalletDto Parameters to deploy a Smart Wallet and transfer native tokens. Those include owner address, signer, receiver and wallet provider type.
   * @returns Migration response including the token address and message.
   * @dev if the txn successful then the Migration response will also include the txnHash, taskId and amount.
   */
  async transferNativeAndDeploy(
    nativeTransferDeployWalletDto: NativeTransferDeployWalletDto,
  ): Promise<MigrationResponse[]> {
    const response: MigrationResponse[] = [];
    try {
      const { receiver, amount, owner, signer } = nativeTransferDeployWalletDto;
      let amountToTransfer = BigNumber.from(0);

      if (!signer) {
        throw Error('signer is required');
      }

      if (amount && BigNumber.from(amount).gt(0)) {
        amountToTransfer = BigNumber.from(amount);
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
        const walletDeploymentResponse = await this.deployWallet(
          nativeTransferDeployWalletDto,
        );
        Logger.log('walletDeploymentResponse ', walletDeploymentResponse);
        response.push({
          tokenAddress: '',
          amount: BigNumber.from(0)._hex,
          message: walletDeploymentResponse.txHash.startsWith('0x')
            ? 'Deployment tx sent'
            : walletDeploymentResponse.message || '',
          txHash: walletDeploymentResponse.txHash.startsWith('0x')
            ? walletDeploymentResponse.txHash
            : '',
        });
        /* eslint-disable @typescript-eslint/no-explicit-any */
      } catch (error: any) {
        Logger.error(error);
        response.push({
          tokenAddress: '',
          amount: amountToTransfer._hex,
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
        tokenAddress: GAS_TOKEN_ADDRESSES[this.chainId as ChainId],
        amount: amountToTransfer._hex,
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
    return fetchBalances(
      this.apiKey,
      this.chainId,
      eoaAddress,
      fetchBalancesOnly,
      tokenAddresses,
    );
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
          (token) => token === GAS_TOKEN_ADDRESSES[this.chainId as ChainId],
        );
        if (!isExist) {
          tokenAddresses.push(GAS_TOKEN_ADDRESSES[this.chainId as ChainId]);
        }
      }

      const balancesList = await fetchBalances(
        this.apiKey,
        this.chainId,
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
            message: `Insufficient balance`,
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
            amount: tx.amount._hex,
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
              amount: tx.amount._hex,
              tokenId: tx.tokenId,
              message: 'Nft transfer tx sent',
              txHash: typeof txHash === 'string' ? txHash : '',
            });
            /* eslint-disable @typescript-eslint/no-explicit-any */
          } catch (error: any) {
            logError(tx, error);
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount._hex,
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
              amount: BigNumber.from(tx.amount),
            });
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: BigNumber.from(tx.amount)._hex,
              message: 'Token transfer tx sent',
              txHash: typeof txHash === 'string' ? txHash : '',
            });
          } catch (error: any) {
            logError(tx, error);
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount._hex,
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
              amount: tx.amount._hex,
              message: 'Native transfer tx sent',
              txHash: typeof txHash === 'string' ? txHash : '',
            });
          } catch (error: any) {
            logError(tx, error);
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount._hex,
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
      const { senderSigner, receiverAddress } = executeMigrationGaslessDto;
      let { transferTokenDetails } = executeMigrationGaslessDto;
      const owner = await senderSigner.getAddress();

      if (transferTokenDetails)
        transferTokenDetails = transferTokenDetails.map(
          (token: TransferTokenDetails) => {
            return {
              ...token,
              tokenAddress: token.tokenAddress.toLowerCase(),
            };
          },
        );

      const tokenAddresses = transferTokenDetails?.map(
        (token) => token.tokenAddress,
      );

      if (tokenAddresses && tokenAddresses.length > 0) {
        const isExist = tokenAddresses.find(
          (token) => token === GAS_TOKEN_ADDRESSES[this.chainId as ChainId],
        );
        if (!isExist) {
          tokenAddresses.push(GAS_TOKEN_ADDRESSES[this.chainId as ChainId]);
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
            message: `Insufficient balance`,
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
      const relayTxList: RelayedTxListDto[] = [];
      const permitResponse = permittedTokens.map(async (token) => {
        const permitDto: PermitDto = {
          signer: senderSigner,
          chainId: this.chainId,
          eoaAddress: owner,
          tokenAddress: token.token_address,
        };
        try {
          const resultSet = await this.permitHelper.performPermit(permitDto);
          permit2TransferableTokens.push(token);
          relayTxList.push({
            tokenInfo: [
              {
                tokenAddress: token.token_address,
                amount: ethers.constants.MaxInt256,
              },
            ],
            type: PERMIT_TX_TYPES.PERMIT,
            txData: resultSet,
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
            amount: token.balance._hex,
            message: 'Permit token failed',
            txHash: '',
          });
        }
      });

      await Promise.all(permitResponse);

      if (permit2TransferableTokens.length === 1) {
        let permitTransferFrom, signature;
        try {
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
          const permitData =
            await this.permitHelper.getSingleTransferPermitData(
              singleTransferPermitDto,
            );

          permitTransferFrom = permitData.permitTransferFrom;
          signature = permitData.signature;

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
            requestData: {
              chainId: BigInt(this.chainId),
              target: PERMIT2_CONTRACT_ADDRESS,
              data,
            },
          };
          relayTxList.push({
            tokenInfo: [
              {
                tokenAddress: permitTransferFrom.permitted.token,
                amount: permitTransferFrom.permitted.amount,
              },
            ],
            type: PERMIT_TX_TYPES.PERMIT2_SINGLE,
            txData: relayTrxDto.requestData,
          });
        } catch (error: any) {
          if (permitTransferFrom) {
            logError(
              {
                tokenAddress: permitTransferFrom.permitted.token,
                amount: permitTransferFrom.permitted.amount,
              },
              error,
            );
          }
        }
      } else if (permit2TransferableTokens.length > 1) {
        let permitBatchTransferFrom, signature;
        try {
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

          permitBatchTransferFrom = permitData.permitBatchTransferFrom;
          signature = permitData.signature;

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
            requestData: {
              chainId: BigInt(this.chainId),
              target: PERMIT2_CONTRACT_ADDRESS,
              data,
            },
          };

          const tokenInfo: RelayTokenInfo[] = [];

          permitBatchTransferFrom.permitted.map((token) => {
            tokenInfo.push({
              tokenAddress: token.token,
              amount: token.amount,
            });
          });

          relayTxList.push({
            tokenInfo,
            type: PERMIT_TX_TYPES.PERMIT2_BATCH,
            txData: relayTrxDto.requestData,
          });
        } catch (error: any) {
          Logger.log('error ', error);
          permitBatchTransferFrom?.permitted.map((token) => {
            logError(
              {
                tokenAddress: token.token,
                amount: BigNumber.from(token.amount)._hex,
              },
              error,
            );
            response.push({
              tokenAddress: token.token,
              amount: BigNumber.from(token.amount)._hex,
              message: 'Transaction Failed',
              txHash: '',
            });
          });
        }
      }

      try {
        const txResponse = await makeGaslessCall(
          this.chainId,
          relayTxList,
          this.apiKey,
        );

        for (const relayResponse of txResponse) {
          const { type, tokenInfo, status, taskId } = relayResponse;
          if (type === PERMIT_TX_TYPES.PERMIT2_BATCH) {
            for (let index = 0; index < tokenInfo.length; index++) {
              const token_address = tokenInfo[index].tokenAddress;
              const amount = BigNumber.from(tokenInfo[index].amount)._hex;
              response.push({
                taskId,
                tokenAddress: token_address,
                amount: amount,
                message:
                  typeof status === 'string' ? status : 'Transaction Failed',
                txHash: '',
              });
            }
          }
          if (type === PERMIT_TX_TYPES.PERMIT) {
            response.push({
              taskId,
              tokenAddress: tokenInfo[0].tokenAddress,
              amount: BigNumber.from(tokenInfo[0].amount)._hex,
              message:
                typeof status === 'string' ? status : 'Transaction Failed',
              txHash: '',
            });
          }

          if (type === PERMIT_TX_TYPES.PERMIT2_SINGLE) {
            response.push({
              taskId,
              tokenAddress: tokenInfo[0].tokenAddress,
              amount: BigNumber.from(tokenInfo[0].amount)._hex,
              message:
                typeof status === 'string' ? status : 'Transaction Failed',
              txHash: '',
            });
          }
        }
      } catch (error: any) {
        Logger.error('error communicating to gasless endpoint');
        Logger.error(error);
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
            amount: tx.amount._hex,
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
              amount: tx.amount._hex,
              tokenId: tx.tokenId,
              message: 'Nft transfer tx sent',
              txHash: typeof txHash === 'string' ? txHash : '',
            });
          } catch (error: any) {
            logError(tx, error);
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount._hex,
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
              amount: tx.amount._hex,
              message: 'Token transfer tx sent',
              txHash: typeof txHash === 'string' ? txHash : '',
            });
          } catch (error: any) {
            logError(tx, error);
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount._hex,
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
              amount: tx.amount._hex,
              message: 'Native transfer tx sent',
              txHash: typeof txHash === 'string' ? txHash : '',
            });
          } catch (error: any) {
            logError(tx, error);
            response.push({
              tokenAddress: tx.tokenAddress,
              amount: tx.amount._hex,
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

  async executeForwardTransaction(
    executeMigrationForwardDto: ExecuteMigrationForwardDto,
  ): Promise<MigrationResponse[]> {
    const response: MigrationResponse[] = [];

    try {
      const { senderSigner, receiverAddress } = executeMigrationForwardDto;
      let { transferTokenDetails } = executeMigrationForwardDto;

      // Convert tokenAddress to lowercase for all tokens in transferTokenDetails
      transferTokenDetails = transferTokenDetails.map(
        (token: TransferTokenDetails) => {
          return {
            ...token,
            tokenAddress: token.tokenAddress.toLowerCase(),
          };
        },
      );

      const owner = await senderSigner.getAddress();
      const tokenAddresses = transferTokenDetails.map(
        (token) => token.tokenAddress,
      );

      if (tokenAddresses && tokenAddresses.length > 0) {
        const isExist = tokenAddresses.find(
          (token) => token === GAS_TOKEN_ADDRESSES[this.chainId as ChainId],
        );
        if (!isExist) {
          tokenAddresses.push(GAS_TOKEN_ADDRESSES[this.chainId as ChainId]);
        }
      }

      if (
        this.chainId === ChainId.MAINNET ||
        this.chainId === ChainId.POLYGON_MAINNET ||
        this.chainId === ChainId.ARBITRUM ||
        this.chainId === ChainId.BASE
      ) {
        const supportedTokens =
          SUPPORTED_STABLE_TOKENS[this.chainId as ChainId];

        if (!supportedTokens) {
          throw new Error('Migration is not supported on supplied chain id');
        }

        if (tokenAddresses && tokenAddresses.length > 0) {
          const filteredTokens = transferTokenDetails.filter((token) => {
            const supportedTokensForChain =
              SUPPORTED_STABLE_TOKENS[this.chainId as ChainId];
            let isSupported = false;
            if (
              supportedTokensForChain &&
              Object.values(supportedTokensForChain).includes(
                token.tokenAddress,
              )
            ) {
              isSupported = true;
            }
            if (!isSupported) {
              response.push({
                tokenAddress: token.tokenAddress,
                message: `Forward migration is not supported for ${token.tokenAddress} on the chain ID ${this.chainId}`,
              });
              return false; // Remove the token from the filtered array
            }
            return true; // Keep the token in the filtered array
          });
          transferTokenDetails = filteredTokens;
        }
      }

      const balancesList = await fetchBalances(
        this.apiKey,
        this.chainId,
        owner,
        false,
        tokenAddresses,
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
            message: `Insufficient balance`,
          });
        }
        tandA.tokenAddress = tandA.tokenAddress.toLowerCase();

        if (
          matchingToken &&
          !matchingToken.permitExist &&
          BigNumber.from(matchingToken.permit2Allowance).eq(BigNumber.from(0))
        ) {
          response.push({
            tokenAddress: tandA.tokenAddress.toLowerCase(),
            message: `Forward migration is not supported for ${tandA.tokenAddress.toLowerCase()} on the chain ID ${
              this.chainId
            }`,
          });
        }
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

      const erc20Tokens = tokens.filter(
        (token) =>
          (token.type === COVALENT_TOKEN_TYPES.STABLE_COIN ||
            token.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY) &&
          token.native_token === false,
      );
      Logger.log('erc20Tokens ', erc20Tokens);

      const feeData = await fetchGasPrice(this.chainId);
      const gasPrice = BigNumber.from(feeData.data.gasPrice);
      // const gasPrice = BigNumber.from(30).mul(GEWI_UNITS)
      const nativePriceInUsd = (await fetchNativeToUsdPrice(this.chainId)).data
        .price;

      if (!gasPrice) throw new Error('Unable to fetch gas price');

      if (!nativePriceInUsd)
        throw new Error('Unable to fetch nativePriceInUsd');

      // filter out tokens that have already given allowance
      const permit2TransferableTokens: TokenData[] = erc20Tokens.filter(
        (balanceObj) =>
          BigNumber.from(balanceObj.permit2Allowance).gt(BigNumber.from(0)) ||
          BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(-1)),
      );

      const txIndexes: number[] = [];

      processPermit2TransferableTokens(
        response,
        permit2TransferableTokens,
        gasPrice,
        nativePriceInUsd,
        txIndexes,
      );

      // Filtering out tokens to do permit transaction
      const permittedTokens = erc20Tokens.filter(
        (balanceObj) =>
          balanceObj.permitExist &&
          BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(0)),
      );
      Logger.log('permittedTokens ', permittedTokens);
      const relayTxList: RelayedTxListDto[] = [];
      const permitResponse = permittedTokens.map(async (token) => {
        const permitDto: PermitDto = {
          signer: senderSigner,
          chainId: this.chainId,
          eoaAddress: owner,
          tokenAddress: token.token_address,
        };
        try {
          const resultSet = await this.permitHelper.performPermit(permitDto);
          permit2TransferableTokens.push(token);

          processGasFeeAndTokens(
            response,
            permit2TransferableTokens.length - 1,
            gasPrice,
            nativePriceInUsd,
            permit2TransferableTokens,
            txIndexes,
            true,
          );

          relayTxList.push({
            tokenInfo: [
              {
                tokenAddress: token.token_address,
                amount: ethers.constants.MaxInt256,
              },
            ],
            type: PERMIT_TX_TYPES.PERMIT,
            txData: resultSet,
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
            amount: token.balance._hex,
            message: 'Permit token failed',
            txHash: '',
          });
        }
      });

      await Promise.all(permitResponse);

      if (permit2TransferableTokens.length === 1) {
        let permitTransferFrom, signature;
        try {
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
          const permitData =
            await this.permitHelper.getSingleTransferPermitData(
              singleTransferPermitDto,
            );

          permitTransferFrom = permitData.permitTransferFrom;
          signature = permitData.signature;

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
            requestData: {
              chainId: BigInt(this.chainId),
              target: PERMIT2_CONTRACT_ADDRESS,
              data,
            },
          };
          relayTxList.push({
            tokenInfo: [
              {
                tokenAddress: permitTransferFrom.permitted.token,
                amount: permitTransferFrom.permitted.amount,
              },
            ],
            type: PERMIT_TX_TYPES.PERMIT2_SINGLE,
            txData: relayTrxDto.requestData,
          });
        } catch (error: any) {
          if (permitTransferFrom) {
            logError(
              {
                tokenAddress: permitTransferFrom.permitted.token,
                amount: permitTransferFrom.permitted.amount,
              },
              error,
            );
          }
        }
      } else if (permit2TransferableTokens.length > 1) {
        let permitBatchTransferFrom, signature;
        try {
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

          permitBatchTransferFrom = permitData.permitBatchTransferFrom;
          signature = permitData.signature;

          const tokenPermissions = [];

          for (let i = 0; i < permitBatchTransferFrom.permitted.length; i++) {
            const batchInfo = permitBatchTransferFrom.permitted[i];
            tokenPermissions.push({
              to: txIndexes.includes(i) ? TREASURY_ADDRESS : receiverAddress,
              requestedAmount: batchInfo.amount,
            });
          }

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
            requestData: {
              chainId: BigInt(this.chainId),
              target: PERMIT2_CONTRACT_ADDRESS,
              data,
            },
          };

          const tokenInfo: RelayTokenInfo[] = [];

          permitBatchTransferFrom.permitted.map((token) => {
            tokenInfo.push({
              tokenAddress: token.token,
              amount: token.amount,
            });
          });

          relayTxList.push({
            tokenInfo,
            type: PERMIT_TX_TYPES.PERMIT2_BATCH,
            txData: relayTrxDto.requestData,
          });
        } catch (error: any) {
          Logger.log('error ', error);
          permitBatchTransferFrom?.permitted.map((token) => {
            logError(
              {
                tokenAddress: token.token,
                amount: BigNumber.from(token.amount)._hex,
              },
              error,
            );
            response.push({
              tokenAddress: token.token,
              amount: BigNumber.from(token.amount)._hex,
              message: 'Transaction Failed',
              txHash: '',
            });
          });
        }
      }

      try {
        if (relayTxList.length > 0) {
          const txResponse = await makeForwardCall(
            this.chainId,
            relayTxList,
            txIndexes,
            this.apiKey,
          );

          for (const relayResponse of txResponse) {
            const { type, tokenInfo, status, taskId } = relayResponse;
            if (type === PERMIT_TX_TYPES.PERMIT2_BATCH) {
              for (let index = 0; index < tokenInfo.length; index++) {
                const token_address = tokenInfo[index].tokenAddress;
                const amount = BigNumber.from(tokenInfo[index].amount)._hex;
                response.push({
                  taskId,
                  tokenAddress: token_address,
                  amount: amount,
                  message:
                    typeof status === 'string' ? status : 'Transaction Failed',
                  txHash: '',
                });
              }
            }
            if (type === PERMIT_TX_TYPES.PERMIT) {
              response.push({
                taskId,
                tokenAddress: tokenInfo[0].tokenAddress,
                amount: BigNumber.from(tokenInfo[0].amount)._hex,
                message:
                  typeof status === 'string' ? status : 'Transaction Failed',
                txHash: '',
              });
            }

            if (type === PERMIT_TX_TYPES.PERMIT2_SINGLE) {
              response.push({
                taskId,
                tokenAddress: tokenInfo[0].tokenAddress,
                amount: BigNumber.from(tokenInfo[0].amount)._hex,
                message:
                  typeof status === 'string' ? status : 'Transaction Failed',
                txHash: '',
              });
            }
          }
        }
      } catch (error: any) {
        Logger.error('error communicating to gasless endpoint');
        Logger.error(error);
      }
    } catch (error) {
      // Handle any errors that occur during the migration process
      Logger.error('Migration Error:', error);
      throw error;
    }
    Logger.log(JSON.stringify(response));
    return response;
  }

  async getTransactionStatus(taskId: string): Promise<TrxStatusResponse> {
    try {
      // Make the API call using the sendRequest function
      const response: TrxStatusResponse = await sendRequest({
        url: `${TRX_STATUS_ENDPOINT + '/' + taskId}`,
        method: HttpMethod.GET,
      });
      Logger.log('Transaction Status Response:', response);
      return response;
    } catch (error) {
      // Handle any errors that may occur during the API request
      Logger.error('Error getting transaction status:', error);
      throw error;
    }
  }
}

export default AarcSDK;
