import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { fetchProfileRoles, hasRole, homeFor, ROLE_HOME } from "@/lib/roles";
import type { Role } from "@/types/database";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const user = await getAuthUser(supabase);

  const path = request.nextUrl.pathname;
  const isLoginPage = path === "/login";
  const isSetPasswordPage = path === "/set-password";
  const isForgotPasswordPage = path === "/forgot-password";
  const isOfflinePage = path === "/offline";
  // The invite/recovery email link lands here first (no session yet) — it
  // exchanges the token for a session, then redirects to /set-password.
  const isAuthConfirmRoute = path === "/auth/confirm";

  if (
    !user &&
    !isLoginPage &&
    !isSetPasswordPage &&
    !isForgotPasswordPage &&
    !isOfflinePage &&
    !isAuthConfirmRoute
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Fetch the profile once per request — used for login-redirect, role
  // gating, and an immediate cutoff for deactivated staff (their auth ban
  // only blocks new sign-ins, not an already-issued token until it refreshes).
  let profile: { roles: Role[]; isActive: boolean } | null = null;
  if (user) {
    profile = await fetchProfileRoles(supabase, user.id);
  }

  if (user && profile && !profile.isActive && !isLoginPage) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Only bounce a signed-in user away from /login when we know where to send
  // them — with no profile row, / sends them straight back here (a loop).
  if (user && isLoginPage && profile) {
    const url = request.nextUrl.clone();
    url.pathname = homeFor(profile.roles) || "/";
    return NextResponse.redirect(url);
  }

  // Section-level role gating: each section belongs to one role. Someone can open
  // every section of the roles they hold (admins can open all of them).
  if (user && profile) {
    const section = (Object.entries(ROLE_HOME) as [Role, string][]).find(
      ([, prefix]) => path === prefix || path.startsWith(`${prefix}/`)
    )?.[0];
    if (section && !hasRole(profile.roles, section)) {
      const url = request.nextUrl.clone();
      url.pathname = homeFor(profile.roles) || "/login";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
