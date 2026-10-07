import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "lime" | "danger" | "dark";
type Size = "sm" | "lg";
type Common = { variant?: Variant; size?: Size; icon?: ReactNode; block?: boolean };

const classes = ({ variant = "secondary", size, block }: Common, extra?: string) =>
  cn("btn", variant, size, block && "block", extra);

/** Template `.btn` (10-styles.css "Buttons"). */
export function Button({ variant, size, icon, block, className, children, type = "button", ...rest }: Common & ComponentProps<"button">) {
  return (
    <button type={type} className={classes({ variant, size, block }, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

/** A `.btn` that navigates. */
export function ButtonLink({ variant, size, icon, block, className, children, ...rest }: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={classes({ variant, size, block }, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
