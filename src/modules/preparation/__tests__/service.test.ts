import { describe, expect, it, vi } from "vitest";
import { normalizeSimulation, normalizeSwapResponse, simulatePreparedRoute, validatePreparedRoute, buildSelectedRoute, PreparationError, inspectRawSwapResponse, transactionFidelity } from "../service";
import type { BinanceClient } from "../../../lib/binance/client";
import type { NormalizedQuote } from "../../routing/types";

process.env.OC_API_KEY = "test";
process.env.OC_SECRET_KEY = "test";
process.env.OC_BASE_URL = "https://web3.binance.com/build";

const quote: NormalizedQuote = {
  provider: "bstock", symbol: "NVDAB", contractAddress: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
  available: true, vendorName: "LiquidMesh", executionMode: "SWAP", inputAmountUsd: "10", inputAmountRaw: "10000000000000000000", outputTokenAmount: "0.04",
  estimatedUnderlyingShares: "0.04", effectiveUsdPerShare: "250", priceImpactPercent: null, tradeFee: null,
  estimatedGas: null, dexes: null, quoteId: "fresh-quote", approveTarget: "0xspender", latencyMs: 2,
  ratioStatus: "verified", failureCode: null, failureReason: null, raw: {},
};
const wallet = "0x1111111111111111111111111111111111111111";
const swapBody = { code: 0, data: { quoteId: "fresh-quote", vendorName: "LiquidMesh", executionMode: "SWAP", tx: { from: wallet, to: "0x2222222222222222222222222222222222222222", data: "0x1234", value: "0", gas: "400000", minReceiveAmount: "40000000000000000", signatureData: JSON.stringify({ approveContract: "0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5", approveTxCalldata: "0x095ea7b3" + "0".repeat(24) + "b44446b0c8e56988c34f7f73ae904982b5fdda5" + "0".repeat(24) + "8ac7230489e80000" }) } } };

describe("swap preparation", () => {
  it("builds with exact selected quote data and required approval metadata", async () => {
    const signedGet = vi.fn(async (_path: string, params: Record<string, string>) => {
      expect(params.quoteId).toBe("fresh-quote");
      expect(params.toTokenAddress).toBe(quote.contractAddress);
      expect(params.amount).toBe("10000000000000000000");
      expect(params.userWalletAddress).toBe(wallet);
      expect(params.approveTransaction).toBe("true");
      return { status: 200, body: swapBody, latencyMs: 4, signedPath: "" };
    });
    const route = await buildSelectedRoute({ signedGet } as unknown as BinanceClient, quote, { amount: "10000000000000000000", wallet, chainId: 56, slippagePercent: "0.5" });
    expect(signedGet).toHaveBeenCalledOnce();
    expect(route.transaction?.data).toBe("0x1234");
    expect(route.approval?.spender?.toLowerCase()).toBe("0xb44446b0c8e56988c34f7ff73ae904982b5fdda5");
    expect(route.approval?.calldata?.startsWith("0x095ea7b3")).toBe(true);
    expect(route.approval?.status).toBe("unknown");
    expect(route.approval?.tokenAddress).toBe("0x55d398326f99059ff775485246999027b3197955");
    expect(route.transaction?.minReceiveAmount).toBe("40000000000000000");
    expect(inspectRawSwapResponse(swapBody, wallet).returnedTxFrom).toBe(wallet);
    expect(inspectRawSwapResponse(swapBody, wallet).rawApprovalMetadata.approveCalldata).toBe(true);
    expect(route.raw).toBe(swapBody);
  });

  it("rejects mismatched/expired quote results and malformed tx", () => {
    expect(() => normalizeSwapResponse(quote, { data: { quoteId: "other", tx: {} } }, wallet, "0.5")).toThrowError(PreparationError);
    expect(() => normalizeSwapResponse(quote, { data: { quoteId: "fresh-quote", executionMode: "SWAP" } }, wallet, "0.5")).toThrowError(/neither a simulatable/);
    expect(() => normalizeSwapResponse(quote, { data: { quoteId: "fresh-quote", tx: { from: wallet, to: "0x1", data: "0x", value: "0" } } }, wallet, "0.5")).toThrowError(/neither a simulatable/);
  });

  it("normalizes RFQ typed data and does not simulate without a transaction", async () => {
    const rfq = normalizeSwapResponse({ ...quote, executionMode: "RFQ" }, { data: { quoteId: "fresh-quote", executionMode: "RFQ", vendor: "Ondo", typedDataToSign: "{typed}", signingScheme: "EIP712" } }, wallet, "0.5");
    expect(rfq.rfq?.typedDataToSign).toBe("{typed}");
    const signedPost = vi.fn();
    const simulation = await simulatePreparedRoute({ signedPost } as unknown as BinanceClient, rfq, wallet, 56);
    expect(simulation.attempted).toBe(false);
    expect(simulation.status).toBe("signature_required");
    expect(signedPost).not.toHaveBeenCalled();
  });
});

describe("simulation normalization", () => {  it("parses success balances and allowance changes", () => {
    const raw = { data: { status: "SUCCESS", failReason: null, balanceChanges: [{ contractAddress: quote.contractAddress, tokenType: "ERC20", change: "+0.04", owner: wallet }, { contractAddress: "0xusdt", tokenType: "ERC20", change: "-10", owner: wallet }], allowanceChanges: [{ tokenAddress: "0xusdt", owner: wallet, spender: "0xspender", preAmount: "0", postAmount: "10" }] } };
    const simulation = normalizeSimulation(raw);
    expect(simulation.status).toBe("success");
    expect(simulation.balanceChanges).toHaveLength(2);
    expect(simulation.allowanceChanges[0].spender).toBe("0xspender");
    expect(simulation.raw).toBe(raw);
  });

  it("classifies insufficient allowance and balance without hiding reason", () => {
    expect(normalizeSimulation({ data: { status: "FAILED", failReason: "Insufficient allowance" } }).status).toBe("approval_required");
    const balance = normalizeSimulation({ data: { status: "FAILED", failReason: "Insufficient balance" } });
    expect(balance.status).toBe("failed");
    expect(balance.failReason).toBe("Insufficient balance");
    const unknown = normalizeSimulation({ data: { status: "FAILED", failReason: "execution reverted: BEP20: transfer from the zero address" } });
    expect(unknown.failureClassification).toBe("SIMULATION_REVERT_UNCLASSIFIED");
    expect(unknown.status).toBe("failed");
  });

  it("sends the exact unsigned transaction to simulation and validates safety", async () => {
    const prepared = normalizeSwapResponse(quote, swapBody, wallet, "0.5");
    const diag = inspectRawSwapResponse(swapBody, wallet);
    expect(diag.swapRequestWallet).toBe(wallet);
    expect(diag.returnedTxFrom).toBe(wallet);
    expect(diag.calldataByteLength).toBe(2);
    expect(transactionFidelity(prepared, { evmTx: prepared.transaction })).toEqual({ from: true, to: true, value: true, data: true });
    const signedPost = vi.fn(async (_path: string, _params: Record<string, string>, body: unknown) => {
      const evmTx = (body as { binanceChainId: string; evmTx: { from: string; to: string; value: string; data: string } }).evmTx;
      expect(evmTx.from).toBe(swapBody.data.tx.from);
      expect(evmTx.to).toBe(swapBody.data.tx.to);
      expect(evmTx.value).toBe(swapBody.data.tx.value);
      expect(evmTx.data).toBe(swapBody.data.tx.data);
      expect(body).toEqual({ binanceChainId: "56", evmTx: { from: wallet, to: swapBody.data.tx.to, value: "0", data: "0x1234" } });
      return { status: 200, body: { data: { status: "SUCCESS", balanceChanges: [{ contractAddress: quote.contractAddress, tokenType: "ERC20", change: "+0.04", owner: wallet }], allowanceChanges: [] } }, latencyMs: 2, signedPath: "" };
    });
    const simulation = await simulatePreparedRoute({ signedPost } as unknown as BinanceClient, prepared, wallet, 56);
    expect(simulation.status).toBe("success");
    expect(signedPost).toHaveBeenCalledOnce();
    const checks = validatePreparedRoute(prepared, simulation, wallet, "10", quote.contractAddress, [quote.contractAddress]);
    expect(checks.find((check) => check.name === "expected wallet")?.status).toBe("passed");
    expect(checks.find((check) => check.name === "canonical output token")?.status).toBe("passed");
  });
});
