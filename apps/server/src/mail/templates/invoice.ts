import type { TemplateData } from '../mail.types';
import { appName, fmtDate, renderLayout } from './layout';

export const invoice = (data: TemplateData['invoice']) =>
  renderLayout({
    subject: `Invoice ${data.number} from ${appName()}`,
    heading: `Invoice ${data.number}`,
    paragraphs: [
      `Hello ${data.businessName},`,
      `Your invoice ${data.number} for Rs ${data.total} is due on ${fmtDate(data.dueDate)}.`,
    ],
    cta: { label: 'View invoice', url: data.publicUrl },
  });
