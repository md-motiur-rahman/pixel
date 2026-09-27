// Escapes %, _, and the escape character itself so an ilike comparison
// behaves like an exact case-insensitive match rather than a wildcard
// pattern — without this, a value that happens to contain a literal '_' or
// '%' (plausible in a serial number or model name) silently matches more
// broadly than intended, or reads as "not found" when it matches >1 row.
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value);
}
