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
    // Created here (and again in handleSubmit below), not at the top of the
    // component, so this never runs during the server-side render pass
    // (including at build time) — only client-side, after mount.
    const supabase = createClient();
    // The invite link's tokens are in the URL; the browser client picks them
    // up on load and turns them into a session automatically.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true);
      } else {
        setError("This invite link is invalid or has expired. Ask your admin to send a new one.");
      }
    });
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
