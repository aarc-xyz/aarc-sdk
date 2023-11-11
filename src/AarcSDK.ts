import { EthersAdapter } from '@safe-global/protocol-kit';
import { Logger } from './utils/Logger';
import { BigNumber, Contract, ethers, Signer } from 'ethers';
import { sendRequest, HttpMethod } from './utils/HttpRequest'; // Import your HTTP module
import { BALANCES_ENDPOINT, CHAIN_PROVIDERS, PERMIT2_CONTRACT_ADDRESS, PERMIT2_DOMAIN_NAME, PERMIT_FUNCTION_ABI, SAFE_TX_SERVICE_URLS, PERMIT_FUNCTION_TYPES, GELATO_RELAYER_ADDRESS, COVALENT_TOKEN_TYPES } from './utils/Constants';
import { BatchTransferPermitDto, Config, ExecuteMigrationDto, ExecuteMigrationGaslessDto, GelatoTxStatusDto, PermitDto, RelayTrxDto, SingleTransferPermitDto, TokenData } from './utils/Types';
import { BalancesResponse } from './utils/Types'
import { ChainId } from './utils/ChainTypes';
import { PERMIT2_BATCH_TRANSFER_ABI } from './utils/abis/Permit2BatchTransfer.abi';
import { PERMIT2_SINGLE_TRANSFER_ABI } from './utils/abis/Permit2SingleTransfer.abi';
import { GelatoRelay } from "@gelatonetwork/relay-sdk";
import Biconomy from './providers/Biconomy';
import Safe from './providers/Safe'
import { PermitHelper } from './helpers/PermitHelper';
import { getGelatoTransactionStatus, relayTransaction } from './helpers/GelatoHelper';

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
        const { signer, apiKey } = config
        Logger.log('SDK initiated');

        // Create an EthersAdapter using the provided signer or provider
        this.ethAdapter = new EthersAdapter({
            ethers,
            signerOrProvider: signer,
        });
        this.biconomy = new Biconomy(signer);
        this.safe = new Safe(signer, this.ethAdapter);
        this.signer = signer;
        this.apiKey = apiKey;
        // instantiating Gelato Relay SDK
        this.relayer = new GelatoRelay();
        this.permitHelper = new PermitHelper(signer)
    }


    // Forward the methods from Biconomy
    getAllBiconomySCWs() {
        return this.biconomy.getAllBiconomySCWs();
    }

    generateBiconomySCW() {
        return this.biconomy.generateBiconomySCW();
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

            // // Check if response.data is an array with at least one element
            // if (response && response.data && response.data.length > 0) {
            //     // Create a new array with updated values using map
            //     const updatedData = response.data.map(balances => ({
            //         ...balances,
            //         balance: BigNumber.from(balances.balance), // No need for BigNumber.from() if balance is already a BigNumber
            //         permit2Allowance: balances.permit2Allowance !== "-1" ? BigNumber.from(balances.permit2Allowance) : '-1',
            //     }));

            //     // Assign the new array back to response.data
            //     response.data = updatedData;
            // }
            // Handle the response here, logging the result
            Logger.log('Fetching API Response:', response);
            return response;
        } catch (error) {
            // Handle any errors that may occur during the API request
            Logger.error('Error making Covalent API call:', error);
            throw error;
        }
    }

    async executeMigration(executeMigrationDto: ExecuteMigrationDto) {
        try {
            Logger.log('executeMigration ');

            const { tokenAndAmount, scwAddress } = executeMigrationDto;
            const tokenAddresses = tokenAndAmount?.map(token => token.tokenAddress);

            let balancesList = await this.fetchBalances(tokenAddresses);
            Logger.log('balancesList ', balancesList)

            let tokens = balancesList.data.filter(balances => {
                return (
                    balances.type === COVALENT_TOKEN_TYPES.STABLE_COIN ||
                    balances.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY ||
                    balances.type === COVALENT_TOKEN_TYPES.DUST
                );
            });

            Logger.log('tokens ', tokens)


            tokens = tokens.map((element) => {
                const matchingToken = tokenAndAmount?.find((token) => token.tokenAddress.toLowerCase() === element.token_address.toLowerCase());


                // Case: tokenAndAmount contains amount for token, update balance to tokenAndAmount amount
                if (matchingToken && matchingToken.amount.gt(0) && element.balance.gte(matchingToken.amount)) {
                    element.balance = matchingToken.amount;
                }

                // Case: tokenAndAmount contains amount for token but it's greater than the given allowance
                // Then we assign the allowance amount 0 to perform normal token transfer
                if (element.type === COVALENT_TOKEN_TYPES.STABLE_COIN && COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY && element.permit2Allowance.gte(BigNumber.from(0)) && element.balance.gt(element.permit2Allowance)) {
                    element.permit2Allowance = BigNumber.from(0);
                }

                return element;
            })

            Logger.log('balances ', tokens)

            const erc20Tokens = tokens.filter(
                token =>
                (token.type === COVALENT_TOKEN_TYPES.STABLE_COIN || token.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY
                ));
            Logger.log('erc20Tokens ', erc20Tokens)

            const erc20TransferableTokens = erc20Tokens.filter(balanceObj => BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(0)));
            const permit2TransferableTokens = erc20Tokens.filter(balanceObj => BigNumber.from(balanceObj.permit2Allowance).eq(BigNumber.from(-1)) || BigNumber.from(balanceObj.permit2Allowance).gt(BigNumber.from(0)));

            const nativeToken = tokens.filter((token) =>
                token.type === COVALENT_TOKEN_TYPES.DUST)

            // if ( nativeToken.length > 0){
            //     this.permitHelper.performNativeTransfer(scwAddress, nativeToken[0].balance)
            // }

            Logger.log(' erc20TransferableTokens ', erc20TransferableTokens)
            Logger.log(' permit2TransferableTokens ', permit2TransferableTokens)
            Logger.log(' nativeToken ', nativeToken)

            // Loop through tokens to perform normal transfers
            for (const token of erc20TransferableTokens) {
                try {
                    await this.permitHelper.performTokenTransfer(scwAddress, token.token_address, token.balance);
                } catch (error) {
                    Logger.error('error transferring token ', token.token_address)
                }
            }

            const permit2Contract = new Contract(PERMIT2_CONTRACT_ADDRESS, PERMIT2_BATCH_TRANSFER_ABI, this.signer);

            if (permit2TransferableTokens.length === 1) {
                const token = permit2TransferableTokens[0];
                await this.permitHelper.performTokenTransfer(scwAddress, token.token_address, token.balance);
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
                    to: scwAddress,
                    requestedAmount: batchInfo.amount
                }));

                const txInfo = await permit2Contract.permitTransferFrom(permitData.permitBatchTransferFrom, tokenPermissions, this.owner, signature);
                console.log('txInfo ', txInfo);
            }
        } catch (error) {
            // Handle any errors that occur during the migration process
            Logger.error('Migration Error:', error);
            throw error
        }
    }

    async executeMigrationGasless(executeMigrationGaslessDto: ExecuteMigrationGaslessDto) {
        try {
            const { tokenAndAmount, scwAddress, gelatoApiKey } = executeMigrationGaslessDto;
            const tokenAddresses = tokenAndAmount.map(token => token.tokenAddress);

            const balancesList = await this.fetchBalances(tokenAddresses);

            let tokens = balancesList.data.filter(balances => {
                return (
                    balances.type === COVALENT_TOKEN_TYPES.STABLE_COIN ||
                    balances.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY ||
                    balances.type === COVALENT_TOKEN_TYPES.DUST
                );
            });

            Logger.log('tokens ', tokens)


            tokens = tokens.map((element) => {
                const matchingToken = tokenAndAmount?.find((token) => token.tokenAddress.toLowerCase() === element.token_address.toLowerCase());


                // Case: tokenAndAmount contains amount for token, update balance to tokenAndAmount amount
                if (matchingToken && matchingToken.amount.gt(0) && element.balance.gte(matchingToken.amount)) {
                    element.balance = matchingToken.amount;
                }

                // Case: tokenAndAmount contains amount for token but it's greater than the given allowance
                // Then we assign the allowance amount 0 to perform normal token transfer
                if (element.type === COVALENT_TOKEN_TYPES.STABLE_COIN && COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY && element.permit2Allowance.gte(BigNumber.from(0)) && element.balance.gt(element.permit2Allowance)) {
                    element.permit2Allowance = BigNumber.from(0);
                }

                return element;
            })

            Logger.log('balances ', tokens)

            const erc20Tokens = tokens.filter(
                token =>
                (token.type === COVALENT_TOKEN_TYPES.STABLE_COIN || token.type === COVALENT_TOKEN_TYPES.CRYPTO_CURRENCY
                ));
            Logger.log('erc20Tokens ', erc20Tokens)


            const erc20TransferableTokens = erc20Tokens.filter(balanceObj => !balanceObj.permitExist && balanceObj.permit2Allowance.eq(BigNumber.from(0)));

            // Loop through tokens to perform normal transfers

            for (const token of erc20TransferableTokens) {
                const tokenAddress = token.token_address;
                const t = tokenAndAmount.find(ta => ta.tokenAddress === tokenAddress);
                const transferAmount = t ? t.amount : token.balance;
                await this.permitHelper.performTokenTransfer(scwAddress, tokenAddress, transferAmount);
            }

            // Filtering out tokens to do permit transaction
            const permittedTokens = erc20Tokens.filter(balanceObj => balanceObj.permitExist && balanceObj.permit2Allowance.eq(BigNumber.from(0)));
            permittedTokens.map(async token => {
                const permitDto: PermitDto = {
                    chainId: this.chainId,
                    eoaAddress: this.owner,
                    tokenAddress: token.token_address
                }
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
            })

            // filter out tokens that have already given allowance
            const permit2TransferableTokens = erc20Tokens.filter(balanceObj => balanceObj.permit2Allowance.gt(BigNumber.from(0)) || balanceObj.permit2Allowance.eq(BigNumber.from(-1)));

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

                const { data } = await permit2SingleContract.populateTransaction.permitTransferFrom(permitTransferFrom, { to: scwAddress, requestedAmount: permitTransferFrom.permitted.amount }, this.owner, signature);
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
                const taskId = await relayTransaction(relayTrxDto)
                return getGelatoTransactionStatus({
                    relayer: this.relayer,
                    taskId
                });
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
                    to: scwAddress,
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
                const taskId = await relayTransaction(relayTrxDto)
                return getGelatoTransactionStatus({
                    relayer: this.relayer,
                    taskId
                });
            }

        } catch (error) {
            // Handle any errors that occur during the migration process
            Logger.error('Migration Error:', error);
            throw error
        }
    }
}

export default AarcSDK;