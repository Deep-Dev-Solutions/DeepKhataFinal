import PDFDocument from 'pdfkit';

export interface UsageStatementData {
  appName: string;
  businessName: string;
  from: string;
  to: string;
  daysCovered: number;
  orders: number;
  gmv: string;
  itemsSold: number;
  returns: number;
  paymentsReceived: string;
  invoicesPrinted: number;
  activeStaff: number;
  duesOpenReceivable: string;
  duesOpenPayable: string;
}

function rs(v: string): string {
  const [int, frac = '00'] = v.split('.');
  return `Rs. ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac.padEnd(2, '0')}`;
}

/** Text is left uncompressed on purpose: the file is tiny and stays greppable in tests. */
export function buildUsageStatementPdf(d: UsageStatementData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, compress: false });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 50;
    const right = 545;
    doc.font('Helvetica-Bold').fontSize(20).text(d.appName, left, 50);
    doc.font('Helvetica-Bold').fontSize(16).text('Usage statement', left, 50, {
      width: right - left,
      align: 'right',
    });
    doc.moveTo(left, 90).lineTo(right, 90).stroke();

    doc.font('Helvetica-Bold').fontSize(11).text('Business', left, 104);
    doc.font('Helvetica').fontSize(11).text(d.businessName);
    doc.text(`Period: ${d.from} to ${d.to} (${d.daysCovered} days recorded)`);

    let y = 170;
    const row = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(11);
      doc.text(label, left, y, { width: 280 });
      doc.text(value, 330, y, { width: right - 330, align: 'right' });
      y += 22;
    };
    row('Orders', String(d.orders), true);
    row('Gross sales (GMV)', rs(d.gmv), true);
    row('Items sold', String(d.itemsSold));
    row('Returns', String(d.returns));
    row('Payments received', rs(d.paymentsReceived));
    row('Invoices printed', String(d.invoicesPrinted));
    row('Active staff (peak in one day)', String(d.activeStaff));
    row('Dues tracked: lena (receivable)', rs(d.duesOpenReceivable));
    row('Dues tracked: dena (payable)', rs(d.duesOpenPayable));

    doc.font('Helvetica').fontSize(8).fillColor('#666666');
    doc.text(
      'Figures come from the nightly usage rollup and cover full days only. Dues are the open balance at the end of the period.',
      left,
      y + 20,
      { width: right - left },
    );
    doc.end();
  });
}
