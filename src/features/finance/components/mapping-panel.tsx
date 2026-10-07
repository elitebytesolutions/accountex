"use client";

import { useEffect, useState } from "react";
import type { Account, AccountMapping } from "@/shared";
import { Field, FormGrid } from "@/components/ui/form";
import { Panel } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { listAccountMappings, listAccounts, saveAccountMappings } from "../api";

/** Template app/settings › Finance › "Default account mapping": the account each posting role posts to. */
export function MappingPanel({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [maps, setMaps] = useState<AccountMapping[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAccountMappings(), listAccounts().catch(() => [] as Account[])])
      .then(([m, a]) => {
        if (cancelled) return;
        setMaps(m);
        setAccounts(a.filter((x) => x.kind === "POSTABLE" && x.status === "ACTIVE"));
        setDraft(Object.fromEntries(m.map((x) => [x.role, x.accountId ?? ""])));
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the account mapping" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const changed = (maps ?? []).filter((m) => (m.accountId ?? "") !== (draft[m.role] ?? ""));
  const save = async () => {
    setSaving(true);
    try {
      await saveAccountMappings(changed.map((m) => ({ role: m.role, accountId: draft[m.role] || null })));
      toast("Finance settings saved", { tone: "good" });
      setAttempt((n) => n + 1);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not save the mapping", { tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="mb" title="Default account mapping" description="Used when vouchers are generated automatically by sub-ledgers">
      {error && <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((n) => n + 1)} />}
      {!maps && !error && <Skeleton style={{ height: 180 }} />}
      {maps && (
        <>
          {!accounts.length && <p className="small muted">Set up the chart of accounts to choose accounts here.</p>}
          <FormGrid>
            {maps.map((m) => {
              const mine = m.accountId && !accounts.some((a) => a.id === m.accountId) ? [{ id: m.accountId, code: m.accountCode ?? "", name: m.accountName ?? "" }] : [];
              return (
                <Field key={m.role} label={m.name}>
                  <select value={draft[m.role] ?? ""} disabled={!canEdit} onChange={(e) => setDraft((d) => ({ ...d, [m.role]: e.target.value }))}>
                    <option value="">Not mapped</option>
                    {[...mine, ...accounts].map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                  </select>
                </Field>
              );
            })}
          </FormGrid>
          {canEdit && (
            <div className="form-actions">
              <button type="button" className="btn secondary" disabled={!changed.length || saving} onClick={() => setDraft(Object.fromEntries(maps.map((x) => [x.role, x.accountId ?? ""])))}>Discard changes</button>
              <button type="button" className="btn primary" disabled={!changed.length || saving} onClick={save}>{saving ? "Saving…" : "Save finance settings"}</button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
