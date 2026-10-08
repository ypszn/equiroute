import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(nodeExecFile);
export class BawCliError extends Error { constructor(readonly code: "CLI_NOT_INSTALLED" | "COMMAND_FAILED" | "CLI_TIMEOUT" | "OUTPUT_TOO_LARGE" | "MALFORMED_JSON" | "COMMAND_NOT_ALLOWED", message: string, readonly response: unknown = null) { super(message); this.name = "BawCliError"; } }
export type ExecFile = (file: string, args: string[], options: { timeout: number; maxBuffer: number; encoding: "utf8" }) => Promise<{ stdout: string; stderr: string }>;
const BAW_BIN = process.env.BAW_BIN?.trim() || "baw";
const MAX_OUTPUT = 1_000_000;
export const BSC_USDT_ADDRESS = "0x55d398326f99059ff775485246999027b3197955";
export const CANONICAL_NVDA_TARGETS = [
  "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
  "0xa9ee28c80f960b889dfbd1902055218cba016f75",
  "0xc845b2894dbddd03858fd2d643b4ef725fe0849d",
];
/** Read-only commands only. `market-order swap` is intentionally absent and can never be constructed here. */
const ALLOWED_COMMANDS = new Set([
  "wallet status --json",
  "wallet address --json",
  "wallet chains --json",
  "wallet balance --binanceChainId 56 --json",
  "wallet settings --json",
  "cli-check --required-version 1.10.0 --json",
  "skill-check --skill-name binance-agentic-wallet --current-version 1.12.0 --json",
]);
const QUANTITY = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,18})?$/;
const SLIPPAGE = /^(?:0|[1-9]\d?|50)(?:\.\d{1,2})?$/;
function parsed(stdout: string): unknown { try { return JSON.parse(stdout); } catch { throw new BawCliError("MALFORMED_JSON", "BAW command returned malformed JSON"); } }

export function buildQuoteArgs(input: { fromTokenQty: string; fromToken: string; toToken: string; binanceChainId: string; slippage: string }): string[] {
  const qty = String(input.fromTokenQty).trim();
  const slippage = String(input.slippage).trim();
  const from = String(input.fromToken).trim().toLowerCase();
  const to = String(input.toToken).trim().toLowerCase();
  if (!QUANTITY.test(qty) || Number(qty) <= 0) throw new BawCliError("COMMAND_NOT_ALLOWED", "Quote quantity must be a positive decimal amount");
  if (!SLIPPAGE.test(slippage) || Number(slippage) <= 0 || Number(slippage) > 50) throw new BawCliError("COMMAND_NOT_ALLOWED", "Quote slippage must be within (0, 50]");
  if (from !== BSC_USDT_ADDRESS) throw new BawCliError("COMMAND_NOT_ALLOWED", "Only canonical BSC USDT input is allowed");
  if (!CANONICAL_NVDA_TARGETS.includes(to)) throw new BawCliError("COMMAND_NOT_ALLOWED", "Only canonical NVDA BSC target contracts are allowed");
  if (String(input.binanceChainId).trim() !== "56") throw new BawCliError("COMMAND_NOT_ALLOWED", "Only BSC chain 56 is allowed");
  return ["market-order", "quote", "--fromTokenQty", qty, "--fromToken", from, "--toToken", to, "--binanceChainId", "56", "--slippage", slippage, "--json"];
}

export function createBawClient(execFile: ExecFile = async (file, args, options) => execFileAsync(file, args, options)) {
  async function exec(args: string[], quote: boolean): Promise<unknown> {
    try {
      const result = await execFile(BAW_BIN, args, { timeout: 12_000, maxBuffer: MAX_OUTPUT, encoding: "utf8" });
      if (Buffer.byteLength(result.stdout, "utf8") > MAX_OUTPUT || Buffer.byteLength(result.stderr, "utf8") > MAX_OUTPUT) throw new BawCliError("OUTPUT_TOO_LARGE", "BAW output exceeded the configured maximum size");
      return parsed(result.stdout);
    } catch (error) {
      if (error instanceof BawCliError) throw error;
      const e = error as NodeJS.ErrnoException & { killed?: boolean; stderr?: string; stdout?: string; message?: string };
      if (e.code === "ENOENT") throw new BawCliError("CLI_NOT_INSTALLED", "Binance Agentic Wallet CLI is not installed");
      if (e.killed || e.code === "ETIMEDOUT") throw new BawCliError("CLI_TIMEOUT", "BAW read-only command timed out");
      const code = typeof e.code === "string" || typeof e.code === "number" ? e.code : null;
      const message = typeof e.stderr === "string" ? e.stderr.trim().slice(0, 1200) : (e.message ?? "BAW command failed");
      const failureBody = typeof e.stdout === "string" ? (() => { try { return JSON.parse(e.stdout as string) as unknown; } catch { return null; } })() : null;
      throw new BawCliError("COMMAND_FAILED", `BAW ${quote ? "quote" : "read-only"} command failed${code !== null ? ` (${code})` : ""}: ${message}`, failureBody ?? { code, message });
    }
  }
  async function run(args: string[]): Promise<unknown> {
    if (!ALLOWED_COMMANDS.has(args.join(" "))) throw new BawCliError("COMMAND_NOT_ALLOWED", "BAW command is not in the read-only allowlist");
    return exec(args, false);
  }
  return {
    run,
    getStatus: () => run(["wallet", "status", "--json"]),
    getAddress: () => run(["wallet", "address", "--json"]),
    getChains: () => run(["wallet", "chains", "--json"]),
    getBalances: (chainId: string) => { if (chainId !== "56") throw new BawCliError("COMMAND_NOT_ALLOWED", "Only documented BSC balance queries are allowed"); return run(["wallet", "balance", "--binanceChainId", "56", "--json"]); },
    getSettings: () => run(["wallet", "settings", "--json"]),
    cliCheck: () => run(["cli-check", "--required-version", "1.10.0", "--json"]),
    skillCheck: () => run(["skill-check", "--skill-name", "binance-agentic-wallet", "--current-version", "1.12.0", "--json"]),
    quoteMarketOrder: async (input: { fromTokenQty: string; fromToken: string; toToken: string; binanceChainId: "56"; slippage: string }) => exec(buildQuoteArgs(input), true),
  };
}
export { ALLOWED_COMMANDS as BAW_READ_ONLY_ALLOWLIST };
