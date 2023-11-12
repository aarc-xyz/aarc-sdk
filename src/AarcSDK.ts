import { EthersAdapter } from '@safe-global/protocol-kit';
import { Logger } from './utils/Logger';
import { BigNumber, Contract, ethers, Signer } from 'ethers';
import { sendRequest, HttpMethod } from './utils/HttpRequest'; // Import your HTTP module
import { BALANCES_ENDPOINT, CHAIN_PROVIDERS, PERMIT2_CONTRACT_ADDRESS, GELATO_RELAYER_ADDRESS, COVALENT_TOKEN_TYPES } from './utils/Constants';
import { BatchTransferPermitDto, Config, ExecuteMigrationDto, ExecuteMigrationGaslessDto, GelatoTxStatusDto, MigrationResponse, PermitDto, RelayTrxDto, SingleTransferPermitDto, TokenData } from './utils/Types';
import { BalancesResponse } from './utils/Types'
import { ChainId } from './utils/ChainTypes';
import { PERMIT2_BATCH_TRANSFER_ABI } from './utils/abis/Permit2BatchTransfer.abi';
import { PERMIT2_SINGLE_TRANSFER_ABI } from './utils/abis/Permit2SingleTransfer.abi';
import { GelatoRelay } from "@gelatonetwork/relay-sdk";
import Biconomy from './providers/Biconomy';
import Safe from './providers/Safe'
import { PermitHelper } from './helpers/PermitHelper';
import { getGelatoTransactionStatus, relayTransaction } from './helpers/GelatoHelper';
import { logError } from './helpers';

class AarcSDK {
    biconomy: Biconomy;
    safe: Safe;
    chainId!: number;
    owner!: string;
    ethAdapter!: EthersAdapter;
    signer: Signer
    apiKey: string
    relayer: GelatoRelay
    ethersProvider!: ethers.providers.JsonRpcProvider
    permitHelper: PermitHelper

    constructor(config: Config) {
        const { rpcUrl, signer, apiKey } = config
        Logger.log('Aarc SDK initiated');
        // Create an EthersAdapter using the provided signer or provider
        this.ethAdapter = new EthersAdapter({
            ethers,
            signerOrProvider: signer,
        });
        this.biconomy = new Biconomy(signer);
        this.safe = new Safe(signer, this.ethAdapter);
        this.signer = signer;
        this.apiKey = apiKey;
        this.ethersProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
        // instantiating Gelato Relay SDK
        this.relayer = new GelatoRelay();
        this.permitHelper = new PermitHelper(signer)
    }

    async generateBiconomySCW() {
        return await this.biconomy.generateBiconomySCW();
    }

    // Forward the methods from Safe
    getAllSafes() {
        return this.safe.getAllSafes();
    }

    generateSafeSCW() {
        return this.safe.generateSafeSCW();
    }

    async init(): Promise<AarcSDK> {
        try {
            const chainId = await this.signer.getChainId();
            if (Object.values(ChainId).includes(chainId)) {
                this.chainId = chainId;
            } else {
                throw new Error('Invalid chain id');
            }
            this.owner = await this.signer.getAddress();
            this.ethersProvider = new ethers.providers.JsonRpcProvider(CHAIN_PROVIDERS[this.chainId]);
            Logger.log('EOA address', this.owner)
            return this;
        } catch (error) {
            Logger.error('error while initiating sdk');
            throw error;
        }
    }

    /**
     * @description this function will return balances of ERC-20, ERC-721 and native tokens
     * @param balancesDto
     * @returns
     */
    async fetchBalances(tokenAddresses?: string[]): Promise<BalancesResponse> {
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
                    address: this.owner,
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

    async executeMigration(executeMigrationDto: ExecuteMigrationDto) {
        const response: MigrationResponse[] = []
        try {
            Logger.log('executeMigration ');

            const { tokenAndAmount, receiverAddress } = executeMigrationDto;
            const tokenAddresses = tokenAndAmount?.map(token => token.tokenAddress);

            let balancesList = await this.fetchBalances(tokenAddresses);

            tokenAndAmount?.map(tandA => {
                const matchingToken = balancesList.data.find((mToken) => mToken.token_address.toLowerCase() === tandA.tokenAddress.toLowerCase());
                if (!matchingToken) {
                    response.push({
                        tokenAddress: tandA.tokenAddress,
                        amount: tandA?.amount,
                        message: 'Supplied token does not exist'
                    });
                }
            })


            const updatedTokens = [];
            for (const tokenInfo of balancesList.data) {
                const matchingToken = tokenAndAmount?.find((token) => token.tokenAddress.toLowerCase() === tokenInfo.token_address.toLowerCase());

                if (matchingToken && matchingToken.amount !== undefined && matchingToken.amount.gt(0) && BigNumber.from(matchingToken.amount).gt(tokenInfo.balance)) {
                    response.push({
                        tokenAddress: tokenInfo.token_address,
                        amount: matchingToken?.amount,
                        message: 'Supplied amount is greater than balance'
                    });
                }
                else
                    updatedTokens.push(tokenInfo);
            }

            // Now, updatedTokens contains the filtered array without the undesired elements
            balancesList.data = updatedTokens;

            let tokens = balancesList.data.filter(balances => {
                return (
                    balances.type === COVALENT_TOKEN_TYPES.STABLE_COIN ||
                    balances.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY ||
                    balances.type === COVALENT_TOKEN_TYPES.DUST
                );
            });

            Logger.log(' filtered tokens ', tokens)


            tokens = tokens.map((element: TokenData) => {
                const matchingToken = tokenAndAmount?.find((token) => token.tokenAddress.toLowerCase() === element.token_address.toLowerCase());

                if (matchingToken && matchingToken.amount !== undefined && matchingToken.amount.gt(0)) {
                    element.balance = matchingToken.amount
                }

                // Case: tokenAndAmount contains amount for token but it's greater than the given allowance
                // Then we assign the allowance amount 0 to perform normal token transfer
                if (element.type === COVALENT_TOKEN_TYPES.STABLE_COIN && COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY && element.permit2Allowance.gte(BigNumber.from(0)) && element.balance.gt(element.permit2Allowance)) {
                    element.permit2Allowance = BigNumber.from(0);
                }

                return element;
            })

            Logger.log('tokens ', tokens)


            let nfts = balancesList.data.filter(balances => {
                return (
                    balances.type === COVALENT_TOKEN_TYPES.NFT
                );
            });

            Logger.log('nfts ', nfts)

            for (const collection of nfts) {
                if (collection.nft_data) {
                    for (const nft of collection.nft_data) {
                        try {
                            const txHash = await this.permitHelper.performNFTTransfer(receiverAddress, collection.token_address, nft.tokenId);
                            response.push({
                                tokenAddress: collection.token_address,
                                amount: 1,
                                tokenId: nft.tokenId,
                                message: 'Nft transfer successful',
                                txHash: typeof (txHash) === 'string' ? txHash : ''
                            })
                        } catch (error: any) {
                            logError(collection, error)
                            response.push({
                                tokenAddress: collection.token_address,
                                amount: 1,
                                message: 'Nft transfer failed',
                                txHash: ''
                            })
                        }
                    }
                }
            }

            const erc20Tokens = tokens.filter(
                token =>
                (token.type === COVALENT_TOKEN_TYPES.STABLE_COIN || token.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY
                ));
            Logger.log('erc20Tokens ', erc20Tokens)

            const erc20TransferableTokens = erc20Tokens.filter(balanceObj => BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(0)));
            const permit2TransferableTokens = erc20Tokens.filter(balanceObj => BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(-1)) || BigNumber.from(balanceObj.permit2Allowance).gt(BigNumber.from(0)));

            const nativeToken = tokens.filter((token) =>
                token.type === COVALENT_TOKEN_TYPES.DUST)

            Logger.log(' erc20TransferableTokens ', erc20TransferableTokens)
            Logger.log(' permit2TransferableTokens ', permit2TransferableTokens)
            Logger.log(' nativeToken ', nativeToken)


            if (nativeToken.length > 0) {
                try {
                    const txHash = await this.permitHelper.performNativeTransfer(receiverAddress, nativeToken[0].balance)

                    response.push({
                        tokenAddress: nativeToken[0].token_address,
                        amount: nativeToken[0].balance,
                        message: 'Native transfer successful',
                        txHash: typeof (txHash) === 'string' ? txHash : ''
                    })
                    // await delay(5000)
                } catch (error: any) {
                    logError(nativeToken[0], error)
                    response.push({
                        tokenAddress: nativeToken[0].token_address,
                        amount: nativeToken[0].balance,
                        message: 'Native transfer failed',
                        txHash: ''
                    })
                }
            }
            // Loop through tokens to perform normal transfers
            for (const token of erc20TransferableTokens) {
                try {
                    const txHash = await this.permitHelper.performTokenTransfer(receiverAddress, token.token_address, token.balance);
                    response.push({
                        tokenAddress: token.token_address,
                        amount: token.balance,
                        message: 'Token transfer successful',
                        txHash: typeof (txHash) === 'string' ? txHash : ''
                    })
                } catch (error: any) {
                    logError(token, error)
                    response.push({
                        tokenAddress: token.token_address,
                        amount: token.balance,
                        message: 'Token transfer failed',
                        txHash: ''
                    })
                }
            }

            const permit2Contract = new Contract(PERMIT2_CONTRACT_ADDRESS, PERMIT2_BATCH_TRANSFER_ABI, this.signer);

            if (permit2TransferableTokens.length === 1) {
                const token = permit2TransferableTokens[0];
                try {
                    const txHash = await this.permitHelper.performTokenTransfer(receiverAddress, token.token_address, token.balance);
                    response.push({
                        tokenAddress: token.token_address,
                        amount: token.balance,
                        message: 'Token transfer successful',
                        txHash: typeof (txHash) === 'string' ? txHash : ''
                    })
                } catch (error: any) {
                    logError(token, error)
                    response.push({
                        tokenAddress: token.token_address,
                        amount: token.balance,
                        message: 'Token transfer failed',
                        txHash: ''
                    })
                }
            }

            if (permit2TransferableTokens.length > 1) {
                const batchTransferPermitDto: BatchTransferPermitDto = {
                    provider: this.ethersProvider,
                    chainId: this.chainId,
                    spenderAddress: this.owner,
                    tokenData: permit2TransferableTokens
                }
                const permitData = await this.permitHelper.getBatchTransferPermitData(batchTransferPermitDto);
                const { permitBatchTransferFrom, signature } = permitData

                const tokenPermissions = permitBatchTransferFrom.permitted.map(batchInfo => ({
                    to: receiverAddress,
                    requestedAmount: batchInfo.amount
                }));

                try {
                    const txInfo = await permit2Contract.permitTransferFrom(permitData.permitBatchTransferFrom, tokenPermissions, this.owner, signature);
                    permitBatchTransferFrom.permitted.map(token => {
                        response.push({
                            tokenAddress: token.token,
                            amount: token.amount,
                            message: 'Token transfer successful',
                            txHash: txInfo.hash
                        })
                    })
                } catch (error: any) {
                    permitBatchTransferFrom.permitted.map(token => {
                        logError({
                            token_address: token.token,
                            balance: token.amount,
                           }, error)
                        response.push({
                            tokenAddress: token.token,
                            amount: token.amount,
                            message: 'Token transfer Failed',
                            txHash: ''
                        })
                    })
                }
            }
        } catch (error) {
            // Handle any errors that occur during the migration process
            Logger.error('Migration Error:', error);
            throw error
        }
        Logger.log(JSON.stringify(response))
        return response
    }

    async executeMigrationGasless(executeMigrationGaslessDto: ExecuteMigrationGaslessDto) {
        const response: MigrationResponse[] = []
        try {
            const { tokenAndAmount, receiverAddress, gelatoApiKey } = executeMigrationGaslessDto;
            const tokenAddresses = tokenAndAmount?.map(token => token.tokenAddress);

            const balancesList = await this.fetchBalances(tokenAddresses);

            tokenAndAmount?.map(tandA => {
                const matchingToken = balancesList.data.find((mToken) => mToken.token_address.toLowerCase() === tandA.tokenAddress.toLowerCase());
                if (!matchingToken) {
                    response.push({
                        tokenAddress: tandA.tokenAddress,
                        amount: tandA?.amount,
                        message: 'Supplied token does not exist'
                    });
                }
            })


            const updatedTokens = [];
            for (const tokenInfo of balancesList.data) {
                const matchingToken = tokenAndAmount?.find((token) => token.tokenAddress.toLowerCase() === tokenInfo.token_address.toLowerCase());

                if (matchingToken && matchingToken.amount !== undefined && matchingToken.amount.gt(0) && BigNumber.from(matchingToken.amount).gt(tokenInfo.balance)) {
                    response.push({
                        tokenAddress: tokenInfo.token_address,
                        amount: matchingToken?.amount,
                        message: 'Supplied amount is greater than balance'
                    });
                }
                else
                    updatedTokens.push(tokenInfo);
            }

            // Now, updatedTokens contains the filtered array without the undesired elements
            balancesList.data = updatedTokens;

            let tokens = balancesList.data.filter(balances => {
                return (
                    balances.type === COVALENT_TOKEN_TYPES.STABLE_COIN ||
                    balances.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY ||
                    balances.type === COVALENT_TOKEN_TYPES.DUST
                );
            });

            Logger.log(' filtered tokens ', tokens)


            tokens = tokens.map((element: TokenData) => {
                const matchingToken = tokenAndAmount?.find((token) => token.tokenAddress.toLowerCase() === element.token_address.toLowerCase());

                if (matchingToken && matchingToken.amount !== undefined && matchingToken.amount.gt(0)) {
                    element.balance = matchingToken.amount
                }

                // Case: tokenAndAmount contains amount for token but it's greater than the given allowance
                // Then we assign the allowance amount 0 to perform normal token transfer
                if (element.type === COVALENT_TOKEN_TYPES.STABLE_COIN && COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY && element.permit2Allowance.gte(BigNumber.from(0)) && element.balance.gt(element.permit2Allowance)) {
                    element.permit2Allowance = BigNumber.from(0);
                }

                return element;
            })

            Logger.log('tokens ', tokens)

            const erc20Tokens = tokens.filter(
                token =>
                (token.type === COVALENT_TOKEN_TYPES.STABLE_COIN || token.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY
                ));
            Logger.log('erc20Tokens ', erc20Tokens)

            const nativeToken = tokens.filter(token => (token.type === COVALENT_TOKEN_TYPES.DUST));

            if (nativeToken.length > 0) {
                try {
                    const txHash = await this.permitHelper.performNativeTransfer(receiverAddress, nativeToken[0].balance)

                    response.push({
                        tokenAddress: nativeToken[0].token_address,
                        amount: nativeToken[0].balance,
                        message: 'Native transfer successful',
                        txHash: typeof (txHash) === 'string' ? txHash : ''
                    })
                } catch (error: any) {
                    logError(nativeToken[0], error)
                    response.push({
                        tokenAddress: nativeToken[0].token_address,
                        amount: nativeToken[0].balance,
                        message: 'Native transfer failed',
                        txHash: ''
                    })
                }
            }

            const erc20TransferableTokens = erc20Tokens.filter(balanceObj => !balanceObj.permitExist && balanceObj.permit2Allowance.eq(BigNumber.from(0)));

            Logger.log('erc20TransferableTokens ', erc20TransferableTokens)
            // Loop through tokens to perform normal transfers

            for (const token of erc20TransferableTokens) {
                const tokenAddress = token.token_address;
                try {
                    const txHash = await this.permitHelper.performTokenTransfer(receiverAddress, tokenAddress, token.balance);
                    response.push({
                        tokenAddress: token.token_address,
                        amount: token.balance,
                        message: 'Token transfer successful',
                        txHash: typeof (txHash) === 'string' ? txHash : ''
                    })
                } catch (error: any) {
                    logError(token, error)
                    response.push({
                        tokenAddress: token.token_address,
                        amount: token.balance,
                        message: 'Token transfer failed',
                        txHash: ''
                    })
                }
            }

            // Filtering out tokens to do permit transaction
            const permittedTokens = erc20Tokens.filter(balanceObj => balanceObj.permitExist && BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(0)));
            Logger.log('permittedTokens ', permittedTokens)
            permittedTokens.map(async token => {
                const permitDto: PermitDto = {
                    chainId: this.chainId,
                    eoaAddress: this.owner,
                    tokenAddress: token.token_address
                }
                try {
                    const resultSet = await this.permitHelper.performPermit(permitDto)
                    const relayTrxDto: RelayTrxDto = {
                        relayer: this.relayer,
                        requestData: resultSet,
                        gelatoApiKey
                    }
                    const taskId = await relayTransaction(relayTrxDto)
                    const gelatoTxStatusDto: GelatoTxStatusDto = {
                        relayer: this.relayer,
                        taskId
                    }
                    const txStatus = await getGelatoTransactionStatus(gelatoTxStatusDto);
                    if (txStatus) {
                        permit2TransferableTokens.push(token);
                    }
                    response.push({
                        tokenAddress: token.token_address,
                        amount: token.balance,
                        message: typeof (txStatus) === 'string' ? 'Token Permit Successful' : 'Token Permit Failed',
                        txHash: typeof (txStatus) === 'string' ? txStatus : ''
                    })
                } catch (error: any) {
                    logError(token, error)
                    response.push({
                        tokenAddress: token.token_address,
                        amount: token.balance,
                        message: 'Permit token failed',
                        txHash: ''
                    })
                }
            })

            // filter out tokens that have already given allowance
            const permit2TransferableTokens = erc20Tokens.filter(balanceObj => BigNumber.from(balanceObj.permit2Allowance).gt(BigNumber.from(0)) || BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(-1)));

            // Merge permittedTokens and permit2TransferableTokens
            const batchPermitTransaction = permittedTokens.concat(permit2TransferableTokens);


            if (batchPermitTransaction.length === 1) {
                const singleTransferPermitDto: SingleTransferPermitDto = {
                    provider: this.ethersProvider,
                    chainId: this.chainId,
                    spenderAddress: GELATO_RELAYER_ADDRESS,
                    tokenData: batchPermitTransaction[0]
                }
                const permit2SingleContract = new Contract(PERMIT2_CONTRACT_ADDRESS, PERMIT2_SINGLE_TRANSFER_ABI, this.signer);
                const permitData = await this.permitHelper.getSingleTransferPermitData(singleTransferPermitDto);
                const { permitTransferFrom, signature } = permitData

                const { data } = await permit2SingleContract.populateTransaction.permitTransferFrom(permitTransferFrom, { to: receiverAddress, requestedAmount: permitTransferFrom.permitted.amount }, this.owner, signature);
                if (!data) {
                    throw new Error('unable to get data')
                }
                const relayTrxDto: RelayTrxDto = {
                    relayer: this.relayer,
                    requestData: {
                        chainId: BigInt(this.chainId),
                        target: PERMIT2_CONTRACT_ADDRESS,
                        data
                    },
                    gelatoApiKey
                }
               try {
                const taskId = await relayTransaction(relayTrxDto)
                const txStatus = await getGelatoTransactionStatus({
                    relayer: this.relayer,
                    taskId
                });
                response.push({
                    tokenAddress: permitTransferFrom.permitted.token,
                    amount: permitTransferFrom.permitted.amount,
                    message: typeof (txStatus) === 'string' ? 'Transactions Successful' : 'Transactions Failed',
                    txHash: typeof (txStatus) === 'string' ? txStatus : ''
                })
               } catch (error: any) {
                   logError({
                    token_address: permitTransferFrom.permitted.token,
                    balance: permitTransferFrom.permitted.amount,
                   }, error)
               }
            } else if (batchPermitTransaction.length > 1) {
                const permit2BatchContract = new Contract(PERMIT2_CONTRACT_ADDRESS, PERMIT2_BATCH_TRANSFER_ABI, this.signer);

                const batchTransferPermitDto: BatchTransferPermitDto = {
                    provider: this.ethersProvider,
                    chainId: this.chainId,
                    spenderAddress: GELATO_RELAYER_ADDRESS,
                    tokenData: batchPermitTransaction
                }
                const permitData = await this.permitHelper.getBatchTransferPermitData(batchTransferPermitDto);

                const { permitBatchTransferFrom, signature } = permitData

                const tokenPermissions = permitBatchTransferFrom.permitted.map(batchInfo => ({
                    to: receiverAddress,
                    requestedAmount: batchInfo.amount
                }));

                const { data } = await permit2BatchContract.populateTransaction.permitTransferFrom(permitBatchTransferFrom, tokenPermissions, this.owner, signature);
                if (!data) {
                    throw new Error('unable to get data')
                }

                const relayTrxDto: RelayTrxDto = {
                    relayer: this.relayer,
                    requestData: {
                        chainId: BigInt(this.chainId),
                        target: PERMIT2_CONTRACT_ADDRESS,
                        data
                    },
                    gelatoApiKey
                }
                try {
                    const taskId = await relayTransaction(relayTrxDto)
                    const txStatus = await getGelatoTransactionStatus({
                        relayer: this.relayer,
                        taskId
                    });
                    permitBatchTransferFrom.permitted.map(token => {
                        response.push({
                            tokenAddress: token.token,
                            amount: token.amount,
                            message: typeof (txStatus) === 'string' ? 'Transaction Successful' : 'Transaction Failed',
                            txHash: typeof (txStatus) === 'string' ? txStatus : ''
                        })
                    })
                } catch (error: any) {
                    permitBatchTransferFrom.permitted.map(token => {
                        logError({
                            token_address: token.token,
                            balance: token.amount,
                           }, error)
                        response.push({
                            tokenAddress: token.token,
                            amount: token.amount,
                            message: 'Transaction Failed',
                            txHash: ''
                        })
                    })
                }
            }

        } catch (error) {
            // Handle any errors that occur during the migration process
            Logger.error('Migration Error:', error);
            throw error
        }
        Logger.log(JSON.stringify(response))
        return response
    }
}

export default AarcSDK;
