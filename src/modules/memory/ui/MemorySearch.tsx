"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function MemorySearch({ q }: { q: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [v, setV] = useState(q);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const p = new URLSearchParams(sp.toString());
        p.delete("offset");
        p.delete("id");
        if (v.trim()) p.set("q", v.trim());
        else p.delete("q");
        router.push(`/memory?${p}`);
      }}
    >
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="기억 검색"
        className="h-8 w-40 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 md:w-56"
        aria-label="기억 검색"
      />
    </form>
  );
}
