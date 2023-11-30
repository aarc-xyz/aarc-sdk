import { BigNumber, Signer, ethers } from 'ethers';
import { AarcSDK } from '../src'; // Adjust the path according to your directory structure
import * as EstimatorHelper from '../src/helpers/EstimatorHelper';
import { ChainId } from '../src/utils/ChainTypes';
import { PermitHelper } from '../src/helpers/PermitHelper'; // Import the original class
import './EthersMock';
let aarcSDK: any;

describe('Aarc SDK executeMigration', () => {
  const receiver = '0xe7a35625b23710C131Fa38c92CF5F7793c50604A';

  const privateKey =
    '29822a62aaeb9a16e9d1fd88412bac4fe37574bbcb245b4232e3b3612496fd96';
  const rpcUrl = 'https://ethereum-goerli.publicnode.com';
  const apiKey = '097ce80e-4dcc-4265-8aa7-2ed0e19901ff';
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const eoaAddress = signer.address;

  beforeEach(async () => {
    aarcSDK = new AarcSDK({
      rpcUrl: rpcUrl,
      chainId: (await provider.getNetwork()).chainId,
      apiKey: apiKey,
    });

    aarcSDK.permitHelper = new PermitHelper(
      rpcUrl,
      (await provider.getNetwork()).chainId,
    );
    jest
      .spyOn(aarcSDK.permitHelper, 'performTokenTransfer')
      .mockImplementation(() => 'token-transfer-0x1234567890');
    jest
      .spyOn(aarcSDK.permitHelper, 'performNFTTransfer')
      .mockImplementation(() => 'nft-transfer-0x1234567890');
    jest
      .spyOn(aarcSDK.permitHelper, 'performNativeTransfer')
      .mockImplementation(() => 'native-transfer-0x1234567890');
    jest
      .spyOn(aarcSDK.permitHelper, 'getBatchTransferPermitData')
      .mockImplementation((batchTransferPermitDto: any) => {
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
      });
  }, 30000);

  it('should handle an error when fetching balances', async () => {
    aarcSDK.fetchBalances = jest
      .fn()
      .mockRejectedValue(new Error('Failed to fetch balances'));

    const executeMigrationDto = {
      senderSigner: signer,
      receiverAddress: receiver,
    };

    await expect(aarcSDK.executeMigration(executeMigrationDto)).rejects.toThrow(
      'Failed to fetch balances',
    );
  }, 30000);

  it('should handle a successful migration', async () => {
    // Mocking the fetchBalances function
    aarcSDK.fetchBalances = jest.fn().mockResolvedValue({
      code: 200,
      data: [
        {
          decimals: 18,
          name: 'Ether',
          symbol: 'ETH',
          native_token: true,
          token_address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          balance: {
            type: 'BigNumber',
            hex: '0x015896a11bc6ea3e',
          },
          type: 'dust',
          nft_data: null,
          permit2Allowance: {
            type: 'BigNumber',
            hex: '0x00',
          },
          permitExist: false,
        },
        {
          decimals: 6,
          name: 'USDA',
          native_token: false,
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
      transferTokenDetails: [
        {
          tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
          amount: BigNumber.from('1000000'),
        },
        {
          tokenAddress: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
          amount: BigNumber.from('2000000000'),
        },
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
      amount: BigNumber.from(0x0f4240),
    });

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
      message: 'Token transfer tx sent',
      txHash: 'token-transfer-0x1234567890',
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
          native_token: true,
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
          decimals: 6,
          name: 'USDA',
          native_token: false,
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
      transferTokenDetails: [
        {
          tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          amount: BigNumber.from('100'),
        },
      ],
      receiverAddress: receiver,
    };

    const migrationResponse =
      await aarcSDK.executeMigration(executeMigrationDto);
    expect(Array.isArray(migrationResponse)).toBe(true);
    expect(migrationResponse).toHaveLength(1);

    expect(aarcSDK.permitHelper.performNativeTransfer).toHaveBeenCalled();

    expect(aarcSDK.permitHelper.performNativeTransfer).toHaveBeenCalledWith({
      senderSigner: signer,
      recipientAddress: receiver,
      amount: BigNumber.from('0x64'),
    });

    expect(aarcSDK.permitHelper.performNativeTransfer).toHaveBeenCalledTimes(1);

    expect(migrationResponse[0]).toEqual({
      tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      amount: expect.objectContaining({
        _hex: '0x64',
      }),
      message: 'Native transfer tx sent',
      txHash: 'native-transfer-0x1234567890',
    });
  }, 30000);

  it('token transfer where balance is less then permit allowance', async () => {
    // Mocking the fetchBalances function
    aarcSDK.fetchBalances = jest.fn().mockResolvedValue({
      code: 200,
      data: [
        {
          decimals: 18,
          name: 'ETH',
          symbol: 'ETH',
          native_token: true,
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
          decimals: 6,
          native_token: false,
          name: 'USDA1',
          symbol: 'USDA1',
          token_address: '0xbb8bb7e16d8f03969d49fd3ed0efd13e65c8f5b5',
          balance: { type: 'BigNumber', hex: '0x05f5e100' },
          type: 'cryptocurrency',
          nft_data: null,
          permit2Allowance: { type: 'BigNumber', hex: '0x00' },
          permitExist: true,
        },
        {
          decimals: 6,
          native_token: false,
          name: 'USDA2',
          symbol: 'USDA2',
          token_address: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
          balance: { type: 'BigNumber', hex: '0x1dcd6500' },
          type: 'cryptocurrency',
          nft_data: null,
          permit2Allowance: { type: 'BigNumber', hex: '0x1dcd650' },
          permitExist: true,
        },
        {
          decimals: 8,
          native_token: false,
          name: 'USDB',
          symbol: 'USDB',
          token_address: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
          balance: { type: 'BigNumber', hex: '0x05f5e100' },
          type: 'cryptocurrency',
          nft_data: null,
          permit2Allowance: { type: 'BigNumber', hex: '-0x01' },
          permitExist: true,
        },
        {
          decimals: 18,
          native_token: false,
          name: 'USDC',
          symbol: 'USDC',
          token_address: '0xb18059aa6483ba71d6d3dfabad53616b00ea2aba',
          balance: { type: 'BigNumber', hex: '0x6a94d74f430000' },
          type: 'cryptocurrency',
          nft_data: null,
          permit2Allowance: { type: 'BigNumber', hex: '-0x01' },
          permitExist: true,
        },
      ],
      message: 'Success',
    });

    jest
      .spyOn(aarcSDK.permitHelper, 'getBatchTransferPermitData')
      .mockImplementation((batchTransferPermitDto: any) => {
        const { spenderAddress } = batchTransferPermitDto;
        // Simulate the behavior of the function based on your test requirements
        const signature = 'mockedSignature'; // Replace with your mocked signature

        return {
          permitBatchTransferFrom: {
            permitted: [
              {
                token: '0xb18059aa6483ba71d6d3dfabad53616b00ea2aba',
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
      });

    jest
      .spyOn(EstimatorHelper, 'calculateTotalGasNeeded')
      .mockImplementation(
        async (
          provider: ethers.providers.JsonRpcProvider,
          transactions: any[],
          chainId: ChainId,
        ) => {
          let totalGasCost = BigNumber.from(0);
          const validTransactions: any = [];

          for (const transaction of transactions) {
            transaction.gasCost = BigNumber.from(1234322);
            totalGasCost = totalGasCost.add(transaction.gasCost);
            validTransactions.push(transaction);
          }

          return { validTransactions, totalGasCost };
        },
      );

    const executeMigrationDto = {
      senderSigner: signer,
      transferTokenDetails: [
        {
          tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
          amount: BigNumber.from('0x1dcd6500'),
        },
        {
          tokenAddress: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
          amount: BigNumber.from('0x05f5e100'),
        },
        {
          tokenAddress: '0xb18059aa6483ba71d6d3dfabad53616b00ea2aba',
          amount: BigNumber.from('0x6a94d74f430000'),
        },
        {
          tokenAddress: '0xbb8bb7e16d8f03969d49fd3ed0efd13e65c8f5b5',
          amount: BigNumber.from('0x05f5e100'),
        },
      ],
      receiverAddress: receiver,
    };

    const migrationResponse =
      await aarcSDK.executeMigration(executeMigrationDto);
    expect(Array.isArray(migrationResponse)).toBe(true);
    expect(migrationResponse).toHaveLength(4);

    expect(aarcSDK.permitHelper.getBatchTransferPermitData).toHaveBeenCalled();

    expect(
      aarcSDK.permitHelper.getBatchTransferPermitData,
    ).toHaveBeenCalledTimes(1);

    expect(aarcSDK.permitHelper.performTokenTransfer).toHaveBeenCalled();

    expect(aarcSDK.permitHelper.performTokenTransfer).toHaveBeenCalledTimes(2);

    expect(migrationResponse[0]).toEqual({
      tokenAddress: '0xb18059aa6483ba71d6d3dfabad53616b00ea2aba',
      amount: expect.objectContaining({
        hex: '0x989680',
      }),
      message: 'Token transfer tx sent',
      txHash: 'permit-token-transfer-0x1234567890',
    });

    expect(migrationResponse[1]).toEqual({
      tokenAddress: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
      amount: expect.objectContaining({
        hex: '0x174876e800',
      }),
      message: 'Token transfer tx sent',
      txHash: 'permit-token-transfer-0x1234567890',
    });

    expect(aarcSDK.permitHelper.performTokenTransfer).toHaveBeenCalledWith({
      senderSigner: signer,
      recipientAddress: receiver,
      tokenAddress: '0xbb8bb7e16d8f03969d49fd3ed0efd13e65c8f5b5',
      amount: BigNumber.from(0x05f5e100),
    });

    expect(migrationResponse[2]).toEqual({
      tokenAddress: '0xbb8bb7e16d8f03969d49fd3ed0efd13e65c8f5b5',
      amount: BigNumber.from(0x05f5e100),
      message: 'Token transfer tx sent',
      txHash: 'token-transfer-0x1234567890',
    });

    expect(aarcSDK.permitHelper.performTokenTransfer).toHaveBeenCalledWith({
      senderSigner: signer,
      recipientAddress: receiver,
      tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
      amount: BigNumber.from(0x1dcd6500),
    });

    expect(migrationResponse[3]).toEqual({
      tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
      amount: BigNumber.from(0x1dcd6500),
      message: 'Token transfer tx sent',
      txHash: 'token-transfer-0x1234567890',
    });
  });

  it('should transfer token and native sucessfully', async () => {
    // Mock a different implementation for fetchBalances
    aarcSDK.fetchBalances = jest.fn().mockResolvedValue({
      code: 200,
      data: [
        {
          decimals: 18,
          name: 'ETH',
          native_token: true,
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
          decimals: 6,
          name: 'USDA',
          native_token: false,
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
    };

    let migrationResponse;

    migrationResponse = await aarcSDK.executeMigration(executeMigrationDto);
    expect(Array.isArray(migrationResponse)).toBe(true);
    expect(migrationResponse).toHaveLength(2);

    expect(aarcSDK.permitHelper.performNativeTransfer).toHaveBeenCalled();

    expect(aarcSDK.permitHelper.performNativeTransfer).toHaveBeenCalledWith({
      senderSigner: signer,
      recipientAddress: receiver,
      amount: BigNumber.from('0x7a1200'),
    });

    expect(aarcSDK.permitHelper.performTokenTransfer).toHaveBeenCalled();

    expect(aarcSDK.permitHelper.performTokenTransfer).toHaveBeenCalledTimes(1);

    expect(aarcSDK.permitHelper.performTokenTransfer).toHaveBeenCalledWith({
      senderSigner: signer,
      recipientAddress: receiver,
      tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
      amount: { type: 'BigNumber', hex: '0x989680' },
    });

    expect(aarcSDK.permitHelper.performNativeTransfer).toHaveBeenCalledTimes(1);

    expect(migrationResponse[0]).toEqual({
      tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
      amount: { type: 'BigNumber', hex: '0x989680' },
      message: 'Token transfer tx sent',
      txHash: 'token-transfer-0x1234567890',
    });

    expect(migrationResponse[1]).toEqual({
      tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      amount: expect.objectContaining({
        _hex: '0x7a1200',
      }),
      message: 'Native transfer tx sent',
      txHash: 'native-transfer-0x1234567890',
    });
  }, 30000);

  it('should handle batch transfer with permit data', async () => {
    // Mocking the fetchBalances function
    aarcSDK.fetchBalances = jest.fn().mockResolvedValue({
      code: 200,
      data: [
        {
          decimals: 18,
          name: 'ETH',
          native_token: true,
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
          decimals: 18,
          name: 'USDA',
          symbol: 'USDA',
          native_token: false,
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
        {
          decimals: 6,
          name: 'USDC',
          symbol: 'USDC',
          native_token: false,
          token_address: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
          balance: { type: 'BigNumber', hex: '0x174876e800' },
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

    jest
      .spyOn(EstimatorHelper, 'calculateTotalGasNeeded')
      .mockImplementation(
        async (
          provider: ethers.providers.JsonRpcProvider,
          transactions: any[],
          chainId: ChainId,
        ) => {
          let totalGasCost = BigNumber.from(0);
          const validTransactions: any = [];

          for (const transaction of transactions) {
            transaction.gasCost = BigNumber.from(1234322);
            totalGasCost = totalGasCost.add(transaction.gasCost);
            validTransactions.push(transaction);
          }

          return { validTransactions, totalGasCost };
        },
      );

    const executeMigrationDto = {
      senderSigner: signer,
      transferTokenDetails: [
        {
          tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
          amount: BigNumber.from('1000000'),
        },
        {
          tokenAddress: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
          amount: BigNumber.from('2000000000'),
        },
      ],
      receiverAddress: receiver,
    };

    const migrationResponse =
      await aarcSDK.executeMigration(executeMigrationDto);

    expect(
      aarcSDK.permitHelper.getBatchTransferPermitData,
    ).toHaveBeenCalledTimes(1);

    expect(migrationResponse).toHaveLength(2);

    expect(migrationResponse[0]).toEqual({
      tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
      amount: expect.objectContaining({
        type: 'BigNumber',
        hex: '0x989680',
      }),
      message: 'Token transfer tx sent',
      txHash: 'permit-token-transfer-0x1234567890',
    });

    expect(migrationResponse[1]).toEqual({
      tokenAddress: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
      amount: expect.objectContaining({
        type: 'BigNumber',
        hex: '0x174876e800',
      }),
      message: 'Token transfer tx sent',
      txHash: 'permit-token-transfer-0x1234567890',
    });
  }, 30000);

  it('should handle insufficient gas case', async () => {
    // Mocking the fetchBalances function
    aarcSDK.fetchBalances = jest.fn().mockResolvedValue({
      code: 200,
      data: [
        {
          decimals: 18,
          name: 'ETH',
          symbol: 'ETH',
          token_address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          balance: { type: 'BigNumber', hex: '0xf4240' },
          type: 'dust',
          native_token: true,
          nft_data: null,
          permit2Allowance: {
            type: 'BigNumber',
            hex: '0x0c9f2c9cd04674edd2f5bf5642',
          },
          permitExist: true,
        },
        {
          decimals: 18,
          name: 'USDA',
          symbol: 'USDA',
          native_token: false,
          token_address: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
          balance: { type: 'BigNumber', hex: '0x989680' },
          type: 'cryptocurrency',
          nft_data: null,
          permit2Allowance: {
            type: 'BigNumber',
            hex: '0x0',
          },
          permitExist: true,
        },
        {
          decimals: 6,
          name: 'USDC',
          symbol: 'USDC',
          native_token: false,
          token_address: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
          balance: { type: 'BigNumber', hex: '0x174876e800' },
          type: 'cryptocurrency',
          nft_data: null,
          permit2Allowance: {
            type: 'BigNumber',
            hex: '0x0',
          },
          permitExist: true,
        },
      ],
      message: 'Success',
    });

    jest
      .spyOn(EstimatorHelper, 'calculateTotalGasNeeded')
      .mockImplementation(
        async (
          provider: ethers.providers.JsonRpcProvider,
          transactions: any[],
          chainId: ChainId,
        ) => {
          let totalGasCost = BigNumber.from(0);
          const validTransactions: any = [];

          for (const transaction of transactions) {
            transaction.gasCost = BigNumber.from(1234322);
            totalGasCost = totalGasCost.add(transaction.gasCost);
            validTransactions.push(transaction);
          }

          return { validTransactions, totalGasCost };
        },
      );

    const executeMigrationDto = {
      senderSigner: signer,
      transferTokenDetails: [
        {
          tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
          amount: BigNumber.from('1000000'),
        },
        {
          tokenAddress: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
          amount: BigNumber.from('2000000000'),
        },
      ],
      receiverAddress: receiver,
    };

    const migrationResponse =
      await aarcSDK.executeMigration(executeMigrationDto);

    expect(aarcSDK.permitHelper.performTokenTransfer).toHaveBeenCalledTimes(0);

    expect(migrationResponse).toHaveLength(2);

    expect(migrationResponse[0]).toEqual({
      tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
      amount: expect.objectContaining({
        _hex: '0x0f4240',
      }),
      message: 'Insufficient balance for transaction',
      txHash: '',
    });

    expect(migrationResponse[1]).toEqual({
      tokenAddress: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
      amount: expect.objectContaining({
        _hex: '0x77359400',
      }),
      message: 'Insufficient balance for transaction',
      txHash: '',
    });
  }, 30000);
});
