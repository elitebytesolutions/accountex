import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

/** Template `.form-grid` (two columns; `cols={1}` or `cols={3}` for one or three). */
export function FormGrid({ cols, children }: { cols?: 1 | 3; children: ReactNode }) {
  return <div className={cn("form-grid", cols === 3 && "c3", cols === 1 && "c1")}>{children}</div>;
}

/**
 * Template field: `<label><span>Label</span>control</label>`. Inputs, selects and textareas are styled globally
 * by the template. The error line is an addition: the template has no error style, so it uses `.hint` in the
 * danger colour.
 */
export function Field({ label, required, hint, error, full, children }: {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={cn(full && "full")}>
      <span>
        {label}
        {required && " *"}
      </span>
      {children}
      {error ? <small className="hint text-danger" role="alert">{error}</small> : hint && <small className="hint">{hint}</small>}
    </label>
  );
}

const invalid = "aria-invalid:border-danger";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(invalid, className)} {...rest} />;
}

export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={cn(invalid, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn(invalid, className)} {...rest} />;
}

/** Template `.switch` toggle: `<label class="switch"><input type=checkbox><i></i><span>label</span></label>`. */
export function Switch({ label, className, ...rest }: { label?: ReactNode } & Omit<ComponentProps<"input">, "type">) {
  return (
    <label className={cn("switch", className)}>
      <input type="checkbox" {...rest} />
      <i />
      {label && <span>{label}</span>}
    </label>
  );
}

/** Template `label.check` (plain checkbox row inside a form grid). */
export function Check({ label, full, ...rest }: { label: ReactNode; full?: boolean } & Omit<ComponentProps<"input">, "type">) {
  return (
    <label className={cn("check", full && "full")}>
      <input type="checkbox" {...rest} /> {label}
    </label>
  );
}

/** Template `.form-actions` (button row at the end of a form). */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="form-actions">{children}</div>;
}
