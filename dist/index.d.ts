import * as _langchain_core_tools from '@langchain/core/tools';
import { z } from 'zod';

type PayFetch = (url: string) => Promise<Response>;

// Types for the dependency-free core (gate.mjs).

declare const GATE_BASE: string;

interface GateArgs {
  token: string;
  side?: "buy" | "sell";
  notionalUsd?: number;
  base?: string;
}

interface GateResponse {
  token?: string;
  side?: "buy" | "sell";
  notional_usd?: number;
  decision?: "go" | "hold" | "block" | string;
  reason?: string;
  verdict?: string;
  risk_score?: number;
  liquidity_usd?: number;
  impact_pct_of_pool?: number;
  flags?: string[];
  token_meta?: { symbol?: string; name?: string; decimals?: number };
  analyzed_at?: string;
  disclaimer?: string;
  /** true when the paid x402 gate settled; false/absent on the free-preview path. */
  paid?: boolean;
  /** present only on the free-preview degrade-open path — how to unlock paid. */
  activation?: GateActivation;
  sizing?: {
    max_safe_notional_usd?: number;
    this_trade?: { price_impact_pct?: number };
    entry_sim?: { this_trade?: { roundtrip_breakeven_pct?: number } };
    exit_sim?: { this_trade?: { slippage_pct?: number; net_recovered_usd?: number } };
  };
  [k: string]: unknown;
}

interface TradeDecision {
  go: boolean;
  reasons: string[];
}

declare function extractToken(text: string | null | undefined): string | null;
declare function buildGateUrl(args?: GateArgs): string;
declare function summarizeGate(out: GateResponse | null | undefined): string;

interface SizingValues {
  roundtrip_breakeven_pct: number | null;
  max_safe_notional_usd: number | null;
  exit_slippage_pct: number | null;
  exit_net_recovered_usd: number | null;
}
declare function evaluateTrade(
  out: GateResponse | null | undefined,
  opts?: { maxBreakevenPct?: number; maxExitSlippagePct?: number }
): TradeDecision;
declare function fetchGate(
  payFetch: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<GateResponse> }>,
  args?: GateArgs
): Promise<GateResponse>;

interface GateActivation {
  needed: boolean;
  mode: string;
  reason: string;
  hint: string;
  paid_url?: string;
  price_usdc?: string;
}

type PreviewFetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<GateResponse> }>;

declare function buildPreviewUrl(args?: GateArgs): string;
declare function fundOnrampHint(): string;
declare function fetchGatePreview(
  args?: GateArgs,
  opts?: { previewFetch?: PreviewFetch }
): Promise<GateResponse>;
/**
 * Fetch a gate verdict, degrading OPEN to the free preview when the paid call
 * cannot be paid (no key / unfunded wallet -> 402). Throws only when both the
 * paid route and the preview are unreachable.
 */
declare function fetchGateOrPreview(
  payFetch: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<GateResponse> }>,
  args?: GateArgs,
  opts?: { hasKey?: boolean; previewFetch?: PreviewFetch }
): Promise<GateResponse>;

interface GuardResult extends GateResponse {
  proceed: boolean;
  guard_reasons: string[];
  summary: string;
  sizing_summary?: string | null;
  sizing_values?: SizingValues | null;
}

declare function runGuard(
  payFetch: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<GateResponse> }>,
  args?: GateArgs,
  opts?: { maxBreakevenPct?: number; maxExitSlippagePct?: number; hasKey?: boolean; previewFetch?: PreviewFetch }
): Promise<GuardResult>;

interface TokenReportResponse {
  token?: string;
  chain?: string;
  token_meta?: { symbol?: string; name?: string; decimals?: number };
  security?: {
    isHoneypot?: boolean;
    sellable?: boolean;
    transferTaxBps?: number | null;
    taxMutable?: boolean;
    ownerRenounced?: boolean;
    upgradeableProxy?: boolean;
    canMint?: boolean;
    canPause?: boolean;
    hasBlacklist?: boolean;
    simStatus?: string;
    [k: string]: unknown;
  };
  liquidity?: { wethPoolUsd?: number; dex?: string; [k: string]: unknown };
  verdict?: "SAFE" | "CAUTION" | "AVOID" | string;
  risk_score?: number;
  reasons?: string[];
  analyzed_at?: string;
  disclaimer?: string;
  [k: string]: unknown;
}

interface ReportDecision {
  safe: boolean;
  reasons: string[];
}

interface TokenReportResult extends TokenReportResponse {
  safe: boolean;
  guard_reasons: string[];
  summary: string;
}

declare function buildReportUrl(args?: { token: string; base?: string }): string;
declare function summarizeReport(out: TokenReportResponse | null | undefined): string;
declare function evaluateReport(
  out: TokenReportResponse | null | undefined,
  opts?: { maxRiskScore?: number }
): ReportDecision;
declare function fetchTokenReport(
  payFetch: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<TokenReportResponse> }>,
  args?: { token: string; base?: string }
): Promise<TokenReportResponse>;
declare function runTokenReport(
  payFetch: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<TokenReportResponse> }>,
  args?: { token: string; base?: string },
  opts?: { maxRiskScore?: number }
): Promise<TokenReportResult>;

interface SwapGuardOptions {
    /** Pre-built x402-paying fetch; overrides `privateKey`. Mainly for tests. */
    payFetch?: PayFetch;
    /** Hex private key of the agent's Base wallet; signs the $0.008 USDC x402 payment. Omit for the free preview path only. */
    privateKey?: string;
    /** Override the gate base URL (defaults to the hosted Grey Ridge Worker). */
    base?: string;
    /** Default trade size (USD) for the liquidity / price-impact / sizing checks. */
    defaultNotionalUsd?: number;
    /** Skip a trade whose round-trip friction (entry+exit) exceeds this percent. */
    maxBreakevenPct?: number;
    /** Skip a trade whose modelled exit slippage exceeds this percent. */
    maxExitSlippagePct?: number;
}
/**
 * Build a LangChain tool that gates a Base swap on token safety.
 *
 * Wraps Grey Ridge `/gate/swap` (honeypot + sellability + admin-control +
 * liquidity-vs-size), paid inline per call via x402 USDC ($0.008) — no API key,
 * no subscription. The tool returns the full verdict plus a sizing-aware
 * `proceed` boolean the model can branch on, and fails CLOSED (`proceed:false`)
 * if the gate is ever unreachable, so an outage can never green-light a swap.
 *
 * Uses `responseFormat: "content_and_artifact"` so the agent gets a readable
 * string AND the structured guard object (`.artifact`) in one call.
 *
 * ```ts
 * import { createSwapGuard } from "@grey-ridge/langchain-swap-gate";
 * import { createReactAgent } from "@langchain/langgraph/prebuilt";
 * const swapGuard = createSwapGuard({ privateKey: process.env.PRIVATE_KEY });
 * const agent = createReactAgent({ llm, tools: [swapGuard] });
 * await agent.invoke({ messages: [{ role: "user", content: "Buy $50 of 0x… on Base" }] });
 * ```
 */
declare function createSwapGuard(opts?: SwapGuardOptions): _langchain_core_tools.DynamicStructuredTool<z.ZodObject<{
    token: z.ZodString;
    side: z.ZodDefault<z.ZodEnum<["buy", "sell"]>>;
    notional_usd: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    token: string;
    side: "buy" | "sell";
    notional_usd: number;
}, {
    token: string;
    side?: "buy" | "sell" | undefined;
    notional_usd?: number | undefined;
}>, {
    token: string;
    side?: "buy" | "sell";
    notional_usd?: number;
}, {
    token: string;
    side?: "buy" | "sell" | undefined;
    notional_usd?: number | undefined;
}, [string, GuardResult]>;
/**
 * Zero-config tool: reads `PRIVATE_KEY` (the agent's Base wallet) and the
 * optional `SWAP_GATE_BASE_URL` from the environment. Import and drop straight
 * into an agent's `tools` array.
 */
declare const swapGuard: _langchain_core_tools.DynamicStructuredTool<z.ZodObject<{
    token: z.ZodString;
    side: z.ZodDefault<z.ZodEnum<["buy", "sell"]>>;
    notional_usd: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    token: string;
    side: "buy" | "sell";
    notional_usd: number;
}, {
    token: string;
    side?: "buy" | "sell" | undefined;
    notional_usd?: number | undefined;
}>, {
    token: string;
    side?: "buy" | "sell";
    notional_usd?: number;
}, {
    token: string;
    side?: "buy" | "sell" | undefined;
    notional_usd?: number | undefined;
}, [string, GuardResult]>;
interface TokenReportOptions {
    /** Pre-built x402-paying fetch; overrides `privateKey`. Mainly for tests. */
    payFetch?: PayFetch;
    /** Hex private key of the agent's Base wallet; signs the $0.01 USDC x402 payment. Omit for the free preview path only. */
    privateKey?: string;
    /** Override the gate base URL (defaults to the hosted Grey Ridge Worker). */
    base?: string;
    /** Treat a token whose risk_score exceeds this (0-100) as unsafe. Default 60. */
    maxRiskScore?: number;
}
/**
 * Build a LangChain tool that vets a Base ERC-20 for safety — the research /
 * watchlist-screening companion to `swapGuard`.
 *
 * Wraps Grey Ridge `/chain/token-report` (honeypot + sellability sim,
 * owner-renounce + mint/pause/blacklist/fee-setter/upgradeable-proxy checks,
 * measured transfer tax, and Uniswap v3 WETH-pool liquidity), paid inline per
 * call via x402 USDC ($0.01) — no API key. Use it to screen a candidate token
 * BEFORE deciding to trade it. Returns the full report plus a `safe` boolean,
 * and fails CLOSED (`safe:false`, verdict AVOID) if the route is unreachable.
 *
 * Uses `responseFormat: "content_and_artifact"` so the agent gets a readable
 * string AND the structured report object (`.artifact`) in one call.
 *
 * ```ts
 * import { createTokenReport } from "@grey-ridge/langchain-swap-gate";
 * const tokenReport = createTokenReport({ privateKey: process.env.PRIVATE_KEY });
 * const agent = createReactAgent({ llm, tools: [tokenReport] });
 * ```
 */
declare function createTokenReport(opts?: TokenReportOptions): _langchain_core_tools.DynamicStructuredTool<z.ZodObject<{
    token: z.ZodString;
}, "strip", z.ZodTypeAny, {
    token: string;
}, {
    token: string;
}>, {
    token: string;
}, {
    token: string;
}, [string, TokenReportResult]>;
/**
 * Zero-config token-report tool: reads `PRIVATE_KEY` and the optional
 * `SWAP_GATE_BASE_URL` from the environment.
 */
declare const tokenReport: _langchain_core_tools.DynamicStructuredTool<z.ZodObject<{
    token: z.ZodString;
}, "strip", z.ZodTypeAny, {
    token: string;
}, {
    token: string;
}>, {
    token: string;
}, {
    token: string;
}, [string, TokenReportResult]>;

export { GATE_BASE, type GateActivation, type GateArgs, type GateResponse, type GuardResult, type ReportDecision, type SwapGuardOptions, type TokenReportOptions, type TokenReportResponse, type TokenReportResult, type TradeDecision, buildGateUrl, buildPreviewUrl, buildReportUrl, createSwapGuard, createTokenReport, swapGuard as default, evaluateReport, evaluateTrade, extractToken, fetchGate, fetchGateOrPreview, fetchGatePreview, fetchTokenReport, fundOnrampHint, runGuard, runTokenReport, summarizeGate, summarizeReport, swapGuard, tokenReport };
