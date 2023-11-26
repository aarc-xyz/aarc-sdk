import { BigNumber, ethers } from "ethers";
import { AarcSDK } from '../src';
import { RPC_URL, PRIVATE_KEY, API_KEY, GELATO_API_KEY, nativeTokenAddress, tokenAddresses, TokenName, ChainID, nativeTokenAddresses, MUMBAI_NFT_ADDRESS } from "./Constants";
import { ERC20_ABI } from '../src/utils/abis/ERC20.abi';
import { ERC721_ABI } from "../src/utils/abis/ERC721.abi";
import { delay } from "../src/helpers";



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
                    { tokenAddress: tokenAddresses[chainId].USDA1.address, amount: BigNumber.from("100000000") },
                    { tokenAddress: tokenAddresses[chainId].USDB.address, amount: BigNumber.from("100000000") },
                    { tokenAddress: tokenAddresses[chainId].USDA2.address, amount: BigNumber.from("500000000") },
                    { tokenAddress: tokenAddresses[chainId].USDC.address, amount: BigNumber.from("30000000000000000") },
                ],
                gelatoApiKey: GELATO_API_KEY
            })
            console.log('ResultSet ', resultSet);
            for (const result of resultSet) {
                if (
                    !result ||
                    typeof result !== 'object' ||
                    !('tokenAddress' in result) ||
                    !('amount' in result) ||
                    result.message !== 'Transaction Successful' ||
                    !result.txHash ||
                    !result.amount
                ) {
                    throw new Error('Erc20 Transfer Failed');
                }
            }
        }
    } else {
        console.log('insufficient native balance for transaction')
        console.log('please send some token to proceed further')
        return
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
                transferTokenDetails: [{tokenAddress: '0x0000000000000000000000000000000000001010'}],
                gelatoApiKey: GELATO_API_KEY
            })
            console.log('ResultSet ', resultSet);

            for (const result of resultSet) {
                if (
                    !result ||
                    typeof result !== 'object' ||
                    !('tokenAddress' in result) ||
                    !('amount' in result) ||
                    result.message !== 'Native transfer successful' ||
                    !result.txHash ||
                    !result.amount
                ) {
                    throw new Error('Transfer Native Token Case Failed');
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
            const nftMintAmount = 2
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
                transferTokenDetails: [{tokenAddress: MUMBAI_NFT_ADDRESS}],
                gelatoApiKey: GELATO_API_KEY
            })
            console.log('ResultSet ', resultSet);

            for (const result of resultSet) {
                if (
                    !result ||
                    typeof result !== 'object' ||
                    !('tokenAddress' in result) ||
                    !('amount' in result) ||
                    result.message !== 'Nft transfer successful' ||
                    !result.txHash ||
                    !result.amount
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

const executeTransfers = async () => {
    await transferErc20Tokens()
    await transferNftsOnly()
    await transferFullNativeOnly()
};

executeTransfers().then(() => {
    console.log('All transfers executed successfully.');
}).catch((error) => {
    console.error('Error during transfers:', error);
});