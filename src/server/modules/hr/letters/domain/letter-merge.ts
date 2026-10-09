/** Merge data of an employee letter (English only). Missing values print as an em dash. */
export type EmployeeLetterMergeData = Record<string, string | null | undefined>;

const ENTITIES: Record<string, string> = { '&amp;': '&', '&nbsp;': ' ', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>', '&ndash;': '–', '&mdash;': '—' };
const decode = (s: string) => s.replace(/&(amp|nbsp|quot|#39|apos|lt|gt|ndash|mdash);/g, (m) => ENTITIES[m] ?? m);
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "08 October 2026". */
export function letterDate(iso: string | null | undefined) {
  if (!iso) return null;
  return `${iso.slice(8, 10)} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** Rs 185,000. */
export const letterMoney = (n: number) => `Rs ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

/**
 * Template bodyHtml (paragraphs, line breaks, bold) with {{merge.fields}} filled in → paragraphs for the PDF.
 * A paragraph that only held an empty merge field is dropped; a paragraph wholly in <b>/<strong> prints bold.
 * Unknown fields are left out rather than printed as code.
 */
export function mergeLetter(bodyHtml: string, data: EmployeeLetterMergeData): { text: string; bold: boolean; field: string | null }[] {
  const blocks = bodyHtml.replace(/\r?\n/g, ' ').split(/<\/p>|<p[^>]*>|<\/div>|<div[^>]*>/i).map((b) => b.trim()).filter(Boolean);
  const out: { text: string; bold: boolean; field: string | null }[] = [];
  for (const b of blocks) {
    const bold = /^<(b|strong)>[\s\S]*<\/(b|strong)>$/i.test(b);
    const only = b.replace(/<[^>]+>/g, '').trim().match(/^\{\{\s*([a-zA-Z.]+)\s*\}\}$/)?.[1] ?? null;
    const text = decode(b.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
      .replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (_m, k: string) => (k in data ? data[k] ?? '—' : ''))
      .replace(/[ \t]+/g, ' ').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
    if (!text || (only && !data[only])) continue;
    out.push({ text, bold, field: only });
  }
  return out;
}
