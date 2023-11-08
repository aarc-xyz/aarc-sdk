import { ERC20_ABI } from "@biconomy/modules";
import { SponsoredCallRequest } from "@gelatonetwork/relay-sdk";
import { BaseRelayParams } from "@gelatonetwork/relay-sdk/dist/lib/types";
import { ethers, Signer } from "ethers";
import { PermitTransferFrom, SignatureTransfer, TokenPermissions, PermitBatchTransferFrom } from "@uniswap/permit2-sdk";
import { ChainId } from "./utils/ChainTypes";
import { PERMIT2_CONTRACT_ADDRESS, PERMIT_FUNCTION_TYPES, PERMIT_FUNCTION_ABI, PERMIT2_DOMAIN_NAME } from "./utils/Constants";
import { TokenData, PermitData, BatchPermitData } from "./utils/types";
import { TypedDataDomain, TypedDataSigner } from '@ethersproject/abstract-signer'
import { Logger } from './utils/Logger';
import { GelatoRelay } from "@gelatonetwork/relay-sdk";

export class PermitHelper {
    signer: Signer
    constructor(_signer: Signer) {
        this.signer = _signer
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

    async signPermitMessage(owner: string, chainId: ChainId, eoaAddress: string, tokenAddress: string): Promise<{ r: string, s: string, v: number, nonce: number, deadline: number }> {
        try {
            const deadline = Math.floor(Date.now() / 1000) + 3600
            // Create a contract instance with the ABI and contract address.
            const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);
            const nonce = await tokenContract.nonces(eoaAddress);

            // set the domain parameters
            const domain = {
                name: await tokenContract.name(),
                version: "1",
                chainId: chainId,
                verifyingContract: tokenContract.address
            };

            // set the Permit type values
            const values = {
                owner: owner,
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
            const { r, s, v, deadline } = await this.signPermitMessage(eoaAddress, chainId, eoaAddress, tokenAddress);

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

            // TODO: need to relay transaction

            // return this.relayTransaction({
            //     chainId: BigInt(chainId),
            //     target: tokenAddress,
            //     data
            // }, gelatoApiKey)
            return true
        } catch (error) {
            Logger.error(`permit transaction error: ${error}`);
            throw error
        }
    }

    async relayTransaction(relayer: GelatoRelay, requestData: BaseRelayParams, gelatoApiKey: string): Promise<boolean> {
        try {
            const request: SponsoredCallRequest = requestData
            const relayResponse = await relayer.sponsoredCall(request, gelatoApiKey);
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

    async getSingleTransferPermitData(provider: ethers.providers.JsonRpcProvider, chainId: ChainId, spenderAddress: string, tokenData: TokenData): Promise<PermitData> {
        const nonce = await provider.getTransactionCount(spenderAddress);
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

    async getBatchTransferPermitData(provider: ethers.providers.JsonRpcProvider, chainId: ChainId, spenderAddress: string, tokenData: TokenData[]): Promise<BatchPermitData> {
        const nonce = await provider.getTransactionCount(spenderAddress);
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