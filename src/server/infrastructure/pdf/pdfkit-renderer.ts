import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PdfRenderer, type PdfLetterDocument } from '../../core/application/ports/pdf-renderer.js';

const MARGIN = 56;

/** PdfRenderer on pdfkit with the standard Helvetica fonts (no font files, English text only). A4 portrait. */
@Injectable()
export class PdfkitRenderer extends PdfRenderer {
  letter(d: PdfLetterDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }, info: { Title: d.title, Producer: 'Accountex' } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      const width = doc.page.width - MARGIN * 2;
      const accent = d.letterhead.accent && /^#[0-9a-f]{6}$/i.test(d.letterhead.accent) ? d.letterhead.accent : '#15803D';

      // letterhead
      doc.font('Helvetica-Bold').fontSize(18).fillColor(accent).text(d.letterhead.company, MARGIN, MARGIN, { width });
      doc.font('Helvetica').fontSize(9).fillColor('#555555');
      for (const l of d.letterhead.lines.filter(Boolean)) doc.text(l, { width });
      doc.moveDown(0.4);
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + width, doc.y).lineWidth(1.2).strokeColor(accent).stroke();
      doc.moveDown(0.8);

      // reference
      doc.font('Helvetica').fontSize(10).fillColor('#333333');
      for (const r of d.reference) doc.text(r, { width, align: 'right' });
      doc.moveDown(1);

      // body
      doc.fillColor('#111111');
      d.paragraphs.forEach((p, i) => {
        doc.font(p.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(11).text(p.text, MARGIN, doc.y, { width, align: p.align === 'center' ? 'center' : 'justify', lineGap: 2 });
        doc.moveDown(0.7);
        if (d.table && d.table.afterParagraph === i) {
          const rows = d.table.totalRow ? [...d.table.rows, d.table.totalRow] : d.table.rows;
          const colW = Math.min(360, width);
          rows.forEach(([k, v], j) => {
            const total = !!d.table!.totalRow && j === rows.length - 1;
            const y = doc.y;
            if (total) doc.moveTo(MARGIN, y - 2).lineTo(MARGIN + colW, y - 2).lineWidth(0.6).strokeColor('#999999').stroke();
            doc.font(total ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).text(k, MARGIN + 8, y, { width: colW - 120 });
            doc.text(v, MARGIN + colW - 110, y, { width: 102, align: 'right' });
            doc.moveDown(0.25);
          });
          doc.moveDown(0.6);
        }
      });

      // signature
      doc.moveDown(0.6).font('Helvetica').fontSize(11).text(d.signature.closing, MARGIN, doc.y, { width });
      doc.moveDown(2.6);
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + 170, doc.y).lineWidth(0.6).strokeColor('#999999').stroke();
      doc.moveDown(0.3);
      if (d.signature.name) doc.font('Helvetica-Bold').fontSize(11).text(d.signature.name, { width });
      if (d.signature.designation) doc.font('Helvetica').fontSize(10).text(d.signature.designation, { width });
      doc.font('Helvetica').fontSize(10).text(d.signature.company, { width });

      // verification footer on the first page
      const bottom = doc.page.height - MARGIN - 10 - d.footer.length * 11;
      doc.font('Helvetica').fontSize(8).fillColor('#666666');
      d.footer.forEach((f, i) => doc.text(f, MARGIN, bottom + i * 11, { width, align: 'center', lineBreak: false }));
      doc.end();
    });
  }
}
