import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "good" | "warn" | "danger" | "info" | "violet" | "neutral" | "dark" | "lime" | "outline";

/** Template `.badge` with a tone; `dot` adds the leading status dot. Lookup tones map 1:1 (good/warn/danger/info/neutral/violet). */
export function Badge({ tone = "neutral", dot, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return <span className={cn("badge", tone, dot && "dot")}>{children}</span>;
}
