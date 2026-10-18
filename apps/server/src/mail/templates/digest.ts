import type { DigestRow, TemplateData } from '../mail.types';
import { appName, esc, renderLayout } from './layout';

function table(title: string, rows: DigestRow[]): string {
  if (rows.length === 0) return '';
  const body = rows
    .map(
      (r) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${esc(r.party)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">Rs ${esc(r.amount)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${esc(r.dueDate)}</td></tr>`,
    )
    .join('');
  return `<h3 style="margin:18px 0 6px;font-size:16px;">${esc(title)}</h3><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">${body}</table>`;
}

function lines(title: string, rows: DigestRow[]): string[] {
  if (rows.length === 0) return [];
  return [
    '',
    title,
    ...rows.map((r) => `- ${r.party}: Rs ${r.amount} (due ${r.dueDate})`),
  ];
}

export const digest = (data: TemplateData['digest']) =>
  renderLayout({
    subject: `${appName()} daily khulasa - ${data.businessName}`,
    heading: 'Aaj ka khulasa',
    paragraphs: [
      data.receivables.length + data.payables.length === 0
        ? 'Nothing is overdue or due soon today.'
        : `Here is what needs attention at ${data.businessName}.`,
    ],
    extraHtml:
      table('Wasooli (lena)', data.receivables) +
      table('Is hafte dena hai', data.payables),
    extraText: [
      ...lines('Wasooli (lena)', data.receivables),
      ...lines('Is hafte dena hai', data.payables),
    ],
  });
