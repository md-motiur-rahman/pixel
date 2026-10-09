import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-user";

const ROLE_HOME: Record<string, string> = {
  admin: "/admin/inventory",
  tester: "/tester",
  dispatcher: "/dispatcher",
  checker: "/checker",
  data_entry: "/data-entry",
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

  // Only bounce a signed-in user away from /login when we know where to send
  // them — with no profile row, / sends them straight back here (a loop).
  if (user && isLoginPage && profile) {
    const url = request.nextUrl.clone();
    url.pathname = (profile && ROLE_HOME[profile.role]) || "/";
    return NextResponse.redirect(url);
  }

  // Section-level role gating: each section belongs to one role (admins can open all of them).
  if (user && profile) {
    const section = Object.entries(ROLE_HOME).find(
      ([, prefix]) => path === prefix || path.startsWith(`${prefix}/`)
    )?.[0];
    if (section && profile.role !== section && profile.role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = ROLE_HOME[profile.role] || "/login";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
