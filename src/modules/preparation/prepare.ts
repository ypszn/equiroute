import { createBinanceClient } from "../../lib/binance/client";
import { getRepresentations } from "../registry/registry";
import { createBinanceQuoteProvider } from "../routing/quote-provider";
import { routeIntent } from "../routing/service";
import { tryParseDecimal, isPositive, cmp, parseDecimal } from "../routing/decimal";
import { buildPreExecutionReceipt } from "./build-receipt";
import { buildSelectedRoute, PreparationError, simulatePreparedRoute, validatePreparedRoute, inspectRawSwapResponse } from "./service";
import { validateMandate, DEFAULT_MANDATE, type ExecutionMandate, evaluatePolicy } from "../policy/engine";
import type { PreparationResult } from "./types";

export async function prepareIntent(input: {
  ticker: string;
  notionalUsd: string;
  userWalletAddress: string;
  slippagePercent: string;
  mandate?: ExecutionMandate;
}): Promise<PreparationResult> {
  const client = createBinanceClient();
  const quoteProvider = createBinanceQuoteProvider(client);
  // Fresh route pass happens within this request; no client quoteId is accepted.
  const mandate = input.mandate ?? DEFAULT_MANDATE;
  const routed = await routeIntent({ ticker: input.ticker, notionalUsd: input.notionalUsd, userWalletAddress: input.userWalletAddress }, quoteProvider, client, mandate);
  const selected = routed.selected;
  const alternatives = routed.quotes.filter((quote) => quote !== selected);
  const base: PreparationResult = {
    intent: { ticker: input.ticker.toUpperCase(), notionalUsd: input.notionalUsd, userWalletAddress: input.userWalletAddress, slippagePercent: input.slippagePercent },
    marketContext: routed.marketContext,
    route: { selected, alternatives },
    preparation: { status: selected ? "preparation_failed" : "no_route", stateCode: selected ? null : "NO_EXECUTABLE_ROUTE", preparedRoute: null, approval: null, rfq: null, reason: selected ? null : "No verified executable route available" },
    simulation: { attempted: false, status: "not_available", binanceStatus: null, failReason: selected ? "Preparation not completed" : "No executable route", balanceChanges: [], allowanceChanges: [], failureClassification: null, transactionFidelity: null, raw: null },
    safetyChecks: [],
    diagnostics: undefined,
    mandate,
    policyDecision: routed.policyDecision,
    policyRejectedRoutes: routed.policyRejectedRoutes,
    receipt: null,
  };
  if (!selected) {
    base.preparation = { ...base.preparation, status: routed.policyDecision?.outcome === "blocked" ? "no_route" : base.preparation.status, stateCode: routed.policyDecision?.outcome === "blocked" ? "NO_POLICY_COMPLIANT_ROUTE" : base.preparation.stateCode };
    base.receipt = buildPreExecutionReceipt(base);
    return base;
  }
  try {
    const selectedAmount = selected.inputAmountRaw;
    if (!selectedAmount) throw new Error("Selected quote omitted exact fromTokenAmount; refusing to reconstruct swap amount");
    const prepared = await buildSelectedRoute(client, selected, { amount: selectedAmount, wallet: input.userWalletAddress, chainId: 56, slippagePercent: input.slippagePercent });
    base.diagnostics = {
      requestedWallet: input.userWalletAddress,
      ...inspectRawSwapResponse(prepared.raw, input.userWalletAddress),
      simulationFrom: prepared.transaction?.from ?? null,
      anyZeroAddress: [input.userWalletAddress, prepared.transaction?.from ?? ""].some((address) => address.toLowerCase() === "0x0000000000000000000000000000000000000000"),
      calldataPreserved: null,
      inputBalance: { status: "unknown", balance: null, required: input.notionalUsd, failureCode: null },
      allowanceStatus: prepared.approval ? "unknown" : "unknown",
    };
    const simulation = await simulatePreparedRoute(client, prepared, input.userWalletAddress, 56);
    const canonical = getRepresentations(input.ticker).map((rep) => rep.contractAddress.toLowerCase());
    const safetyChecks = validatePreparedRoute(prepared, simulation, input.userWalletAddress, input.notionalUsd, selected.contractAddress, canonical);
    let status: PreparationResult["preparation"]["status"];
    if (simulation.status === "approval_required") status = "approval_required";
    else if (simulation.status === "signature_required") status = "signature_required";
    else if (simulation.status === "success") status = "ready";
    else status = "simulation_failed";
    base.preparation = { status, stateCode: null, preparedRoute: prepared, approval: prepared.approval, rfq: prepared.rfq, reason: simulation.failReason };
    base.simulation = { ...simulation, transactionFidelity: prepared.transaction ? { from: true, to: true, value: true, data: true } : null };
    base.policyDecision = evaluatePolicy({ ticker: input.ticker, notionalUsd: input.notionalUsd, slippagePercent: input.slippagePercent, mandate, quote: selected, regime: routed.marketContext?.regime ?? "unknown", simulationStatus: simulation.status });
    base.safetyChecks = safetyChecks;
    if (base.diagnostics) {
      base.diagnostics.simulationFrom = prepared.transaction?.from ?? null;
      base.diagnostics.anyZeroAddress = [base.diagnostics.requestedWallet, base.diagnostics.swapRequestWallet, base.diagnostics.returnedTxFrom ?? "", base.diagnostics.simulationFrom ?? ""].some((address) => address.toLowerCase() === "0x0000000000000000000000000000000000000000");
      base.diagnostics.calldataPreserved = simulation.transactionFidelity?.data ?? null;
    }
  } catch (error) {
    const code = error instanceof PreparationError ? error.code : "PREPARATION_FAILED";
    base.preparation = { status: "preparation_failed", stateCode: code, preparedRoute: null, approval: null, rfq: null, reason: error instanceof Error ? error.message : String(error) };
    base.simulation = { attempted: false, status: "not_available", binanceStatus: null, failReason: base.preparation.reason, balanceChanges: [], allowanceChanges: [], failureClassification: null, transactionFidelity: null, raw: null };
  }
  base.receipt = buildPreExecutionReceipt(base);
  return base;
}

export function validatePrepareInput(value: unknown): { ticker: string; notionalUsd: string; userWalletAddress: string; slippagePercent: string; mandate?: ExecutionMandate } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const ticker = typeof record.ticker === "string" ? record.ticker.trim().toUpperCase() : "";
  const notionalUsd = typeof record.notionalUsd === "string" ? record.notionalUsd.trim() : "";
  const userWalletAddress = typeof record.userWalletAddress === "string" ? record.userWalletAddress.trim() : "";
  const slippagePercent = typeof record.slippagePercent === "string" ? record.slippagePercent.trim() : "0.5";
  const mandate = validateMandate(record.mandate);
  const notional = tryParseDecimal(notionalUsd);
  const slippage = tryParseDecimal(slippagePercent);
  if (!ticker || !notional || !isPositive(notional) || !/^0x[0-9a-fA-F]{40}$/.test(userWalletAddress) || userWalletAddress.toLowerCase() === "0x0000000000000000000000000000000000000000" || !slippage || !isPositive(slippage) || cmp(slippage, parseDecimal("50")) > 0 || !mandate) return null;
  return { ticker, notionalUsd, userWalletAddress, slippagePercent, mandate };
}
