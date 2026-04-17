// デプロイ済みコントラクトアドレスとチェーン設定

export const WORLD_CHAIN_ID = 480 as const;

export const DEPLOYMENTS = {
  [WORLD_CHAIN_ID]: {
    escrow: '0xB9f9919fAF810639522cdA4F415C3de9ffD212Dc' as const,
    usdc: '0x79a02482a880bce3f13e09da970dc34db4cd24d1' as const,
    wld: '0x2cFc85d8E48F8EAB294be644d9E25C3030863003' as const,
    relayer: '0x7081957816e03c9D4FDA6B8eD21CA2462B7707Ba' as const,
  },
} as const;

export const TOKEN_DECIMALS = {
  USDC: 6,
  WLD: 18,
} as const;

export const AUTO_APPROVE_DELAY = 259_200; // 3 days in seconds
export const MAX_REWARD_USDC = 100_000_000n; // $100 (6 decimals)
export const MAX_REWARD_WLD = 1_000_000_000_000_000_000_000n; // 1000 WLD (18 decimals)
export const MAX_WORKERS = 100;
