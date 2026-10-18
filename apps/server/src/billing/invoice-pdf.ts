import PDFDocument from 'pdfkit';

export interface AgencyDetails {
  name: string;
  address: string;
  ntn: string;
  bank: string;
  jazzcash: string;
  easypaisa: string;
}

export function agencyDetailsFromEnv(): AgencyDetails {
  return {
    name: process.env.AGENCY_NAME || process.env.APP_NAME || 'DeepKhata',
    address: process.env.AGENCY_ADDRESS || '',
    ntn: process.env.AGENCY_NTN || '',
    bank: process.env.AGENCY_BANK_DETAILS || '',
    jazzcash: process.env.AGENCY_JAZZCASH || '',
    easypaisa: process.env.AGENCY_EASYPAISA || '',
  };
}

export interface PdfLine {
  description: string;
  quantity: number;
  unitPrice: string;
  amount: string;
}

export interface InvoicePdfData {
  number: string;
  businessName: string;
  periodStart: Date;
  periodEnd: Date;
  lines: PdfLine[];
  subtotal: string;
  discount: string;
  total: string;
  status: string;
  dueDate: Date;
  agency: AgencyDetails;
}

/** Asia/Karachi is a fixed UTC+5, so a fixed offset gives the right calendar day. */
function karachiDate(d: Date): string {
  return new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
}

function money(v: string): string {
  const [int, frac = '00'] = v.split('.');
  return `Rs. ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac.padEnd(2, '0')}`;
}

export function buildInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 50;
    const right = 545;
    const a = data.agency;

    doc.font('Helvetica-Bold').fontSize(20).text(a.name, left, 50);
    doc.font('Helvetica').fontSize(9);
    if (a.address) doc.text(a.address);
    if (a.ntn) doc.text(`NTN: ${a.ntn}`);

    doc.font('Helvetica-Bold').fontSize(22).text('INVOICE', left, 50, {
      width: right - left,
      align: 'right',
    });
    doc.font('Helvetica').fontSize(10);
    doc.text(`No: ${data.number}`, left, 78, { width: right - left, align: 'right' });
    doc.text(`Status: ${data.status}`, { width: right - left, align: 'right' });
    doc.text(`Due date: ${karachiDate(data.dueDate)}`, { width: right - left, align: 'right' });

    doc.moveTo(left, 140).lineTo(right, 140).stroke();

    doc.font('Helvetica-Bold').fontSize(10).text('Billed to', left, 152);
    doc.font('Helvetica').text(data.businessName);
    doc.text(
      `Period: ${karachiDate(data.periodStart)} to ${karachiDate(data.periodEnd)}`,
    );

    // Lines table.
    let y = 215;
    const col = { desc: left, qty: 330, unit: 390, amt: 470 };
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Description', col.desc, y);
    doc.text('Qty', col.qty, y, { width: 40, align: 'right' });
    doc.text('Unit price', col.unit, y, { width: 70, align: 'right' });
    doc.text('Amount', col.amt, y, { width: right - col.amt, align: 'right' });
    y += 16;
    doc.moveTo(left, y).lineTo(right, y).stroke();
    y += 6;
    doc.font('Helvetica');
    for (const line of data.lines) {
      const h = doc.heightOfString(line.description, { width: 270 });
      doc.text(line.description, col.desc, y, { width: 270 });
      doc.text(String(line.quantity), col.qty, y, { width: 40, align: 'right' });
      doc.text(money(line.unitPrice), col.unit, y, { width: 70, align: 'right' });
      doc.text(money(line.amount), col.amt, y, { width: right - col.amt, align: 'right' });
      y += Math.max(h, 12) + 6;
    }
    doc.moveTo(left, y).lineTo(right, y).stroke();
    y += 10;

    const totalRow = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10);
      doc.text(label, 330, y, { width: 130, align: 'right' });
      doc.text(value, col.amt, y, { width: right - col.amt, align: 'right' });
      y += bold ? 20 : 16;
    };
    totalRow('Subtotal', money(data.subtotal));
    totalRow('Discount', `- ${money(data.discount)}`);
    totalRow('Total', money(data.total), true);

    y += 15;
    doc.font('Helvetica-Bold').fontSize(11).text('How to pay', left, y);
    doc.font('Helvetica').fontSize(10);
    if (a.bank) doc.text(`Bank transfer: ${a.bank}`, left, doc.y + 4);
    if (a.jazzcash) doc.text(`JazzCash: ${a.jazzcash}`);
    if (a.easypaisa) doc.text(`Easypaisa: ${a.easypaisa}`);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text(`Payment reference: ${data.number}`);

    doc.end();
  });
}
