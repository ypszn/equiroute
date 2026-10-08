import { NVDA_REPRESENTATIONS } from "./nvda";
import type { EquityProvider, EquityRepresentation } from "./types";

/**
 * Registry of canonical tokenized-equity representations.
 *
 * Lookup is contract-address-first. A token that matches a ticker symbol but
 * whose contract address is not registered for that provider is NOT trusted.
 */
const BY_TICKER: ReadonlyMap<string, readonly EquityRepresentation[]> = new Map([
  ["NVDA", NVDA_REPRESENTATIONS],
]);

const BY_ADDRESS: ReadonlyMap<string, EquityRepresentation> = new Map(
  NVDA_REPRESENTATIONS.map((r) => [r.contractAddress.toLowerCase(), r]),
);

export function supportedTickers(): string[] {
  return [...BY_TICKER.keys()];
}

/** All canonical representations for a ticker (empty array if unsupported). */
export function getRepresentations(ticker: string): readonly EquityRepresentation[] {
  return BY_TICKER.get(ticker.toUpperCase()) ?? [];
}

/**
 * Resolve a representation by provider + contract address.
 * Returns undefined for unrecognized or mismatched pairs — never trust
 * a symbol-only match.
 */
export function resolveRepresentation(
  provider: EquityProvider,
  contractAddress: string,
): EquityRepresentation | undefined {
  const found = BY_ADDRESS.get(contractAddress.toLowerCase());
  if (!found) return undefined;
  return found.provider === provider ? found : undefined;
}

/**
 * True when (ticker, provider, contractAddress) form a registered canonical
 * triple. Used to reject lookalike/fake tokens.
 */
export function isCanonicalRepresentation(
  ticker: string,
  provider: EquityProvider,
  contractAddress: string,
): boolean {
  const rep = resolveRepresentation(provider, contractAddress);
  return rep !== undefined && rep.underlying === ticker.toUpperCase() && rep.recognized;
}
