import type { TemplateData } from '../mail.types';
import { appName, renderLayout } from './layout';

export const trialUsage = (data: TemplateData['trial-usage']) =>
  renderLayout({
    subject: `Your first days on ${appName()}`,
    heading: 'Your trial so far',
    paragraphs: [
      `Assalam o Alaikum ${data.name},`,
      `You have recorded ${data.salesCount} sales worth Rs ${data.salesTotal} and are tracking ${data.duesTracked} open lena/dena items.`,
      'Keep going: the more you record, the clearer your khata becomes.',
    ],
  });
