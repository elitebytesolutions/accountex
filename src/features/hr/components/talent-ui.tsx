"use client";

/** Small display helpers shared by the Phase 33 talent screens (recruitment, performance, training, My Goals). */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const tDm = (d: string | null | undefined) => (d ? `${d.slice(8, 10)} ${MON[Number(d.slice(5, 7)) - 1]}` : "—");
export const tDmy = (d: string | null | undefined) => (d ? `${tDm(d)} ${d.slice(0, 4)}` : "—");
/** "06 Oct · 09:30" in the browser's time zone. */
export const tStamp = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export const tTime = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const tRs = (n: number | null | undefined) => (n == null ? "—" : `Rs ${n.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`);
export const tNum = (n: number | null | undefined, digits = 1) => (n == null ? "—" : n.toFixed(digits));
export const tInitials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
export const tHuman = (s: string | null | undefined) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") : "—");
/** Local "YYYY-MM-DDTHH:MM" for a datetime-local input, and back to an ISO instant. */
export const tLocalInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** The local calendar date ("YYYY-MM-DD") of an instant, matching tTime / tStamp (slicing the ISO string gives the UTC date). */
export const tLocalDate = (iso: string) => tLocalInput(iso).slice(0, 10);
export const tFromLocal = (v: string) => (v ? new Date(v).toISOString() : "");
export const tToday = () => { const d = new Date(); const p = (x: number) => String(x).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

/** The template's ★★★★☆ rating. */
export function Stars({ value }: { value: number | null | undefined }) {
  const n = Math.round(value ?? 0);
  return <span style={{ color: "var(--warn)" }} aria-label={value ? `${value} of 5` : "Not rated"}>{"★".repeat(n)}{"☆".repeat(5 - n)}</span>;
}
