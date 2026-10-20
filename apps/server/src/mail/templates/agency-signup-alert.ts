import type { TemplateData } from '../mail.types';
import { appName, renderLayout } from './layout';

export const agencySignupAlert = (data: TemplateData['agency-signup-alert']) =>
  renderLayout({
    subject: `New shop signup: ${data.shopName}`,
    heading: 'New shop signed up',
    paragraphs: [
      `Shop: ${data.shopName}`,
      `Owner: ${data.ownerName}`,
      `Phone: ${data.phone}`,
      `City / market: ${data.city} / ${data.market}`,
      `A new shop joined ${appName()}. Reach out on WhatsApp to help them get started.`,
    ],
    cta: { label: 'Open WhatsApp', url: data.waLink },
  });
