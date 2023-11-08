import { EthersAdapter, SafeFactory } from '@safe-global/protocol-kit';
import { Logger } from './utils/Logger';
import { Contract, ethers, Signer } from 'ethers';
import { sendRequest, HttpMethod } from './utils/HttpRequest'; // Import your HTTP module
import { BALANCES_ENDPOINT, CHAIN_PROVIDERS, PERMIT2_CONTRACT_ADDRESS, PERMIT_FUNCTION_ABI, SAFE_TX_SERVICE_URLS, PERMIT_FUNCTION_TYPES } from './utils/Constants';
import { BatchPermitData, Config, ExecuteMigrationDto, ExecuteMigrationGaslessDto, PermitData, TokenData } from './utils/types';
import { OwnerResponse, BalancesResponse } from './utils/types'
import SafeApiKit from "@safe-global/api-kit";
import { ERC20_ABI } from './utils/abis/ERC20.abi';
import { TokenPermissions, SignatureTransfer, PermitTransferFrom, PermitBatchTransferFrom } from '@uniswap/permit2-sdk'
import { ChainId } from './utils/ChainTypes';
import { PERMIT_2_ABI } from './utils/abis/Permit2.abi';
import { GelatoRelay, SponsoredCallRequest } from "@gelatonetwork/relay-sdk";
import { BaseRelayParams } from '@gelatonetwork/relay-sdk/dist/lib/types';
import Biconomy from './Biconomy';
import { TypedDataDomain, TypedDataSigner } from '@ethersproject/abstract-signer'

class AarcSDK extends Biconomy {
    chainId!: number;
    owner!: string;
    saltNonce = 0;
    ethAdapter!: EthersAdapter;
    signer: Signer
    apiKey: string
    relayer: GelatoRelay
    ethersProvider!: ethers.providers.JsonRpcProvider

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
                const matchingToken = tokenAndAmount.find((token) => token.tokenAddress === element.token_address);
                if (matchingToken && Number(matchingToken.amount) > 0) {
                    element.balance = matchingToken.amount;
                }
                return element;
            });

            const erc20TransferableTokens = balances.filter(balanceObj => balanceObj.permit2Allowance === 0);
            const permit2TransferableTokens = balances.filter(balanceObj => balanceObj.permit2Allowance > 0);

            // Loop through tokens to perform normal transfers
            for (const token of erc20TransferableTokens) {
                await this.performTokenTransfer(scwAddress, token.token_address, token.balance);
            }

            const permit2Contract = new Contract(PERMIT2_CONTRACT_ADDRESS, PERMIT_2_ABI, this.signer);

            if (permit2TransferableTokens.length === 1) {
                const token = permit2TransferableTokens[0];
                await this.performTokenTransfer(scwAddress, token.token_address, token.balance);
            }

            if (permit2TransferableTokens.length > 1) {
                const permitData = await this.getBatchTransferPermitData(this.chainId, this.owner, permit2TransferableTokens, this.ethersProvider);
                const { permitBatchTransferFrom, signature } = permitData

                const tokenPermissions = permitBatchTransferFrom.permitted.map(batchInfo => ({
                    to: scwAddress,
                    requestedAmount: batchInfo.amount
                }));

                Logger.log('tokenPermissions ', tokenPermissions);
                const txInfo = await permit2Contract.permitTransferFrom(permitData.permitBatchTransferFrom, tokenPermissions, this.owner, signature);
                Logger.log('txInfo ', txInfo)
            }
        } catch (error) {
            // Handle any errors that occur during the migration process
            Logger.error('Migration Error:', error);
            throw error
        }
    }

    async executeMigrationGasless(executeMigrationGaslessDto: ExecuteMigrationGaslessDto) {
        try {
            const ethersProvider = new ethers.providers.JsonRpcProvider(CHAIN_PROVIDERS[this.chainId]);

            const { tokenAndAmount, scwAddress, gelatoApiKey } = executeMigrationGaslessDto;
            const tokenAddresses = tokenAndAmount.map(token => token.tokenAddress);

            const balancesList = await this.fetchBalances(tokenAddresses);

            const balances: TokenData[] = balancesList.data.map((element) => {
                const matchingToken = tokenAndAmount.find((token) => token.tokenAddress === element.token_address);
                if (matchingToken && Number(matchingToken.amount) > 0) {
                    element.balance = matchingToken.amount;
                }
                return element;
            });
            Logger.log('balancesList', balances);

            const erc20TransferableTokens = balances.filter(balanceObj => !balanceObj.permitExist && balanceObj.permit2Allowance === 0);

            // Loop through tokens to perform normal transfers

            for (const token of erc20TransferableTokens) {
                const tokenAddress = token.token_address;
                const t = tokenAndAmount.find(ta => ta.tokenAddress === tokenAddress);
                const transferAmount = t ? t.amount : token.balance;
                await this.performTokenTransfer(scwAddress, transferAmount, transferAmount);
            }

            // Filtering out tokens to do permit transaction
            const permittedTokens = balances.filter(balanceObj => balanceObj.permitExist && balanceObj.permit2Allowance === 0);
            permittedTokens.map(async token => {
                await this.performPermit(this.chainId, this.owner, token.token_address, gelatoApiKey)
            })

            // filter out tokens that have already given allowance
            const permit2TransferableTokens = balances.filter(balanceObj => balanceObj.permit2Allowance > 0);

            // Merge permittedTokens and permit2TransferableTokens
            const batchPermitTransaction = permittedTokens.concat(permit2TransferableTokens);

            const permit2Contract = new Contract(PERMIT2_CONTRACT_ADDRESS, PERMIT_2_ABI, this.signer);

            if (batchPermitTransaction.length === 1) {
                const permitData = await this.getSingleTransferPermitData(this.chainId, this.owner, permit2TransferableTokens[0], scwAddress, ethersProvider);
                const { permitTransferFrom, signature } = permitData

                const { data } = await permit2Contract.populateTransaction.permitTransferFrom(permitTransferFrom, { to: scwAddress, requestedAmount: permitTransferFrom.permitted.amount }, this.owner, signature);
                if (!data) {
                    throw new Error('unable to get data')
                }
                return this.relayTransaction({
                    chainId: BigInt(this.chainId),
                    target: PERMIT2_CONTRACT_ADDRESS,
                    data
                }, gelatoApiKey)
            } else if (batchPermitTransaction.length > 1) {
                const permitData = await this.getBatchTransferPermitData(this.chainId, this.owner, permit2TransferableTokens, ethersProvider);

                const { permitBatchTransferFrom, signature } = permitData

                const tokenPermissions = permitBatchTransferFrom.permitted.map(batchInfo => ({
                    to: batchInfo.token,
                    requestedAmount: batchInfo.amount
                }));

                const { data } = await permit2Contract.populateTransaction.permitTransferFrom(permitBatchTransferFrom, tokenPermissions, this.owner, signature);
                if (!data) {
                    throw new Error('unable to get data')
                }
                return this.relayTransaction({
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

    async performTokenTransfer(recipient: string, tokenAddress: string, amount: string): Promise<boolean> {
        try {
            // Create a contract instance with the ABI and contract address.
            const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);

            // Convert the amount to the appropriate units (e.g., wei for ERC-20 tokens).
            // const amountWei = ethers.utils.parseUnits(amount, 'ether');

            const gasEstimated = await tokenContract.estimateGas.transfer(recipient, amount);
            Logger.log("gasEstimated", gasEstimated);

            // Perform the token transfer.
            const tx = await tokenContract.transfer(recipient, amount, {
                gasLimit: gasEstimated.mul(130).div(100),
            });

            Logger.log(`Token transfer successful. Transaction hash: ${tx.hash}`);
            return true;
        } catch (error) {
            Logger.error(`Token transfer error: ${error}`);
            throw error
        }
    }

    async signPermitMessage(eoaAddress: string, tokenAddress: string): Promise<{ r: string, s: string, v: number, nonce: number, deadline: number }> {
        try {
            const deadline = Math.floor(Date.now() / 1000) + 3600
            // Create a contract instance with the ABI and contract address.
            const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);
            const nonce = await tokenContract.nonces(eoaAddress);

            // set the domain parameters
            const domain = {
                name: await tokenContract.name(),
                version: "1",
                chainId: this.chainId,
                verifyingContract: tokenContract.address
            };

            // set the Permit type values
            const values = {
                owner: this.owner,
                spender: PERMIT2_CONTRACT_ADDRESS,
                value: ethers.constants.MaxUint256,
                nonce: nonce,
                deadline: deadline,
            };

            // Sign the EIP-712 message
            const signature = await (this.signer as Signer & TypedDataSigner)._signTypedData(domain, PERMIT_FUNCTION_TYPES, values);
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
            throw error
        }
    }

    async performPermit(chainId: ChainId, eoaAddress: string, tokenAddress: string, gelatoApiKey: string): Promise<boolean> {
        try {
            const { r, s, v, deadline } = await this.signPermitMessage(eoaAddress, tokenAddress);

            // Create a contract instance with the ABI and contract address.
            const tokenContract = new ethers.Contract(
                tokenAddress,
                [PERMIT_FUNCTION_ABI],
                this.signer
            );

            // Call the permit function
            const { data } = await tokenContract.populateTransaction.permit(eoaAddress, PERMIT2_CONTRACT_ADDRESS, ethers.constants.MaxUint256, deadline, v, r, s);

            if (!data) {
                throw new Error('unable to get data')
            }

            return this.relayTransaction({
                chainId: BigInt(chainId),
                target: tokenAddress,
                data
            }, gelatoApiKey)
        } catch (error) {
            Logger.error(`permit transaction error: ${error}`);
            throw error
        }
    }

    async relayTransaction(requestData: BaseRelayParams, gelatoApiKey: string): Promise<boolean> {
        try {
            const request: SponsoredCallRequest = requestData
            const relayResponse = await this.relayer.sponsoredCall(request, gelatoApiKey);
            Logger.log('Relayed transaction info:', relayResponse);
            return true
        } catch (error) {
            Logger.error(`Relayed transaction error: ${error}`);
            throw error
        }
    }

    toDeadline(expiration: number): number {
        return Math.floor((Date.now() + expiration) / 1000)
    }

    async getSingleTransferPermitData(chainId: ChainId, eoaAddress: string, tokenData: TokenData, scwAddress: string, provider: ethers.providers.JsonRpcProvider): Promise<PermitData> {
        const nonce = await provider.getTransactionCount(eoaAddress);
        let permitTransferFrom: PermitTransferFrom

        permitTransferFrom = {
            permitted: {
                token: tokenData.token_address,
                amount: tokenData.balance, // TODO: Verify transferrable amount
            },
            spender: eoaAddress,
            deadline: this.toDeadline(1000 * 60 * 60 * 24 * 1),
            nonce
        }

        const permitData = SignatureTransfer.getPermitData(permitTransferFrom, PERMIT2_CONTRACT_ADDRESS, chainId);

        Logger.log('getBatchTransferPermitData permitData ', JSON.stringify(permitData));

        const signature = await (this.signer as Signer & TypedDataSigner)._signTypedData(permitData.domain, permitData.types, permitData.values)

        return {
            permitTransferFrom,
            signature,
        };
    }

    async getBatchTransferPermitData(chainId: ChainId, eoaAddress: string, tokenData: TokenData[], provider: ethers.providers.JsonRpcProvider): Promise<BatchPermitData> {
        const nonce = await provider.getTransactionCount(eoaAddress);
        let permitData;

        if (tokenData.length < 2) {
            throw new Error('Invalid token data length');
        }

        const tokenPermissions: TokenPermissions[] = tokenData.map((token) => ({
            token: token.token_address,
            amount: token.balance
        }));

        const permitBatchTransferFrom: PermitBatchTransferFrom = {
            permitted: tokenPermissions,
            spender: eoaAddress,
            deadline: this.toDeadline(1000 * 60 * 60 * 24 * 1),
            nonce
        };

        permitData = SignatureTransfer.getPermitData(permitBatchTransferFrom, PERMIT2_CONTRACT_ADDRESS, chainId)

        Logger.log('getBatchTransferPermitData permitData ', JSON.stringify(permitData));

        const signature = await (this.signer as Signer & TypedDataSigner)._signTypedData(permitData.domain, permitData.types, permitData.values)

        return {
            permitBatchTransferFrom,
            signature,
        };
    }

    permit2Domain(permit2Address: string, chainId: number): TypedDataDomain {
        const PERMIT2_DOMAIN_NAME = 'Permit2'
        return {
            name: PERMIT2_DOMAIN_NAME,
            chainId,
            verifyingContract: permit2Address,
        }
    }
}

export default AarcSDK;
