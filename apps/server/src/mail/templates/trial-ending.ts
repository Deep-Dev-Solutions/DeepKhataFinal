import type { TemplateData } from '../mail.types';
import { appName, renderLayout } from './layout';

export const trialEnding = (data: TemplateData['trial-ending']) =>
  renderLayout({
    subject: `Your ${appName()} trial ends in ${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'}`,
    heading: 'Your trial is ending soon',
    paragraphs: [
      `Assalam o Alaikum ${data.name},`,
      `Your free trial ends in ${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'}. Subscribe to keep using ${appName()} without interruption.`,
    ],
    cta: { label: 'Subscribe now', url: data.payUrl },
  });
