"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthCard } from "@/components/auth-card";
import { Button, Field, Input, Message } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    // Created here, not at the top of the component, so this never runs
    // during the server-side render pass (including at build time) — only
    // when actually submitted in the browser.
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/set-password`,
    });

    setSubmitting(false);

    // Always show the same success message, even on error (e.g. a rate-limit
    // response) — surfacing the real error here would let someone infer
    // whether a given email has an account, which is exactly what this is
    // meant to avoid.
    if (error) {
      console.error("resetPasswordForEmail failed:", error.message);
    }
    setSent(true);
  }

  return (
    <AuthCard>
        <h1 className="text-lg font-semibold tracking-tight text-fg">Reset your password</h1>

        {sent ? (
          <Message variant="success">
            <span className="block pt-3">
              If an account exists for that email, a reset link is on its way. Check your inbox.
            </span>
          </Message>
        ) : (
          <>
            <p className="mt-1 text-sm text-fg-muted">
              Enter your email and we&rsquo;ll send you a link to set a new password.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Field label="Email">
                <Input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          </>
        )}

        <Link href="/login" className="mt-5 block text-sm font-medium text-link hover:text-link-hover">
          Back to sign in
        </Link>
      </AuthCard>
  );
}
