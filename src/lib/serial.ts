// Serial lookups are exact but case-insensitive (ilike with escaped wildcards).
// Queries fetch up to 2 rows: before migration_4 added a case-insensitive
// unique index, "abc1" and "ABC1" could both exist, and .maybeSingle() would
// fail with a cryptic "multiple rows" error instead of saying what's wrong.
export function singleSerialMatch<T>(
  rows: T[] | null
): { ok: true; row: T | null } | { ok: false; error: string } {
  if (!rows || rows.length === 0) return { ok: true, row: null };
  if (rows.length > 1) {
    return {
      ok: false,
      error:
        "More than one item has this serial number (differing only in upper/lower case). Correct one of them first.",
    };
  }
  return { ok: true, row: rows[0] };
}
