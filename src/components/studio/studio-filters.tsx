"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/shared";
import { PLATFORMS } from "@/engines/studio/platforms";

export function StudioFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  };
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row">
      <NativeSelect aria-label="Status" className="sm:w-44" value={params.get("status") ?? ""} onChange={(e) => update("status", e.target.value)}>
        <option value="">All active</option>
        {["idea", "draft", "in_review", "approved", "scheduled", "published", "rejected", "archived"].map((s) => (
          <option key={s} value={s}>
            {s.replace("_", " ")}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Platform" className="sm:w-44" value={params.get("platform") ?? ""} onChange={(e) => update("platform", e.target.value)}>
        <option value="">All platforms</option>
        {Object.values(PLATFORMS).map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
