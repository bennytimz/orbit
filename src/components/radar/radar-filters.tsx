"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/shared";
import { CATEGORY_LABELS } from "./labels";

export function RadarFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`);
  };

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => update("q", q.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search discoveries" className="pl-8" aria-label="Search discoveries" />
      </div>
      <NativeSelect aria-label="Category" className="sm:w-56" value={params.get("category") ?? ""} onChange={(e) => update("category", e.target.value)}>
        <option value="">All categories</option>
        {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Status" className="sm:w-40" value={params.get("status") ?? ""} onChange={(e) => update("status", e.target.value)}>
        <option value="">Active</option>
        <option value="saved">Saved</option>
        <option value="dismissed">Dismissed</option>
        <option value="all">All</option>
      </NativeSelect>
      <NativeSelect aria-label="Sort" className="sm:w-44" value={params.get("sort") ?? ""} onChange={(e) => update("sort", e.target.value)}>
        <option value="">Most relevant</option>
        <option value="recent">Most recent</option>
      </NativeSelect>
    </div>
  );
}
