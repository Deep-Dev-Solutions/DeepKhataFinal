import type { TemplateData } from '../mail.types';
import { appName, fmtDate, renderLayout } from './layout';

export const paymentReceipt = (data: TemplateData['payment-receipt']) =>
  renderLayout({
    subject: `Payment received for invoice ${data.number}`,
    heading: 'Payment received, shukriya',
    paragraphs: [
      `Hello ${data.businessName},`,
      `We received Rs ${data.amount} for invoice ${data.number}. Your ${appName()} subscription is active until ${fmtDate(data.periodEnd)}.`,
    ],
  });
