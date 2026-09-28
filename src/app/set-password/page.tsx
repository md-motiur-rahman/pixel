"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, Message } from "@/components/ui";

export default function SetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function establishSession() {
      const supabase = createClient();

      // Supabase's default invite/reset email (the free-tier one — editing
      // templates requires custom SMTP) links here with the session tokens
      // in the URL's #hash fragment, not a query param, and this app's
      // PKCE-flow client doesn't auto-detect that on its own. Read it
      // ourselves and hand it directly to the client.
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        // Drop the tokens from the visible URL/history now that they're used.
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        if (!error) {
          setReady(true);
          return;
        }
      }

      // No hash tokens — maybe a session was already set up server-side via
      // /auth/confirm instead (the path used if custom SMTP + a customized
      // template are configured later).
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setReady(true);
      } else {
        setError("This invite link is invalid or has expired. Ask your admin to send a new one.");
      }
    }

    // Deferred a tick so this is a callback invocation, not a direct
    // effect-body call.
    const timeoutId = setTimeout(() => void establishSession(), 0);
    return () => clearTimeout(timeoutId);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4 py-10">
      <Card className="w-full max-w-sm p-6 sm:p-7">
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Set your password</h1>
        <p className="mt-1 text-sm text-neutral-500">Choose a password to finish creating your account.</p>

        {ready ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field label="New password">
              <Input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error && <Message variant="error">{error}</Message>}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Saving…" : "Set password & continue"}
            </Button>
          </form>
        ) : (
          <p className="mt-6 text-sm text-neutral-500">{error ?? "Checking your invite link…"}</p>
        )}
      </Card>
    </div>
  );
}
