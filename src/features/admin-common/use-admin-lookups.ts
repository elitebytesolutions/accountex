"use client";

import { useEffect, useState } from "react";
import type { LookupsResponse } from "@/shared";
import { getAdminLookups } from "./api";

/**
 * Lookup lists for Super Admin selects (the tenant `useLookups` needs a workspace session). Empty until loaded.
 * Use with `labelOf`, `toneOf` and `lookupOptions` from "@/features/settings/use-lookups".
 */
export function useAdminLookups(types: string[]): LookupsResponse {
  const key = types.join(",");
  const [data, setData] = useState<LookupsResponse>({});
  useEffect(() => {
    let cancelled = false;
    getAdminLookups(key.split(","))
      .then((d) => !cancelled && setData(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);
  return data;
}
