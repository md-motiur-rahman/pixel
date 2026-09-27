import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ROLE_HOME: Record<string, string> = {
  admin: "/admin",
  tester: "/tester",
  dispatcher: "/dispatcher",
  checker: "/checker",
};

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
  let profile: { role: string; is_active: boolean } | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  if (user && profile && !profile.is_active && !isLoginPage) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = (profile && ROLE_HOME[profile.role]) || "/";
    return NextResponse.redirect(url);
  }

  // Section-level role gating: /admin, /tester, /dispatcher, /checker
  if (user && profile) {
    const section = Object.keys(ROLE_HOME).find((r) => path.startsWith(`/${r}`));
    if (section && profile.role !== section && profile.role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = ROLE_HOME[profile.role] || "/login";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
