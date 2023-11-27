// Mock the permitTransferFrom method
jest.mock('ethers', () => {
    const actualEth = jest.requireActual('ethers');
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