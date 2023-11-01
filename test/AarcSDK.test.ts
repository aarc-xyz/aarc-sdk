import AarcSDK from '../src/AarcSDK';
import { sendRequest } from '../src/utils/HttpRequest';
import { Wallet, providers } from 'ethers';

describe('AarcSDK', () => {
    let aarcSDK;

    let mockSigner;

    beforeEach(() => {
        // Create a mock signer using ethers
        mockSigner = new Wallet('a1a3f989b9a4f9b9808350ebce61477103a2e38b6be8c86063b6cb43f943ebfd', new providers.JsonRpcProvider());

        aarcSDK = new AarcSDK(mockSigner);
    });

    describe('init', () => {
        it('should initialize the SDK with an owner and predict the smart wallet address', async () => {
            const owner = '0x98150396C356C55a848B2baBA6aC7614615a595b';
            const config = {
                owners: [owner],
                threshold: 1,
            };

            // Mock SafeFactory.create
            jest.spyOn(AarcSDK.prototype.safeFactory, 'predictSafeAddress').mockResolvedValue('0x789def');

            await aarcSDK.init(owner);

            expect(aarcSDK.owner).toBe(owner);
            expect(aarcSDK.smartWalletAddress).toBe('0x789def');
            expect(AarcSDK.prototype.safeFactory.predictSafeAddress).toHaveBeenCalledWith(config, '0');
        });

        it('should handle errors during initialization', async () => {
            const owner = '0x98150396C356C55a848B2baBA6aC7614615a595b';

            // Mock an error during SafeFactory.create
            jest.spyOn(AarcSDK.prototype.safeFactory, 'predictSafeAddress').mockRejectedValue(new Error('Initialization error'));

            await expect(aarcSDK.init(owner)).rejects.toThrow('Error creating safe');
        });
    });

    // describe('fetchBalances', () => {
    //     it('should make a Covalent API call and return the response', async () => {
    //         const balancesDto = {
    //             chainId: 1,
    //             address: '0x98150396C356C55a848B2baBA6aC7614615a595b',
    //         };

    //         // Mock the response from sendRequest
    //         const mockResponse = { data: 'mock response data' };
    //         (sendRequest as jest.Mock).mockResolvedValue(mockResponse);

    //         const response = await aarcSDK.fetchBalances(balancesDto);

    //         expect(response).toEqual(mockResponse);
    //         expect(sendRequest).toHaveBeenCalledWith({
    //             url: 'your_api_endpoint_here', // Provide the actual endpoint
    //             method: 'POST',
    //             body: balancesDto,
    //         });
    //     });

    //     it('should handle errors during the API call', async () => {
    //         const balancesDto = {
    //             chainId: 1,
    //             address: '0x98150396C356C55a848B2baBA6aC7614615a595b',
    //         };
    //         // Mock an error during the API call
    //         const error = new Error('API call error');
    //         (sendRequest as jest.Mock).mockRejectedValue(error);

    //         await expect(aarcSDK.fetchBalances(balancesDto)).rejects.toThrow(error);
    //     });
    // });
});
