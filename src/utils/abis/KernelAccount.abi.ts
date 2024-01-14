export const KERNEL_ACCOUNT_ABI = [
  {
    inputs: [
      {
        internalType: 'contract IKernelValidator',
        name: '_defaultValidator',
        type: 'address',
      },
      {
        internalType: 'bytes',
        name: '_data',
        type: 'bytes',
      },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;
