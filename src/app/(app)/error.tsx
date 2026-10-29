"use client";

import { Button, Card, Message } from "@/components/ui";

// Shown inside the app shell when a page crashes while rendering, instead of the
// whole page going blank. The message tells us what broke.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="mx-auto w-full max-w-xl space-y-3 p-5 sm:p-6">
      <h2 className="text-sm font-semibold text-fg">Something went wrong on this page</h2>
      <Message variant="error">{error.message || "Unknown error."}</Message>
      {error.digest && <p className="text-xs text-fg-subtle">Reference: {error.digest}</p>}
      <Button type="button" variant="secondary" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
