import { EthersAdapter, SafeFactory } from '@safe-global/protocol-kit';
import { Logger } from './utils/Logger';
import { Contract, ethers, Signer } from 'ethers';
import { sendRequest, HttpMethod } from './utils/HttpRequest'; // Import your HTTP module
import { BALANCES_ENDPOINT, ETHEREUM_PROVIDER, PERMIT2_CONTRACT_ADDRESS, SAFE_TX_SERVICE_URL, BICONOMY_TX_SERVICE_URL } from './utils/Constants';
import { ExecuteMigrationDto, GetBalancesDto, TokenData } from './utils/types';
import { OwnerResponse, BalancesResponse } from './utils/types'
import SafeApiKit from "@safe-global/api-kit";
import { ERC20_ABI } from './utils/abis/ERC20.abi';
import { PERMIT_2_ABI } from './utils/abis/Permit2.abi';
import { TokenPermissions, SignatureTransfer, PermitTransferFrom, PermitBatchTransferFrom } from '@uniswap/Permit2-sdk'
import { ChainId } from './utils/ChainTypes';
import Biconomy from "./Biconomy";

class AarcSDK extends Biconomy{
    chainId!: number;
    owner!: string;
    saltNonce = 0;
    ethAdapter!: EthersAdapter;
    signer!: Signer;

    constructor(_signer: Signer) {
        Logger.log('SDK initiated');
        super(_signer);

        // Create an EthersAdapter using the provided signer or provider
        this.ethAdapter = new EthersAdapter({
            ethers,
            signerOrProvider: _signer,
        });
        this.signer = _signer;
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
        const tokenAddresses = tokenAndAmount.map(token => token.tokenAddress)

        let balances = await this.fetchBalances({ chainId, eoaAddress, tokenAddresses })
        Logger.log(' balancesList ', balances)

        const ethersProvider = new ethers.providers.JsonRpcProvider(
            ETHEREUM_PROVIDER,
        );

        const erc20TransferableTokens = balances.data.filter((balanceObj) =>
            balanceObj.permit2Allowance === 0
        )

        const permit2TransferableTokens = balances.data.filter((balanceObj) =>
            balanceObj.permit2Exist
        )

        // Loop through tokens to perform normal transfers
        for (const token of erc20TransferableTokens) {
            // Check if the token's balance is greater than 0
            if (parseFloat(token.balance) > 0 && token.permit2Allowance === 0) {
                await this.performTokenTransfer(
                    scwAddress,
                    token.contract_address,
                    tokenAndAmount.find((t) => t.tokenAddress === token.contract_address)?.amount || '0'
                );
            }
        }
        const permit2Contract = new Contract(PERMIT2_CONTRACT_ADDRESS, PERMIT_2_ABI, this.signer)


        // TODO: // verify below logic
        if (permit2TransferableTokens.length === 1) {

            // const { permitTransferFrom, signature } = await this.getSingleTransferPermitData(chainId, eoaAddress, permit2TransferableTokens[0], scwAddress, ethersProvider)
            // await permit2Contract.permitTransferFrom(permitTransferFrom, { to: scwAddress, requestedAmount: permit2TransferableTokens[0].permit2Allowance }, eoaAddress, signature)
            if (parseFloat(permit2TransferableTokens[0].balance) > 0 && permit2TransferableTokens[0].permit2Allowance === 0) {
                await this.performTokenTransfer(
                    scwAddress,
                    permit2TransferableTokens[0].contract_address,
                    tokenAndAmount.find((t) => t.tokenAddress === permit2TransferableTokens[0].contract_address)?.amount || '0'
                );
            }
        } 
        
        if (permit2TransferableTokens.length > 1) {

            const { permitBatchTransferFrom, signature } = await this.getBatchTransferPermitData(chainId, eoaAddress, permit2TransferableTokens, scwAddress, ethersProvider)
            const tokenPermissions = permitBatchTransferFrom.permitted.map((batchInfo) => ({
                to: batchInfo.token,
                requestedAmount: batchInfo.amount, // TODO: Verify transferrable amount
            }));

            await permit2Contract.permitTransferFrom(permitBatchTransferFrom, tokenPermissions, eoaAddress, signature)
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

    async getSingleTransferPermitData(chainId: ChainId, eoaAddress: string, tokenData: TokenData, scwAddress: string, provider: ethers.providers.JsonRpcProvider) {
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

    async getBatchTransferPermitData(chainId: ChainId, eoaAddress: string, tokenData: TokenData[], scwAddress: string, provider: ethers.providers.JsonRpcProvider) {
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
