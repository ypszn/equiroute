import type { NormalizedQuote } from "../routing/types";
import type { PolicyDecision, ExecutionMandate } from "../policy/engine";
import type { PolicyRejectedRoute } from "../routing/types";
import type { AgenticWalletState, ExecutionReadiness } from "../agentic-wallet/types";


export type WalletFlowDiagnostics = {
  requestedWallet: string;
  swapRequestWallet: string;
  returnedTxFrom: string | null;
  simulationFrom: string | null;
  anyZeroAddress: boolean;
  calldataByteLength: number | null;
  calldataSelector: string | null;
  calldataPreserved: boolean | null;
  rawApprovalMetadata: {
    txSignatureData: boolean;
    topLevelSignatureData: boolean;
    rfq: boolean;
    rfqSignatureData: boolean;
    spender: string | null;
    approveCalldata: boolean;
  };
  inputBalance: {
    status: "unknown" | "sufficient" | "insufficient";
    balance: string | null;
    required: string | null;
    failureCode: string | null;
  };
  allowanceStatus: "unknown" | "sufficient" | "insufficient";
};

export type ApprovalRequirement = {
  status: "required" | "not_required" | "unknown";
  tokenAddress: string | null;
  spender: string | null;
  amount: string | null;
  calldata: string | null;
  signatureData?: unknown;
  raw?: unknown;
};

export type PreparedRoute = {
  provider: string;
  symbol: string;
  vendorName: string | null;
  executionMode: string | null;
  quoteId: string;
  builtAt: string;
  transaction: {
    from: string;
    to: string;
    data: string;
    value: string;
    gas?: string | null;
    gasPrice?: string | null;
    maxPriorityFeePerGas?: string | null;
    minReceiveAmount?: string | null;
    slippagePercent?: string | null;
  } | null;
  rfq: {
    vendor?: string | null;
    txType?: string | null;
    typedDataToSign?: string | null;
    signingScheme?: string | null;
    signatureData?: unknown;
  } | null;
  approval: ApprovalRequirement | null;
  raw: unknown;
};

export type SimulationResult = {
  attempted: boolean;
  status: "success" | "failed" | "approval_required" | "signature_required" | "not_available";
  binanceStatus: string | null;
  failReason: string | null;
  balanceChanges: Array<{ contractAddress: string; tokenType: string; change: string; owner: string }>;
  allowanceChanges: Array<{ tokenAddress: string; owner: string; spender: string; preAmount: string; postAmount: string }>;
  failureClassification: "INSUFFICIENT_ALLOWANCE" | "INSUFFICIENT_INPUT_BALANCE" | "SIMULATION_REVERT_UNCLASSIFIED" | null;
  transactionFidelity: { from: boolean; to: boolean; value: boolean; data: boolean } | null;
  raw: unknown;
};

export type SafetyCheck = { name: string; status: "passed" | "failed" | "unknown"; detail: string };

export type PreparationResult = {
  intent: { ticker: string; notionalUsd: string; userWalletAddress: string; slippagePercent: string };
  marketContext: unknown;
  route: { selected: NormalizedQuote | null; alternatives: NormalizedQuote[] };
  preparation: {
    status: "ready" | "approval_required" | "signature_required" | "simulation_failed" | "preparation_failed" | "no_route";
    stateCode: string | null;
    preparedRoute: PreparedRoute | null;
    approval: ApprovalRequirement | null;
    rfq: PreparedRoute["rfq"];
    reason: string | null;
  };
  simulation: SimulationResult;
  diagnostics?: WalletFlowDiagnostics;
  mandate?: ExecutionMandate;
  policyDecision?: PolicyDecision;
  policyRejectedRoutes?: PolicyRejectedRoute[];
  agenticWallet?: AgenticWalletState;
  executionReadiness?: ExecutionReadiness;
  safetyChecks: SafetyCheck[];
  receipt: unknown;
};
