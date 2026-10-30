"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function PrintActions({ back }: { back: { href: string; label: string } }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button onClick={() => window.print()} className="sm:w-auto">
        Print label
      </Button>
      <Button variant="secondary" onClick={() => router.push(back.href)} className="sm:w-auto">
        {back.label}
      </Button>
    </div>
  );
}
