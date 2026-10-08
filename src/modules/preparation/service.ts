import type { BinanceClient } from "../../lib/binance/client";
import { BinanceApiError } from "../../lib/binance/client";
import { getBinanceConfig } from "../../lib/binance/config";
import { USDT_BSC } from "../routing/quote-provider";
import { isBody, pickString } from "../routing/normalize";
import type { NormalizedQuote } from "../routing/types";
import type { ApprovalRequirement, PreparedRoute, SimulationResult, SafetyCheck } from "./types";

export class PreparationError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "PreparationError"; }
}

function unwrap(body: unknown): Record<string, unknown> | null {
  if (!isBody(body)) return null;
  const data = body.data;
  if (Array.isArray(data)) return isBody(data[0]) ? data[0] : null;
  return isBody(data) ? data : body;
}

function isHexData(value: string | null): value is string {
  return value !== null && /^0x[0-9a-fA-F]*$/.test(value);
}

export type LiveSwapDiagnostics = {
  swapRequestWallet: string;
  returnedTxFrom: string | null;
  calldataByteLength: number | null;
  calldataSelector: string | null;
  rawApprovalMetadata: {
    txSignatureData: boolean;
    topLevelSignatureData: boolean;
    rfq: boolean;
    rfqSignatureData: boolean;
    spender: string | null;
    approveCalldata: boolean;
  };
};

export function inspectRawSwapResponse(body: unknown, requestedWallet: string): LiveSwapDiagnostics {
  const record = unwrap(body);
  const tx = record && isBody(record.tx) ? record.tx : null;
  const rfq = record && isBody(record.rfq) ? record.rfq : null;
  const txData = tx ? pickString(tx, ["data"]) : null;
  const txSig = tx?.signatureData;
  const parsedTxSig = typeof txSig === "string" ? (() => { try { return JSON.parse(txSig) as unknown; } catch { return null; } })() : txSig;
  const rfqSig = rfq?.signatureData;
  const signatureData = record?.signatureData;
  return {
    swapRequestWallet: requestedWallet,
    returnedTxFrom: tx ? pickString(tx, ["from"]) : null,
    calldataByteLength: txData?.startsWith("0x") ? Math.max(0, (txData.length - 2) / 2) : null,
    calldataSelector: txData && txData.length >= 10 ? txData.slice(0, 10) : null,
    rawApprovalMetadata: {
      txSignatureData: txSig !== undefined,
      topLevelSignatureData: signatureData !== undefined,
      rfq: rfq !== null,
      rfqSignatureData: rfqSig !== undefined,
        spender: record ? pickString(record, ["approveTarget", "spender"]) ?? (isBody(parsedTxSig) ? pickString(parsedTxSig, ["approveContract"]) : null) : null,
        approveCalldata: Boolean(record && (record.approveCalldata || record.approveData || (isBody(record.approval) && (record.approval.data || record.approval.calldata)) || (isBody(parsedTxSig) && parsedTxSig.approveTxCalldata))),
    },
  };
}

export function normalizeApproval(body: Record<string, unknown>, knownInputTokenAddress: string | null = null): ApprovalRequirement | null {
  const tx = isBody(body.tx) ? body.tx : {};
  const raw = body.approve ?? body.approval ?? body.approveTransactionData ?? tx.signatureData;
  const parsedSignature = typeof raw === "string" ? (() => { try { return JSON.parse(raw) as unknown; } catch { return null; } })() : raw;
  const record = isBody(parsedSignature) ? parsedSignature : body;
  const spender = pickString(record, ["spender", "approveTarget", "approveContract", "approveContractAddress", "to"]) ?? pickString(body, ["approveTarget", "spender"]);
  const rawCalldata = pickString(record, ["data", "calldata", "approveData", "approveTxCalldata"]);
  const calldata = rawCalldata && /^0x095ea7b3[0-9a-fA-F]{128}$/.test(rawCalldata) ? rawCalldata : rawCalldata;
  const tokenAddress = knownInputTokenAddress ?? pickString(record, ["tokenAddress", "contractAddress", "fromTokenAddress"]);
  const amount = pickString(record, ["amount", "approveAmount", "value"]);
  const signatureData = parsedSignature ?? record.signatureData ?? tx.signatureData ?? body.signatureData;
  const decodedSpender = calldata && /^0x095ea7b3[0-9a-fA-F]{128}$/.test(calldata) ? `0x${calldata.slice(34, 74)}` : null;
  const decodedAmount = calldata && decodedSpender && spender && decodedSpender.toLowerCase() === spender.toLowerCase() && /^0x095ea7b3[0-9a-fA-F]{128}$/.test(calldata) ? BigInt(`0x${calldata.slice(74, 138)}`).toString() : null;
  const finalSpender = decodedSpender && (!spender || decodedSpender.toLowerCase() === spender.toLowerCase()) ? decodedSpender : spender;
  const finalAmount = decodedAmount ?? amount;
  if (!finalSpender && !calldata && !tokenAddress && !finalAmount && signatureData === undefined) return null;
  return {
    status: "unknown",
    tokenAddress,
    spender: finalSpender,
    amount: finalAmount,
    calldata,
    ...(signatureData !== undefined ? { signatureData } : {}),
    raw,
  };
}

export function normalizeSwapResponse(
  quote: NormalizedQuote,
  body: unknown,
  requestedWallet: string,
  slippagePercent: string,
): PreparedRoute {
  const record = unwrap(body);
  if (!record) throw new PreparationError("MALFORMED_SWAP_RESPONSE", "Binance swap response did not contain a data object");
  const responseEnvelope = isBody(body) ? body : {};
  const envelopeCode = pickString(responseEnvelope, ["code"]);
  const envelopeMessage = pickString(responseEnvelope, ["msg", "message"]);
  if (envelopeCode !== null && envelopeCode !== "0" && envelopeCode !== "200") {
    const errorText = `${envelopeMessage ?? ""} ${envelopeCode}`.toLowerCase();
    if (errorText.includes("expired") || errorText.includes("quote")) throw new PreparationError("PREPARATION_EXPIRED", envelopeMessage ?? `Binance rejected expired quote (${envelopeCode})`);
    throw new PreparationError("SWAP_BUILD_FAILED", envelopeMessage ?? `Binance swap build rejected (${envelopeCode})`);
  }
  const responseCode = pickString(record, ["code"]);
  const responseMessage = pickString(record, ["msg", "message"]);
  if (responseCode !== null && responseCode !== "0" && responseCode !== "200") {
    const errorText = `${responseMessage ?? ""} ${responseCode}`.toLowerCase();
    if (errorText.includes("expired") || errorText.includes("quote")) throw new PreparationError("PREPARATION_EXPIRED", responseMessage ?? `Binance rejected expired quote (${responseCode})`);
    throw new PreparationError("SWAP_BUILD_FAILED", responseMessage ?? `Binance swap build rejected (${responseCode})`);
  }
  const returnedQuoteId = pickString(record, ["quoteId"]);
  if (returnedQuoteId && returnedQuoteId !== quote.quoteId) throw new PreparationError("SWAP_QUOTE_MISMATCH", "Binance swap response quoteId does not match the selected fresh quote");
  const preparedQuoteId = returnedQuoteId ?? quote.quoteId;
  if (!preparedQuoteId) throw new PreparationError("MALFORMED_SWAP_RESPONSE", "Selected quote did not contain a quoteId");
  const txValue = record.tx ?? record.transaction;
  const tx = isBody(txValue) ? txValue : null;
  const from = tx ? pickString(tx, ["from"]) : null;
  const to = tx ? pickString(tx, ["to"]) : null;
  const data = tx ? pickString(tx, ["data"]) : null;
  const value = tx ? pickString(tx, ["value"]) : null;
  const transaction = tx && from && to && isHexData(data) && data !== "0x" && value !== null
    ? {
        from, to, data, value,
        gas: pickString(tx, ["gas"]),
        gasPrice: pickString(tx, ["gasPrice"]),
        maxPriorityFeePerGas: pickString(tx, ["maxPriorityFeePerGas"]),
        minReceiveAmount: pickString(tx, ["minReceiveAmount"]) ?? pickString(record, ["minReceiveAmount"]),
        slippagePercent: pickString(record, ["slippagePercent"]) ?? slippagePercent,
      }
    : null;
  const typedData = record.typedDataToSign ?? record.typedData;
  const signatureData = record.signatureData ?? record.signature;
  const rfq = typedData !== undefined || signatureData !== undefined || pickString(record, ["txType", "signingScheme", "vendor"]) !== null
    ? {
        vendor: pickString(record, ["vendor", "vendorName"]),
        txType: pickString(record, ["txType"]),
        typedDataToSign: typeof typedData === "string" ? typedData : typedData !== undefined ? JSON.stringify(typedData) : null,
        signingScheme: pickString(record, ["signingScheme"]),
        ...(signatureData !== undefined ? { signatureData } : {}),
      }
    : null;
  if (!transaction && !rfq) throw new PreparationError("NO_TRANSACTION_RETURNED", "Binance swap response contained neither a simulatable EVM transaction nor RFQ signing material");
  if (requestedWallet.toLowerCase() === "0x0000000000000000000000000000000000000000") throw new PreparationError("ZERO_ADDRESS_SENDER", "Refusing to prepare or simulate with the zero address");
  if (transaction && transaction.from.toLowerCase() === "0x0000000000000000000000000000000000000000") throw new PreparationError("ZERO_ADDRESS_SENDER", "Binance returned the zero address as transaction sender");
  if (transaction && transaction.from.toLowerCase() !== requestedWallet.toLowerCase()) {
    throw new PreparationError("SENDER_MISMATCH", "Built transaction sender does not match requested wallet");
  }
  return {
    provider: quote.provider,
    symbol: quote.symbol,
    vendorName: pickString(record, ["vendorName"]) ?? quote.vendorName,
    executionMode: pickString(record, ["executionMode"]) ?? quote.executionMode,
    quoteId: preparedQuoteId,
    builtAt: new Date().toISOString(),
    transaction,
    rfq,
    approval: normalizeApproval(record, USDT_BSC.contractAddress),
    raw: body,
  };
}

export function normalizeSimulation(body: unknown): SimulationResult {
  const record = unwrap(body);
  if (!record) return { attempted: true, status: "failed", binanceStatus: null, failReason: "Malformed simulation response", balanceChanges: [], allowanceChanges: [], failureClassification: "SIMULATION_REVERT_UNCLASSIFIED", transactionFidelity: null, raw: body };
  const binanceStatus = pickString(record, ["status"]);
  const failReason = pickString(record, ["failReason", "message"]);
  const balanceRaw = Array.isArray(record.balanceChanges) ? record.balanceChanges : [];
  const allowanceRaw = Array.isArray(record.allowanceChanges) ? record.allowanceChanges : [];
  const balanceChanges = balanceRaw.flatMap((item) => isBody(item) ? [{
    contractAddress: pickString(item, ["contractAddress"]) ?? "",
    tokenType: pickString(item, ["tokenType"]) ?? "",
    change: pickString(item, ["change"]) ?? "",
    owner: pickString(item, ["owner"]) ?? "",
  }] : []);
  const allowanceChanges = allowanceRaw.flatMap((item) => isBody(item) ? [{
    tokenAddress: pickString(item, ["tokenAddress"]) ?? "",
    owner: pickString(item, ["owner"]) ?? "",
    spender: pickString(item, ["spender"]) ?? "",
    preAmount: pickString(item, ["preAmount"]) ?? "",
    postAmount: pickString(item, ["postAmount"]) ?? "",
  }] : []);
  const reason = (failReason ?? "").toLowerCase();
  let status: SimulationResult["status"];
  let failureClassification: SimulationResult["failureClassification"] = null;
  if (reason.includes("allowance") || reason.includes("approve")) { status = "approval_required"; failureClassification = "INSUFFICIENT_ALLOWANCE"; }
  else if (reason.includes("balance") || reason.includes("insufficient funds")) { status = "failed"; failureClassification = "INSUFFICIENT_INPUT_BALANCE"; }
  else if (binanceStatus?.toLowerCase().includes("success")) status = "success";
  else if (binanceStatus?.toLowerCase().includes("approval")) status = "approval_required";
  else if (binanceStatus?.toLowerCase().includes("signature")) status = "signature_required";
  else { status = "failed"; failureClassification = failReason ? "SIMULATION_REVERT_UNCLASSIFIED" : null; }
  return { attempted: true, status, binanceStatus, failReason, balanceChanges, allowanceChanges, failureClassification, transactionFidelity: null, raw: body };
}

export async function buildSelectedRoute(
  client: BinanceClient,
  quote: NormalizedQuote,
  input: { amount: string; wallet: string; chainId: number; slippagePercent: string },
): Promise<PreparedRoute> {
  if (!quote.quoteId) throw new PreparationError("MALFORMED_QUOTE", "Selected route did not include a quoteId");
  const config = getBinanceConfig();
  let result;
  try {
    result = await client.signedGet(config.swapPath, {
      binanceChainId: String(input.chainId),
      amount: input.amount,
      fromTokenAddress: USDT_BSC.contractAddress,
      toTokenAddress: quote.contractAddress,
      userWalletAddress: input.wallet,
      quoteId: quote.quoteId,
      slippagePercent: input.slippagePercent,
      approveTransaction: "true",
    });
  } catch (error) {
    if (error instanceof BinanceApiError) {
      const text = `${error.msg ?? ""} ${String(error.code ?? "")}`.toLowerCase();
      if (text.includes("expired") || (text.includes("quote") && (text.includes("not found") || text.includes("invalid") || text.includes("timeout")))) throw new PreparationError("PREPARATION_EXPIRED", error.msg ?? error.message);
      throw new PreparationError("SWAP_BUILD_FAILED", error.msg ?? error.message);
    }
    throw new PreparationError("SWAP_BUILD_FAILED", error instanceof Error ? error.message : String(error));
  }
  return normalizeSwapResponse(quote, result.body, input.wallet, input.slippagePercent);
}

export function transactionFidelity(prepared: PreparedRoute, simulationBody: unknown): { from: boolean; to: boolean; value: boolean; data: boolean } {
  const record = isBody(simulationBody) && isBody(simulationBody.evmTx) ? simulationBody.evmTx : null;
  const tx = prepared.transaction;
  return {
    from: Boolean(record && tx && record.from === tx.from),
    to: Boolean(record && tx && record.to === tx.to),
    value: Boolean(record && tx && record.value === tx.value),
    data: Boolean(record && tx && record.data === tx.data),
  };
}

export async function simulatePreparedRoute(
  client: BinanceClient,
  prepared: PreparedRoute,
  wallet: string,
  chainId: number,
): Promise<SimulationResult> {
  if (!prepared.transaction) {
    const status = prepared.rfq?.typedDataToSign ? "signature_required" : "not_available";
    return { attempted: false, status, binanceStatus: null, failReason: status === "signature_required" ? "RFQ signature material returned; signing is disabled in this milestone" : "No EVM transaction returned by Binance", balanceChanges: [], allowanceChanges: [], failureClassification: null, transactionFidelity: null, raw: prepared.raw };
  }
  const config = getBinanceConfig();
  try {
    const evmTx = {
      from: prepared.transaction.from,
      to: prepared.transaction.to,
      value: prepared.transaction.value,
      data: prepared.transaction.data,
    };
    const response = await client.signedPost(config.simulatePath, {}, {
      binanceChainId: String(chainId),
      evmTx,
    });
    const normalized = normalizeSimulation(response.body);
    return { ...normalized, transactionFidelity: {
      from: evmTx.from === prepared.transaction.from,
      to: evmTx.to === prepared.transaction.to,
      value: evmTx.value === prepared.transaction.value,
      data: evmTx.data === prepared.transaction.data,
    } };
  } catch (error) {
    const msg = error instanceof BinanceApiError ? error.msg ?? error.message : error instanceof Error ? error.message : String(error);
    return { attempted: true, status: "not_available", binanceStatus: null, failReason: msg, balanceChanges: [], allowanceChanges: [], failureClassification: "SIMULATION_REVERT_UNCLASSIFIED", transactionFidelity: null, raw: null };
  }
}

export function validateMinReceive(minReceiveAmount: string | null, quotedOutputRaw: string | null): SafetyCheck {
  if (minReceiveAmount === null) return { name: "minimum receive bound", status: "unknown", detail: "Binance did not return minReceiveAmount" };
  if (!/^[0-9]+$/.test(minReceiveAmount)) return { name: "minimum receive bound", status: "failed", detail: "minReceiveAmount is not a non-negative integer base-unit amount" };
  if (quotedOutputRaw === null || !/^[0-9]+$/.test(quotedOutputRaw)) return { name: "minimum receive bound", status: "unknown", detail: "Quoted output base-unit amount is unavailable for comparison" };
  const valid = BigInt(minReceiveAmount) <= BigInt(quotedOutputRaw);
  return { name: "minimum receive bound", status: valid ? "passed" : "failed", detail: valid ? "minReceiveAmount does not exceed quoted output" : "minReceiveAmount exceeds quoted output" };
}

export function validatePreparedRoute(
  prepared: PreparedRoute,
  simulation: SimulationResult,
  wallet: string,
  inputAmount: string,
  outputToken: string,
  canonicalEquityAddresses: readonly string[],
): SafetyCheck[] {
  const tx = prepared.transaction;
  const checks: SafetyCheck[] = [
    validateMinReceive(prepared.transaction?.minReceiveAmount ?? null, null),
    { name: "expected wallet", status: tx ? (tx.from.toLowerCase() === wallet.toLowerCase() ? "passed" : "failed") : "unknown", detail: tx ? `Transaction sender ${tx.from}` : "No EVM transaction available" },
    { name: "transaction destination", status: tx?.to ? "passed" : "unknown", detail: tx?.to ?? "Destination not returned" },
    { name: "non-empty calldata", status: tx?.data && tx.data !== "0x" ? "passed" : tx ? "failed" : "unknown", detail: tx?.data ? `${tx.data.length} calldata characters` : "No calldata" },
    { name: "simulation outcome", status: simulation.status === "success" ? "passed" : simulation.status === "failed" ? "failed" : "unknown", detail: simulation.failReason ?? simulation.binanceStatus ?? simulation.status },
  ];
  const outputFound = simulation.balanceChanges.some((change) => change.contractAddress.toLowerCase() === outputToken.toLowerCase() && change.change.startsWith("+"));
  checks.push({ name: "canonical output token", status: simulation.status !== "success" ? "unknown" : outputFound ? "passed" : "unknown", detail: outputFound ? `Positive balance change for ${outputToken}` : "Simulation does not establish canonical positive output" });
  const inputOutflow = simulation.balanceChanges.find((change) => change.contractAddress.toLowerCase() === USDT_BSC.contractAddress.toLowerCase() && change.owner.toLowerCase() === wallet.toLowerCase() && change.change.startsWith("-"));
  checks.push({ name: "input amount bound", status: inputOutflow ? "unknown" : simulation.status === "success" ? "unknown" : "unknown", detail: inputOutflow ? `Input outflow ${inputOutflow.change}; compare against requested ${inputAmount} requires unit metadata` : "Simulation does not expose a comparable input outflow" });
  const unexpectedOutflow = simulation.balanceChanges.find((change) => canonicalEquityAddresses.includes(change.contractAddress.toLowerCase()) && change.owner.toLowerCase() === wallet.toLowerCase() && change.change.startsWith("-"));
  checks.push({ name: "no unexpected canonical equity outflow", status: unexpectedOutflow ? "failed" : simulation.status === "success" ? "passed" : "unknown", detail: unexpectedOutflow ? `${unexpectedOutflow.contractAddress} outflow ${unexpectedOutflow.change}` : "No unexpected canonical equity outflow observed" });
  return checks;
}
