import { Contract, Wallet, providers } from 'ethers';
import { AarcSDK } from '../src';
import { WALLET_TYPE } from '../src/utils/AarcTypes';

let aarcSDK: AarcSDK;
let mockContractInstance: any;
let mockProvidersInstance: any;

describe('Alchemy', () => {
  const privateKey =
    '29822a62aaeb9a16e9d1fd88412bac4fe37574bbcb245b4232e3b3612496fd96';
  const rpcUrl = 'https://ethereum-goerli.publicnode.com';
  const apiKey = 'd2ded745-c5f5-43d6-9577-869daf62488d';
  const provider = new providers.JsonRpcProvider(rpcUrl);
  const signer = new Wallet(privateKey, provider);
  const eoaAddress = signer.address;
  let chainId: number;

  beforeEach(async () => {
    mockContractInstance = {
      getAddress: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve('0x90FD3CE197cb41fcFf401dF8DD9866C7f503eC22'),
        ),
      createAccount: jest.fn().mockImplementation(() =>
        Promise.resolve({
          hash: '0x1234567890abcdef',
        }),
      ),
    };
    mockProvidersInstance = {
      getCode: jest.fn().mockImplementation(() => Promise.resolve('0x')),
    };

    // Mock the ethers.Contract constructor to return the mock contract instance
    (Contract as unknown as jest.Mock) = jest
      .fn()
      .mockImplementation(() => mockContractInstance);
    jest
      .spyOn(providers, 'JsonRpcProvider')
      .mockImplementation(() => mockProvidersInstance as any);

    chainId = (await provider.getNetwork()).chainId;
    aarcSDK = new AarcSDK({
      rpcUrl: rpcUrl,
      chainId: chainId,
      apiKey: apiKey,
    });
  });

  describe('getAllAlchemySCWs', () => {
    it('should return an array of SmartAccountResponse', async () => {
      const owner = '0x1234567890abcdef';

      jest.spyOn(aarcSDK.alchemy, 'getAlchemySCW').mockResolvedValue({
        address: '0x1234567890abcdef',
        isDeployed: false,
      });

      const accounts = await aarcSDK.getSmartWalletAddresses(
        WALLET_TYPE.ALCHEMY,
        owner,
      );

      expect(aarcSDK.alchemy.getAlchemySCW).toHaveBeenCalledTimes(1);
      expect(aarcSDK.alchemy.getAlchemySCW).toHaveBeenCalledWith(owner, 0);

      expect(Array.isArray(accounts)).toBe(true);
      expect(accounts.length).toBeGreaterThan(0);

      for (const account of accounts) {
        expect(account).toHaveProperty('address');
        expect(account).toHaveProperty('isDeployed');
      }

      expect(accounts[0].address).toBe('0x1234567890abcdef');
      expect(accounts[0].isDeployed).toBe(false);
    });

    it('should return an array of SmartAccountResponse with isDeployed true', async () => {
      const owner = '0x1234567890abcdef';

      jest.spyOn(aarcSDK.alchemy, 'getAlchemySCW').mockResolvedValueOnce({
        address: '0x1234567890abcdef',
        isDeployed: true,
      });

      jest.spyOn(aarcSDK.alchemy, 'getAlchemySCW').mockResolvedValueOnce({
        address: '0x9876543210abcdef',
        isDeployed: false,
      });

      const accounts = await aarcSDK.getSmartWalletAddresses(
        WALLET_TYPE.ALCHEMY,
        owner,
      );

      expect(aarcSDK.alchemy.getAlchemySCW).toHaveBeenCalledTimes(2);
      expect(aarcSDK.alchemy.getAlchemySCW).toHaveBeenCalledWith(owner, 0);
      expect(aarcSDK.alchemy.getAlchemySCW).toHaveBeenCalledWith(owner, 1);

      expect(Array.isArray(accounts)).toBe(true);
      expect(accounts.length).toBeGreaterThan(0);

      for (const account of accounts) {
        expect(account).toHaveProperty('address');
        expect(account).toHaveProperty('isDeployed');
      }

      expect(accounts[0].address).toBe('0x1234567890abcdef');
      expect(accounts[0].isDeployed).toBe(true);

      expect(accounts[1].address).toBe('0x9876543210abcdef');
      expect(accounts[1].isDeployed).toBe(false);
    });

    it('should throw an error if there is an error while getting alchemy smart accounts', async () => {
      const owner = '0x1234567890abcdef';
      jest
        .spyOn(aarcSDK.alchemy, 'getAlchemySCW')
        .mockRejectedValue(new Error('Failed to get smart account'));

      await expect(aarcSDK.alchemy.getAllAlchemySCWs(owner)).rejects.toThrow(
        'Failed to get smart account',
      );
    });
  });

  describe('getAlchemySCW', () => {
    it('should return SmartAccountResponse', async () => {
      const owner = '0x1234567890abcdef';

      const account = await aarcSDK.alchemy.getAlchemySCW(owner, 0);

      expect(account).toHaveProperty('address');
      expect(account).toHaveProperty('isDeployed');
      expect(account.address).toBe(
        '0x90FD3CE197cb41fcFf401dF8DD9866C7f503eC22',
      );
      expect(account.isDeployed).toBe(false);
    });

    it('should return SmartAccountResponse with isDeployed true', async () => {
      const owner = '0x1234567890abcdef';

      mockProvidersInstance.getCode = jest
        .fn()
        .mockImplementation(() => Promise.resolve('0x1234567890abcdef'));

      const account = await aarcSDK.alchemy.getAlchemySCW(owner, 0);

      expect(account).toHaveProperty('address');
      expect(account).toHaveProperty('isDeployed');
      expect(account.address).toBe(
        '0x90FD3CE197cb41fcFf401dF8DD9866C7f503eC22',
      );
      expect(account.isDeployed).toBe(true);
    });

    it('should throw an error if there is an error while getting alchemy smart accounts', async () => {
      const owner = '0x1234567890abcdef';
      jest
        .spyOn(aarcSDK.alchemy, 'getAlchemySCW')
        .mockRejectedValue(new Error('Failed to get smart account'));

      await expect(aarcSDK.alchemy.getAllAlchemySCWs(owner)).rejects.toThrow(
        'Failed to get smart account',
      );
    });
  });

  describe('deployAlchemySCW', () => {
    it('should return a DeployWalletReponse', async () => {
      const owner = '0x1234567890abcdef';
      const nonce = 0;

      const response = await aarcSDK.deployWallet({
        walletType: WALLET_TYPE.ALCHEMY,
        signer,
        owner,
        deploymentWalletIndex: nonce,
      });

      expect(response).toHaveProperty('smartWalletOwner', owner);
      expect(response).toHaveProperty('deploymentWalletIndex', nonce);
      expect(response).toHaveProperty('txHash');
      expect(response).toHaveProperty('chainId', chainId);

      expect(response.txHash).toBe('0x1234567890abcdef');
    });

    it('should throw an error if there is txHash is missing', async () => {
      const owner = '0x1234567890abcdef';
      const nonce = 0;

      mockContractInstance.createAccount = jest
        .fn()
        .mockImplementation(() => Promise.resolve({}));

      await expect(
        aarcSDK.deployWallet({
          walletType: WALLET_TYPE.ALCHEMY,
          signer,
          owner,
          deploymentWalletIndex: nonce,
        }),
      ).rejects.toThrow('error while deploying alchemy smart account');
    });

    it('should throw an error if there is an error while generating alchemy smart account', async () => {
      const owner = '0x1234567890abcdef';
      mockContractInstance.createAccount = jest
        .fn()
        .mockRejectedValue(new Error('Failed to generate smart account'));

      await expect(
        aarcSDK.deployWallet({
          walletType: WALLET_TYPE.ALCHEMY,
          signer,
          owner,
        }),
      ).rejects.toThrow('Failed to generate smart account');
    });
  });
});
