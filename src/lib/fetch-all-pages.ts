// Supabase/PostgREST caps a single response at 1,000 rows by default — this
// client has 1,000+ camera models, so any unpaginated query over the catalog
// (or a large export) can silently truncate. Pages through until a request
// returns zero rows.
//
// Callers must give the query a stable, unique .order() (e.g. its id column)
// — offset pagination over a non-deterministic or non-unique sort can return
// rows in a different order per page, silently skipping or duplicating rows
// across the page boundary.
const PAGE_SIZE = 1000;

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ ok: true; rows: T[] } | { ok: false; error: string }> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) return { ok: false, error: error.message };
    // Don't assume a short page means "the last page" — if this project's
    // own PostgREST max-rows setting is below PAGE_SIZE, every page would be
    // short, and stopping here would silently return a partial result.
    // Only a genuinely empty page means there's nothing left to fetch.
    if (!data || data.length === 0) break;
    rows.push(...data);
    from += data.length;
  }
  return { ok: true, rows };
}
