import { EthersAdapter, SafeFactory } from '@safe-global/protocol-kit';
import { Logger } from './utils/Logger';
import { ethers, Signer } from 'ethers';
import { sendRequest, HttpMethod } from './utils/HttpRequest'; // Import your HTTP module
import { BALANCES_ENDPOINT, ETHEREUM_PROVIDER, PERMIT2_CONTRACT_ADDRESS, SAFE_TX_SERVICE_URL, BICONOMY_TX_SERVICE_URL } from './utils/Constants';
import { ExecuteMigrationDto, GetBalancesDto, TokenData } from './utils/types';
import { OwnerResponse, BalancesResponse } from './utils/types'
import SafeApiKit from "@safe-global/api-kit";
import { ERC20_ABI } from './utils/abis/ERC20.abi';
import { TokenPermissions, SignatureTransfer, PermitTransferFrom, PermitBatchTransferFrom } from '@uniswap/Permit2-sdk'
import { ChainId } from './utils/ChainTypes';
import { BiconomySmartAccountV2, DEFAULT_ENTRYPOINT_ADDRESS } from "@biconomy/account";
import { ECDSAOwnershipValidationModule, DEFAULT_ECDSA_OWNERSHIP_MODULE } from '@biconomy/modules'
import NodeClient from '@biconomy/node-client'

class AarcSDK {
    chainId!: number;
    owner!: string;
    saltNonce = 0;
    ethAdapter!: EthersAdapter;
    signer!: Signer;

    constructor(_signer: Signer) {
        Logger.log('SDK initiated');

        // Create an EthersAdapter using the provided signer or provider
        this.ethAdapter = new EthersAdapter({
            ethers,
            signerOrProvider: _signer,
        });
        this.signer = _signer
    }

    async getOwnerAddress(): Promise<string> {
        if (this.owner == undefined) {
            this.owner = await this.signer.getAddress();
        }
        return this.owner;
    }

    async getChainId(): Promise<ChainId> {
        if (this.chainId == undefined) {
            const chainId = await this.signer.getChainId();
            if (chainId in Object.values(ChainId)) {
                this.chainId = chainId;
            } else {
                throw new Error('Invalid chain id');
            }
        }
        return this.chainId;
    }

    async getAllSafes(): Promise<OwnerResponse> {
        try {
            const safeService = new SafeApiKit({
                txServiceUrl: SAFE_TX_SERVICE_URL,
                ethAdapter: this.ethAdapter,
            });     
            const safes = await safeService.getSafesByOwner(this.owner);
            return safes;
        } catch (error) {
            Logger.log('error while getting safes');
            throw error;
        }
    }

    async getAllBiconomySCWs(){
        try{
            const nodeClient = new NodeClient({ txServiceUrl: BICONOMY_TX_SERVICE_URL });
            const params = {
                chainId: await this.getChainId(), //or any chain id of your choice
                owner: await this.getOwnerAddress(),
                index: 0
            }
            const accounts = await nodeClient.getSmartAccountsByOwner(params);
            return accounts;
        } catch (error){
            Logger.log('error while getting biconomy smart accounts');
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

    async generateBiconomySCW(): Promise<string> {
        const module = await ECDSAOwnershipValidationModule.create({
            signer: this.signer,
            moduleAddress: DEFAULT_ECDSA_OWNERSHIP_MODULE
        });
        
        let biconomySmartAccount = await BiconomySmartAccountV2.create({
            chainId: await this.getChainId(),// or any supported chain of your choice 
            entryPointAddress: DEFAULT_ENTRYPOINT_ADDRESS,
            defaultValidationModule: module,
            activeValidationModule: module
        });

        return await biconomySmartAccount.getAccountAddress();
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
        const { chainId, eoaAddress, tokenAndAmount, scwAddress } = executeMigrationDto
        let balances = await this.fetchBalances({ chainId, eoaAddress })
        const balancesList = balances.data.filter((balanceObj) =>
            tokenAndAmount.some((token) => token.tokenAddress === balanceObj.contract_address)
        )
        const ethersProvider = new ethers.providers.JsonRpcProvider(
            ETHEREUM_PROVIDER,
        );
        Logger.log(' balancesList ', balancesList)

        const erc20TransferableTokens = balances.data.filter((balanceObj) =>
            balanceObj.allowance === 0
        )

        const permit2TransferableTokens = balances.data.filter((balanceObj) =>
            balanceObj.permitExist
        )

        // Loop through tokens to perform normal transfers
        for (const token of erc20TransferableTokens) {
            // Check if the token's balance is greater than 0
            if (parseFloat(token.balance) > 0 && token.allowance === 0) {
                await this.performTokenTransfer(
                    scwAddress,
                    token.contract_address,
                    tokenAndAmount.find((t) => t.tokenAddress === token.contract_address)?.amount || '0'
                );
            }
        }

        if (permit2TransferableTokens.length > 0) {
            await this.createPermitMessageData(chainId, eoaAddress, permit2TransferableTokens, scwAddress, ethersProvider)
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
            return false;
        }
    }

    toDeadline(expiration: number): number {
        return Math.floor((Date.now() + expiration) / 1000)
    }

    async createPermitMessageData(chainId: ChainId, eoaAddress: string, tokenData: TokenData[], scwAddress: string, provider: ethers.providers.JsonRpcProvider): Promise<boolean> {
        try {
            const nonce = await provider.getTransactionCount(eoaAddress);
            let permitData;

            if (tokenData.length === 1) {
                const permitTransferFrom: PermitTransferFrom = {
                    permitted: {
                        token: tokenData[0].contract_address,
                        amount: tokenData[0].allowance, // TODO: Verify transferrable amount
                    },
                    deadline: this.toDeadline(1000 * 60 * 60 * 24 * 30),
                    nonce,
                    spender: eoaAddress
                }
                permitData = SignatureTransfer.getPermitData(permitTransferFrom, PERMIT2_CONTRACT_ADDRESS, chainId);
            } else {

                const tokenPermissions: TokenPermissions[] = tokenData.map((token) => ({
                    token: token.contract_address,
                    amount: token.allowance, // TODO: Verify transferrable amount
                }));

                const permitBatchTransferFrom: PermitBatchTransferFrom = {
                    permitted: tokenPermissions,
                    deadline: this.toDeadline(1000 * 60 * 60 * 24 * 30),
                    nonce,
                    spender: eoaAddress,
                };

                permitData = SignatureTransfer.getPermitData(permitBatchTransferFrom, PERMIT2_CONTRACT_ADDRESS, chainId)
            }
            // TODO: fix error here
            // const signature = await signTypedData(this.signer, permitData.domain, permitData.types, permitData.values)
            return true

        } catch (error) {
            Logger.error(`Token transfer error: ${error}`);
            return false;
        }
    };
}

export default AarcSDK;
