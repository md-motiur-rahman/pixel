import { WifiOff } from "lucide-react";
import { Card } from "@/components/ui";

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="max-w-sm p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-warn-line bg-warn-soft text-warn">
          <WifiOff aria-hidden="true" className="size-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold tracking-tight text-fg">You&rsquo;re offline</h1>
        <p className="mt-2 text-sm text-fg-muted">
          This page hasn&rsquo;t been loaded before, so it needs a connection. Reconnect and try again.
        </p>
      </Card>
    </div>
  );
}
