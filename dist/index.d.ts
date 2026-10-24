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
declare function evaluateTrade(
  out: GateResponse | null | undefined,
  opts?: { maxBreakevenPct?: number; maxExitSlippagePct?: number }
): TradeDecision;
declare function fetchGate(
  payFetch: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<GateResponse> }>,
  args?: GateArgs
): Promise<GateResponse>;

interface GuardResult extends GateResponse {
  proceed: boolean;
  guard_reasons: string[];
  summary: string;
}

declare function runGuard(
  payFetch: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<GateResponse> }>,
  args?: GateArgs,
  opts?: { maxBreakevenPct?: number; maxExitSlippagePct?: number }
): Promise<GuardResult>;

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

export { GATE_BASE, type GateArgs, type GateResponse, type GuardResult, type SwapGuardOptions, type TradeDecision, buildGateUrl, createSwapGuard, swapGuard as default, evaluateTrade, extractToken, fetchGate, runGuard, summarizeGate, swapGuard };
