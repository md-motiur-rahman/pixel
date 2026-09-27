"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, Message } from "@/components/ui";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

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
    <div className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4 py-10">
      <Card className="w-full max-w-sm p-6 sm:p-7">
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Reset your password</h1>

        {sent ? (
          <Message variant="success">
            <span className="block pt-3">
              If an account exists for that email, a reset link is on its way. Check your inbox.
            </span>
          </Message>
        ) : (
          <>
            <p className="mt-1 text-sm text-neutral-500">
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

        <Link href="/login" className="mt-5 block text-sm font-medium text-indigo-600 hover:text-indigo-700">
          Back to sign in
        </Link>
      </Card>
    </div>
  );
}
