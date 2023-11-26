import { BigNumber, ethers } from 'ethers';
import { AarcSDK } from '../src'; // Adjust the path according to your directory structure

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
describe('Aarc SDK executeMigration', () => {
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
  }, 30000);
  it('should handle native token transfer without ERC20 tokens', async () => {
    // Mock a different implementation for fetchBalances
    aarcSDK.fetchBalances = jest.fn().mockResolvedValue({
      code: 200,
      data: [
        {
          decimals: 18,
          name: 'ETH',
          symbol: 'ETH',
          nativeToken: true,
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
      ],
      message: 'Success',
    });

    const executeMigrationDto = {
      senderSigner: signer,
      transferTokenDetails: [
        {
          tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          amount: BigNumber.from('10000000'),
        },
      ],
      receiverAddress: receiver,
    };

    const migrationResponse =
      await aarcSDK.executeMigration(executeMigrationDto);

    expect(aarcSDK.permitHelper.performNativeTransfer).toHaveBeenCalledTimes(1);
    expect(migrationResponse[0]).toEqual({
      tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      amount: expect.objectContaining({
        _hex: '0x989680',
      }),
      message: 'Native transfer successful',
      txHash: 'native-transfer-0x1234567890',
    });
  }, 30000);

  it('should handle native token transfer of 80% without ERC20 tokens', async () => {
    // Mock a different implementation for fetchBalances
    aarcSDK.fetchBalances = jest.fn().mockResolvedValue({
      code: 200,
      data: [
        {
          decimals: 18,
          name: 'ETH',
          symbol: 'ETH',
          nativeToken: true,
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
      ],
      message: 'Success',
    });

    const executeMigrationDto = {
      senderSigner: signer,
      receiverAddress: receiver,
    };

    const migrationResponse =
      await aarcSDK.executeMigration(executeMigrationDto);

    expect(aarcSDK.permitHelper.performNativeTransfer).toHaveBeenCalled();
    expect(aarcSDK.permitHelper.performNativeTransfer).toHaveBeenCalledTimes(1);
    expect(migrationResponse[0]).toEqual({
      tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      amount: expect.objectContaining({
        _hex: '0x7a1200',
      }),
      message: 'Native transfer successful',
      txHash: 'native-transfer-0x1234567890',
    });
  }, 30000);

  it('should handle an error when performing native transfer', async () => {
    // Mock balances with only native token (ETH)
    aarcSDK.fetchBalances = jest.fn().mockResolvedValue({
      code: 200,
      data: [
        {
          decimals: 18,
          name: 'ETH',
          symbol: 'ETH',
          nativeToken: true,
          token_address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          balance: { type: 'BigNumber', hex: '0x1E' },
          type: 'dust',
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
          amount: BigNumber.from('40'),
        },
      ],
      receiverAddress: receiver,
    };

    const migrationResponse =
      await aarcSDK.executeMigration(executeMigrationDto);

    expect(migrationResponse[0]).toEqual({
      tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      amount: expect.objectContaining({
        _hex: '0x28',
      }),
      message: 'Supplied amount is greater than balance',
      txHash: '',
    });
  }, 30000);
});
