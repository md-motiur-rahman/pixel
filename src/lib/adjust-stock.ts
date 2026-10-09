// Result of resolving a stock-count difference (see checker/actions.ts).
export type AdjustResult = { ok: true; quantity: number } | { ok: false; error: string };
