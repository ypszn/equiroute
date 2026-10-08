import { describe, it, expect } from "vitest";
import { validateAgenticPreflightInput } from "../preflight";

describe("Agentic preflight input", () => {
  it("rejects browser-provided wallet override fields", () => {
    expect(validateAgenticPreflightInput({ ticker: "NVDA", notionalUsd: "10", userWalletAddress: "0x1111111111111111111111111111111111111111" })).toBeNull();
    expect(validateAgenticPreflightInput({ ticker: "NVDA", notionalUsd: "10", address: "0x1111111111111111111111111111111111111111" })).toBeNull();
  });
});
