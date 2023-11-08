import { EthersAdapter, SafeFactory } from '@safe-global/protocol-kit';
import { Logger } from './utils/Logger';
import { Contract, ethers, Signer } from 'ethers';
import { sendRequest, HttpMethod } from './utils/HttpRequest'; // Import your HTTP module
import { BALANCES_ENDPOINT, CHAIN_PROVIDERS, PERMIT2_CONTRACT_ADDRESS, PERMIT2_DOMAIN_NAME, PERMIT_FUNCTION_ABI, SAFE_TX_SERVICE_URLS, PERMIT_FUNCTION_TYPES, GELATO_RELAYER_ADDRESS } from './utils/Constants';
import { BatchPermitData, Config, ExecuteMigrationDto, ExecuteMigrationGaslessDto, PermitData, TokenData } from './utils/types';
import { OwnerResponse, BalancesResponse } from './utils/types'
import SafeApiKit from "@safe-global/api-kit";
import { ERC20_ABI } from './utils/abis/ERC20.abi';
import { ChainId } from './utils/ChainTypes';
import { PERMIT_2_ABI } from './utils/abis/Permit2.abi';
import { GelatoRelay, SponsoredCallRequest } from "@gelatonetwork/relay-sdk";
import Biconomy from './Biconomy';
import { PermitHelper } from './PermitHelper';

class AarcSDK extends Biconomy {
    chainId!: number;
    owner!: string;
    saltNonce = 0;
    ethAdapter!: EthersAdapter;
    signer: Signer
    apiKey: string
    relayer: GelatoRelay
    ethersProvider!: ethers.providers.JsonRpcProvider
    permitHelper: PermitHelper

    constructor(config: Config) {
        const { signer, apiKey } = config
        super(signer);
        Logger.log('SDK initiated');

        // Create an EthersAdapter using the provided signer or provider
        this.ethAdapter = new EthersAdapter({
            ethers,
            signerOrProvider: signer,
        });
        this.signer = signer;
        this.apiKey = apiKey;
        // instantiating Gelato Relay SDK
        this.relayer = new GelatoRelay();
        this.permitHelper = new PermitHelper(signer)
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

    async getAllSafes(): Promise<OwnerResponse> {
        try {
            const safeService = new SafeApiKit({
                txServiceUrl: SAFE_TX_SERVICE_URLS[this.chainId],
                ethAdapter: this.ethAdapter,
            });
            const safes = await safeService.getSafesByOwner(this.owner);
            return safes;
        } catch (error) {
            Logger.log('error while getting safes');
            throw error;
        }
    }

    async generateSafeSCW(): Promise<string> {
        // Create a SafeFactory instance using the EthersAdapter
        const safeFactory = await SafeFactory.create({
            ethAdapter: this.ethAdapter,
        });
        const config = {
            owners: [this.owner],
            threshold: 1,
        };
        // Configure the Safe parameters and predict the Safe address
        const smartWalletAddress = await safeFactory.predictSafeAddress(
            config,
            this.saltNonce.toString(),
        );
        return smartWalletAddress;
    }

    /**
     * @description this function will return balances of ERC-20, ERC-721 and native tokens
     * @param balancesDto
     * @returns
     */
    async fetchBalances(tokenAddresses?: string[]): Promise<BalancesResponse> {
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
                    address: this.owner,
                    tokenAddresses: tokenAddresses,
                },
            });

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
            const tokenAddresses = tokenAndAmount.map(token => token.tokenAddress);

            const balancesList = await this.fetchBalances(tokenAddresses);

            const balances: TokenData[] = balancesList.data.map((element) => {
                const matchingToken = tokenAndAmount.find((token) => token.tokenAddress.toLowerCase() === element.token_address.toLowerCase());
                if (matchingToken && Number(matchingToken.amount) > 0) {
                    element.balance = matchingToken.amount;
                }
                return element;
            });

            const erc20TransferableTokens = balances.filter(balanceObj => balanceObj.permit2Allowance === "0");
            const permit2TransferableTokens = balances.filter(balanceObj => balanceObj.permit2Allowance != "0");

            // Loop through tokens to perform normal transfers
            for (const token of erc20TransferableTokens) {
                await this.permitHelper.performTokenTransfer(scwAddress, token.token_address, token.balance);
            }

            const permit2Contract = new Contract(PERMIT2_CONTRACT_ADDRESS, PERMIT_2_ABI, this.signer);

            if (permit2TransferableTokens.length === 1) {
                const token = permit2TransferableTokens[0];
                await this.permitHelper.performTokenTransfer(scwAddress, token.token_address, token.balance);
            }

            if (permit2TransferableTokens.length > 1) {
                const permitData = await this.permitHelper.getBatchTransferPermitData(this.ethersProvider, this.chainId, this.owner, permit2TransferableTokens);
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

            const balances: TokenData[] = balancesList.data.map((element) => {
                const matchingToken = tokenAndAmount.find((token) => token.tokenAddress.toLowerCase() === element.token_address.toLowerCase());
                if (matchingToken && Number(matchingToken.amount) > 0) {
                    element.balance = matchingToken.amount;
                }
                return element;
            });
            Logger.log('balancesList', balances);

            const erc20TransferableTokens = balances.filter(balanceObj => !balanceObj.permit2Exist && balanceObj.permit2Allowance === "0");

            // Loop through tokens to perform normal transfers

            for (const token of erc20TransferableTokens) {
                const tokenAddress = token.token_address;
                const t = tokenAndAmount.find(ta => ta.tokenAddress === tokenAddress);
                const transferAmount = t ? t.amount : token.balance;
                await this.permitHelper.performTokenTransfer(scwAddress, tokenAddress, transferAmount);
            }

            // Filtering out tokens to do permit transaction
            const permittedTokens = balances.filter(balanceObj => balanceObj.permit2Exist && balanceObj.permit2Allowance === "0");
            permittedTokens.map(async token => {
                await this.permitHelper.performPermit(this.chainId, this.owner, token.token_address, gelatoApiKey)
            })

            // filter out tokens that have already given allowance
            const permit2TransferableTokens = balances.filter(balanceObj => balanceObj.permit2Allowance != "0");

            // Merge permittedTokens and permit2TransferableTokens
            const batchPermitTransaction = permittedTokens.concat(permit2TransferableTokens);

            const permit2Contract = new Contract(PERMIT2_CONTRACT_ADDRESS, PERMIT_2_ABI, this.signer);

            if (batchPermitTransaction.length === 1) {
                const permitData = await this.permitHelper.getSingleTransferPermitData(this.ethersProvider, this.chainId, GELATO_RELAYER_ADDRESS, batchPermitTransaction[0]);
                const { permitTransferFrom, signature } = permitData

                const { data } = await permit2Contract.populateTransaction.permitTransferFrom(permitTransferFrom, { to: scwAddress, requestedAmount: permitTransferFrom.permitted.amount }, this.owner, signature);
                if (!data) {
                    throw new Error('unable to get data')
                }
                return this.permitHelper.relayTransaction(this.relayer, {
                    chainId: BigInt(this.chainId),
                    target: PERMIT2_CONTRACT_ADDRESS,
                    data
                }, gelatoApiKey)
            } else if (batchPermitTransaction.length > 1) {
                const permitData = await this.permitHelper.getBatchTransferPermitData(this.ethersProvider, this.chainId, GELATO_RELAYER_ADDRESS, batchPermitTransaction);

                const { permitBatchTransferFrom, signature } = permitData

                const tokenPermissions = permitBatchTransferFrom.permitted.map(batchInfo => ({
                    to: scwAddress,
                    requestedAmount: batchInfo.amount
                }));

                const { data } = await permit2Contract.populateTransaction.permitTransferFrom(permitBatchTransferFrom, tokenPermissions, this.owner, signature);
                if (!data) {
                    throw new Error('unable to get data')
                }
                return this.permitHelper.relayTransaction(this.relayer, {
                    chainId: BigInt(this.chainId),
                    target: PERMIT2_CONTRACT_ADDRESS,
                    data
                }, gelatoApiKey)
            }

        } catch (error) {
            // Handle any errors that occur during the migration process
            Logger.error('Migration Error:', error);
            throw error
        }
    }
}

export default AarcSDK;

