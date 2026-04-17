// HumanProofEscrowV2 ABI — Agent Commerce Protocol のリファレンス実装

export const ESCROW_ABI = [
  // ── Agent Functions ──
  {
    inputs: [
      { name: 'paymentToken', type: 'address' },
      { name: 'rewardPerWorker', type: 'uint256' },
      { name: 'maxWorkers', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'createBounty',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'bountyId', type: 'uint256' }, { name: 'worker', type: 'address' }],
    name: 'approveSubmission',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'bountyId', type: 'uint256' }, { name: 'worker', type: 'address' }],
    name: 'rejectSubmission',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    name: 'cancelBounty',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // ── Relayer Functions ──
  {
    inputs: [{ name: 'bountyId', type: 'uint256' }, { name: 'worker', type: 'address' }],
    name: 'registerWorker',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'bountyId', type: 'uint256' }, { name: 'worker', type: 'address' }],
    name: 'markSubmitted',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // ── Public Functions ──
  {
    inputs: [{ name: 'bountyId', type: 'uint256' }, { name: 'worker', type: 'address' }],
    name: 'autoApprove',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    name: 'reclaimAfterDeadline',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'bountyId', type: 'uint256' }, { name: 'worker', type: 'address' }],
    name: 'reclaimForWorker',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // ── View Functions ──
  {
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    name: 'getBounty',
    outputs: [{
      components: [
        { name: 'agent', type: 'address' },
        { name: 'paymentToken', type: 'address' },
        { name: 'rewardPerWorker', type: 'uint256' },
        { name: 'maxWorkers', type: 'uint256' },
        { name: 'acceptedWorkers', type: 'uint256' },
        { name: 'completedWorkers', type: 'uint256' },
        { name: 'totalDeposited', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'status', type: 'uint8' },
      ],
      name: '',
      type: 'tuple',
    }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'bountyId', type: 'uint256' }, { name: 'worker', type: 'address' }],
    name: 'getWorkerTask',
    outputs: [{
      components: [
        { name: 'worker', type: 'address' },
        { name: 'submissionStatus', type: 'uint8' },
        { name: 'submittedAt', type: 'uint256' },
        { name: 'paid', type: 'bool' },
      ],
      name: '',
      type: 'tuple',
    }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'getContractBalance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'rewardPerWorker', type: 'uint256' },
      { name: 'maxWorkers', type: 'uint256' },
    ],
    name: 'calculateTotalCost',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'bountyCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'getTokenFeeBps',
    outputs: [
      { name: 'platformBps', type: 'uint256' },
      { name: 'protocolBps', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // ── Events ──
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: true, name: 'agent', type: 'address' },
      { indexed: false, name: 'paymentToken', type: 'address' },
      { indexed: false, name: 'rewardPerWorker', type: 'uint256' },
      { indexed: false, name: 'maxWorkers', type: 'uint256' },
      { indexed: false, name: 'deadline', type: 'uint256' },
    ],
    name: 'BountyCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: true, name: 'worker', type: 'address' },
    ],
    name: 'WorkerRegistered',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: true, name: 'worker', type: 'address' },
    ],
    name: 'SubmissionMarked',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: true, name: 'worker', type: 'address' },
      { indexed: false, name: 'workerPayout', type: 'uint256' },
    ],
    name: 'SubmissionApproved',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: true, name: 'worker', type: 'address' },
    ],
    name: 'SubmissionRejected',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: true, name: 'worker', type: 'address' },
      { indexed: false, name: 'workerPayout', type: 'uint256' },
    ],
    name: 'AutoApproved',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'bountyId', type: 'uint256' },
      { indexed: false, name: 'refunded', type: 'uint256' },
    ],
    name: 'BountyCancelled',
    type: 'event',
  },
] as const;

export const ERC20_ABI = [
  {
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
