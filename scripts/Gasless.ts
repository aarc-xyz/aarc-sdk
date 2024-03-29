import { BigNumber, ethers } from "ethers";
import { AarcSDK } from '../src';
import { RPC_URL, PRIVATE_KEY, API_KEY, tokenAddresses, TokenName, ChainID, nativeTokenAddresses, MUMBAI_NFT_ADDRESS, validateEnvironmentVariables } from "./Constants";
import { ERC20_ABI } from '../src/utils/abis/ERC20.abi';
import { PERMIT2_CONTRACT_ADDRESS } from "../src/utils/Constants";
import { hashMessage } from  "@ethersproject/hash"
import { TransferTokenDetails } from "../src/utils/AarcTypes";
import { ERC721_ABI } from "../src/utils/abis/ERC721.abi";
import { delay } from "../src/helpers";

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

    let balances = await aarcSDK.fetchBalances(eoaAddress);
    console.log(balances);

    if (balances.data && balances.data.length > 0) {
        const token = balances.data.find(token => {
            return token.token_address.toLowerCase() === nativeTokenAddresses[chainId].toLowerCase()
        })
        console.log('token ', token);

        if (!token || BigNumber.from(token.balance).lte(BigNumber.from(0))) {
            console.log('insufficient balance for transaction')
            console.log('balance is ', token?.balance.toNumber())
            console.log('please send some token to proceed further')
            return
        }
        else {
            for (const tokenName in tokenAddresses[chainId]) {
                console.log(' tokenName ', tokenName);
                const { address, decimals } = tokenAddresses[chainId][tokenName as keyof typeof TokenName];

                if (!address)
                continue
                
                const token = balances.data.find(token => {
                    return token.token_address.toLowerCase() === address.toLowerCase()
                })
                console.log('token ', token);

                if (!token || BigNumber.from(token.balance).lte(BigNumber.from(0))) {
                    const tokenContract = new ethers.Contract(
                        address,
                        ERC20_ABI,
                        signer,
                    );
                    try {
                        await tokenContract.mint(eoaAddress, BigNumber.from(1000).mul(10).pow(decimals))
                        console.log(tokenName, 'token minted successfully');

                    } catch (error) {
                        console.error('error minting token', error)
                    }
                }
            }
            const resultSet = await aarcSDK.executeMigrationGasless({
                senderSigner: signer,
                receiverAddress: "0x786E6045eacb96cAe0259cd761e151b68B85bdA7",
                transferTokenDetails: [
                    { tokenAddress: tokenAddresses[chainId].USDA1.address, amount: BigNumber.from("100000000")._hex },
                    { tokenAddress: tokenAddresses[chainId].USDB.address, amount: BigNumber.from("100000000")._hex },
                    { tokenAddress: tokenAddresses[chainId].USDA2.address, amount: BigNumber.from("500000000")._hex },
                    { tokenAddress: tokenAddresses[chainId].USDC.address, amount: BigNumber.from("30000")._hex },
                ]
            })
            console.log('ResultSet ', resultSet);
            for (const result of resultSet) {
                if (
                    !result ||
                    typeof result !== 'object' ||
                    !('tokenAddress' in result) ||
                    !('amount' in result && typeof result.amount === 'object' && 'hex' in result.amount) ||
                    !('message' in result && typeof result.message === 'string') ||
                    !('taskId' in result && typeof result.taskId === 'string') ||
                    (result.message !== 'Transaction sent' &&
                        result.message !== 'Transaction Added to Queue' &&
                        result.message !== 'Token Permit tx Sent')
                ) {
                    throw new Error('Multi Erc20 Transfer Failed');
                }
            }
        }
    } else {
        console.log('insufficient native balance for transaction')
        console.log('please send some token to proceed further')
        return
    }
}

export const transferErc20Tokens = async () => {
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

    let balances = await aarcSDK.fetchBalances(eoaAddress);
    console.log(balances);

    let transferTokenDetails: TransferTokenDetails[] = []

    for (const tokenName in tokenAddresses[chainId]) {
        console.log(' tokenName ', tokenName);
        const { address, decimals } = tokenAddresses[chainId][tokenName as keyof typeof TokenName];
        const token = balances.data.find(token => {
            return token.token_address.toLowerCase() === address.toLowerCase()
        })
        console.log('token ', token);


        if (token) {
            transferTokenDetails.push({ tokenAddress: address, amount: (token.balance)._hex })
        }

    }

    if (transferTokenDetails.length > 0) {
        const resultSet = await aarcSDK.executeMigrationGasless({
            senderSigner: signer,
            receiverAddress: "0x786E6045eacb96cAe0259cd761e151b68B85bdA7",
            transferTokenDetails
        })
        console.log('ResultSet ', resultSet);
        for (const result of resultSet) {
            if (
                !result ||
                typeof result !== 'object' ||
                !('tokenAddress' in result) ||
                !('message' in result && typeof result.message === 'string') ||
                !('taskId' in result && typeof result.taskId === 'string') ||
                (result.message !== 'Transaction sent' &&
                result.message !== 'Insufficient balance' &&
                result.message !== 'Transaction Added to Queue' &&
                result.message !== 'Token Permit tx Sent')
            ) {
                throw new Error('Erc20 Transfer Failed');
            }
        }
    }
}

export const transferFullNativeOnly = async () => {
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

    let balances = await aarcSDK.fetchBalances(eoaAddress);
    console.log(balances);

    if (balances.data && balances.data.length > 0) {
        const token = balances.data.find(token => {
            return token.token_address.toLowerCase() === nativeTokenAddresses[chainId].toLowerCase()
        })
        console.log('token ', token);

        if (!token || BigNumber.from(token.balance).lte(BigNumber.from(0))) {
            console.log('insufficient balance for transaction')
            console.log('balance is ', token?.balance.toNumber())
            console.log('please send some token to proceed further')
            return
        }
        else {
            const resultSet = await aarcSDK.executeMigrationGasless({
                senderSigner: signer,
                receiverAddress: '0x786E6045eacb96cAe0259cd761e151b68B85bdA7',
                transferTokenDetails: [{ tokenAddress: '0x0000000000000000000000000000000000001010', amount: BigNumber.from(1000)._hex }]
            })
            console.log('ResultSet ', resultSet);

            for (const result of resultSet) {
                if (
                    !result ||
                    typeof result !== 'object' ||
                    !('tokenAddress' in result) ||
                    !('message' in result && typeof result.message === 'string') ||
                    !('txHash' in result && typeof result.txHash === 'string') ||
                    (result.message !== 'Transaction sent' &&
                        result.message !== 'Native transfer tx sent')
                ) {
                    throw new Error('Native Transfer Failed');
                }
            }

        }
    } else {
        console.log('insufficient native balance for transaction')
        console.log('please send some token to proceed further')
        return
    }
}

export const transferNftsOnly = async () => {
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

    let balances = await aarcSDK.fetchBalances(eoaAddress);
    console.log(balances);

    if (balances.data && balances.data.length > 0) {
        const token = balances.data.find(token => {
            return token.token_address.toLowerCase() === nativeTokenAddresses[chainId].toLowerCase()
        })
        console.log('token ', token);

        if (!token || BigNumber.from(token.balance).lte(BigNumber.from(0))) {
            console.log('insufficient balance for transaction')
            console.log('balance is ', token?.balance.toNumber())
            console.log('please send some token to proceed further')
            return
        }
        else {
            const nftMintAmount = 1
            const tokenIds: string[] = []
            const tokenContract = new ethers.Contract(
                MUMBAI_NFT_ADDRESS,
                ERC721_ABI,
                signer,
            );
            const ts = (await tokenContract.totalSupply()).sub(1)
            console.log('nft total supply is', ts.toString())

            // if ( !ts.isNegative() )
            // for (let index = 0; index < nftMintAmount; index++) {
            //     const tokenId = ts.add(index).add(1);
            //     tokenIds.push(tokenId.toString())
            // }
            try {
                await tokenContract.mint(BigNumber.from(nftMintAmount))
                console.log('NFT minted successfully');
                await delay(5000)
            } catch (error) {
                console.error('error minting token', error)
                return
            }
            const resultSet = await aarcSDK.executeMigrationGasless({
                senderSigner: signer,
                receiverAddress: '0x786E6045eacb96cAe0259cd761e151b68B85bdA7',
                transferTokenDetails: [{ tokenAddress: MUMBAI_NFT_ADDRESS }]
            })
            console.log('ResultSet ', resultSet);

            for (const result of resultSet) {
                if (
                    !result ||
                    typeof result !== 'object' ||
                    !('tokenAddress' in result) ||
                    !('message' in result && typeof result.message === 'string') ||
                    !('txHash' in result && typeof result.txHash === 'string') ||
                    (result.message !== 'Transaction sent' &&
                    result.message !== 'Insufficient balance' &&
                        result.message !== 'Nft transfer tx sent')
                ) {
                    throw new Error('Nft Transfer Failed');
                }
            }
            
        }
    } else {
        console.log('insufficient native balance for transaction')
        console.log('please send some token to proceed further')
        return
    }
}

export const signAndVerifyMessage = async () => {
    let provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const message = "Signing for Aarc";
    // Message we are signing
    const walletInst = new ethers.Wallet(PRIVATE_KEY, provider);
    // Unlike Web3.js, Ethers seperates the provider instance and wallet instance, so we must also create a wallet instance
    const signMessage = await walletInst.signMessage(message);
    console.log('signMessage ', signMessage)
    // Using our wallet instance which holds our private key, we call the Ethers signMessage function and pass our message inside
    // const messageSigner = await signMessage.then((value) => {
    const verifySigner = ethers.utils.recoverAddress(hashMessage(message), signMessage);
    return verifySigner;
        // Now we verify the signature by calling the recoverAddress function which takes a message hash and signature hash and returns the signer address
    // });
}

const executeTransfers = async () => {
    validateEnvironmentVariables()
    // await signAndVerifyMessage()
    // await decreaseAllowances()
    await mintAndTransferErc20Tokens()
    await transferErc20Tokens()
    await transferFullNativeOnly()
    await transferNftsOnly()
};

executeTransfers().then(() => {
    console.log('All transfers executed successfully.');
}).catch((error) => {
    console.error('Error during transfers:', error);
});