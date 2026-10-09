// Amazon ASINs are 10 characters, letters (upper case) and digits. Shared by the
// inventory screen (instant feedback) and the server action (the real check —
// the database re-validates too).
export const MAX_ASINS = 3;

const ASIN_RE = /^[A-Z0-9]{10}$/;

export function normalizeAsin(value: string): string {
  return value.trim().toUpperCase();
}

/** Validates an ASIN list: blanks are ignored, the first is required. `max` is how many are allowed. */
export function validateAsins(
  values: string[],
  max: number = MAX_ASINS
): { ok: true; asins: string[] } | { ok: false; error: string; index?: number } {
  const asins: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const asin = normalizeAsin(values[i] ?? "");
    if (!asin) continue;
    if (!ASIN_RE.test(asin)) {
      return { ok: false, index: i, error: `"${asin}" isn't a valid ASIN — it must be exactly 10 letters or numbers.` };
    }
    if (asins.includes(asin)) {
      return { ok: false, index: i, error: `${asin} is entered more than once.` };
    }
    asins.push(asin);
  }
  if (asins.length === 0) return { ok: false, index: 0, error: "At least one ASIN is required." };
  if (asins.length > max) return { ok: false, error: `At most ${max} ASINs are allowed here.` };
  return { ok: true, asins };
}
