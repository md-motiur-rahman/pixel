"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, Message } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Created here, not at the top of the component, so this never runs
    // during the server-side render pass (including at build time) — only
    // when actually submitted in the browser.
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

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
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Pixel Direct</h1>
        <p className="mt-1 text-sm text-neutral-500">Camera inventory — sign in to continue.</p>

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
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error && <Message variant="error">{error}</Message>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Please wait…" : "Sign in"}
          </Button>
        </form>

        <Link
          href="/forgot-password"
          className="mt-5 block text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Forgot your password?
        </Link>
        <p className="mt-2 text-sm text-neutral-500">Don&rsquo;t have an account? Ask an admin to invite you.</p>
      </Card>
    </div>
  );
}
