import { cmp, tryParseDecimal } from "./decimal";
import type { NormalizedQuote, QuoteRejection } from "./types";

/**
 * Deterministic route ranking. NO LLM. Pure function over normalized quotes.
 *
 * Milestone-1 policy:
 *  1. Remove unavailable routes.
 *  2. Remove malformed routes (no positive estimatedUnderlyingShares).
 *  3. Prefer the route delivering the greatest underlying-share exposure
 *     for the same USDT input.
 *  4. Deterministic tie-break: lower effectiveUsdPerShare, then provider
 *     name, then symbol — so equal inputs always pick the same winner.
 *  5. Price impact and other metadata are preserved on the quote for the
 *     receipt explanation but are not ranking keys in M1.
 */
export function rankQuotes(quotes: readonly NormalizedQuote[]): {
  selected: NormalizedQuote | null;
  rejected: QuoteRejection[];
  ranked: NormalizedQuote[];
} {
  const rejected: QuoteRejection[] = [];
  const executable: NormalizedQuote[] = [];

  for (const q of quotes) {
    const shares = q.ratioStatus === "verified" && q.estimatedUnderlyingShares !== null
      ? tryParseDecimal(q.estimatedUnderlyingShares)
      : null;
    if (!q.available) {
      rejected.push({ provider: q.provider, symbol: q.symbol, reason: q.failureReason ?? "Unavailable", code: q.failureCode });
      continue;
    }
    if (q.ratioStatus !== "verified") {
      rejected.push({
        provider: q.provider,
        symbol: q.symbol,
        reason: "Executable route excluded from normalized exposure ranking: wrapper share ratio is unverified",
        code: "UNVERIFIED_RATIO",
      });
      continue;
    }
    if (shares === null || shares.scaled <= 0n) {
      rejected.push({
        provider: q.provider,
        symbol: q.symbol,
        reason: "Malformed quote: no positive underlying-share estimate",
        code: "MALFORMED_QUOTE",
      });
      continue;
    }
    executable.push(q);
  }

  const ranked = [...executable].sort(compareExecutable);
  return { selected: ranked[0] ?? null, rejected, ranked };
}

/** Stable, deterministic ordering for executable quotes. */
function compareExecutable(a: NormalizedQuote, b: NormalizedQuote): number {
  // 1) greatest estimated underlying shares
  const sa = tryParseDecimal(a.estimatedUnderlyingShares ?? "0");
  const sb = tryParseDecimal(b.estimatedUnderlyingShares ?? "0");
  if (sa && sb) {
    const c = cmp(sb, sa); // descending
    if (c !== 0) return c;
  }

  // 2) tie-break: lower effective USD per share
  const pa = tryParseDecimal(a.effectiveUsdPerShare ?? "");
  const pb = tryParseDecimal(b.effectiveUsdPerShare ?? "");
  if (pa && pb) {
    const c = cmp(pa, pb); // ascending
    if (c !== 0) return c;
  } else if (pa && !pb) {
    return -1;
  } else if (!pa && pb) {
    return 1;
  }

  // 3) deterministic provider-name, then symbol ordering
  const pc = a.provider.localeCompare(b.provider);
  if (pc !== 0) return pc;
  return a.symbol.localeCompare(b.symbol);
}
