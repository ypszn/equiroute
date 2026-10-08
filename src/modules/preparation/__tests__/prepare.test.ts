import { describe, it, expect } from "vitest";
import { validatePrepareInput } from "../prepare";

describe("preparation public wallet validation", () => {
  it("rejects the zero address before any provider call can occur", () => {
    expect(validatePrepareInput({ ticker: "NVDA", notionalUsd: "10", userWalletAddress: "0x0000000000000000000000000000000000000000", slippagePercent: "0.5" })).toBeNull();
  });
});
