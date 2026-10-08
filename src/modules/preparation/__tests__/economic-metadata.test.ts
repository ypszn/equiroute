import { describe, expect, it } from "vitest";
import { validateMinReceive, normalizeApproval, normalizeSwapResponse } from "../service";
import type { NormalizedQuote } from "../../routing/types";

const inputToken = "0x55d398326f99059ff775485246999027b3197955";
const outputRaw = "42322864918184087";
const minValues = ["41851868085182703", "42322864918184087"];
const spender = "0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5";
const calldata = `0x095ea7b3${"0".repeat(24)}${spender.slice(2).toLowerCase()}${BigInt("1000000000000000000").toString(16).padStart(64, "0")}`;
const quote: NormalizedQuote = { provider: "bstock", symbol: "NVDAB", contractAddress: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436", available: true, vendorName: "LiquidMesh", executionMode: "SWAP", inputAmountUsd: "10", inputAmountRaw: "10000000000000000000", outputTokenAmount: "0.042322864918184087", estimatedUnderlyingShares: "0.042", effectiveUsdPerShare: "236", priceImpactPercent: "0.1", tradeFee: null, estimatedGas: null, dexes: null, quoteId: "fresh", approveTarget: null, latencyMs: 1, ratioStatus: "verified", failureCode: null, failureReason: null, raw: null };

describe("captured swap economic metadata", () => {
  it("accepts large base-unit strings and compares with BigInt", () => {
    for (const min of minValues) expect(validateMinReceive(min, outputRaw).status).toBe("passed");
    expect(validateMinReceive("42322864918184088", outputRaw).status).toBe("failed");
    expect(validateMinReceive("004", "0004").status).toBe("passed");
  });

  it("normalizes JSON-string tx.signatureData, verifies approve selector/spender and decodes amount", () => {
    const signatureData = JSON.stringify({ approveContract: spender, approveTxCalldata: calldata });
    const approval = normalizeApproval({ tx: { signatureData } }, inputToken);
    expect(approval?.spender?.toLowerCase()).toBe(spender.toLowerCase());
    expect(approval?.calldata).toBe(calldata);
    expect(approval?.amount).toBe("1000000000000000000");
    expect(approval?.tokenAddress).toBe(inputToken);
    expect(approval?.status).toBe("unknown");
  });

  it("rejects selector/spender mismatches and keeps approval status unknown", () => {
    const mismatch = calldata.slice(0, 34) + "f".repeat(40) + calldata.slice(74);
    const approval = normalizeApproval({ tx: { signatureData: JSON.stringify({ approveContract: spender, approveTxCalldata: mismatch }) } }, inputToken);
    expect(approval?.spender).toBe(spender);
    expect(approval?.amount).toBeNull();
    expect(approval?.status).toBe("unknown");
  });

  it("preserves minReceiveAmount from tx exactly in swap normalization", () => {
    const raw = { code: 0, data: { quoteId: "fresh", tx: { from: "0x1111111111111111111111111111111111111111", to: "0x2222222222222222222222222222222222222222", data: "0x1234", value: "0", minReceiveAmount: minValues[0], signatureData: JSON.stringify({ approveContract: spender, approveTxCalldata: calldata }) } } };
    const prepared = normalizeSwapResponse(quote, raw, "0x1111111111111111111111111111111111111111", "0.5");
    expect(prepared.transaction?.minReceiveAmount).toBe(minValues[0]);
    expect(prepared.approval?.spender?.toLowerCase()).toBe(spender.toLowerCase());
    expect(validateMinReceive(prepared.transaction?.minReceiveAmount ?? null, outputRaw).status).toBe("passed");
  });
});
