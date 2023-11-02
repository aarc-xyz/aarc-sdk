import { EthersAdapter, SafeFactory } from '@safe-global/protocol-kit';
import { Logger } from './utils/Logger';
import { Contract, ethers, Signer } from 'ethers';
import { sendRequest, HttpMethod } from './utils/HttpRequest'; // Import your HTTP module
import { BALANCES_ENDPOINT, ETHEREUM_PROVIDER, PERMIT2_CONTRACT_ADDRESS, SAFE_TX_SERVICE_URL } from './utils/Constants';
import { BatchPermitData, Config, ExecuteMigrationDto, GetBalancesDto, PermitData, TokenData } from './utils/types';
import { OwnerResponse, BalancesResponse } from './utils/types'
import SafeApiKit from "@safe-global/api-kit";
import { ERC20_ABI } from './utils/abis/ERC20.abi';
import { TokenPermissions, SignatureTransfer, PermitTransferFrom, PermitBatchTransferFrom } from '@uniswap/Permit2-sdk'
import { ChainId } from './utils/ChainTypes';
import { PERMIT_2_ABI } from './utils/abis/Permit2.abi';
import { GelatoRelay, SponsoredCallRequest } from "@gelatonetwork/relay-sdk";
import { BaseRelayParams } from '@gelatonetwork/relay-sdk/dist/lib/types';

class AarcSDK {
    safeFactory!: SafeFactory;
    owner!: string;
    smartWalletAddress!: string;
    saltNonce = 0;
    ethAdapter!: EthersAdapter;
    safeService!: SafeApiKit;
    isInited = false;
    signer!: Signer
    apiKey: string
    relayer: GelatoRelay

    constructor(config: Config) {

        Logger.log('SDK initiated');

        const { signer, apiKey } = config

        // Create an EthersAdapter using the provided signer or provider
        this.ethAdapter = new EthersAdapter({
            ethers,
            signerOrProvider: signer,
        });
        this.safeService = new SafeApiKit({
            txServiceUrl: SAFE_TX_SERVICE_URL,
            ethAdapter: this.ethAdapter,
        });
        this.signer = signer
        this.apiKey = apiKey
        // instantiating Gelato Relay SDK
        this.relayer = new GelatoRelay();
    }

    async getAllSafes(): Promise<OwnerResponse> {
        try {
            const safes = await this.safeService?.getSafesByOwner(this.owner);
            return safes;
        } catch (error) {
            Logger.log('error while getting safes');
            throw error;
        }
    }

    async init(): Promise<AarcSDK> {
        try {
            this.owner = await this.signer.getAddress()
            // Create a SafeFactory instance using the EthersAdapter
            this.safeFactory = await SafeFactory.create({
                ethAdapter: this.ethAdapter,
            });
            const config = {
                owners: [this.owner],
                threshold: 1,
            };
            // Configure the Safe parameters and predict the Safe address
            this.smartWalletAddress = await this.safeFactory.predictSafeAddress(
                config,
                this.saltNonce.toString(),
            );
        } catch (err) {
            Logger.error('Error creating safe');
        }
        this.isInited = true;
        return this
    }

    /**
     * @description this function will return computer smart wallet address
     * @returns
     */
    getSafe() {
        return this.smartWalletAddress;
    }

    /**
     * @description this function will return balances of ERC-20, ERC-721 and native tokens
     * @param balancesDto
     * @returns
     */
    async fetchBalances(balancesDto: GetBalancesDto): Promise<BalancesResponse> {
        try {
            // Make the API call using the sendRequest function
            const response: BalancesResponse = await sendRequest({
                url: BALANCES_ENDPOINT,
                method: HttpMethod.Post,
                body: balancesDto,
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
            const { chainId, eoaAddress, tokenAndAmount, scwAddress } = executeMigrationDto;
            const tokenAddresses = tokenAndAmount.map(token => token.tokenAddress);

            const balances = await this.fetchBalances({ chainId, eoaAddress, tokenAddresses });
            Logger.log('balancesList', balances);

            const ethersProvider = new ethers.providers.JsonRpcProvider(ETHEREUM_PROVIDER);

            const erc20TransferableTokens = balances.data.filter(balanceObj => balanceObj.permit2Allowance === 0);
            const permit2TransferableTokens = balances.data.filter(balanceObj => balanceObj.permit2Allowance > 0);

            // Loop through tokens to perform normal transfers
            for (const token of erc20TransferableTokens) {
                const tokenAddress = token.contract_address;
                const t = tokenAndAmount.find(ta => ta.tokenAddress === tokenAddress);
                const transferAmount = t ? t.amount : token.balance;
                await this.performTokenTransfer(scwAddress, tokenAddress, transferAmount);
            }

            const permit2Contract = new Contract(PERMIT2_CONTRACT_ADDRESS, PERMIT_2_ABI, this.signer);

            if (permit2TransferableTokens.length === 1) {
                const token = permit2TransferableTokens[0];
                const t = tokenAndAmount.find(ta => ta.tokenAddress === token.contract_address);
                const transferAmount = t ? t.amount : token.balance;
                await this.performTokenTransfer(scwAddress, token.contract_address, transferAmount);
            }

            if (permit2TransferableTokens.length > 1) {
                const permitData = await this.getBatchTransferPermitData(chainId, eoaAddress, permit2TransferableTokens, scwAddress, ethersProvider);
                const { permitBatchTransferFrom, signature } = permitData

                const tokenPermissions = permitBatchTransferFrom.permitted.map(batchInfo => ({
                    to: batchInfo.token,
                    requestedAmount: batchInfo.amount
                }));
                await permit2Contract.permitTransferFrom(permitBatchTransferFrom, tokenPermissions, eoaAddress, signature);
            }
        } catch (error) {
            // Handle any errors that occur during the migration process
            Logger.error('Migration Error:', error);
            throw error
        }
    }

    async executeMigrationGasless(executeMigrationDto: ExecuteMigrationDto) {
        try {
            const ethersProvider = new ethers.providers.JsonRpcProvider(ETHEREUM_PROVIDER);

            const { chainId, eoaAddress, tokenAndAmount, scwAddress } = executeMigrationDto;
            const tokenAddresses = tokenAndAmount.map(token => token.tokenAddress);

            const balances = await this.fetchBalances({ chainId, eoaAddress, tokenAddresses });
            Logger.log('balancesList', balances);

            const erc20TransferableTokens = balances.data.filter(balanceObj => !balanceObj.permit2Exist);

            // Loop through tokens to perform normal transfers
            for (const token of erc20TransferableTokens) {
                const tokenAddress = token.contract_address;
                const t = tokenAndAmount.find(ta => ta.tokenAddress === tokenAddress);
                const transferAmount = t ? t.amount : token.balance;
                await this.performTokenTransfer(scwAddress, transferAmount, transferAmount);
            }

            // Filtering out tokens to do permit transaction
            const permiteedTokens = balances.data.filter(balanceObj => balanceObj.permit2Exist);

            permiteedTokens.map(async token => {
                await this.performPermit(chainId, scwAddress, token.contract_address)
            })

            // filter out tokens that have already given allowan
            const permit2TransferableTokens = balances.data.filter(balanceObj => balanceObj.permit2Allowance > 0);

            // Merge permiteedTokens and permit2TransferableTokens
            const batchPermitTransaction = permiteedTokens.concat(permit2TransferableTokens);

            const permit2Contract = new Contract(PERMIT2_CONTRACT_ADDRESS, PERMIT_2_ABI, this.signer);


            if (batchPermitTransaction.length === 1) {
                const permitData = await this.getSingleTransferPermitData(chainId, eoaAddress, permit2TransferableTokens[0], scwAddress, ethersProvider);
                const { permitTransferFrom, signature } = permitData

                const { data } = await permit2Contract.populateTransaction.permitTransferFrom(permitTransferFrom, { to: scwAddress, requestedAmount: permitTransferFrom.permitted.amount }, eoaAddress, signature);
                if (!data) {
                    throw new Error('unable to get data')
                }
                return this.relayTransaction({
                    chainId: BigInt(chainId),
                    target: PERMIT2_CONTRACT_ADDRESS,
                    data
                })
            } else if (batchPermitTransaction.length > 1) {
                const permitData = await this.getBatchTransferPermitData(chainId, eoaAddress, permit2TransferableTokens, scwAddress, ethersProvider, true);

                const { permitBatchTransferFrom, signature } = permitData

                const tokenPermissions = permitBatchTransferFrom.permitted.map(batchInfo => ({
                    to: batchInfo.token,
                    requestedAmount: batchInfo.amount
                }));
                const { data } = await permit2Contract.populateTransaction.permitTransferFrom(permitBatchTransferFrom, tokenPermissions, eoaAddress, signature);
                if (!data) {
                    throw new Error('unable to get data')
                }
                return this.relayTransaction({
                    chainId: BigInt(chainId),
                    target: PERMIT2_CONTRACT_ADDRESS,
                    data
                })
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
            const amountWei = ethers.utils.parseUnits(amount, 'ether');

            // Perform the token transfer.
            const tx = await tokenContract.transfer(recipient, amountWei);

            Logger.log(`Token transfer successful. Transaction hash: ${tx.hash}`);
            return true;
        } catch (error) {
            Logger.error(`Token transfer error: ${error}`);
            throw error
        }
    }

    async signPermitMessage(eoaAddress: string, tokenAddress: string): Promise<{ r: string, s: string, v: string, nonce: number, deadline: number }> {
        try {
            const deadline = Math.floor(Date.now() / 1000) + 3600
            // Create a contract instance with the ABI and contract address.
            const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);

            const nonce = await tokenContract.nonceOf(eoaAddress);

            // Encode the message manually according to contract expectations
            const encodedMessage = ethers.utils.defaultAbiCoder.encode(
                ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint8', 'bytes32', 'bytes32'],
                [ethers.utils.keccak256('0x1901'), eoaAddress, PERMIT2_CONTRACT_ADDRESS, ethers.constants.MaxUint256, nonce, deadline, 0, '0x', '0x']
            );

            // Sign the encoded message
            const signature = await this.signer.signMessage(ethers.utils.arrayify(encodedMessage));
            return {
                r: signature.slice(0, 66),
                s: '0x' + signature.slice(66, 130),
                v: '0x' + signature.slice(130, 132),
                nonce,
                deadline,
            };
        } catch (error) {
            Logger.error(`Token transfer error: ${error}`);
            throw error
        }
    }

    async performPermit(chainId: ChainId, eoaAddress: string, tokenAddress: string): Promise<boolean> {
        try {
            const { r, s, v, deadline } = await this.signPermitMessage(eoaAddress, tokenAddress);

            // Create a contract instance with the ABI and contract address.
            const tokenContract = new ethers.Contract(
                tokenAddress,
                ['function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)'],
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
            })
        } catch (error) {
            Logger.error(`permit transaction error: ${error}`);
            throw error
        }
    }

    async relayTransaction(requestData: BaseRelayParams): Promise<boolean> {
        try {
            const request: SponsoredCallRequest = requestData
            const relayResponse = await this.relayer.sponsoredCall(request, this.apiKey);
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
        let permitData;
        let permitTransferFrom: PermitTransferFrom

        permitTransferFrom = {
            permitted: {
                token: tokenData.contract_address,
                amount: tokenData.permit2Allowance, // TODO: Verify transferrable amount
            },
            deadline: this.toDeadline(1000 * 60 * 60 * 24 * 30),
            nonce,
            spender: eoaAddress
        }
        permitData = SignatureTransfer.getPermitData(permitTransferFrom, PERMIT2_CONTRACT_ADDRESS, chainId);
        const signature = await this.signer.signMessage(ethers.utils.arrayify(ethers.utils._TypedDataEncoder.encode(permitData.domain, permitData.types, permitData.values)));
        return {
            permitTransferFrom,
            signature,
        };
    }

    async getBatchTransferPermitData(chainId: ChainId, eoaAddress: string, tokenData: TokenData[], scwAddress: string, provider: ethers.providers.JsonRpcProvider, isGaless: boolean = false): Promise<BatchPermitData> {
        const nonce = await provider.getTransactionCount(eoaAddress);
        let permitData;

        if (tokenData.length < 2) {
            throw new Error('Invalid token data length');
        }

        const tokenPermissions: TokenPermissions[] = tokenData.map((token) => ({
            token: token.contract_address,
            amount: token.permit2Allowance, // TODO: Verify transferrable amount
        }));

        const permitBatchTransferFrom: PermitBatchTransferFrom = {
            permitted: tokenPermissions,
            deadline: this.toDeadline(1000 * 60 * 60 * 24 * 30),
            nonce,
            spender: eoaAddress,
        };

        permitData = SignatureTransfer.getPermitData(permitBatchTransferFrom, PERMIT2_CONTRACT_ADDRESS, chainId)

        const signature = await this.signer.signMessage(ethers.utils.arrayify(ethers.utils._TypedDataEncoder.encode(permitData.domain, permitData.types, permitData.values)));

        return {
            permitBatchTransferFrom,
            signature,
        };
    }
}

export default AarcSDK;
