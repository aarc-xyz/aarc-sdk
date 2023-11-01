"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AarcSDK_1 = __importDefault(require("../src/AarcSDK"));
const ethers_1 = require("ethers");
describe('AarcSDK', () => {
    let aarcSDK;
    let mockSigner;
    beforeEach(() => {
        // Create a mock signer using ethers
        mockSigner = new ethers_1.Wallet('a1a3f989b9a4f9b9808350ebce61477103a2e38b6be8c86063b6cb43f943ebfd', new ethers_1.providers.JsonRpcProvider());
        aarcSDK = new AarcSDK_1.default(mockSigner);
    });
    describe('init', () => {
        it('should initialize the SDK with an owner and predict the smart wallet address', () => __awaiter(void 0, void 0, void 0, function* () {
            const owner = '0x98150396C356C55a848B2baBA6aC7614615a595b';
            const config = {
                owners: [owner],
                threshold: 1,
            };
            // Mock SafeFactory.create
            jest.spyOn(AarcSDK_1.default.prototype.safeFactory, 'predictSafeAddress').mockResolvedValue('0x789def');
            yield aarcSDK.init(owner);
            expect(aarcSDK.owner).toBe(owner);
            expect(aarcSDK.smartWalletAddress).toBe('0x789def');
            expect(AarcSDK_1.default.prototype.safeFactory.predictSafeAddress).toHaveBeenCalledWith(config, '0');
        }));
        it('should handle errors during initialization', () => __awaiter(void 0, void 0, void 0, function* () {
            const owner = '0x98150396C356C55a848B2baBA6aC7614615a595b';
            // Mock an error during SafeFactory.create
            jest.spyOn(AarcSDK_1.default.prototype.safeFactory, 'predictSafeAddress').mockRejectedValue(new Error('Initialization error'));
            yield expect(aarcSDK.init(owner)).rejects.toThrow('Error creating safe');
        }));
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
