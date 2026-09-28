"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export function SignOutButton() {
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        // Created here, not at the top of the component, so this never runs
        // during the server-side render pass (including at build time) —
        // only when actually clicked in the browser.
        const supabase = createClient();
        // Without { scope: "local" }, Supabase signs the user out
        // everywhere — a dispatcher signing out of a shared warehouse
        // tablet would otherwise also kill their session on their own
        // phone the next time it refreshes its token.
        await supabase.auth.signOut({ scope: "local" });
        router.push("/login");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
