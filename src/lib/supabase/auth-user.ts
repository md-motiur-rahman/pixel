import type { SupabaseClient } from "@supabase/supabase-js";

// The signed-in caller's verified id. getClaims() verifies the session JWT's
// signature locally when the project uses asymmetric signing keys — no round
// trip to the Auth server (getUser() makes one on EVERY call, and pages and
// actions made several per click). On a legacy symmetric-key project it falls
// back to checking with the Auth server, i.e. never slower than getUser().
// It also refreshes a session that's about to expire, like getUser() did.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAuthUser(supabase: SupabaseClient<any, any, any>): Promise<{ id: string } | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub };
}
