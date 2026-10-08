"use client";

import { ArrowRight, Check, CircleCheck, Flag, Info, KeyRound, List, Plus, ToggleRight, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { BOOLEAN_VARIATIONS, flagKeyError, type FlagDetail, type FlagOptions } from "@/shared";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { createFlag } from "../api";
import { Avatar, CATEGORIES, ENVS, EnvDot, FLAG_TYPE_INFO, FlagIcon, TypeBadge, fmtDate } from "./flag-ui";

const STEPS = ["Type", "Details", "Variations", "Ownership", "Review"];
const snake = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[0-9_]+/, "").slice(0, 60);
const isoIn = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

/**
 * Template newFlagWizard() (9J-flags.js): a bottom sheet with five steps (type, details, variations, ownership,
 * review). Flags start OFF in every environment. POST /api/admin/flags.
 */
export function NewFlagWizard({ options, existingKeys, onClose, onCreated }: {
  options: FlagOptions | null; existingKeys: string[]; onClose: () => void; onCreated: (f: FlagDetail) => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [type, setType] = useState("");
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [desc, setDesc] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagIn, setTagIn] = useState("");
  const [cat, setCat] = useState("SALES");
  const [multi, setMulti] = useState(false);
  const [mvars, setMvars] = useState([{ name: "Control", value: "control" }, { name: "Treatment", value: "treatment" }]);
  const [owner, setOwner] = useState<string>("");
  const [temporary, setTemporary] = useState(true);
  const [expiry, setExpiry] = useState(isoIn(90));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const vars = multi ? mvars : BOOLEAN_VARIATIONS.map((v) => ({ ...v }));
  const keyErr = flagKeyError(key) || (existingKeys.includes(key) ? "A flag with this key already exists" : "");
  const ownerId = owner;
  const ownerName = options?.staff.find((s) => s.id === ownerId)?.name ?? "You (Super Admin)";

  const valid = () => {
    if (step === 0 && !type) { toast("Pick a flag type", { tone: "warn" }); return false; }
    if (step === 1 && (!name.trim() || keyErr)) { setErrors({ ...(name.trim() ? {} : { name: "Name the flag" }), ...(keyErr ? { key: keyErr } : {}) }); return false; }
    if (step === 2 && multi) {
      const vals = mvars.map((v) => v.value.trim());
      if (vals.some((v) => !v) || mvars.some((v) => !v.name.trim()) || new Set(vals).size !== vals.length) { toast("Variation names and values must be filled in, and values unique", { tone: "warn" }); return false; }
    }
    if (step === 3 && temporary && !expiry) { setErrors({ expiresOn: "Temporary flags need an expiry date" }); return false; }
    setErrors({});
    return true;
  };

  const submit = async () => {
    setBusy(true);
    try {
      const f = await createFlag({
        key, name: name.trim(), description: desc.trim() || null, flagType: type, category: cat, tags,
        variationKind: multi ? "MULTIVARIATE" : "BOOLEAN", variations: vars, ...(ownerId ? { ownerStaffId: ownerId } : {}),
        isTemporary: temporary, expiresOn: temporary ? expiry : null,
      });
      onCreated(f);
    } catch (e) {
      const fe = adminFieldErrors(e);
      setErrors(fe);
      if (fe.key || fe.name) setStep(1);
      toast(adminErrorMessage(e, "Could not create the flag"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (!valid()) return;
    if (step < 4) setStep(step + 1);
    else void submit();
  };

  const addTag = () => {
    const v = snake(tagIn);
    if (v && !tags.includes(v) && tags.length < 20) setTags([...tags, v]);
    setTagIn("");
  };

  let body: React.ReactNode;
  if (step === 0) {
    body = (
      <>
        <p className="ff-wlead">What kind of flag is this? The type sets sensible defaults for lifecycle and expiry.</p>
        <div className="ff-tcards">
          {Object.entries(FLAG_TYPE_INFO).map(([k, t]) => (
            <button key={k} type="button" className={cn("ff-tcard", `t-${t.css}`, type === k && "on")} aria-pressed={type === k}
              onClick={() => { setType(k); setTemporary(t.temp); if (k === "EXPERIMENT") setMulti(true); setTimeout(() => setStep(1), 220); }}>
              <FlagIcon type={k} /><b>{t.label}</b><small>{t.blurb}</small><span className={cn("ff-ttag", t.temp && "temp")}>{t.temp ? "Temporary" : "Permanent"}</span>
            </button>
          ))}
        </div>
      </>
    );
  } else if (step === 1) {
    body = (
      <div className="form-grid">
        <label className="full"><span>Name *</span>
          <input value={name} maxLength={120} placeholder="e.g. Raast QR on invoices" autoFocus aria-invalid={!!errors.name}
            onChange={(e) => { setName(e.target.value); if (!keyTouched) setKey(snake(e.target.value)); }} />
          {errors.name && <small className="hint text-danger">{errors.name}</small>}
        </label>
        <label className="full"><span>Key *</span>
          <div className="ff-keyin"><KeyRound /><input value={key} spellCheck={false} autoComplete="off" placeholder="raast_qr_on_invoices" className={cn(key && !keyErr && "ff-ok", errors.key && "ff-invalid")}
            onChange={(e) => { setKeyTouched(true); setKey(e.target.value.toLowerCase().replace(/[\s-]/g, "_")); }} /></div>
          <small className={cn("ff-keymsg", key && (keyErr ? "bad" : "ok"))}>{key && !keyErr ? <CircleCheck /> : <Info />}{key ? keyErr || "Looks good. This is what engineers type in code." : "Generated from the name. snake_case, unique, cannot change later."}</small>
        </label>
        <label><span>Category</span><select value={cat} onChange={(e) => setCat(e.target.value)}>{CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
        <label><span>Tags</span>
          <div className="ff-tagin">
            {tags.map((t) => <span key={t} className="ff-vchip">{t}<button type="button" aria-label="Remove tag" onClick={() => setTags(tags.filter((x) => x !== t))}><X /></button></span>)}
            <input value={tagIn} placeholder={tags.length ? "" : "Type and press Enter"} onChange={(e) => setTagIn(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } else if (e.key === "Backspace" && !tagIn && tags.length) setTags(tags.slice(0, -1)); }} />
          </div>
        </label>
        <label className="full"><span>Description</span><textarea rows={2} value={desc} placeholder="What does it gate, and who asked for it?" onChange={(e) => setDesc(e.target.value)} /></label>
      </div>
    );
  } else if (step === 2) {
    body = (
      <>
        <div className="seg ff-vkind">
          <button type="button" className={cn(!multi && "active")} onClick={() => setMulti(false)}><ToggleRight />Boolean</button>
          <button type="button" className={cn(multi && "active")} onClick={() => setMulti(true)}><List />Multivariate</button>
        </div>
        <p className="ff-wlead">{multi ? "Two or more string variations, e.g. for an A/B/n experiment. Bucketing stays sticky by tenant." : <>Two variations: serve <b>On</b> to targeted tenants, <b>Off</b> to everyone else.</>}</p>
        <div className="ff-varlist">
          {vars.map((v, i) => (
            <div key={i} className="ff-varrow" style={{ ["--i" as string]: i }}>
              <span className={cn("ff-vsw", `v${i % 4}`)} />
              <input value={v.name} readOnly={!multi} aria-label="Variation name" onChange={(e) => setMvars(mvars.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
              <input value={v.value} readOnly={!multi} className="ff-mono-in" aria-label="Variation value" onChange={(e) => setMvars(mvars.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} />
              {multi && mvars.length > 2 && <button type="button" className="icon-btn-sm" aria-label="Remove" onClick={() => setMvars(mvars.filter((_, k) => k !== i))}><X /></button>}
            </div>
          ))}
        </div>
        {multi && mvars.length < 20 && (
          <button type="button" className="ff-addrule" onClick={() => { const n = mvars.length; setMvars([...mvars, { name: `Variant ${String.fromCharCode(64 + n)}`, value: `variant_${String.fromCharCode(96 + n)}` }]); }}><Plus />Add variation</button>
        )}
      </>
    );
  } else if (step === 3) {
    body = (
      <div className="form-grid">
        <label><span>Owner *</span>
          <select value={ownerId} onChange={(e) => setOwner(e.target.value)}><option value="">You (Super Admin)</option>{(options?.staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label><span>Expiry date {temporary ? "*" : ""}</span>
          <input type="date" value={expiry} min={isoIn(1)} disabled={!temporary} onChange={(e) => setExpiry(e.target.value)} aria-invalid={!!errors.expiresOn} />
          {errors.expiresOn && <small className="hint text-danger">{errors.expiresOn}</small>}
        </label>
        <div className={cn("full ff-tempbox", temporary && "temp")}>
          <label className="switch"><input type="checkbox" checked={temporary} onChange={(e) => setTemporary(e.target.checked)} /><i /><span>Temporary flag</span></label>
          <small>{temporary ? <>Becomes <b>stale</b> on its expiry date, and the owner gets a cleanup reminder.</> : "Permanent flags (kill switches, ops, entitlements) never go stale."}</small>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="ff-review">
        <div className="ff-rhead"><FlagIcon type={type} lg /><div><code className="ff-key lg">{key}</code><b>{name}</b><small>{desc || "No description"}</small></div></div>
        <div className="dl ff-rdl">
          <div><span>Type</span><b><TypeBadge type={type} sm /></b></div>
          <div><span>Category</span><b>{CATEGORIES.find((c) => c.code === cat)?.label}</b></div>
          <div><span>Variations</span><b>{vars.map((v) => v.name).join(" · ")}</b></div>
          <div><span>Owner</span><b><Avatar name={ownerName} /> {ownerName}</b></div>
          <div><span>Lifecycle</span><b>{temporary ? `Temporary · expires ${fmtDate(expiry)}` : "Permanent"}</b></div>
          <div><span>Tags</span><b>{tags.length ? tags.map((t) => <span key={t} className="ff-vchip">{t}</span>) : "—"}</b></div>
        </div>
        <div className="ff-renvs">{ENVS.map((e) => <span key={e.code}><EnvDot env={e.code} />{e.label}<b>OFF</b></span>)}</div>
        <pre className="ff-code sm"><span className="k">if</span> (<span className="k">await</span> flags.variation(<span className="s">&apos;{key}&apos;</span>, ctx, <span className="v">{multi ? `'${mvars[0]?.value ?? ""}'` : "false"}</span>)) {"{ … }"}</pre>
      </div>
    );
  }

  return createPortal(
    <div className="overlay sheet-overlay open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet ff-sheet" role="dialog" aria-modal aria-label="New feature flag">
        <span className="sheet-grab" />
        <div className="modal-head">
          <div><h2>New feature flag</h2><p>Flags start OFF in every environment. Production changes apply directly; kill switches need the key typed.</p></div>
          <button type="button" className="x" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="sheet-body">
          <div className="ff-wiz">
            <ol className="ff-wsteps">
              {STEPS.map((s, i) => <li key={s} className={cn(i < step && "done", i === step && "cur")}><span>{i < step ? <Check /> : i + 1}</span>{s}</li>)}
            </ol>
            <div className="ff-wbody"><div className="ff-wpane">{body}</div></div>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={() => (step ? setStep(step - 1) : onClose())}>{step ? "Back" : "Cancel"}</button>
          <span className="spacer" />
          <span className="ff-wcount">Step {step + 1} of 5</span>
          <button type="button" className="btn primary" disabled={busy} onClick={next}>
            {step === 4 ? <><Flag />{busy ? "Creating…" : "Create flag"}</> : <>Next<ArrowRight /></>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
