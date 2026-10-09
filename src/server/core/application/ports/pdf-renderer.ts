/** A letter-style document: letterhead, numbered reference, paragraphs, signature block and a verification footer. */
export type PdfLetterDocument = {
  /** File metadata title. */
  title: string;
  letterhead: { company: string; lines: string[]; accent?: string | null };
  /** Right-aligned reference lines under the letterhead (letter no., date). */
  reference: string[];
  /** Body paragraphs in order; `bold` paragraphs are headings such as the subject line. */
  paragraphs: { text: string; bold?: boolean; align?: 'left' | 'center' }[];
  /** Optional two-column table (e.g. a salary breakup) printed after the paragraph at `afterParagraph`. */
  table?: { afterParagraph: number; rows: [string, string][]; totalRow?: [string, string] } | null;
  signature: { closing: string; name: string | null; designation: string | null; company: string };
  footer: string[];
};

/**
 * Port: renders documents to PDF on the server (Phase 33: employee letters, English only). The adapter uses a small
 * PDF library with its built-in fonts; no browser is involved.
 */
export abstract class PdfRenderer {
  abstract letter(doc: PdfLetterDocument): Promise<Buffer>;
}
