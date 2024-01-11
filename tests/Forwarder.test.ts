import { BigNumber, Signer, ethers } from 'ethers';
import { AarcSDK } from '../src'; // Adjust the path according to your directory structure
import { PermitHelper } from '../src/helpers/PermitHelper'; // Import the original class
import './EthersMock';
import {
  GELATO_RELAYER_ADDRESS,
  PERMIT_TX_TYPES,
} from '../src/utils/Constants';
import * as helperFunctions from '../src/helpers/helper'; // Import the helper file
import { RelayTxListResponse } from '../src/utils/AarcTypes';

jest.mock('../src/helpers/HttpHelper', () => ({
  fetchBalances: jest.fn(),
  fetchNativeToUsdPrice: jest.requireActual('../src/helpers/HttpHelper')
    .fetchNativeToUsdPrice,
  fetchGasPrice: jest.fn(),
}));

import { fetchBalances, fetchGasPrice } from '../src/helpers/HttpHelper';

let aarcSDK: any;

describe('Aarc SDK executeForwardTransactions', () => {
  const receiver = '0xe7a35625b23710C131Fa38c92CF5F7793c50604A';

  const privateKey =
    '29822a62aaeb9a16e9d1fd88412bac4fe37574bbcb245b4232e3b3612496fd96';
  const rpcUrl = 'https://ethereum-goerli.publicnode.com';
  const apiKey = 'd2ded745-c5f5-43d6-9577-869daf62488d';
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
            permitted: {
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

  it('should do forwarder migration flow', async () => {
    (fetchGasPrice as jest.Mock).mockResolvedValue({
      code: 200,
      data: {
        gasPrice: 1000000000,
      },
      message: 'Success',
    });

    // Mocking the fetchBalances function
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
    jest
      .spyOn(helperFunctions, 'makeForwardCall')
      .mockImplementation(async (chainId, relayTxList) => {
        const resultSet: RelayTxListResponse[] = [
          {
            type: PERMIT_TX_TYPES.PERMIT,
            tokenInfo: [
              {
                tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
                amount: BigNumber.from(ethers.constants.MaxUint256),
              },
            ],
            taskId: 'permit-tx-123456',
            status: 'permit-hash-12345',
          },
          {
            type: PERMIT_TX_TYPES.PERMIT,
            tokenInfo: [
              {
                tokenAddress: '0xbb8bb7e16d8f03969d49fd3ed0efd13e65c8f5b5',
                amount: BigNumber.from(ethers.constants.MaxUint256),
              },
            ],
            taskId: 'permit-tx-123456',
            status: 'permit-hash-12345',
          },
          {
            type: PERMIT_TX_TYPES.PERMIT2_BATCH,
            tokenInfo: [
              {
                tokenAddress: '0xbb8bb7e16d8f03969d49fd3ed0efd13e65c8f5b5',
                amount: BigNumber.from(0x05f5e100),
              },
              {
                tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
                amount: BigNumber.from(0x1dcd6500),
              },
              {
                tokenAddress: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
                amount: BigNumber.from(0x05f5e100),
              },
              {
                tokenAddress: '0xb18059aa6483ba71d6d3dfabad53616b00ea2aba',
                amount: BigNumber.from(0x1dcd6500),
              },
            ],
            taskId: 'permit-batch-tx-123456',
            status: 'permit-batch-hash-12345',
          },
        ];
        return resultSet;
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
          amount: BigNumber.from('0x1dcd6500'),
        },
        {
          tokenAddress: '0xbb8bb7e16d8f03969d49fd3ed0efd13e65c8f5b5',
          amount: BigNumber.from('0x05f5e100'),
        },
      ],
      receiverAddress: receiver,
    };

    const migrationResponse =
      await aarcSDK.executeForwardTransaction(executeMigrationDto);
    expect(Array.isArray(migrationResponse)).toBe(true);
    expect(migrationResponse).toHaveLength(7);

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
      tokenAddress: '0xb18059aa6483ba71d6d3dfabad53616b00ea2aba',
      amount: BigNumber.from(0x1dcd6500),
      message: 'Token does not have enough balance to pay for fee',
      taskId: '',
      txHash: '',
    });

    expect(migrationResponse[1]).toEqual({
      tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
      amount: BigNumber.from(ethers.constants.MaxUint256),
      message: 'permit-hash-12345',
      taskId: 'permit-tx-123456',
      txHash: '',
    });

    expect(migrationResponse[2]).toEqual({
      tokenAddress: '0xbb8bb7e16d8f03969d49fd3ed0efd13e65c8f5b5',
      amount: BigNumber.from(ethers.constants.MaxUint256),
      message: 'permit-hash-12345',
      taskId: 'permit-tx-123456',
      txHash: '',
    });

    // Verify the content of the response
    expect(migrationResponse[3]).toEqual({
      tokenAddress: '0xbb8bb7e16d8f03969d49fd3ed0efd13e65c8f5b5',
      amount: BigNumber.from(0x05f5e100),
      message: 'permit-batch-hash-12345',
      taskId: 'permit-batch-tx-123456',
      txHash: '',
    });

    expect(migrationResponse[4]).toEqual({
      tokenAddress: '0xf4ca1a280ebccdaebf80e3c128e55de01fabd893',
      amount: BigNumber.from(0x1dcd6500),
      message: 'permit-batch-hash-12345',
      taskId: 'permit-batch-tx-123456',
      txHash: '',
    });

    expect(migrationResponse[5]).toEqual({
      tokenAddress: '0xbb8db535d685f2742d6e84ec391c63e6a1ce3593',
      amount: BigNumber.from(0x05f5e100),
      message: 'permit-batch-hash-12345',
      taskId: 'permit-batch-tx-123456',
      txHash: '',
    });

    expect(migrationResponse[6]).toEqual({
      tokenAddress: '0xb18059aa6483ba71d6d3dfabad53616b00ea2aba',
      amount: BigNumber.from(0x1dcd6500),
      message: 'permit-batch-hash-12345',
      taskId: 'permit-batch-tx-123456',
      txHash: '',
    });
  }, 30000);
});
