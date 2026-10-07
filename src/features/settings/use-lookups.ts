"use client";

import { useEffect, useState } from "react";
import type { LookupsResponse } from "@/shared";
import { getLookups } from "./api";

/** Lookup lists for selects, loaded once per component. Empty lists until loaded (selects then show the saved code). */
export function useLookups(types: string[]): LookupsResponse {
  const key = types.join(",");
  const [data, setData] = useState<LookupsResponse>({});
  useEffect(() => {
    let cancelled = false;
    getLookups(key.split(","))
      .then((d) => !cancelled && setData(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);
  return data;
}

/** <option>s for a lookup; keeps the current value selectable even if it is inactive or not loaded yet. */
export function lookupOptions(data: LookupsResponse, type: string, current?: string | null) {
  const items = data[type] ?? [];
  const extra = current && !items.some((i) => i.code === current) ? [{ code: current, label: current, tone: "neutral" }] : [];
  return [...extra, ...items];
}

export const labelOf = (data: LookupsResponse, type: string, code: string | null | undefined) =>
  code ? (data[type]?.find((i) => i.code === code)?.label ?? code) : "—";

/** Badge tone of a lookup value (good / warn / danger / info / neutral / violet). */
export const toneOf = (data: LookupsResponse, type: string, code: string | null | undefined) =>
  (code && data[type]?.find((i) => i.code === code)?.tone) || "neutral";
