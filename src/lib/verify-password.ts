import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Re-checks a person's password by signing in with it on a throwaway client.
// Nothing is persisted, so the caller's own session and cookies are untouched.
// The session that sign-in creates is revoked straight away so it doesn't
// linger — scope "local" revokes only that one session, never the person's
// others (a global sign-out would kick them off every device).
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  if (!email || !password) return false;

  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;

  try {
    await createAdminClient().auth.admin.signOut(data.session.access_token, "local");
  } catch {
    // Cleanup only — the password was verified either way.
  }
  return true;
}
