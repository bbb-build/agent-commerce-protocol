import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ACPClient } from '../client.js';
import { ESCROW_ABI, ERC20_ABI } from '../abi.js';
import { DEPLOYMENTS, WORLD_CHAIN_ID } from '../constants.js';
import { TaskStatus, SubmissionStatus } from '../types.js';

// ---------------------------------------------------------------------------
// ヘルパー: viem の PublicClient / WalletClient モック生成
// ---------------------------------------------------------------------------

const AGENT_ADDR = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA01' as const;
const WORKER_ADDR = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB02' as const;
const TOKEN_ADDR = DEPLOYMENTS[WORLD_CHAIN_ID].usdc;
const ESCROW_ADDR = DEPLOYMENTS[WORLD_CHAIN_ID].escrow;

function createMockPublicClient(overrides?: Record<string, any>) {
  return {
    readContract: vi.fn().mockResolvedValue(0n),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({
      logs: [],
    }),
    watchContractEvent: vi.fn().mockReturnValue(vi.fn()), // unwatch function
    ...overrides,
  } as any;
}

function createMockWalletClient(overrides?: Record<string, any>) {
  return {
    account: { address: AGENT_ADDR },
    writeContract: vi.fn().mockResolvedValue('0xabcdef1234567890' as `0x${string}`),
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// テスト: コンストラクタ
// ---------------------------------------------------------------------------

describe('ACPClient constructor', () => {
  it('should create a client with default World Chain deployment', () => {
    const pub = createMockPublicClient();
    const client = new ACPClient({ publicClient: pub });

    // tokens getter で正しいアドレスが返ることを検証
    expect(client.tokens.USDC).toBe(DEPLOYMENTS[WORLD_CHAIN_ID].usdc);
    expect(client.tokens.WLD).toBe(DEPLOYMENTS[WORLD_CHAIN_ID].wld);
  });

  it('should accept a custom escrow address', () => {
    const pub = createMockPublicClient();
    const customAddr = '0x1111111111111111111111111111111111111111' as const;
    const client = new ACPClient({
      publicClient: pub,
      config: { escrowAddress: customAddr },
    });

    // カスタムアドレスでも例外なく構築できる
    expect(client).toBeDefined();
  });

  it('should throw if chain has no deployment and no custom escrow', () => {
    const pub = createMockPublicClient();
    expect(() =>
      new ACPClient({
        publicClient: pub,
        config: { chainId: 999 },
      }),
    ).toThrow('No deployment for chain 999');
  });

  it('should allow custom chain with explicit escrow address', () => {
    const pub = createMockPublicClient();
    const customAddr = '0x2222222222222222222222222222222222222222' as const;
    // カスタムチェーン + カスタムアドレスなら例外なし
    const client = new ACPClient({
      publicClient: pub,
      config: { chainId: 999, escrowAddress: customAddr },
    });
    expect(client).toBeDefined();
  });

  it('should throw when tokens getter is called on unsupported chain', () => {
    const pub = createMockPublicClient();
    const customAddr = '0x3333333333333333333333333333333333333333' as const;
    const client = new ACPClient({
      publicClient: pub,
      config: { chainId: 999, escrowAddress: customAddr },
    });
    expect(() => client.tokens).toThrow('No token addresses for chain 999');
  });

  it('should work without walletClient (read-only mode)', () => {
    const pub = createMockPublicClient();
    const client = new ACPClient({ publicClient: pub });
    expect(client).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// テスト: ユーティリティ関数
// ---------------------------------------------------------------------------

describe('ACPClient utility functions', () => {
  let client: ACPClient;

  beforeEach(() => {
    client = new ACPClient({ publicClient: createMockPublicClient() });
  });

  describe('parseUSDC / formatUSDC', () => {
    it('should parse 1 USDC to 1_000_000', () => {
      expect(client.parseUSDC(1)).toBe(1_000_000n);
    });

    it('should parse 5.50 USDC correctly', () => {
      expect(client.parseUSDC(5.5)).toBe(5_500_000n);
    });

    it('should parse 0 USDC', () => {
      expect(client.parseUSDC(0)).toBe(0n);
    });

    it('should format 1_000_000 to "1.00"', () => {
      expect(client.formatUSDC(1_000_000n)).toBe('1.00');
    });

    it('should format 5_500_000 to "5.50"', () => {
      expect(client.formatUSDC(5_500_000n)).toBe('5.50');
    });

    it('should round-trip parseUSDC -> formatUSDC', () => {
      const amount = 42.99;
      const parsed = client.parseUSDC(amount);
      const formatted = client.formatUSDC(parsed);
      expect(formatted).toBe('42.99');
    });
  });

  describe('parseWLD / formatWLD', () => {
    it('should parse 1 WLD to 1e18', () => {
      expect(client.parseWLD(1)).toBe(1_000_000_000_000_000_000n);
    });

    it('should parse 0.5 WLD correctly', () => {
      expect(client.parseWLD(0.5)).toBe(500_000_000_000_000_000n);
    });

    it('should format 1e18 to "1.0000"', () => {
      expect(client.formatWLD(1_000_000_000_000_000_000n)).toBe('1.0000');
    });

    it('should round-trip parseWLD -> formatWLD', () => {
      const amount = 3.5;
      const parsed = client.parseWLD(amount);
      const formatted = client.formatWLD(parsed);
      expect(formatted).toBe('3.5000');
    });
  });
});

// ---------------------------------------------------------------------------
// テスト: 読み取り専用メソッド
// ---------------------------------------------------------------------------

describe('ACPClient read methods', () => {
  it('getTask should call readContract with correct args and map result', async () => {
    const rawTask = {
      agent: AGENT_ADDR,
      paymentToken: TOKEN_ADDR,
      rewardPerWorker: 5_000_000n,
      maxWorkers: 10n,
      acceptedWorkers: 3n,
      completedWorkers: 1n,
      totalDeposited: 50_000_000n,
      deadline: 1700000000n,
      status: 0,
    };

    const pub = createMockPublicClient({
      readContract: vi.fn().mockResolvedValue(rawTask),
    });
    const client = new ACPClient({ publicClient: pub });

    const task = await client.getTask(1n);

    expect(pub.readContract).toHaveBeenCalledWith({
      address: ESCROW_ADDR,
      abi: ESCROW_ABI,
      functionName: 'getBounty',
      args: [1n],
    });
    expect(task.agent).toBe(AGENT_ADDR);
    expect(task.paymentToken).toBe(TOKEN_ADDR);
    expect(task.rewardPerWorker).toBe(5_000_000n);
    expect(task.maxWorkers).toBe(10n);
    expect(task.acceptedWorkers).toBe(3n);
    expect(task.completedWorkers).toBe(1n);
    expect(task.totalDeposited).toBe(50_000_000n);
    expect(task.deadline).toBe(1700000000n);
    expect(task.status).toBe(TaskStatus.Open);
  });

  it('getWorkerTask should call readContract with correct args and map result', async () => {
    const rawWorkerTask = {
      worker: WORKER_ADDR,
      submissionStatus: 2,
      submittedAt: 1700000000n,
      paid: true,
    };

    const pub = createMockPublicClient({
      readContract: vi.fn().mockResolvedValue(rawWorkerTask),
    });
    const client = new ACPClient({ publicClient: pub });

    const wt = await client.getWorkerTask(1n, WORKER_ADDR);

    expect(pub.readContract).toHaveBeenCalledWith({
      address: ESCROW_ADDR,
      abi: ESCROW_ABI,
      functionName: 'getWorkerTask',
      args: [1n, WORKER_ADDR],
    });
    expect(wt.worker).toBe(WORKER_ADDR);
    expect(wt.submissionStatus).toBe(SubmissionStatus.Approved);
    expect(wt.submittedAt).toBe(1700000000n);
    expect(wt.paid).toBe(true);
  });

  it('calculateTotalCost should forward call to readContract', async () => {
    const pub = createMockPublicClient({
      readContract: vi.fn().mockResolvedValue(55_000_000n),
    });
    const client = new ACPClient({ publicClient: pub });

    const cost = await client.calculateTotalCost(TOKEN_ADDR, 5_000_000n, 10);

    expect(pub.readContract).toHaveBeenCalledWith({
      address: ESCROW_ADDR,
      abi: ESCROW_ABI,
      functionName: 'calculateTotalCost',
      args: [TOKEN_ADDR, 5_000_000n, 10n],
    });
    expect(cost).toBe(55_000_000n);
  });

  it('taskCount should return bountyCount from contract', async () => {
    const pub = createMockPublicClient({
      readContract: vi.fn().mockResolvedValue(42n),
    });
    const client = new ACPClient({ publicClient: pub });

    const count = await client.taskCount();
    expect(count).toBe(42n);
    expect(pub.readContract).toHaveBeenCalledWith({
      address: ESCROW_ADDR,
      abi: ESCROW_ABI,
      functionName: 'bountyCount',
    });
  });

  it('getFeeBps should return platform and protocol fee bps', async () => {
    const pub = createMockPublicClient({
      readContract: vi.fn().mockResolvedValue([100n, 50n]),
    });
    const client = new ACPClient({ publicClient: pub });

    const fees = await client.getFeeBps(TOKEN_ADDR);
    expect(fees.platformBps).toBe(100n);
    expect(fees.protocolBps).toBe(50n);
  });

  it('contractBalance should return balance for given token', async () => {
    const pub = createMockPublicClient({
      readContract: vi.fn().mockResolvedValue(1_000_000_000n),
    });
    const client = new ACPClient({ publicClient: pub });

    const balance = await client.contractBalance(TOKEN_ADDR);
    expect(balance).toBe(1_000_000_000n);
  });
});

// ---------------------------------------------------------------------------
// テスト: 書き込みメソッド（WalletClient必須）
// ---------------------------------------------------------------------------

describe('ACPClient write methods', () => {
  it('should throw when calling write method without walletClient', async () => {
    const pub = createMockPublicClient();
    const client = new ACPClient({ publicClient: pub });

    await expect(client.release(1n, WORKER_ADDR)).rejects.toThrow(
      'WalletClient with account required for write operations',
    );
  });

  it('should throw when walletClient has no account', async () => {
    const pub = createMockPublicClient();
    const wallet = createMockWalletClient({ account: undefined });
    const client = new ACPClient({ publicClient: pub, walletClient: wallet });

    await expect(client.release(1n, WORKER_ADDR)).rejects.toThrow(
      'WalletClient with account required for write operations',
    );
  });

  describe('release', () => {
    it('should call approveSubmission and wait for receipt', async () => {
      const txHash = '0xabc123' as `0x${string}`;
      const pub = createMockPublicClient();
      const wallet = createMockWalletClient({
        writeContract: vi.fn().mockResolvedValue(txHash),
      });
      const client = new ACPClient({ publicClient: pub, walletClient: wallet });

      const hash = await client.release(1n, WORKER_ADDR);

      expect(hash).toBe(txHash);
      expect(wallet.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: ESCROW_ADDR,
          abi: ESCROW_ABI,
          functionName: 'approveSubmission',
          args: [1n, WORKER_ADDR],
        }),
      );
      expect(pub.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: txHash });
    });
  });

  describe('reject', () => {
    it('should call rejectSubmission', async () => {
      const txHash = '0xdef456' as `0x${string}`;
      const pub = createMockPublicClient();
      const wallet = createMockWalletClient({
        writeContract: vi.fn().mockResolvedValue(txHash),
      });
      const client = new ACPClient({ publicClient: pub, walletClient: wallet });

      const hash = await client.reject(2n, WORKER_ADDR);

      expect(hash).toBe(txHash);
      expect(wallet.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'rejectSubmission',
          args: [2n, WORKER_ADDR],
        }),
      );
    });
  });

  describe('autoRelease', () => {
    it('should call autoApprove', async () => {
      const txHash = '0xauto01' as `0x${string}`;
      const pub = createMockPublicClient();
      const wallet = createMockWalletClient({
        writeContract: vi.fn().mockResolvedValue(txHash),
      });
      const client = new ACPClient({ publicClient: pub, walletClient: wallet });

      const hash = await client.autoRelease(5n, WORKER_ADDR);

      expect(hash).toBe(txHash);
      expect(wallet.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'autoApprove',
          args: [5n, WORKER_ADDR],
        }),
      );
    });
  });

  describe('reclaim', () => {
    it('should call reclaimForWorker when worker is provided', async () => {
      const txHash = '0xreclaim01' as `0x${string}`;
      const pub = createMockPublicClient();
      const wallet = createMockWalletClient({
        writeContract: vi.fn().mockResolvedValue(txHash),
      });
      const client = new ACPClient({ publicClient: pub, walletClient: wallet });

      const hash = await client.reclaim(3n, WORKER_ADDR);

      expect(hash).toBe(txHash);
      expect(wallet.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'reclaimForWorker',
          args: [3n, WORKER_ADDR],
        }),
      );
    });

    it('should call cancelBounty when no worker and acceptedWorkers is 0', async () => {
      const txHash = '0xcancel01' as `0x${string}`;
      const pub = createMockPublicClient({
        readContract: vi.fn().mockResolvedValue({
          agent: AGENT_ADDR,
          paymentToken: TOKEN_ADDR,
          rewardPerWorker: 5_000_000n,
          maxWorkers: 10n,
          acceptedWorkers: 0n,
          completedWorkers: 0n,
          totalDeposited: 50_000_000n,
          deadline: 1700000000n,
          status: 0,
        }),
      });
      const wallet = createMockWalletClient({
        writeContract: vi.fn().mockResolvedValue(txHash),
      });
      const client = new ACPClient({ publicClient: pub, walletClient: wallet });

      const hash = await client.reclaim(3n);

      expect(hash).toBe(txHash);
      expect(wallet.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'cancelBounty',
          args: [3n],
        }),
      );
    });

    it('should call reclaimAfterDeadline when no worker and acceptedWorkers > 0', async () => {
      const txHash = '0xreclaim02' as `0x${string}`;
      const pub = createMockPublicClient({
        readContract: vi.fn().mockResolvedValue({
          agent: AGENT_ADDR,
          paymentToken: TOKEN_ADDR,
          rewardPerWorker: 5_000_000n,
          maxWorkers: 10n,
          acceptedWorkers: 3n,
          completedWorkers: 1n,
          totalDeposited: 50_000_000n,
          deadline: 1700000000n,
          status: 0,
        }),
      });
      const wallet = createMockWalletClient({
        writeContract: vi.fn().mockResolvedValue(txHash),
      });
      const client = new ACPClient({ publicClient: pub, walletClient: wallet });

      const hash = await client.reclaim(3n);

      expect(hash).toBe(txHash);
      expect(wallet.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'reclaimAfterDeadline',
          args: [3n],
        }),
      );
    });
  });

  describe('lock', () => {
    it('should approve ERC-20 when allowance is insufficient and then create bounty', async () => {
      const approveTxHash = '0xapprove01' as `0x${string}`;
      const createTxHash = '0xcreate01' as `0x${string}`;

      // readContract: first call returns allowance (0n), second returns totalCost (55_000_000n)
      const readContract = vi.fn()
        // calculateTotalCost
        .mockResolvedValueOnce(55_000_000n)
        // allowance
        .mockResolvedValueOnce(0n);

      const pub = createMockPublicClient({
        readContract,
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
          logs: [
            {
              // 擬似BountyCreatedイベントログ
              address: ESCROW_ADDR,
              topics: [],
              data: '0x',
              blockNumber: 100n,
              transactionHash: createTxHash,
              logIndex: 0,
              blockHash: '0x' as `0x${string}`,
              transactionIndex: 0,
              removed: false,
            },
          ],
        }),
      });

      const writeContract = vi.fn()
        .mockResolvedValueOnce(approveTxHash) // approve
        .mockResolvedValueOnce(createTxHash); // createBounty

      const wallet = createMockWalletClient({ writeContract });
      const client = new ACPClient({ publicClient: pub, walletClient: wallet });

      // parseEventLogs が BountyCreated を返すようにモックが必要
      // ただし parseEventLogs は viem からインポートされた純粋関数なので、
      // ログに正しいデータを含める必要がある。
      // テストではこの部分を簡略化し、lock 内で parseEventLogs が空を返してエラーになるケースをテストする
      await expect(
        client.lock({
          paymentToken: TOKEN_ADDR,
          rewardPerWorker: 5_000_000n,
          maxWorkers: 10,
          deadline: 1700000000n,
        }),
      ).rejects.toThrow('BountyCreated event not found in receipt');

      // approve が呼ばれたことを確認（allowance 0 < totalCost 55M）
      expect(writeContract).toHaveBeenCalledTimes(2);
      expect(writeContract.mock.calls[0][0]).toMatchObject({
        address: TOKEN_ADDR,
        functionName: 'approve',
        args: [ESCROW_ADDR, 55_000_000n],
      });
      expect(writeContract.mock.calls[1][0]).toMatchObject({
        address: ESCROW_ADDR,
        functionName: 'createBounty',
        args: [TOKEN_ADDR, 5_000_000n, 10n, 1700000000n],
      });
    });

    it('should skip ERC-20 approve when allowance is sufficient', async () => {
      const createTxHash = '0xcreate02' as `0x${string}`;

      const readContract = vi.fn()
        // calculateTotalCost
        .mockResolvedValueOnce(55_000_000n)
        // allowance (sufficient)
        .mockResolvedValueOnce(100_000_000n);

      const pub = createMockPublicClient({
        readContract,
        waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
      });

      const writeContract = vi.fn().mockResolvedValueOnce(createTxHash);
      const wallet = createMockWalletClient({ writeContract });
      const client = new ACPClient({ publicClient: pub, walletClient: wallet });

      // BountyCreated イベントが見つからないのでエラーになるが、
      // approve がスキップされたことを確認する
      await expect(
        client.lock({
          paymentToken: TOKEN_ADDR,
          rewardPerWorker: 5_000_000n,
          maxWorkers: 10,
          deadline: 1700000000n,
        }),
      ).rejects.toThrow('BountyCreated event not found in receipt');

      // approve はスキップされ、createBounty のみ
      expect(writeContract).toHaveBeenCalledTimes(1);
      expect(writeContract.mock.calls[0][0]).toMatchObject({
        functionName: 'createBounty',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// テスト: イベント監視
// ---------------------------------------------------------------------------

describe('ACPClient event watching', () => {
  it('watchTaskCreated should register event listener and return unwatch', () => {
    const unwatch = vi.fn();
    const pub = createMockPublicClient({
      watchContractEvent: vi.fn().mockReturnValue(unwatch),
    });
    const client = new ACPClient({ publicClient: pub });

    const callback = vi.fn();
    const result = client.watchTaskCreated(callback);

    expect(pub.watchContractEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ESCROW_ADDR,
        abi: ESCROW_ABI,
        eventName: 'BountyCreated',
      }),
    );
    expect(result).toBe(unwatch);
  });

  it('watchTaskCreated onLogs should invoke callback with parsed args', () => {
    let capturedOnLogs: (logs: any[]) => void;

    const pub = createMockPublicClient({
      watchContractEvent: vi.fn().mockImplementation(({ onLogs }) => {
        capturedOnLogs = onLogs;
        return vi.fn();
      }),
    });
    const client = new ACPClient({ publicClient: pub });

    const callback = vi.fn();
    client.watchTaskCreated(callback);

    // イベントログをシミュレート
    capturedOnLogs!([
      { args: { bountyId: 1n, agent: AGENT_ADDR, paymentToken: TOKEN_ADDR } },
      { args: { bountyId: 2n, agent: AGENT_ADDR, paymentToken: TOKEN_ADDR } },
    ]);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1, 1n, AGENT_ADDR, TOKEN_ADDR);
    expect(callback).toHaveBeenNthCalledWith(2, 2n, AGENT_ADDR, TOKEN_ADDR);
  });

  it('watchApproved should register SubmissionApproved event listener', () => {
    const unwatch = vi.fn();
    const pub = createMockPublicClient({
      watchContractEvent: vi.fn().mockReturnValue(unwatch),
    });
    const client = new ACPClient({ publicClient: pub });

    const callback = vi.fn();
    const result = client.watchApproved(callback);

    expect(pub.watchContractEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ESCROW_ADDR,
        abi: ESCROW_ABI,
        eventName: 'SubmissionApproved',
      }),
    );
    expect(result).toBe(unwatch);
  });

  it('watchApproved onLogs should invoke callback with parsed args', () => {
    let capturedOnLogs: (logs: any[]) => void;

    const pub = createMockPublicClient({
      watchContractEvent: vi.fn().mockImplementation(({ onLogs }) => {
        capturedOnLogs = onLogs;
        return vi.fn();
      }),
    });
    const client = new ACPClient({ publicClient: pub });

    const callback = vi.fn();
    client.watchApproved(callback);

    capturedOnLogs!([
      { args: { bountyId: 7n, worker: WORKER_ADDR, workerPayout: 4_850_000n } },
    ]);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(7n, WORKER_ADDR, 4_850_000n);
  });
});

// ---------------------------------------------------------------------------
// テスト: 型列挙値
// ---------------------------------------------------------------------------

describe('Enum values', () => {
  it('TaskStatus should have correct values', () => {
    expect(TaskStatus.Open).toBe(0);
    expect(TaskStatus.Completed).toBe(1);
    expect(TaskStatus.Cancelled).toBe(2);
  });

  it('SubmissionStatus should have correct values', () => {
    expect(SubmissionStatus.None).toBe(0);
    expect(SubmissionStatus.Submitted).toBe(1);
    expect(SubmissionStatus.Approved).toBe(2);
    expect(SubmissionStatus.Rejected).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// テスト: 定数
// ---------------------------------------------------------------------------

describe('Constants', () => {
  it('WORLD_CHAIN_ID should be 480', () => {
    expect(WORLD_CHAIN_ID).toBe(480);
  });

  it('DEPLOYMENTS should contain World Chain addresses', () => {
    const deployment = DEPLOYMENTS[WORLD_CHAIN_ID];
    expect(deployment).toBeDefined();
    expect(deployment.escrow).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(deployment.usdc).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(deployment.wld).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(deployment.relayer).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});

// ---------------------------------------------------------------------------
// テスト: ABI 構造の検証
// ---------------------------------------------------------------------------

describe('ABI structure', () => {
  it('ESCROW_ABI should contain createBounty function', () => {
    const createBounty = ESCROW_ABI.find(
      (entry) => 'name' in entry && entry.name === 'createBounty',
    );
    expect(createBounty).toBeDefined();
    expect(createBounty!.type).toBe('function');
  });

  it('ESCROW_ABI should contain BountyCreated event', () => {
    const event = ESCROW_ABI.find(
      (entry) => 'name' in entry && entry.name === 'BountyCreated' && entry.type === 'event',
    );
    expect(event).toBeDefined();
  });

  it('ESCROW_ABI should contain all expected function names', () => {
    const functionNames = ESCROW_ABI
      .filter((entry) => entry.type === 'function')
      .map((entry) => (entry as any).name);

    expect(functionNames).toContain('createBounty');
    expect(functionNames).toContain('approveSubmission');
    expect(functionNames).toContain('rejectSubmission');
    expect(functionNames).toContain('cancelBounty');
    expect(functionNames).toContain('registerWorker');
    expect(functionNames).toContain('markSubmitted');
    expect(functionNames).toContain('autoApprove');
    expect(functionNames).toContain('reclaimAfterDeadline');
    expect(functionNames).toContain('reclaimForWorker');
    expect(functionNames).toContain('getBounty');
    expect(functionNames).toContain('getWorkerTask');
    expect(functionNames).toContain('getContractBalance');
    expect(functionNames).toContain('calculateTotalCost');
    expect(functionNames).toContain('bountyCount');
    expect(functionNames).toContain('getTokenFeeBps');
  });

  it('ESCROW_ABI should contain all expected event names', () => {
    const eventNames = ESCROW_ABI
      .filter((entry) => entry.type === 'event')
      .map((entry) => (entry as any).name);

    expect(eventNames).toContain('BountyCreated');
    expect(eventNames).toContain('WorkerRegistered');
    expect(eventNames).toContain('SubmissionMarked');
    expect(eventNames).toContain('SubmissionApproved');
    expect(eventNames).toContain('SubmissionRejected');
    expect(eventNames).toContain('AutoApproved');
    expect(eventNames).toContain('BountyCancelled');
  });

  it('ERC20_ABI should contain approve, allowance, balanceOf, decimals', () => {
    const names = ERC20_ABI.map((entry) => entry.name);
    expect(names).toContain('approve');
    expect(names).toContain('allowance');
    expect(names).toContain('balanceOf');
    expect(names).toContain('decimals');
  });
});
