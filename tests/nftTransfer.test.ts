import { BigNumber, ethers } from 'ethers';
import { PermitHelper } from '../src/helpers';
import { AarcSDK } from '../src'; // Adjust the path according to your directory structure

// Mock the PermitHelper class

jest.mock('../src/helpers/PermitHelper', () => {
  return {
    PermitHelper: jest.fn().mockImplementation(() => {
      return {
        performTokenTransfer: jest
          .fn()
          .mockResolvedValue('token-transfer-0x1234567890'),
        permitTransferFrom: jest
          .fn()
          .mockResolvedValue('permit-token-transfer-0x1234567890'),
        performNFTTransfer: jest
          .fn()
          .mockResolvedValue('nft-transfer-0x1234567890'),
        performNativeTransfer: jest
          .fn()
          .mockResolvedValue('native-transfer-0x1234567890'),
        getBatchTransferPermitData: jest
          .fn()
          .mockImplementation(async (batchTransferPermitDto) => {
            const { spenderAddress } = batchTransferPermitDto;
            // Simulate the behavior of the function based on your test requirements
            const signature = 'mockedSignature'; // Replace with your mocked signature

            return {
              permitBatchTransferFrom: {
                permitted: [
                  {
                    token: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
                    amount: { type: 'BigNumber', hex: '0x989680' },
                  },
                  {
                    token: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
                    amount: { type: 'BigNumber', hex: '0x174876e800' },
                  },
                ],
                spender: spenderAddress,
                deadline: 12345678,
                nonce: 6623,
              },
              signature,
            };
          }),
      };
    }),
  };
});

describe('Aarc SDK nft transfer', () => {
  let receiver: string;
  let aarcSDK: any;

  const privateKey =
    '29822a62aaeb9a16e9d1fd88412bac4fe37574bbcb245b4232e3b3612496fd96';
  const rpcURl = 'https://ethereum-goerli.publicnode.com';
  const apiKey = '097ce80e-4dcc-4265-8aa7-2ed0e19901ff';
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
          permit2Allowance: {
            type: 'BigNumber',
            hex: '0x0c9f2c9cd04674edd2f5bf5642',
          },
          permitExist: true,
        },
      ],
      message: 'Success',
    });
  }, 30000);

  it('should transfer nfts sucessfully', async () => {
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
          permit2Allowance: {
            type: 'BigNumber',
            hex: '0x0c9f2c9cd04674edd2f5bf5642',
          },
          permitExist: true,
        },
        {
          decimals: 0,
          name: 'Goerli_NFTS',
          symbol: 'G_NFTS',
          token_address: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
          balance: { type: 'BigNumber', hex: '0x03' },
          type: 'nft',
          nft_data: [
            { image: 'something', tokenId: '1' },
            { image: 'something', tokenId: '2' },
            { image: 'something', tokenId: '3' },
          ],
          permit2Allowance: '0',
          permitExist: false,
        },
        {
          decimals: 6,
          name: 'USDA',
          symbol: 'USDA',
          token_address: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
          balance: { type: 'BigNumber', hex: '0x989680' },
          type: 'cryptocurrency',
          nft_data: null,
          permit2Allowance: {
            type: 'BigNumber',
            hex: '0x0c9f2c9cd04674edd2f5bf5642',
          },
          permitExist: true,
        },
      ],
      message: 'Success',
    });

    const executeMigrationDto = {
      senderSigner: signer,
      receiverAddress: receiver,
      transferTokenDetails: [
        {
          tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
          tokenIds: ['1', '2'],
        },
      ],
    };

    let migrationResponse;

    migrationResponse = await aarcSDK.executeMigration(executeMigrationDto);
    expect(Array.isArray(migrationResponse)).toBe(true);
    expect(migrationResponse).toHaveLength(2);

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalled();
    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledTimes(2);

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledWith({
      senderSigner: signer,
      recipientAddress: receiver,
      tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
      tokenId: '1',
    });

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledWith({
      senderSigner: signer,
      recipientAddress: receiver,
      tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
      tokenId: '2',
    });

    expect(migrationResponse[0]).toEqual({
      tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
      amount: 1,
      tokenId: '1',
      message: 'Nft transfer successful',
      txHash: 'nft-transfer-0x1234567890',
    });

    expect(migrationResponse[1]).toEqual({
      tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
      amount: 1,
      tokenId: '2',
      message: 'Nft transfer successful',
      txHash: 'nft-transfer-0x1234567890',
    });
  }, 30000);

  it('should handle amount edge case in nft transfers', async () => {
    // Mock a different implementation for fetchBalances
    aarcSDK.fetchBalances = jest.fn().mockResolvedValue({
        code: 200,
        data: [
            {
                decimals: 0,
                name: 'Goerli_NFTS',
                symbol: 'G_NFTS',
                token_address: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
                balance: {type: 'BigNumber', hex: '0x03'},
                type: 'nft',
                nft_data: [{image: "something", tokenId: "1"}, {image: "something", tokenId: "2"}, {image: "something", tokenId: "3"}],
                permit2Allowance: "0",
                permitExist: false
            },
            {
                decimals: 0,
                name: 'Random_NFTS',
                symbol: 'G_NFTS',
                token_address: '0x897ca55b9ef0b3094e8fa82435b3b4c50d713043',
                balance: {type: 'BigNumber', hex: '0x03'},
                type: 'nft',
                nft_data: [{image: "something", tokenId: "4"}, {image: "something", tokenId: "8"}, {image: "something", tokenId: "11"}],
                permit2Allowance: "0",
                permitExist: false
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
        transferTokenDetails: [
            {tokenAddress:"0x932ca55b9ef0b3094e8fa82435b3b4c50d713043", tokenIds: ["1", "2"]},
            {tokenAddress:"0x897ca55b9ef0b3094e8fa82435b3b4c50d713043", amount: BigNumber.from(100), tokenIds: ["4", "8", "11"]},
        ]
    };

    let migrationResponse;

    migrationResponse = await aarcSDK.executeMigration(executeMigrationDto);
    expect(Array.isArray(migrationResponse)).toBe(true);
    expect(migrationResponse).toHaveLength(5);

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalled();
    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledTimes(5);

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledWith(
        {
            senderSigner: signer,
            recipientAddress: receiver,
            tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
            tokenId: "1"
        }
    );

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledWith(
        {
            senderSigner: signer,
            recipientAddress: receiver,
            tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
            tokenId: "2"
        }
    );

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledWith(
        {
            senderSigner: signer,
            recipientAddress: receiver,
            tokenAddress: '0x897ca55b9ef0b3094e8fa82435b3b4c50d713043',
            tokenId: "4"
        }
    );

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledWith(
        {
            senderSigner: signer,
            recipientAddress: receiver,
            tokenAddress: '0x897ca55b9ef0b3094e8fa82435b3b4c50d713043',
            tokenId: "8"
        }
    );

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledWith(
        {
            senderSigner: signer,
            recipientAddress: receiver,
            tokenAddress: '0x897ca55b9ef0b3094e8fa82435b3b4c50d713043',
            tokenId: "11"
        }
    );

    expect(migrationResponse[0]).toEqual({
        tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
        amount: 1,
        tokenId: '1',
        message: 'Nft transfer successful',
        txHash: 'nft-transfer-0x1234567890'
    });
    
    expect(migrationResponse[1]).toEqual({
        tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
        amount: 1,
        tokenId: '2',
        message: 'Nft transfer successful',
        txHash: 'nft-transfer-0x1234567890'
    });

    expect(migrationResponse[2]).toEqual({
        tokenAddress: '0x897ca55b9ef0b3094e8fa82435b3b4c50d713043',
        amount: 1,
        tokenId: '4',
        message: 'Nft transfer successful',
        txHash: 'nft-transfer-0x1234567890'
    });

    expect(migrationResponse[3]).toEqual({
        tokenAddress: '0x897ca55b9ef0b3094e8fa82435b3b4c50d713043',
        amount: 1,
        tokenId: '8',
        message: 'Nft transfer successful',
        txHash: 'nft-transfer-0x1234567890'
    });

    expect(migrationResponse[4]).toEqual({
        tokenAddress: '0x897ca55b9ef0b3094e8fa82435b3b4c50d713043',
        amount: 1,
        tokenId: '11',
        message: 'Nft transfer successful',
        txHash: 'nft-transfer-0x1234567890'
    });

  }, 30000);

  it('should handle amount edge case in nft transfers gasless', async () => {
    // Mock a different implementation for fetchBalances
    aarcSDK.fetchBalances = jest.fn().mockResolvedValue({
        code: 200,
        data: [
            {
                decimals: 0,
                name: 'Goerli_NFTS',
                symbol: 'G_NFTS',
                token_address: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
                balance: {type: 'BigNumber', hex: '0x03'},
                type: 'nft',
                nft_data: [{image: "something", tokenId: "1"}, {image: "something", tokenId: "2"}, {image: "something", tokenId: "3"}],
                permit2Allowance: "0",
                permitExist: false
            },
            {
                decimals: 0,
                name: 'Random_NFTS',
                symbol: 'G_NFTS',
                token_address: '0x897ca55b9ef0b3094e8fa82435b3b4c50d713043',
                balance: {type: 'BigNumber', hex: '0x03'},
                type: 'nft',
                nft_data: [{image: "something", tokenId: "4"}, {image: "something", tokenId: "8"}, {image: "something", tokenId: "11"}],
                permit2Allowance: "0",
                permitExist: false
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

    const executeMigrationGaslessDto = {
        senderSigner: signer,
        receiverAddress: receiver,
        transferTokenDetails: [
            {tokenAddress:"0x932ca55b9ef0b3094e8fa82435b3b4c50d713043", tokenIds: ["1", "2"]},
            {tokenAddress:"0x897ca55b9ef0b3094e8fa82435b3b4c50d713043", amount: BigNumber.from(100), tokenIds: ["4", "8", "11"]},
        ],
        gelatoApiKey:"1234567890"
    };

    let migrationResponse;

    migrationResponse = await aarcSDK.executeMigrationGasless(executeMigrationGaslessDto);
    expect(Array.isArray(migrationResponse)).toBe(true);
    expect(migrationResponse).toHaveLength(5);

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalled();
    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledTimes(5);

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledWith(
        {
            senderSigner: signer,
            recipientAddress: receiver,
            tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
            tokenId: "1"
        }
    );

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledWith(
        {
            senderSigner: signer,
            recipientAddress: receiver,
            tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
            tokenId: "2"
        }
    );

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledWith(
        {
            senderSigner: signer,
            recipientAddress: receiver,
            tokenAddress: '0x897ca55b9ef0b3094e8fa82435b3b4c50d713043',
            tokenId: "4"
        }
    );

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledWith(
        {
            senderSigner: signer,
            recipientAddress: receiver,
            tokenAddress: '0x897ca55b9ef0b3094e8fa82435b3b4c50d713043',
            tokenId: "8"
        }
    );

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledWith(
        {
            senderSigner: signer,
            recipientAddress: receiver,
            tokenAddress: '0x897ca55b9ef0b3094e8fa82435b3b4c50d713043',
            tokenId: "11"
        }
    );

    expect(migrationResponse[0]).toEqual({
        tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
        amount: 1,
        tokenId: '1',
        message: 'Nft transfer successful',
        txHash: 'nft-transfer-0x1234567890'
    });
    
    expect(migrationResponse[1]).toEqual({
        tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
        amount: 1,
        tokenId: '2',
        message: 'Nft transfer successful',
        txHash: 'nft-transfer-0x1234567890'
    });

    expect(migrationResponse[2]).toEqual({
        tokenAddress: '0x897ca55b9ef0b3094e8fa82435b3b4c50d713043',
        amount: 1,
        tokenId: '4',
        message: 'Nft transfer successful',
        txHash: 'nft-transfer-0x1234567890'
    });

    expect(migrationResponse[3]).toEqual({
        tokenAddress: '0x897ca55b9ef0b3094e8fa82435b3b4c50d713043',
        amount: 1,
        tokenId: '8',
        message: 'Nft transfer successful',
        txHash: 'nft-transfer-0x1234567890'
    });

    expect(migrationResponse[4]).toEqual({
        tokenAddress: '0x897ca55b9ef0b3094e8fa82435b3b4c50d713043',
        amount: 1,
        tokenId: '11',
        message: 'Nft transfer successful',
        txHash: 'nft-transfer-0x1234567890'
    });

  }, 30000);

  it('should throw an errow in case duplicate entries provided', async () => {
    // Mock a different implementation for fetchBalances
    aarcSDK.fetchBalances = jest.fn().mockResolvedValue({
        code: 200,
        data: [
            {
                decimals: 0,
                name: 'Goerli_NFTS',
                symbol: 'G_NFTS',
                token_address: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
                balance: {type: 'BigNumber', hex: '0x03'},
                type: 'nft',
                nft_data: [{image: "something", tokenId: "1"}, {image: "something", tokenId: "2"}, {image: "something", tokenId: "3"}],
                permit2Allowance: "0",
                permitExist: false
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
        transferTokenDetails: [
            {tokenAddress:"0x932ca55b9ef0b3094e8fa82435b3b4c50d713043", tokenIds: ["1"]},
            {tokenAddress:"0x932ca55b9ef0b3094e8fa82435b3b4c50d713043", tokenIds: ["2"]},
        ]
    };

    let migrationResponse;

    migrationResponse = await aarcSDK.executeMigration(executeMigrationDto);
    expect(Array.isArray(migrationResponse)).toBe(true);
    expect(migrationResponse).toHaveLength(2);

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalled();
    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledTimes(1);

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledWith(
        {
            senderSigner: signer,
            recipientAddress: receiver,
            tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
            tokenId: "1"
        }
    );

    expect(migrationResponse[0]).toEqual({
        tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
        tokenId: '2',
        message: 'Duplicate token address',
    });

    expect(migrationResponse[1]).toEqual({
        tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
        amount: 1,
        tokenId: '1',
        message: 'Nft transfer successful',
        txHash: 'nft-transfer-0x1234567890'
    });

  }, 30000);

  it('should throw an errow in case duplicate entries provided in gasless', async () => {
    // Mock a different implementation for fetchBalances
    aarcSDK.fetchBalances = jest.fn().mockResolvedValue({
        code: 200,
        data: [
            {
                decimals: 0,
                name: 'Goerli_NFTS',
                symbol: 'G_NFTS',
                token_address: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
                balance: {type: 'BigNumber', hex: '0x03'},
                type: 'nft',
                nft_data: [{image: "something", tokenId: "1"}, {image: "something", tokenId: "2"}, {image: "something", tokenId: "3"}],
                permit2Allowance: "0",
                permitExist: false
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

    let migrationResponse;

    const executeGaslessMigrationDto = {
        senderSigner: signer,
        receiverAddress: receiver,
        transferTokenDetails: [
            {tokenAddress:"0x932ca55b9ef0b3094e8fa82435b3b4c50d713043", tokenIds: ["1"]},
            {tokenAddress:"0x932ca55b9ef0b3094e8fa82435b3b4c50d713043", tokenIds: ["2"]},
        ],
        gelatoApiKey:"1234567890"
    };

    migrationResponse = await aarcSDK.executeMigrationGasless(executeGaslessMigrationDto);
    expect(Array.isArray(migrationResponse)).toBe(true);
    expect(migrationResponse).toHaveLength(2);

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalled();
    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledTimes(1);

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledWith(
        {
            senderSigner: signer,
            recipientAddress: receiver,
            tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
            tokenId: "1"
        }
    );

    expect(migrationResponse[0]).toEqual({
        tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
        tokenId: '2',
        message: 'Duplicate token address',
    });

    expect(migrationResponse[1]).toEqual({
        tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
        amount: 1,
        tokenId: '1',
        message: 'Nft transfer successful',
        txHash: 'nft-transfer-0x1234567890'
    });
    

  }, 30000);

  it('should transfer gasless nfts sucessfully', async () => {
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
          permit2Allowance: {
            type: 'BigNumber',
            hex: '0x0c9f2c9cd04674edd2f5bf5642',
          },
          permitExist: true,
        },
        {
          decimals: 0,
          name: 'Goerli_NFTS',
          symbol: 'G_NFTS',
          token_address: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
          balance: { type: 'BigNumber', hex: '0x03' },
          type: 'nft',
          nft_data: [
            { image: 'something', tokenId: '1' },
            { image: 'something', tokenId: '2' },
            { image: 'something', tokenId: '3' },
          ],
          permit2Allowance: '0',
          permitExist: false,
        },
        {
          decimals: 6,
          name: 'USDA',
          symbol: 'USDA',
          token_address: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
          balance: { type: 'BigNumber', hex: '0x989680' },
          type: 'cryptocurrency',
          nft_data: null,
          permit2Allowance: {
            type: 'BigNumber',
            hex: '0x0c9f2c9cd04674edd2f5bf5642',
          },
          permitExist: true,
        },
      ],
      message: 'Success',
    });

    const executeMigrationGaslessDto = {
      senderSigner: signer,
      receiverAddress: receiver,
      transferTokenDetails: [
        {
          tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
          tokenIds: ['1', '2'],
        },
      ],
      gelatoApiKey: '1234567890',
    };

    let migrationResponse;

    migrationResponse = await aarcSDK.executeMigrationGasless(
      executeMigrationGaslessDto,
    );
    expect(Array.isArray(migrationResponse)).toBe(true);
    expect(migrationResponse).toHaveLength(2);

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalled();
    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledTimes(2);

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledWith({
      senderSigner: signer,
      recipientAddress: receiver,
      tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
      tokenId: '1',
    });

    expect(aarcSDK.permitHelper.performNFTTransfer).toHaveBeenCalledWith({
      senderSigner: signer,
      recipientAddress: receiver,
      tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
      tokenId: '2',
    });

    expect(migrationResponse[0]).toEqual({
      tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
      amount: 1,
      tokenId: '1',
      message: 'Nft transfer successful',
      txHash: 'nft-transfer-0x1234567890',
    });

    expect(migrationResponse[1]).toEqual({
      tokenAddress: '0x932ca55b9ef0b3094e8fa82435b3b4c50d713043',
      amount: 1,
      tokenId: '2',
      message: 'Nft transfer successful',
      txHash: 'nft-transfer-0x1234567890',
    });
  }, 30000);

});
