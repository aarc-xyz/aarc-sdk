import { BigNumber, ethers } from "ethers";
import { AarcSDK } from '../src';
import { RPC_URL, PRIVATE_KEY, API_KEY, tokenAddresses, TokenName, ChainID, nativeTokenAddresses, MUMBAI_NFT_ADDRESS, validateEnvironmentVariables } from "./Constants";
import { ERC20_ABI } from '../src/utils/abis/ERC20.abi';
import { PERMIT2_CONTRACT_ADDRESS } from "../src/utils/Constants";
import { hashMessage } from  "@ethersproject/hash"

export const decreaseAllowances = async () => {
    let provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    let signer = new ethers.Wallet(PRIVATE_KEY, provider);
    const chainId: ChainID = (await provider.getNetwork()).chainId

    for (const tokenName in tokenAddresses[chainId]) {
        const { address } = tokenAddresses[chainId][tokenName as keyof typeof TokenName];
        const tokenContract = new ethers.Contract(
            address,
            ERC20_ABI,
            signer,
        );
        try {
            await tokenContract.decreaseAllowance(PERMIT2_CONTRACT_ADDRESS, ethers.constants.MaxUint256)
            console.log(tokenName, 'Allowance decreased successfully');

        } catch (error) {
            console.error('error decreasing token', error)
        }
    }
}

export const mintAndTransferErc20Tokens = async () => {
    let provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    let signer = new ethers.Wallet(PRIVATE_KEY, provider);
    let eoaAddress = signer.address;
    const chainId: ChainID = (await provider.getNetwork()).chainId
    console.log(' chainId ', chainId);


    let aarcSDK = new AarcSDK({
        rpcUrl: RPC_URL,
        chainId,
        apiKey: API_KEY,
    });
    const resultSet = await aarcSDK.executeForwardTransaction({
        senderSigner: signer,
        receiverAddress: "0x786E6045eacb96cAe0259cd761e151b68B85bdA7",
        transferTokenDetails: [
            { tokenAddress: tokenAddresses[chainId].USDA1.address, amount: BigNumber.from("100000000")._hex },
            { tokenAddress: tokenAddresses[chainId].USDB.address, amount: BigNumber.from("100000000")._hex },
            { tokenAddress: tokenAddresses[chainId].USDA2.address, amount: BigNumber.from("500000000")._hex },
            { tokenAddress: tokenAddresses[chainId].USDC.address, amount: BigNumber.from("300000")._hex },
        ]
    })
    console.log('ResultSet ', resultSet);
}


const executeTransfers = async () => {
    validateEnvironmentVariables()
    // await decreaseAllowances()
    await mintAndTransferErc20Tokens()
};

executeTransfers().then(() => {
    console.log('All transfers executed successfully.');
}).catch((error) => {
    console.error('Error during transfers:', error);
});