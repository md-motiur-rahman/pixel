import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase's invite/recovery emails link here with a token_hash rather than
// straight to /set-password, because @supabase/ssr's browser client is
// PKCE-only and can't read the older #access_token=... hash-fragment format
// those emails use. Exchanging the token_hash server-side sets the session
// as a cookie, which the client can then read normally.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Must be a same-origin path, not an absolute/protocol-relative URL — e.g.
  // next=@evil.com would otherwise produce https://app@evil.com, which
  // browsers resolve as a redirect to evil.com (userinfo confusion), and
  // next=//evil.com would be protocol-relative to the same effect.
  const rawNext = searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/set-password";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/set-password?error=invalid_link`);
}
