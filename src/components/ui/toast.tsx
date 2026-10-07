"use client";

import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "./cn";

type ToastTone = "good" | "warn" | "danger" | "info";
type ToastOptions = { tone?: ToastTone; ms?: number; action?: { label: string; onClick: () => void } };
type ToastItem = ToastOptions & { id: number; message: string; out: boolean };

const ToastContext = createContext<(message: string, options?: ToastOptions) => void>(() => {});

const ICONS: Record<ToastTone, ReactNode> = { good: <CircleCheck />, warn: <TriangleAlert />, danger: <CircleX />, info: <Info /> };

/** Template toasts (FS.toast in 95-ui.js): bottom-right stack, progress bar, optional action, auto-dismiss. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const close = useCallback((id: number) => {
    setItems((all) => all.map((t) => (t.id === id ? { ...t, out: true } : t)));
    setTimeout(() => setItems((all) => all.filter((t) => t.id !== id)), 300);
  }, []);

  const toast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = Date.now() + Math.random();
      setItems((all) => [...all, { id, message, out: false, ...options }]);
      setTimeout(() => close(id), options.ms ?? 4200);
    },
    [close],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-host" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cn("toast", t.tone, t.out && "out")}>
            {ICONS[t.tone ?? "good"]}
            <span>{t.message}</span>
            {t.action && (
              <button type="button" onClick={() => { t.action!.onClick(); close(t.id); }}>
                {t.action.label}
              </button>
            )}
            <i className="bar" style={{ animationDuration: `${t.ms ?? 4200}ms` }} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** `const toast = useToast(); toast("Saved")` or `toast("Failed", { tone: "danger" })`. */
export const useToast = () => useContext(ToastContext);
