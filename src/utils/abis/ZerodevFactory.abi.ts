export const ZERODEV_KERNEL_FACTORY_ABI = [
  {
    inputs: [
      { internalType: 'address', name: '_implementation', type: 'address' },
      { internalType: 'bytes', name: '_data', type: 'bytes' },
      { internalType: 'uint256', name: '_index', type: 'uint256' },
    ],
    name: 'createAccount',
    outputs: [{ internalType: 'address', name: 'proxy', type: 'address' }],
    stateMutability: 'payable',
    type: 'function',
  },
];
