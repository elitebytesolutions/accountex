import { ean13CheckDigit } from "@/shared";
import { cn } from "@/components/ui/cn";

// EAN-13 bar patterns, ported from template/src/9F-products.js (CSS bars: <i> = bar, <b> = space).
const LC = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const RC = LC.map((p) => p.replace(/./g, (b) => (b === "1" ? "0" : "1")));
const GC = RC.map((p) => [...p].reverse().join(""));
const PAR = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** A 13-digit EAN for any code (shorter / longer codes are padded or cut, with a fresh check digit). */
export function toEan13(code: string | null | undefined): string {
  const c = String(code ?? "").replace(/\D/g, "");
  if (c.length === 13) return c;
  const body = c.padEnd(12, "0").slice(0, 12);
  return body + ean13CheckDigit(body);
}

function eanBits(code: string) {
  const c = toEan13(code);
  const par = PAR[Number(c[0])]!;
  let b = "101";
  for (let i = 1; i <= 6; i++) b += (par[i - 1] === "L" ? LC : GC)[Number(c[i])];
  b += "01010";
  for (let i = 7; i <= 12; i++) b += RC[Number(c[i])];
  return `${b}101`;
}

/** Template `.pr-bc`: the barcode drawn with flex bars. */
export function Bars({ code, className }: { code: string | null | undefined; className?: string }) {
  const b = eanBits(code ?? "");
  const runs: { bar: boolean; w: number; guard: boolean }[] = [];
  for (let i = 0; i < b.length;) {
    let j = i;
    while (j < b.length && b[j] === b[i]) j++;
    runs.push({ bar: b[i] === "1", w: j - i, guard: i < 3 || (i >= 45 && i < 50) || i >= 92 });
    i = j;
  }
  return (
    <span className={cn("pr-bc", className)} aria-hidden>
      {runs.map((r, k) => (r.bar ? <i key={k} className={r.guard ? "g" : undefined} style={{ flex: r.w }} /> : <b key={k} style={{ flex: r.w }} />))}
    </span>
  );
}

export type LabelItem = { sku: string; name: string; nameUrdu: string | null; company: string | null; price: number; ctn: number; piece: string | null; carton: string | null; batch?: { no: string; expiry: string | null } | null };
export type LabelOptions = { price: boolean; company: boolean; urdu: boolean; batch: boolean; ctn: boolean };

/** Template `labelHTML` (9F-products.js): one shelf / carton label. `tpl` is the template's CSS variant (thermal, s38, a4). */
export function Label({ item, o, tpl }: { item: LabelItem; o: LabelOptions; tpl: string }) {
  const code = (o.ctn ? item.carton : null) ?? item.piece ?? "";
  const [i, d] = (o.ctn ? item.price * item.ctn : item.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(".");
  const exp = item.batch?.expiry;
  return (
    <div className={cn("pr-label", tpl)}>
      {o.company && <small className="pr-lb-co">{item.company ?? ""}{o.ctn ? ` · CTN ${item.ctn}` : ""}</small>}
      <b className="pr-lb-name">{item.name}</b>
      {o.urdu && <span className="pr-lb-ur" dir="rtl" lang="ur">{item.nameUrdu ?? ""}</span>}
      <div className="pr-lb-bc"><Bars code={code} /><span>{code ? toEan13(code) : "No barcode"}</span></div>
      <div className="pr-lb-foot">
        {o.batch ? <small>{item.batch ? `B ${item.batch.no}${exp ? ` · Exp ${exp.slice(5, 7)}/${exp.slice(2, 4)}` : ""}` : "No batch"}</small> : <small>{item.sku}</small>}
        {o.price && <b className="pr-lb-price">Rs {i}<span>.{d}</span></b>}
      </div>
    </div>
  );
}
