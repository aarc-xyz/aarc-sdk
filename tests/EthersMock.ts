// Mock the permitTransferFrom method
jest.mock('ethers', () => {
    const actualEth = jest.requireActual('ethers');

    const mockPopulateTransaction = {
        permitTransferFrom: jest
        .fn()
        .mockImplementation(
            async (
                batchDto: any,
                tokenPermissions: any,
                from: string,
                signature: string,
            ) => {
                return { data: '0x',hash: 'permit-token-transfer-0x1234567890' };
            },
        ),
    };

    const mockContract = {
        permitTransferFrom: jest
            .fn()
            .mockImplementation(
                async (
                    batchDto: any,
                    tokenPermissions: any,
                    from: string,
                    signature: string,
                ) => {
                    return { hash: 'permit-token-transfer-0x1234567890' };
                },
            ),
        nonceBitmap: jest.fn().mockImplementation(async (owner: string, nonce: string) => {
            return 123324
        }),
        populateTransaction: mockPopulateTransaction,
    };

    const mockContractFactory = {
        getContract: () => mockContract,
    };

    return {
        ...actualEth,
        Contract: jest.fn(() => mockContract),
        ContractFactory: jest.fn(() => mockContractFactory),
    };
});