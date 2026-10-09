"use client";

import "@/features/ledger/components/voucher-editor.css";
import "./cheque-voucher-screen.css";
import {
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Calendar, ChevronRight, FilePlus, FileText, Info, Landmark, NotebookPen, PenLine, Printer, Save, ScrollText,
  Search, Sheet, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { BankingOptions, SessionUser } from "@/shared";
import { cn } from "@/components/ui/cn";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { bankingOptions, createCheque } from "../api";
import { BulkSheet } from "./cheque-voucher-bulk";
import { amountInWords, chequeDate, num, Rs, rsText, todayIso } from "./cheque-voucher-ui";

type Can = { create: boolean; edit: boolean; post: boolean };
type Dir = "R" | "I";
type Form = { t: Dir; old: string; date: string; partyId: string; chq: string; cdate: string; due: string; amt: string; rem: string; bankId: string; notes: string };
type Field = "party" | "chq" | "cdate" | "due" | "amt" | "bank";

const blank = (t: Dir = "R"): Form => ({ t, old: "", date: todayIso(), partyId: "", chq: "", cdate: "", due: "", amt: "", rem: "", bankId: "", notes: "" });
const MESSAGES: Record<Field, string> = {
  party: "Select the party", chq: "Enter a 6–8 digit cheque number", cdate: "Cheque date is required",
  due: "Due date cannot be before the cheque date", amt: "Amount must be greater than zero", bank: "Choose a bank account",
};
/** Server field → form field. */
const SERVER_FIELD: Record<string, Field> = { customerId: "party", vendorId: "party", partyName: "party", chequeNo: "chq", chequeDate: "cdate", dueDate: "due", amount: "amt", bankAccountId: "bank", chequeBookId: "chq" };

/** Template app/bank/cheque-voucher (44-purchase-docs.html, 94-purchase-docs.js): single cheque voucher and the bulk sheet. */
export function ChequeVoucherScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const [opts, setOpts] = useState<BankingOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [tab, setTab] = useState<"single" | "bulk">("single");
  const [f, setF] = useState<Form>(blank);
  const [bad, setBad] = useState<Partial<Record<Field, string>>>({});
  const [saving, setSaving] = useState(false);
  const [bulkKey, setBulkKey] = useState(0);

  const fetchOptions = useCallback(() => bankingOptions().then(setOpts, (e) => setError(e instanceof ApiError ? e.message : "Could not load the banking setup")), []);
  const load = () => {
    setError(null);
    void fetchOptions();
  };
  useEffect(() => {
    void fetchOptions();
    apiRequest<SessionUser>("/auth/me").then((u) => setCompany(u.tenantName), () => {});
  }, [fetchOptions]);

  const R = f.t === "R";
  const parties = opts ? (R ? opts.customers : opts.vendors) : [];
  const party = parties.find((p) => p.id === f.partyId) ?? null;
  const banks = opts?.bankAccounts.filter((b) => b.status === "ACTIVE") ?? [];
  const bank = banks.find((b) => b.id === f.bankId) ?? null;
  const book = bank?.chequeBooks.find((b) => b.status === "ACTIVE" && b.nextLeafNo <= b.lastLeafNo) ?? null;
  const amt = num(f.amt);
  const inWords = amountInWords(amt);
  const pdc = !!f.cdate && f.cdate > f.date;
  const bankLabel = bank ? `${bank.bankName ? `${bank.bankName} · ` : ""}${bank.title}${bank.last4 ? ` ·${bank.last4}` : ""}` : "";
  const roles = opts?.postingRoles ?? {};
  const holdName = R ? (roles.CHEQUES_IN_HAND?.name ?? "Cheques in hand") : (roles.PDC_PAYABLE?.name ?? "PDC payable");

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    const field = ({ partyId: "party", chq: "chq", cdate: "cdate", due: "due", amt: "amt", bankId: "bank" } as Record<string, Field>)[k as string];
    if (field) setBad((b) => ({ ...b, [field]: undefined }));
  };
  const switchType = (t: Dir) => {
    if (t === f.t) return;
    setF((x) => ({ ...x, t, partyId: "", chq: t === "I" ? "" : x.chq }));
    setBad({});
  };
  const pickBank = (id: string) => {
    const b = banks.find((x) => x.id === id);
    const bk = b?.chequeBooks.find((x) => x.status === "ACTIVE" && x.nextLeafNo <= x.lastLeafNo);
    // issued cheques take the next leaf of the bank account's active cheque book
    setF((x) => ({ ...x, bankId: id, chq: x.t === "I" && bk && (!x.chq || x.chq === String(book?.nextLeafNo ?? "")) ? String(bk.nextLeafNo) : x.chq }));
    setBad((v) => ({ ...v, bank: undefined, chq: undefined }));
  };

  const validate = () => {
    const e: Partial<Record<Field, string>> = {};
    if (!f.partyId) e.party = MESSAGES.party;
    if (!/^\d{6,8}$/.test(f.chq.trim())) e.chq = MESSAGES.chq;
    if (!f.cdate) e.cdate = MESSAGES.cdate;
    if (f.due && f.cdate && f.due < f.cdate) e.due = MESSAGES.due;
    if (!(amt > 0)) e.amt = MESSAGES.amt;
    if (!f.bankId) e.bank = MESSAGES.bank;
    setBad(e);
    return !Object.keys(e).length;
  };

  const reset = (t: Dir = f.t) => {
    setF(blank(t));
    setBad({});
  };

  const save = async () => {
    if (!opts || !party || !bank) {
      validate();
      toast("Please fix the highlighted fields", { tone: "danger" });
      return;
    }
    if (!validate()) {
      toast("Please fix the highlighted fields", { tone: "danger" });
      return;
    }
    setSaving(true);
    try {
      const c = await createCheque({
        direction: R ? "RECEIVED" : "ISSUED", docDate: f.date, branchId: bank.branchId || opts.branches[0]?.id, chequeNo: f.chq.trim(),
        customerId: R ? party.id : null, vendorId: R ? null : party.id, accountId: null, partyName: party.name, drawnOnBankId: null,
        bankAccountId: bank.id, chequeDate: f.cdate, dueDate: f.due || null, receivedOn: R ? f.date : null, amount: amt,
        isPdc: pdc, postingMode: pdc ? "HOLD_PDC" : "DEPOSIT", chequeBookId: R ? null : (book?.id ?? null), crossedAcPayee: true,
        legacyNo: f.old.trim() || null, remarks: f.rem.trim() || null, narration: f.notes.trim() || null,
      });
      toast(`${c.docNo} saved · ${rsText(c.amount)} ${R ? "received" : "issued"}${c.isPdc ? " · held as PDC" : ""}`, {
        tone: "good", action: { label: "Register", onClick: () => router.push("/bank/cheque-register") },
      });
      reset();
      load();
    } catch (e) {
      if (e instanceof ApiError) {
        const mapped: Partial<Record<Field, string>> = {};
        for (const [k, v] of Object.entries(e.details ?? {})) if (SERVER_FIELD[k]) mapped[SERVER_FIELD[k]] = v[0];
        if (e.code === "CHEQUE_LEAF_USED") mapped.chq = e.message;
        setBad(mapped);
        toast(e.message, { tone: "danger" });
      } else toast("Could not save the cheque", { tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const field = (k: Field) => cn("pd-f", bad[k] && "pd-invalid");
  const err = (k: Field) => <small className="pd-err-m">{bad[k] ?? MESSAGES[k]}</small>;

  return (
    <div className="pd-scr pd-cq">
      <div className="page-head pd-head">
        <div className="pd-head-l">
          <span className="pd-head-ic"><ScrollText /></span>
          <div>
            <nav className="pd-crumb"><Link href="/bank/accounts">Bank</Link><ChevronRight /><b>Cheque Voucher</b></nav>
            <h1>Cheque Voucher</h1>
            <p>{tab === "bulk" ? "Create many cheque vouchers at once — type rows on screen or populate them from a sheet." : "Create a single cheque voucher for receipt or issuance."}</p>
          </div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn secondary" onClick={() => window.print()}><Printer />Print</button>
          <button type="button" className="btn secondary" onClick={() => { reset(); setBulkKey((k) => k + 1); toast("Ready for a new voucher", { tone: "info" }); }}><FilePlus />New</button>
          <Link className="btn ghost" href="/bank/cheque-register"><X />Exit</Link>
        </div>
      </div>

      <div className="pd-bigtabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "single"} className={cn(tab === "single" && "on")} onClick={() => setTab("single")}><PenLine />Single Entry</button>
        <button type="button" role="tab" aria-selected={tab === "bulk"} className={cn(tab === "bulk" && "on")} onClick={() => setTab("bulk")}><Sheet />Bulk Sheet Entry</button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !opts ? (
        <div className="panel pd-card"><Skeleton style={{ height: 220 }} /></div>
      ) : (
        <>
          <div className={cn("pd-cq-pane", tab === "single" && "on")}>
            <div className="panel pd-card pd-cq-type">
              <div className="pd-sec-h nob">
                <span className="icon-tile"><ArrowLeftRight /></span>
                <span className="pd-sec-t"><b>Voucher Type</b><small>Receiving a cheque from a customer, or issuing one to a vendor?</small></span>
              </div>
              <div className="pd-typecards">
                <button type="button" className={cn(R && "on")} onClick={() => switchType("R")}>
                  <span className="ic"><ArrowDownToLine /></span><span><b>Receive Cheque</b><small>Incoming cheque from customer</small></span><i className="pd-radio" />
                </button>
                <button type="button" className={cn(!R && "on")} onClick={() => switchType("I")}>
                  <span className="ic"><ArrowUpFromLine /></span><span><b>Issue Cheque</b><small>Outgoing cheque to vendor</small></span><i className="pd-radio" />
                </button>
              </div>
            </div>

            <div className="panel pd-card">
              <div className="pd-sec-h nob"><span className="icon-tile"><FileText /></span><span className="pd-sec-t"><b>Voucher Information</b><small>Numbering and date</small></span></div>
              <div className="pd-fgrid c3">
                <label className="pd-f"><span>Old No.</span><input value={f.old} maxLength={40} placeholder="Auto if new" onChange={(e) => set("old", e.target.value)} /></label>
                <label className="pd-f"><span>Voucher No.</span><input value="CHQ-… assigned on save" readOnly /></label>
                <label className="pd-f"><span>Voucher Date</span><div className="pd-inp-ic"><Calendar /><input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></div></label>
              </div>
            </div>

            <div className="pd-cq-2">
              <div className="panel pd-card">
                <div className="pd-sec-h nob">
                  <span className="icon-tile"><ScrollText /></span>
                  <span className="pd-sec-t"><b>Cheque Details</b><small>{R ? "Enter the cheque received from the customer." : "Enter the cheque issued to the vendor."}</small></span>
                </div>
                <div className="pd-hform">
                  <label className={field("party")}>
                    <span>Party / Account <em>*</em></span>
                    <div className="pd-inp-ic"><Search />
                      <select value={f.partyId} onChange={(e) => set("partyId", e.target.value)}>
                        <option value="">{R ? "Select customer / account" : "Select vendor / account"}</option>
                        {parties.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                      </select>
                    </div>
                    {err("party")}
                  </label>
                  <label className={field("chq")}>
                    <span>Cheque No. <em>*</em></span>
                    <input value={f.chq} inputMode="numeric" maxLength={10} placeholder="Enter 6–8 digit cheque number" onChange={(e) => set("chq", e.target.value.replace(/\D/g, ""))} />
                    {err("chq")}
                    {!R && book && <small className="pd-hint">Cheque book {book.bookRef ?? ""} · leaves {book.firstLeafNo}–{book.lastLeafNo}, next {book.nextLeafNo}</small>}
                  </label>
                  <label className={field("cdate")}><span>Cheque Date <em>*</em></span><input type="date" value={f.cdate} onChange={(e) => set("cdate", e.target.value)} />{err("cdate")}</label>
                  <label className={field("due")}><span>Due Date</span><input type="date" value={f.due} onChange={(e) => set("due", e.target.value)} />{err("due")}</label>
                  <label className={field("amt")}>
                    <span>Amount <em>*</em></span>
                    <div className="input-group"><span>Rs</span><input type="number" min="0" step="0.01" placeholder="0.00" value={f.amt} onChange={(e) => set("amt", e.target.value)} /></div>
                    {err("amt")}
                    <small className="pd-words">{inWords}</small>
                  </label>
                  <label className="pd-f">
                    <span>Remarks</span>
                    <textarea rows={2} maxLength={500} placeholder="e.g. invoice reference, payment notes…" value={f.rem} onChange={(e) => set("rem", e.target.value)} />
                    <small className="pd-count">{f.rem.length}/500</small>
                  </label>
                </div>
              </div>

              <div className="panel pd-card">
                <div className="pd-sec-h nob"><span className="icon-tile"><Landmark /></span><span className="pd-sec-t"><b>Bank &amp; Posting Information</b><small>Select the bank and preview the posting.</small></span></div>
                <div className={cn("banner pd-cq-mode", R ? "good" : "info")}>
                  <Info />
                  <div>
                    <b>{R ? (pdc ? "Receive mode: Hold as PDC" : "Receive mode: Deposit in bank") : "Issue mode: Pay from bank"}</b>
                    <p>{R
                      ? `The cheque is held in hand against the customer${pdc ? " until its date" : ""}; deposit it into this bank from the cheque register, and clearing moves it to the bank.`
                      : "The vendor is settled against PDC payable now; the bank is credited when the cheque clears."}</p>
                  </div>
                </div>
                <div className="pd-hform">
                  <label className={field("bank")}>
                    <span>Bank Account <em>*</em></span>
                    <select value={f.bankId} onChange={(e) => pickBank(e.target.value)}>
                      <option value="">Select bank account</option>
                      {banks.map((b) => <option key={b.id} value={b.id}>{b.bankName ? `${b.bankName} · ` : ""}{b.title}{b.last4 ? ` ·${b.last4}` : ""}</option>)}
                    </select>
                    {err("bank")}
                  </label>
                </div>
                <div className="pd-post-box">
                  <div className="pd-post-h">Posting information · now</div>
                  <div className="pd-post-r"><span>Dr · {R ? holdName : (party?.name ?? "Vendor (A/P)")}</span><b><Rs value={amt} /></b></div>
                  <div className="pd-post-r"><span>Cr · {R ? (party?.name ?? "Customer (A/R)") : holdName}</span><b><Rs value={amt} /></b></div>
                  <div className="pd-post-h">When the cheque clears</div>
                  <div className="pd-post-r"><span>Dr · {R ? (bank ? bankLabel : "Bank") : holdName}</span><b><Rs value={amt} /></b></div>
                  <div className="pd-post-r"><span>Cr · {R ? holdName : (bank ? bankLabel : "Bank")}</span><b><Rs value={amt} /></b></div>
                </div>
                <div className="pd-cheque">
                  <div className="pd-ch-top"><b>{R ? (party ? `Drawn by ${party.name}` : "Customer bank") : (bank ? (bank.bankName || bank.title) : "Bank")}</b><span>Date <i>{chequeDate(f.cdate)}</i></span></div>
                  <div className="pd-ch-pay">Pay <i>{R ? (company || "________________") : (party?.name ?? "________________")}</i></div>
                  <div className="pd-ch-words"><i>{inWords || "Rupees ____________________"}</i><b>{amt > 0 ? <Rs value={amt} /> : "Rs —"}</b></div>
                  <div className="pd-ch-foot"><span>⑈{f.chq || "000000"}⑈{bank?.last4 ? ` ${bank.last4}⑆` : ""}</span><span className="pd-ch-sign">Authorised signatory</span></div>
                </div>
              </div>
            </div>

            <div className="panel pd-card">
              <div className="pd-sec-h nob"><span className="icon-tile"><NotebookPen /></span><span className="pd-sec-t"><b>Additional Notes</b><small>Any additional narration (optional).</small></span></div>
              <input className="pd-wide" maxLength={300} placeholder="Enter additional notes, if any…" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
              <div className="pd-cq-foot">
                <span className="spacer" />
                <button type="button" className="btn secondary" onClick={() => { reset(); toast("Form cleared"); }}><X />Clear</button>
                {can.create && (
                  <button type="button" className={cn("btn primary", saving && "pd-busy")} disabled={saving} onClick={save}><Save /><span>{saving ? "Saving…" : "Save voucher"}</span></button>
                )}
              </div>
            </div>
          </div>

          <div className={cn("pd-cq-pane", tab === "bulk" && "on")}>
            <BulkSheet key={bulkKey} opts={opts} can={can} />
          </div>
        </>
      )}
    </div>
  );
}
