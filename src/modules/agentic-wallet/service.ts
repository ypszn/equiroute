import type { AgenticExecutionCompatibility, AgenticWalletBalance, AgenticWalletChain, AgenticWalletClient, AgenticWalletSettings, AgenticWalletState } from "./types";
import { BawCliError } from "./baw-client";
import { cmp, parseDecimal, tryParseDecimal } from "../routing/decimal";

function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function unwrap(value: unknown): unknown { const root = record(value); return root && "data" in root ? root.data : value; }
function string(value: unknown): string | null { if (typeof value === "string") return value; if (typeof value === "number" && Number.isFinite(value)) return String(value); return null; }

export function parseStatus(value: unknown): AgenticWalletState["connection"] {
  const root = record(unwrap(value));
  const status = root?.status;
  if (status === "CONNECTED") return "connected";
  if (status === "UNCONNECTED" || status === "SIGNED_OUT") return "signed_out";
  if (typeof status === "string") return "error";
  return "error";
}
export function parseAddress(value: unknown): string | null {
  const data = record(unwrap(value));
  const addresses = data?.addresses;
  if (!Array.isArray(addresses)) return null;
  const bsc = addresses.find((item) => record(item)?.binanceChainId === "56");
  const address = string(record(bsc)?.address);
  return address && /^0x[0-9a-fA-F]{40}$/.test(address) ? address : null;
}
export function parseChains(value: unknown): AgenticWalletChain[] {
  const data = unwrap(value);
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    const obj = record(item); const id = string(obj?.binanceChainId);
    return id ? [{ binanceChainId: id, name: string(obj?.name), simpleName: string(obj?.simpleName) }] : [];
  });
}
export function parseBalances(value: unknown): AgenticWalletBalance[] {
  const data = unwrap(value);
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    const obj = record(item); const symbol = string(obj?.symbol); const address = string(obj?.address); const chain = string(obj?.binanceChainId); const balance = string(obj?.balance);
    return symbol && address && chain && balance ? [{ symbol, address, binanceChainId: chain, balance }] : [];
  });
}
export function parseSettings(value: unknown): AgenticWalletSettings {
  const data = record(unwrap(value)) ?? {};
  const dev = record(data.devMode) ?? {};
  return {
    dailyLimit: string(data.dailyLimit), quotaUsed: string(data.quotaUsed), quotaLeft: string(data.quotaLeft), quotaDate: string(data.quotaDate),
    abnormalTxnHandling: string(data.abnormalTxnHandling), tradeAllTokens: typeof data.tradeAllTokens === "boolean" ? data.tradeAllTokens : null,
    devMode: { enabled: typeof dev.enabled === "boolean" ? dev.enabled : null, expiresAt: string(dev.expiresAt), dailyLimit: string(dev.dailyLimit), balanceExceeded: typeof dev.balanceExceeded === "boolean" ? dev.balanceExceeded : null },
    sessionExpireTime: string(data.sessionExpireTime),
  };
}
function balanceBySymbol(balances: AgenticWalletBalance[], symbol: string): string | null { return balances.find((item) => item.binanceChainId === "56" && item.symbol.toUpperCase() === symbol)?.balance ?? null; }

export function normalizeWalletState(raw: { status: unknown; address: unknown; chains: unknown; balances: unknown; settings: unknown }): AgenticWalletState {
  const connection = parseStatus(raw.status);
  const balances = parseBalances(raw.balances);
  const settings = parseSettings(raw.settings);
  return {
    connection,
    address: parseAddress(raw.address),
    bscSupported: parseChains(raw.chains).some((chain) => chain.binanceChainId === "56"),
    balances: { usdt: balanceBySymbol(balances, "USDT"), bnb: balanceBySymbol(balances, "BNB") },
    quota: { dailyLimit: settings.dailyLimit, used: settings.quotaUsed, remaining: settings.quotaLeft, date: settings.quotaDate },
    security: { abnormalTxnHandling: settings.abnormalTxnHandling, tradeAllTokens: settings.tradeAllTokens },
    developerMode: settings.devMode,
    sessionExpireTime: settings.sessionExpireTime,
    errorCode: null,
  };
}

export async function getAgenticWalletState(client: AgenticWalletClient): Promise<AgenticWalletState> {
  const requiredCliVersion = "1.10.0";
  const skillVersion = "1.12.0";
  let cliVersion: string | null = null; let cliCompatible: boolean | null = null; let skillUpdateAvailable: boolean | null = null;
  try {
    const [cliCheck, skillCheck] = await Promise.all([client.cliCheck(), client.skillCheck()]);
    const cliData = record(unwrap(cliCheck)); const skillData = record(unwrap(skillCheck));
    cliVersion = string(cliData?.currentCliVersion);
    cliCompatible = cliData?.needUpdateCli === false;
    skillUpdateAvailable = skillData?.needUpdateSkill === true;
  } catch { /* wallet state remains available; caller receives null version-check fields */ }
  try {
    const status = await client.getStatus();
    if (parseStatus(status) !== "connected") return { connection: parseStatus(status), address: null, bscSupported: false, balances: { usdt: null, bnb: null }, quota: { dailyLimit: null, used: null, remaining: null, date: null }, security: { abnormalTxnHandling: null, tradeAllTokens: null }, developerMode: { enabled: null, expiresAt: null, dailyLimit: null, balanceExceeded: null }, sessionExpireTime: null, errorCode: null, cliVersion, requiredCliVersion, cliCompatible, skillVersion, skillUpdateAvailable };
    const [address, chains, balances, settings] = await Promise.all([client.getAddress(), client.getChains(), client.getBalances("56"), client.getSettings()]);
    return { ...normalizeWalletState({ status, address, chains, balances, settings }), cliVersion, requiredCliVersion, cliCompatible, skillVersion, skillUpdateAvailable };
  } catch (error) {
    const connection = error instanceof BawCliError && error.code === "CLI_NOT_INSTALLED" ? "unavailable" : "error";
    return { connection, address: null, bscSupported: false, balances: { usdt: null, bnb: null }, quota: { dailyLimit: null, used: null, remaining: null, date: null }, security: { abnormalTxnHandling: null, tradeAllTokens: null }, developerMode: { enabled: null, expiresAt: null, dailyLimit: null, balanceExceeded: null }, sessionExpireTime: null, errorCode: error instanceof BawCliError ? error.code : "WALLET_READ_FAILED", cliVersion, requiredCliVersion, cliCompatible, skillVersion, skillUpdateAvailable };
  }
}

export type WalletReadinessInput = { wallet: AgenticWalletState; amountUsd: string; requestedAddress?: string | null; txFrom?: string | null; simulationFrom?: string | null; provider: string | null; equiRouteOutcome: "allowed" | "confirmation_required" | "blocked"; equiRoutePolicy?: import("../policy/engine").PolicyDecision };
export function evaluateWalletReadiness(input: WalletReadinessInput) {
  const wallet = input.wallet;
  const boundAddresses = [input.requestedAddress, input.txFrom, input.simulationFrom];
  const addressMatch = Boolean(wallet.address && boundAddresses.every((value) => value !== null && value !== undefined && value.toLowerCase() === wallet.address?.toLowerCase()));
  const usdt = tryParseDecimal(wallet.balances.usdt);
  const requested = tryParseDecimal(input.amountUsd);
  const inputBalanceSufficient: true | false | "unknown" = usdt && requested ? cmp(usdt, requested) >= 0 : "unknown";
  const bnb = tryParseDecimal(wallet.balances.bnb);
  const gasBalanceAvailable: true | false | "unknown" = bnb ? (cmp(bnb, parseDecimal("0")) > 0) : "unknown";
  let quotaSufficient: true | false | "unknown" = "unknown";
  const dailyLimit = tryParseDecimal(wallet.quota.dailyLimit);
  const remaining = tryParseDecimal(wallet.quota.remaining);
  if (dailyLimit && remaining) quotaSufficient = cmp(remaining, requested ?? parseDecimal("0")) >= 0;
  const executionCompatibility: AgenticExecutionCompatibility = "unverified";
  const connected = wallet.connection === "connected";
  const chainSupported = wallet.bscSupported;
  const blockingReasons: string[] = [];
  if (!connected) blockingReasons.push("AGENTIC_WALLET_NOT_CONNECTED");
  if (!wallet.address || !addressMatch) blockingReasons.push("AGENTIC_WALLET_ADDRESS_MISMATCH");
  if (!chainSupported) blockingReasons.push("BSC_NOT_SUPPORTED");
  if (inputBalanceSufficient === false) blockingReasons.push("WALLET_FUNDING_REQUIRED");
  if (gasBalanceAvailable === false) blockingReasons.push("GAS_BALANCE_UNAVAILABLE");
  if (quotaSufficient === false) blockingReasons.push("WALLET_QUOTA_INSUFFICIENT");
  if ((executionCompatibility as AgenticExecutionCompatibility) !== "supported") blockingReasons.push("PROVIDER_EXECUTION_UNVERIFIED");
  if (wallet.security.tradeAllTokens === false) blockingReasons.push("TOKEN_SCOPE_COMPATIBILITY_UNKNOWN");
  if (input.equiRouteOutcome === "blocked") blockingReasons.push("EQUIROUTE_POLICY_BLOCKED");
  const confirmationReasons = input.equiRouteOutcome === "confirmation_required" ? ["EQUIROUTE_CONFIRMATION_REQUIRED"] : [];
  const funding = blockingReasons.includes("WALLET_FUNDING_REQUIRED") || blockingReasons.includes("GAS_BALANCE_UNAVAILABLE");
  const setup = !connected || !wallet.address || !chainSupported;
  const outcome = blockingReasons.length ? setup ? "wallet_setup_required" : funding ? "wallet_funding_required" : "blocked" : "ready_for_confirmation";
  return {     outcome,
    equiRouteOutcome: input.equiRouteOutcome,
    equiRoutePolicy: input.equiRoutePolicy ?? { outcome: input.equiRouteOutcome, checks: [], blockingReasons: input.equiRouteOutcome === "blocked" ? ["EquiRoute policy blocked"] : [], confirmationReasons: input.equiRouteOutcome === "confirmation_required" ? ["EquiRoute requires confirmation"] : [] },
    agenticWallet: { connected, addressMatch, chainSupported, inputBalanceSufficient, gasBalanceAvailable, quotaSufficient, tokenScopeCompatible: wallet.security.tradeAllTokens === true ? true : "unknown", executionCompatibility }, blockingReasons, confirmationReasons } as const;
}
