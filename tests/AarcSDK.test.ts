import { BigNumber, ethers } from 'ethers';
import { PermitHelper } from '../src/helpers';
import { AarcSDK } from '../src'; // Adjust the path according to your directory structure

// Mock the PermitHelper class

jest.mock('../src/helpers/PermitHelper', () => {
    return {
        PermitHelper: jest.fn().mockImplementation(() => {
            return {
                performTokenTransfer: jest.fn().mockResolvedValue('token-transfer-0x1234567890'),
                permitTransferFrom: jest.fn().mockResolvedValue('permit-token-transfer-0x1234567890'),
                performNFTTransfer: jest.fn().mockResolvedValue('nft-transfer-0x1234567890'),
                performNativeTransfer: jest.fn().mockResolvedValue('native-transfer-0x1234567890'),
                getBatchTransferPermitData: jest.fn().mockImplementation(async (batchTransferPermitDto) => {
                    const { spenderAddress } = batchTransferPermitDto;
                    // Simulate the behavior of the function based on your test requirements
                    const signature = 'mockedSignature'; // Replace with your mocked signature
          
                    return {
                      permitBatchTransferFrom: {
                        permitted: [{"token":"0xf4ca1a280ebccdaebf80e3c128e55de01fabd893","amount":{"type":"BigNumber","hex":"0x989680"}},{"token":"0xbb8db535d685f2742d6e84ec391c63e6a1ce3593","amount":{"type":"BigNumber","hex":"0x174876e800"}}],
                        spender: spenderAddress,
                        deadline: 12345678,
                        nonce: 6623,
                      },
                      signature,
                    };
                  })
            };
        }),
    };
});


describe("Aarc SDK executeMigration", () => {
    let receiver: string;
    let aarcSDK: any;

    const privateKey = '29822a62aaeb9a16e9d1fd88412bac4fe37574bbcb245b4232e3b3612496fd96';
    const rpcURl = 'https://ethereum-goerli.publicnode.com';
    const apiKey = "097ce80e-4dcc-4265-8aa7-2ed0e19901ff";
    const provider = new ethers.providers.JsonRpcProvider(rpcURl);
    const signer = new ethers.Wallet(privateKey, provider);
    const eoaAddress = signer.address;
    receiver = '0xe7a35625b23710C131Fa38c92CF5F7793c50604A';

    beforeEach(async () => {
        aarcSDK = new AarcSDK({
            rpcUrl: rpcURl,
            chainId: 5,
            apiKey: apiKey,
        });

        // Mocking the fetchBalances function
        aarcSDK.fetchBalances = jest.fn().mockResolvedValue({
            code: 200,
            data: [
                {
                    decimals: 6,
                    name: 'USDA',
                    symbol: 'USDA',
                    token_address: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
                    balance: { type: 'BigNumber', hex: '0x989680' },
                    type: 'cryptocurrency',
                    nft_data: null,
                    permit2Allowance: { type: 'BigNumber', hex: '0x0c9f2c9cd04674edd2f5bf5642' },
                    permitExist: true,
                },
            ],
            message: 'Success',
        });
    }, 30000);

    it('should handle a successful migration', async () => {
        const executeMigrationDto = {
            senderSigner: signer,
            transferTokenDetails: [
                { tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893', amount: BigNumber.from('1000000') },
                { tokenAddress: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593', amount: BigNumber.from('2000000000') },
            ],
            receiverAddress: receiver,
        };

        let migrationResponse;

        migrationResponse = await aarcSDK.executeMigration(executeMigrationDto);
        expect(Array.isArray(migrationResponse)).toBe(true);
        expect(migrationResponse).toHaveLength(2);

        expect(aarcSDK.permitHelper.performTokenTransfer).toHaveBeenCalled();

        expect(aarcSDK.permitHelper.performTokenTransfer).toHaveBeenCalledTimes(1);

        expect(aarcSDK.permitHelper.performTokenTransfer).toHaveBeenCalledWith({
            senderSigner: signer,
            recipientAddress: receiver,
            tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
            amount: BigNumber.from(0x0f4240)
        }
        );

        // Verify the content of the response
        expect(migrationResponse[0]).toEqual({
            tokenAddress: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
            amount: expect.objectContaining({
                _hex: '0x77359400',
            }),
            message: 'Supplied token does not exist',
        });

        expect(migrationResponse[1]).toEqual({
            tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
            amount: expect.objectContaining({
                _hex: '0x0f4240',
            }),
            message: 'Token transfer successful',
            txHash: 'token-transfer-0x1234567890'
        });
        
    }, 30000);

    it('should handle a successful migration for native token only', async () => {
        // Mock a different implementation for fetchBalances
        aarcSDK.fetchBalances = jest.fn().mockResolvedValue({
            code: 200,
            data: [
                {
                    decimals: 18,
                    name: 'ETH',
                    symbol: 'ETH',
                    token_address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
                    balance: { type: 'BigNumber', hex: '0x989680' },
                    type: 'dust',
                    nft_data: null,
                    permit2Allowance: { type: 'BigNumber', hex: '0x0c9f2c9cd04674edd2f5bf5642' },
                    permitExist: true,
                },
                {
                    decimals: 6,
                    name: 'USDA',
                    symbol: 'USDA',
                    token_address: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
                    balance: { type: 'BigNumber', hex: '0x989680' },
                    type: 'cryptocurrency',
                    nft_data: null,
                    permit2Allowance: { type: 'BigNumber', hex: '0x0c9f2c9cd04674edd2f5bf5642' },
                    permitExist: true,
                },
            ],
            message: 'Success',
        });

        const executeMigrationDto = {
            senderSigner: signer,
            transferTokenDetails: [
                { tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', amount: BigNumber.from('100') },
            ],
            receiverAddress: receiver,
        };

        let migrationResponse;

        migrationResponse = await aarcSDK.executeMigration(executeMigrationDto);
        expect(Array.isArray(migrationResponse)).toBe(true);
        expect(migrationResponse).toHaveLength(1);

        expect(aarcSDK.permitHelper.performNativeTransfer).toHaveBeenCalled();

        expect(aarcSDK.permitHelper.performNativeTransfer).toHaveBeenCalledWith(
            {
                senderSigner: signer,
                recipientAddress: receiver,
                amount: BigNumber.from('0x50')
            }
        );

        expect(aarcSDK.permitHelper.performNativeTransfer).toHaveBeenCalledTimes(1);

        expect(migrationResponse[0]).toEqual({
            tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            amount: expect.objectContaining({
                _hex: '0x50',
            }),
            message: 'Native transfer successful',
            txHash: 'native-transfer-0x1234567890'
        });
    }, 30000);


    it('should transfer token and native sucessfully', async () => {
        // Mock a different implementation for fetchBalances
        aarcSDK.fetchBalances = jest.fn().mockResolvedValue({
            code: 200,
            data: [
                {
                    decimals: 18,
                    name: 'ETH',
                    symbol: 'ETH',
                    token_address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
                    balance: { type: 'BigNumber', hex: '0x989680' },
                    type: 'dust',
                    nft_data: null,
                    permit2Allowance: { type: 'BigNumber', hex: '0x0c9f2c9cd04674edd2f5bf5642' },
                    permitExist: true,
                },
                {
                    decimals: 6,
                    name: 'USDA',
                    symbol: 'USDA',
                    token_address: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
                    balance: { type: 'BigNumber', hex: '0x989680' },
                    type: 'cryptocurrency',
                    nft_data: null,
                    permit2Allowance: { type: 'BigNumber', hex: '0x0c9f2c9cd04674edd2f5bf5642' },
                    permitExist: true,
                },
            ],
            message: 'Success',
        });

        const executeMigrationDto = {
            senderSigner: signer,
            receiverAddress: receiver,
        };

        let migrationResponse;

        migrationResponse = await aarcSDK.executeMigration(executeMigrationDto);
        expect(Array.isArray(migrationResponse)).toBe(true);
        expect(migrationResponse).toHaveLength(2);

        expect(aarcSDK.permitHelper.performNativeTransfer).toHaveBeenCalled();

        expect(aarcSDK.permitHelper.performNativeTransfer).toHaveBeenCalledWith(
            {
                senderSigner: signer,
                recipientAddress: receiver,
                amount: BigNumber.from('0x7a1200')
            }
        );

        expect(aarcSDK.permitHelper.performTokenTransfer).toHaveBeenCalled();

        expect(aarcSDK.permitHelper.performTokenTransfer).toHaveBeenCalledTimes(1);


        expect(aarcSDK.permitHelper.performTokenTransfer).toHaveBeenCalledWith(
            {
                senderSigner: signer,
                recipientAddress: receiver,
                tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
                amount: {type: 'BigNumber', hex: '0x989680'}
            }
        );

        expect(aarcSDK.permitHelper.performNativeTransfer).toHaveBeenCalledTimes(1);

        expect(migrationResponse[0]).toEqual({
            tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
            amount: { type: 'BigNumber', hex: '0x989680' },
            message: 'Token transfer successful',
            txHash: 'token-transfer-0x1234567890'
        });
        
        expect(migrationResponse[1]).toEqual({
            tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            amount: expect.objectContaining({
                _hex: '0x7a1200',
            }),
            message: 'Native transfer successful',
            txHash: 'native-transfer-0x1234567890'
        });

    }, 30000);
});
