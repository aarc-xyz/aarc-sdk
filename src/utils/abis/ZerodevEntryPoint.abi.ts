export const ZERODEV_ENTRY_POINT_ABI = [
  {
    inputs: [
      {
        internalType: 'bytes',
        name: 'initCode',
        type: 'bytes',
      },
    ],
    name: 'getSenderAddress',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'sender',
        type: 'address',
      },
    ],
    name: 'SenderAddressResult',
    type: 'error',
  },
] as const;
