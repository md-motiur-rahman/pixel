"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
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
