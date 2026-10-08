import type { EquityRepresentation } from "./types";

/** Canonical BSC allowlist. Live ratio metadata is resolved separately. */
export const NVDA_REPRESENTATIONS: readonly EquityRepresentation[] = [
  {
    underlying: "NVDA",
    provider: "ondo",
    symbol: "NVDAon",
    chainId: 56,
    contractAddress: "0xa9ee28c80f960b889dfbd1902055218cba016f75",
    recognized: true,
    ratioStatus: "unavailable",
    tokenDecimals: 18,
  },
  {
    underlying: "NVDA",
    provider: "bstock",
    symbol: "NVDAB",
    chainId: 56,
    contractAddress: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
    recognized: true,
    ratioStatus: "unavailable",
    tokenDecimals: 18,
  },
  {
    underlying: "NVDA",
    provider: "xstock",
    symbol: "NVDAx",
    chainId: 56,
    contractAddress: "0xc845b2894dbddd03858fd2d643b4ef725fe0849d",
    recognized: true,
    ratioStatus: "unavailable",
    tokenDecimals: 18,
  },
] as const;
