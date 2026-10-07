"use client";

import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

/** Keeps the overlay mounted for the template's 200 ms closing animation, and closes on Escape. */
function useOverlay(open: boolean, onClose: () => void) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  // React to `open` changes during render (no effect needed): opening mounts, closing starts the animation.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
    }
  }

  // Unmount once the closing animation has run.
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 200);
    return () => clearTimeout(t);
  }, [closing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return { mounted, closing };
}

/** Template drawer (FS.drawer in 95-ui.js): slides in from the right, scrim click / Escape / × close it. */
export function Drawer({ open, onClose, title, subtitle, wide, foot, className, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  wide?: boolean;
  foot?: ReactNode;
  /** Extra class on the drawer (template feature drawers such as `cu-ud`). */
  className?: string;
  children: ReactNode;
}) {
  const { mounted, closing } = useOverlay(open, onClose);
  if (!mounted) return null;
  return createPortal(
    <div className={cn("overlay drawer-overlay open", closing && "closing")} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={cn("drawer", className)} style={wide ? { width: "min(720px,100vw)" } : undefined} role="dialog" aria-modal aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="x" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </aside>
    </div>,
    document.body,
  );
}

/** Template modal used for confirmations (e.g. deactivate / delete). */
export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = "Confirm", danger, busy }: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
}) {
  const { mounted, closing } = useOverlay(open, onClose);
  if (!mounted) return null;
  return createPortal(
    <div className={cn("overlay open", closing && "closing")} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="alertdialog" aria-modal aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="x" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        {children && <div className="muted">{children}</div>}
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={cn("btn", danger ? "danger solid" : "primary")} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Template `.overlay > .modal` with head, scrolling body and footer (e.g. coa-mdl-add). */
export function Modal({ open, onClose, title, subtitle, wide, xl, foot, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  wide?: boolean;
  /** Template `.modal.xl` (large entry forms such as New Customer). */
  xl?: boolean;
  foot?: ReactNode;
  children: ReactNode;
}) {
  const { mounted, closing } = useOverlay(open, onClose);
  if (!mounted) return null;
  return createPortal(
    <div className={cn("overlay open", closing && "closing")} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn("modal", wide && "wide", xl && "xl")} role="dialog" aria-modal aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="x" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>,
    document.body,
  );
}
