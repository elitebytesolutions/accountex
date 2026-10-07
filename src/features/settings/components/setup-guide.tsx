"use client";

import {
  ArrowRight, Building2, Check, ChevronDown, Circle, CircleCheck, Landmark, LayoutDashboard, ListTree, Package, PartyPopper, Play, ReceiptText,
  Rocket, Scale, ShieldCheck, Timer, Undo2, UserPlus, WalletCards, type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { SetupGuide as Guide, SetupStep } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { getSetupGuide, setStepDone } from "../api";

const ICONS: Record<string, LucideIcon> = {
  "building-2": Building2, "list-tree": ListTree, scale: Scale, package: Package, landmark: Landmark,
  "shield-check": ShieldCheck, "user-plus": UserPlus, "receipt-text": ReceiptText, "wallet-cards": WalletCards,
};
const C = 2 * Math.PI * 52;
type Filter = "all" | "todo" | "done";

/** Template `ring()` (9A-company-plus.js). */
function Ring({ pct }: { pct: number }) {
  return (
    <svg className="cp-ring big" viewBox="0 0 120 120" aria-hidden>
      <circle className="trk" cx="60" cy="60" r="52" />
      <circle className="val" cx="60" cy="60" r="52" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - pct / 100)).toFixed(1)} />
    </svg>
  );
}

/** Template app/setup: progress hero, onboarding checklist, mark done / not done. */
export function SetupGuideScreen({ userName, companyName, canEdit }: { userName: string; companyName: string; canEdit: boolean }) {
  const toast = useToast();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSetupGuide()
      .then((g) => {
        if (cancelled) return;
        setGuide(g);
        setError(null);
        setOpen((o) => o ?? g.nextStepKey);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the setup guide" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const toggle = async (step: SetupStep) => {
    setBusy(step.key);
    try {
      const g = await setStepDone(step.key, !step.done);
      setGuide(g);
      if (!step.done) {
        setOpen(g.nextStepKey);
        toast(g.progressPct >= 100 ? `Setup complete. Welcome to Accountex, ${companyName}!` : `${step.title} marked done`, { tone: "good" });
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not update the step", { tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  const continueNext = () => {
    if (!guide?.nextStepKey) return;
    setFilter("all");
    setOpen(guide.nextStepKey);
    document.querySelector(`[data-k="${guide.nextStepKey}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const next = guide?.steps.find((s) => s.key === guide.nextStepKey);
  const complete = (guide?.progressPct ?? 0) >= 100;

  return (
    <div className="cp-screen">
      <PageHead
        eyebrow={<><Rocket />Workspace / Setup Guide</>}
        title="Setup Guide"
        description={`Nine short steps to get ${companyName} fully live on Accountex: books, bank, tax, team and payroll.`}
        actions={<ButtonLink variant="primary" href="/dashboard" icon={<LayoutDashboard />}>Go to dashboard</ButtonLink>}
      />
      {error ? (
        <ErrorState {...error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : !guide ? (
        <>
          <Skeleton style={{ height: 228, borderRadius: 24, marginBottom: 18 }} />
          <Skeleton style={{ height: 420, borderRadius: 16 }} />
        </>
      ) : (
        <>
          <div className={cn("cp-su-hero", complete && "complete")}>
            <div className="cp-su-ringwrap">
              <Ring pct={guide.progressPct} />
              <div className="cp-su-pct"><b>{guide.progressPct}</b><span>%</span><small>{guide.doneSteps} of {guide.totalSteps} done</small></div>
            </div>
            <div className="cp-su-hero-t">
              <span className="hero-eyebrow">Welcome aboard, {userName.split(" ")[0]}</span>
              <h2>{complete ? `You're all set. ${companyName} is fully live!` : `Let's get ${companyName} ready to run`}</h2>
              <p>
                {next ? <>Next up: <b>{next.title}</b>, about {next.minutes} minutes.</> : "Every step is complete. Your books, bank, tax and payroll are ready."}
              </p>
              <div className="cp-su-seg">
                {guide.steps.map((s) => <i key={s.key} className={s.done ? "on" : undefined} style={{ flex: s.weightPct }} title={s.title} />)}
              </div>
              <div className="row cp-wrap-row">
                <Button variant="lime" icon={next ? <Play /> : <PartyPopper />} onClick={continueNext}>{next ? `Continue: ${next.title}` : "All done"}</Button>
                <span className="pill cp-su-pill"><Timer /><span>{guide.minutesRemaining} min</span> left</span>
              </div>
            </div>
          </div>
          <div className="panel cp-su-list">
            <div className="panel-head">
              <div><h3>Onboarding checklist</h3><p>Expand a step for details. Mark it done when you&apos;re happy with it.</p></div>
              <div className="seg" role="tablist">
                {(["all", "todo", "done"] as const).map((f) => (
                  <button key={f} type="button" className={filter === f ? "active" : undefined} onClick={() => setFilter(f)}>
                    {f === "all" ? "All" : f === "todo" ? "To do" : "Done"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              {guide.steps.map((s, i) => {
                const Icon = ICONS[s.icon] ?? Rocket;
                const isOpen = open === s.key;
                const hidden = (filter === "todo" && s.done) || (filter === "done" && !s.done);
                return (
                  <div key={s.key} data-k={s.key} hidden={hidden} className={cn("cp-su-step", s.done && "done", isOpen && "open")} style={{ ["--i" as string]: i }}>
                    <button type="button" className="cp-su-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.key)}>
                      <span className="cp-su-check"><Check /></span>
                      <span className="cp-su-n">{String(i + 1).padStart(2, "0")}</span>
                      <span className="cp-su-t"><b>{s.title}</b><small>{s.group} · ~{s.minutes} min · {s.weightPct}% of setup</small></span>
                      <span className={cn("badge cp-su-state", s.done ? "good" : "neutral")}>{s.done ? "Done" : "To do"}</span>
                      <span className="cp-su-chev"><ChevronDown /></span>
                    </button>
                    <div className="cp-su-body">
                      <div>
                        <div className="cp-su-in">
                          <span className={cn("icon-tile", !s.done && "lime")}><Icon /></span>
                          <div className="cp-su-txt">
                            <p>{s.description}</p>
                            <ul>{s.tips.map((t) => <li key={t}>{s.done ? <CircleCheck /> : <Circle />}{t}</li>)}</ul>
                            <div className="row cp-wrap-row">
                              {s.href ? (
                                <ButtonLink size="sm" variant={s.done ? "secondary" : "primary"} href={s.href}>{s.cta}<ArrowRight /></ButtonLink>
                              ) : (
                                <Badge tone="info">Available in Phase {s.availableInPhase}</Badge>
                              )}
                              {canEdit && s.key !== "PROFILE" && (
                                <Button size="sm" variant={s.done ? "ghost" : "lime"} icon={s.done ? <Undo2 /> : <Check />} disabled={busy === s.key} onClick={() => toggle(s)}>
                                  {s.done ? "Mark as not done" : "Mark done"}
                                </Button>
                              )}
                              {s.key === "PROFILE" && !s.done && <small className="muted">Completes itself when the company profile is saved.</small>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
