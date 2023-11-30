import { BigNumber, Signer, ethers } from 'ethers';
import { AarcSDK } from '../src'; // Adjust the path according to your directory structure
import { PermitHelper } from '../src/helpers/PermitHelper'; // Import the original class
import './EthersMock';
import { GELATO_RELAYER_ADDRESS } from '../src/utils/Constants';
let aarcSDK: any;

// Mock the GelatoHelper functions
jest.mock('../src/helpers/GelatoHelper', () => ({
  relayTransaction: jest.fn().mockImplementation(async () => '12312312'),
  getGelatoTransactionStatus: jest
    .fn()
    .mockImplementation(async () => '0x127hy123'),
}));

describe('Aarc SDK executeMigrationGasless', () => {
  const receiver = '0xe7a35625b23710C131Fa38c92CF5F7793c50604A';

  const privateKey =
    '29822a62aaeb9a16e9d1fd88412bac4fe37574bbcb245b4232e3b3612496fd96';
  const rpcUrl = 'https://ethereum-goerli.publicnode.com';
  const apiKey = '097ce80e-4dcc-4265-8aa7-2ed0e19901ff';
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const eoaAddress = signer.address;
  let chainId: number;

  beforeEach(async () => {
    (chainId = (await provider.getNetwork()).chainId),
      (aarcSDK = new AarcSDK({
        rpcUrl: rpcUrl,
        chainId,
        apiKey: apiKey,
      }));

    aarcSDK.permitHelper = new PermitHelper(rpcUrl, chainId);
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
      .spyOn(aarcSDK.permitHelper, 'performPermit')
      .mockImplementation(() => 'permit-transfer-0x1234567890');

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
                token: '0xbb8bb7e16d8f03969d49fd3ed0efd13e65c8f5b5',
                amount: { type: 'BigNumber', hex: '0x05f5e100' },
              },
              {
                token: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
                amount: { type: 'BigNumber', hex: '0x1dcd6500' },
              },
              {
                token: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
                amount: { type: 'BigNumber', hex: '0x05f5e100' },
              },
              {
                token: '0xb18059aa6483ba71d6d3dfabad53616b00ea2aba',
                amount: { type: 'BigNumber', hex: '0x6a94d74f430000' },
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
      .spyOn(aarcSDK.permitHelper, 'getSingleTransferPermitData')
      .mockImplementation((singleTransferPermitDto: any) => {
        const { spenderAddress } = singleTransferPermitDto;
        // Simulate the behavior of the function based on your test requirements
        const signature = 'mockedSignature'; // Replace with your mocked signature

        return {
          permitTransferFrom: {
            permitted: 
              {
                token: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
                amount: { type: 'BigNumber', hex: '0x1dcd6500' },
              },
            spender: spenderAddress,
            deadline: 12345678,
            nonce: 6623,
          },
          signature,
        };
      });
  }, 30000);

  it('should handle gasless migration', async () => {
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
          name: 'USDA2',
          symbol: 'USDA2',
          token_address: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
          balance: { type: 'BigNumber', hex: '0x1dcd6500' },
          type: 'cryptocurrency',
          nft_data: null,
          permit2Allowance: { type: 'BigNumber', hex: '-0x01' },
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
      ],
      message: 'Success',
    });
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
      gelatoApiKey: 'abcpowerwerwrf',
    };

    const migrationResponse =
      await aarcSDK.executeMigrationGasless(executeMigrationDto);
    expect(Array.isArray(migrationResponse)).toBe(true);
    expect(migrationResponse).toHaveLength(5);

    expect(aarcSDK.permitHelper.performPermit).toHaveBeenCalled();
    expect(aarcSDK.permitHelper.performPermit).toHaveBeenCalledTimes(1);
    expect(aarcSDK.permitHelper.performPermit).toHaveBeenCalledWith({
      signer,
      chainId,
      eoaAddress,
      tokenAddress: '0xbb8bb7e16d8f03969d49fd3ed0efd13e65c8f5b5',
    });

    expect(migrationResponse[0]).toEqual({
      tokenAddress: '0xbb8bb7e16d8f03969d49fd3ed0efd13e65c8f5b5',
      amount: expect.objectContaining({ _hex: '0x05f5e100' }),
      message: 'Token Permit tx Sent',
      txHash: '0x127hy123',
    });

    expect(aarcSDK.permitHelper.getBatchTransferPermitData).toHaveBeenCalled();

    // Verify the content of the response
    expect(migrationResponse[1]).toEqual({
      tokenAddress: '0xbb8bb7e16d8f03969d49fd3ed0efd13e65c8f5b5',
      amount: expect.objectContaining({
        type: 'BigNumber',
        hex: '0x05f5e100',
      }),
      message: 'Transaction sent',
      txHash: '0x127hy123',
    });

    expect(migrationResponse[2]).toEqual({
      tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
      amount: expect.objectContaining({
        type: 'BigNumber',
        hex: '0x1dcd6500',
      }),
      message: 'Transaction sent',
      txHash: '0x127hy123',
    });

    expect(migrationResponse[3]).toEqual({
      tokenAddress: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
      amount: expect.objectContaining({
        type: 'BigNumber',
        hex: '0x05f5e100',
      }),
      message: 'Transaction sent',
      txHash: '0x127hy123',
    });

    expect(migrationResponse[4]).toEqual({
      tokenAddress: '0xb18059aa6483ba71d6d3dfabad53616b00ea2aba',
      amount: expect.objectContaining({
        type: 'BigNumber',
        hex: '0x6a94d74f430000',
      }),
      message: 'Transaction sent',
      txHash: '0x127hy123',
    });
  }, 30000);

  it('should do gasless migration flow', async () => {
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
            hex: '0x0',
          },
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
      ],
      message: 'Success',
    });
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
      gelatoApiKey: 'abcpowerwerwrf',
    };

    const migrationResponse =
      await aarcSDK.executeMigrationGasless(executeMigrationDto);
    expect(Array.isArray(migrationResponse)).toBe(true);
    expect(migrationResponse).toHaveLength(6);

    expect(aarcSDK.permitHelper.performPermit).toHaveBeenCalled();
    expect(aarcSDK.permitHelper.performPermit).toHaveBeenCalledTimes(2);
    expect(aarcSDK.permitHelper.performPermit).toHaveBeenCalledWith({
      signer,
      chainId,
      eoaAddress,
      tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
    });
    expect(aarcSDK.permitHelper.getBatchTransferPermitData).toHaveBeenCalled();
    expect(migrationResponse[0]).toEqual({
      tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
      amount: expect.objectContaining({ _hex: '0x1dcd6500' }),
      message: 'Token Permit tx Sent',
      txHash: '0x127hy123',
    });

    expect(migrationResponse[1]).toEqual({
      tokenAddress: '0xbb8bb7e16d8f03969d49fd3ed0efd13e65c8f5b5',
      amount: expect.objectContaining({ _hex: '0x05f5e100' }),
      message: 'Token Permit tx Sent',
      txHash: '0x127hy123',
    });

    // Verify the content of the response
    expect(migrationResponse[2]).toEqual({
      tokenAddress: '0xbb8bb7e16d8f03969d49fd3ed0efd13e65c8f5b5',
      amount: expect.objectContaining({
        type: 'BigNumber',
        hex: '0x05f5e100',
      }),
      message: 'Transaction sent',
      txHash: '0x127hy123',
    });

    expect(migrationResponse[3]).toEqual({
      tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
      amount: expect.objectContaining({
        type: 'BigNumber',
        hex: '0x1dcd6500',
      }),
      message: 'Transaction sent',
      txHash: '0x127hy123',
    });

    expect(migrationResponse[4]).toEqual({
      tokenAddress: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
      amount: expect.objectContaining({
        type: 'BigNumber',
        hex: '0x05f5e100',
      }),
      message: 'Transaction sent',
      txHash: '0x127hy123',
    });

    expect(migrationResponse[5]).toEqual({
      tokenAddress: '0xb18059aa6483ba71d6d3dfabad53616b00ea2aba',
      amount: expect.objectContaining({
        type: 'BigNumber',
        hex: '0x6a94d74f430000',
      }),
      message: 'Transaction sent',
      txHash: '0x127hy123',
    });
  }, 30000);

  it('should do erc20permit and single permit2 gasless migration flow', async () => {
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
            hex: '0x0',
          },
          permitExist: true,
        },
        {
          decimals: 6,
          native_token: false,
          name: 'USDA1',
          symbol: 'USDA1',
          token_address: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
          balance: { type: 'BigNumber', hex: '0x1dcd6500' },
          type: 'cryptocurrency',
          nft_data: null,
          permit2Allowance: { type: 'BigNumber', hex: '0x0' },
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
          amount: BigNumber.from('0x1dcd6500'),
        },
      ],
      receiverAddress: receiver,
      gelatoApiKey: 'abcpowerwerwrf',
    };

    const migrationResponse =
      await aarcSDK.executeMigrationGasless(executeMigrationDto);
    expect(Array.isArray(migrationResponse)).toBe(true);
    expect(migrationResponse).toHaveLength(2);

    expect(aarcSDK.permitHelper.performPermit).toHaveBeenCalled();
    expect(aarcSDK.permitHelper.performPermit).toHaveBeenCalledTimes(1);
    expect(aarcSDK.permitHelper.performPermit).toHaveBeenCalledWith({
      signer,
      chainId,
      eoaAddress,
      tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
    });

    expect(aarcSDK.permitHelper.getSingleTransferPermitData).toHaveBeenCalled();
    expect(aarcSDK.permitHelper.getSingleTransferPermitData).toHaveBeenCalledTimes(1);
    expect(aarcSDK.permitHelper.getSingleTransferPermitData).toHaveBeenCalledWith({
      signer,
      chainId,
      spenderAddress: GELATO_RELAYER_ADDRESS,
      tokenData: expect.objectContaining({token_address:'0xf4ca1a280ebccdaebf80e3c128e55de01fabd893'}),
    });

    expect(migrationResponse[0]).toEqual({
      tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
      amount: expect.objectContaining({ _hex: '0x1dcd6500' }),
      message: 'Token Permit tx Sent',
      txHash: '0x127hy123',
    });

    // Verify the content of the response
    expect(migrationResponse[1]).toEqual({
      tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
      amount: expect.objectContaining({
        type: 'BigNumber',
        hex: '0x1dcd6500',
      }),
      message: 'Transaction sent',
      txHash: '0x127hy123',
    });
  }, 30000);
});
