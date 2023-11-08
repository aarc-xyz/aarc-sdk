import { EthersAdapter, SafeFactory } from '@safe-global/protocol-kit';
import { Logger } from './utils/Logger';
import { Contract, ethers, Signer } from 'ethers';
import { sendRequest, HttpMethod } from './utils/HttpRequest'; // Import your HTTP module
import { BALANCES_ENDPOINT, CHAIN_PROVIDERS, PERMIT2_CONTRACT_ADDRESS, PERMIT2_DOMAIN_NAME, PERMIT_FUNCTION_ABI, SAFE_TX_SERVICE_URLS, PERMIT_FUNCTION_TYPES, GELATO_RELAYER_ADDRESS } from './utils/Constants';
import { BatchPermitData, Config, ExecuteMigrationDto, ExecuteMigrationGaslessDto, PermitData, TokenData } from './utils/types';
import { OwnerResponse, BalancesResponse } from './utils/types'
import SafeApiKit from "@safe-global/api-kit";
import { ERC20_ABI } from './utils/abis/ERC20.abi';
import { TokenPermissions, SignatureTransfer, PermitTransferFrom, PermitBatchTransferFrom, PERMIT2_ADDRESS } from '@uniswap/permit2-sdk'
import { ChainId } from './utils/ChainTypes';
import { PERMIT2_BATCH_TRANSFER_ABI } from './utils/abis/Permit2BatchTransfer.abi';
import { PERMIT2_SINGLE_TRANSFER_ABI } from './utils/abis/Permit2SingleTransfer.abi';
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
                await this.performTokenTransfer(scwAddress, token.token_address, token.balance);
            }

            const permit2Contract = new Contract(PERMIT2_CONTRACT_ADDRESS, PERMIT2_BATCH_TRANSFER_ABI, this.signer);

            if (permit2TransferableTokens.length === 1) {
                const token = permit2TransferableTokens[0];
                await this.performTokenTransfer(scwAddress, token.token_address, token.balance);
            }

            if (permit2TransferableTokens.length > 1) {
                const permitData = await this.getBatchTransferPermitData(this.chainId, this.owner, permit2TransferableTokens);
                const { permitBatchTransferFrom, signature } = permitData

                const tokenPermissions = permitBatchTransferFrom.permitted.map(batchInfo => ({
                    to: scwAddress,
                    requestedAmount: batchInfo.amount
                }));

                const txInfo  = await permit2Contract.permitTransferFrom(permitData.permitBatchTransferFrom, tokenPermissions, this.owner, signature);
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
                await this.performTokenTransfer(scwAddress, tokenAddress, transferAmount);
            }

            // Filtering out tokens to do permit transaction
            const permittedTokens = balances.filter(balanceObj => balanceObj.permit2Exist && balanceObj.permit2Allowance === "0");
            permittedTokens.map(async token => {
                await this.performPermit(this.chainId, this.owner, token.token_address, gelatoApiKey)
            })

            // filter out tokens that have already given allowance
            const permit2TransferableTokens = balances.filter(balanceObj => balanceObj.permit2Allowance != "0");
            
            // Merge permittedTokens and permit2TransferableTokens
            const batchPermitTransaction = permittedTokens.concat(permit2TransferableTokens);
            
            if (batchPermitTransaction.length === 1) {
                const permit2SingleContract = new Contract(PERMIT2_CONTRACT_ADDRESS, PERMIT2_SINGLE_TRANSFER_ABI, this.signer);
                const permitData = await this.getSingleTransferPermitData(this.chainId, GELATO_RELAYER_ADDRESS, batchPermitTransaction[0]);
                const { permitTransferFrom, signature } = permitData

                console.log('permitTransferFrom ', permitTransferFrom);
                console.log('owner ', this.owner);
                console.log('signature ', signature);

                const { data } = await permit2SingleContract.populateTransaction.permitTransferFrom(permitTransferFrom, { to: scwAddress, requestedAmount: permitTransferFrom.permitted.amount }, this.owner, signature);
                if (!data) {
                    throw new Error('unable to get data')
                }
                return this.relayTransaction({
                    chainId: BigInt(this.chainId),
                    target: PERMIT2_CONTRACT_ADDRESS,
                    data
                }, gelatoApiKey)
            } else if (batchPermitTransaction.length > 1) {
                const permit2BatchContract = new Contract(PERMIT2_CONTRACT_ADDRESS, PERMIT2_BATCH_TRANSFER_ABI, this.signer);
                const permitData = await this.getBatchTransferPermitData(this.chainId, GELATO_RELAYER_ADDRESS, batchPermitTransaction);

                const { permitBatchTransferFrom, signature } = permitData

                const tokenPermissions = permitBatchTransferFrom.permitted.map(batchInfo => ({
                    to: scwAddress,
                    requestedAmount: batchInfo.amount
                }));

                const { data } = await permit2BatchContract.populateTransaction.permitTransferFrom(permitBatchTransferFrom, tokenPermissions, this.owner, signature);
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

    async getSingleTransferPermitData(chainId: ChainId, spenderAddress: string, tokenData: TokenData): Promise<PermitData> {
        // need to change this nonce logic
        const nonce = await this.ethersProvider.getTransactionCount(spenderAddress);
        let permitTransferFrom: PermitTransferFrom

        permitTransferFrom = {
            permitted: {
                token: tokenData.token_address,
                amount: tokenData.balance, // TODO: Verify transferrable amount
            },
            spender: spenderAddress,
            deadline: this.toDeadline(1000 * 60 * 60 * 24 * 1),
            nonce
        }

        const permitData = SignatureTransfer.getPermitData(permitTransferFrom, PERMIT2_CONTRACT_ADDRESS, chainId);

        Logger.log('getSingleTransferPermitData permitData ', JSON.stringify(permitData));

        const signature = await (this.signer as Signer & TypedDataSigner)._signTypedData(permitData.domain, permitData.types, permitData.values)

        return {
            permitTransferFrom,
            signature,
        };
    }

    async getBatchTransferPermitData(chainId: ChainId, spenderAddress: string, tokenData: TokenData[]): Promise<BatchPermitData> {
        const nonce = await this.ethersProvider.getTransactionCount(spenderAddress);
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
            spender: spenderAddress,
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
        return {
            name: PERMIT2_DOMAIN_NAME,
            chainId,
            verifyingContract: permit2Address,
        }
    }
}

export default AarcSDK;
