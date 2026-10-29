// Prices are stored as numeric(10, 2): at most 99,999,999.99, two decimal places.
const MAX_PRICE = 99_999_999.99;

export type PriceResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * Reads a price typed into a form ("125", "125.5", "£1,250.00"). Anything that
 * isn't a plain amount of money — negative, letters, more than 2 decimals — is
 * refused rather than guessed at, since this number ends up in profit figures.
 */
export function parsePrice(raw: string, label = "price"): PriceResult {
  const cleaned = raw.trim().replace(/^£\s*/, "").replace(/,/g, "");
  if (!cleaned) return { ok: false, error: `Enter the ${label}.` };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { ok: false, error: `The ${label} must be an amount like 125 or 125.50.` };
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value > MAX_PRICE) {
    return { ok: false, error: `The ${label} is too large.` };
  }
  return { ok: true, value };
}

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export function formatPrice(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : gbp.format(value);
}
