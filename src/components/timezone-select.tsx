"use client";

import { useSyncExternalStore } from "react";
import { NativeSelect } from "@/components/shared";

const subscribe = () => () => {};

/** Timezone list is computed on the client only, avoiding hydration mismatches. */
export function TimezoneSelect({ id, value, onChange }: { id?: string; value: string; onChange: (tz: string) => void }) {
  const zones = useSyncExternalStore(
    subscribe,
    () => (typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone").join("|") : "UTC"),
    () => "",
  );
  const list = zones ? zones.split("|") : [];
  const options = list.includes(value) || !value ? list : [value, ...list];
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.length === 0 ? <option value={value}>{value || "Loading…"}</option> : null}
      {options.map((tz) => (
        <option key={tz} value={tz}>
          {tz}
        </option>
      ))}
    </NativeSelect>
  );
}
