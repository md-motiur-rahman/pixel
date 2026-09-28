type IdRow = { id: string };
type QueryResult<T> = { data: T | null; error: { code?: string; message: string } | null };

// For any table with a real unique constraint, two callers racing to create
// "the same new row" (e.g. two testers saving the same new brand/model/color
// at once) can both find nothing and both try to insert — the loser would
// otherwise hit a raw 23505 instead of quietly reusing the winner's row.
export async function findOrCreate(
  find: () => Promise<QueryResult<IdRow>>,
  create: () => Promise<QueryResult<IdRow>>
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data: existing, error: findError } = await find();
  if (findError) return { ok: false, error: findError.message };
  if (existing) return { ok: true, id: existing.id };

  const { data: created, error: createError } = await create();
  if (createError) {
    if (createError.code === "23505") {
      const { data: retryExisting, error: retryError } = await find();
      if (retryError) return { ok: false, error: retryError.message };
      if (retryExisting) return { ok: true, id: retryExisting.id };
    }
    return { ok: false, error: createError.message };
  }
  if (!created) return { ok: false, error: "Insert returned no row." };
  return { ok: true, id: created.id };
}
