export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4 text-center">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">You&rsquo;re offline</h1>
        <p className="mt-2 text-sm text-neutral-500">
          This page hasn&rsquo;t been loaded before, so it needs a connection. Reconnect and try again.
        </p>
      </div>
    </div>
  );
}
