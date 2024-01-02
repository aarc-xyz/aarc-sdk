import { BigNumber, ethers } from 'ethers';
import { AarcSDK } from '../src'; // Adjust the path according to your directory structure
import { PermitHelper } from '../src/helpers/PermitHelper'; // Import the original class

jest.mock('../src/helpers/HttpHelper', () => ({
  fetchBalances: jest.fn(),
  fetchNativeToUsdPrice: jest.requireActual('../src/helpers/HttpHelper')
    .fetchNativeToUsdPrice,
}));

import { fetchBalances } from '../src/helpers/HttpHelper';

describe('Aarc SDK executeMigration', () => {
  let receiver: string;
  let aarcSDK: any;

  const privateKey =
    '29822a62aaeb9a16e9d1fd88412bac4fe37574bbcb245b4232e3b3612496fd96';
  const rpcURl = 'https://ethereum-goerli.publicnode.com';
  const apiKey = 'd2ded745-c5f5-43d6-9577-869daf62488d';
  const provider = new ethers.providers.JsonRpcProvider(rpcURl);
  const signer = new ethers.Wallet(privateKey, provider);
  const eoaAddress = signer.address;
  receiver = '0xe7a35625b23710C131Fa38c92CF5F7793c50604A';

  beforeEach(async () => {
    aarcSDK = new AarcSDK({
      rpcUrl: rpcURl,
      chainId: (await provider.getNetwork()).chainId,
      apiKey: apiKey,
    });

    aarcSDK.permitHelper = new PermitHelper(
      rpcURl,
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
  it('should handle native token transfer without ERC20 tokens', async () => {
    // Mock a different implementation for fetchBalances
    (fetchBalances as jest.Mock).mockResolvedValue({
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
      message: 'Native transfer tx sent',
      txHash: 'native-transfer-0x1234567890',
    });
  }, 30000);

  it('should handle native token transfer of 80% without ERC20 tokens', async () => {
    // Mock a different implementation for fetchBalances
    (fetchBalances as jest.Mock).mockResolvedValue({
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
      message: 'Native transfer tx sent',
      txHash: 'native-transfer-0x1234567890',
    });
  }, 30000);

  it('should handle an error when performing native transfer', async () => {
    // Mock balances with only native token (ETH)
    (fetchBalances as jest.Mock).mockResolvedValue({
      code: 200,
      data: [
        {
          decimals: 18,
          name: 'ETH',
          symbol: 'ETH',
          native_token: true,
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
