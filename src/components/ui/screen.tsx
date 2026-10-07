import type { ReactNode } from "react";

/**
 * Template `<section class="screen active" data-route="…">`. Template polish rules are scoped to a screen's route
 * (e.g. which table columns wrap, toolbar insets), so a page that ports a template screen wraps itself in this.
 */
export function Screen({ route, className, children }: { route: string; className?: string; children: ReactNode }) {
  return (
    <section className={className ? `screen active ${className}` : "screen active"} data-route={route}>
      {children}
    </section>
  );
}
