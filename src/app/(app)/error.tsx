"use client";

import { ErrorState } from "@/components/ui/states";

/** Error boundary for workspace pages: template danger banner with a reference and retry. */
export default function WorkspaceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorState
      message="Something went wrong while loading this page. Your data is safe; try again."
      reference={error.digest}
      onRetry={() => retry()}
    />
  );
}
