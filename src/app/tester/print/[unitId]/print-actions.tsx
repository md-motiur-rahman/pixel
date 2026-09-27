"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function PrintActions() {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button onClick={() => window.print()} className="sm:w-auto">
        Print label
      </Button>
      <Button variant="secondary" onClick={() => router.push("/tester")} className="sm:w-auto">
        Test another camera
      </Button>
    </div>
  );
}
