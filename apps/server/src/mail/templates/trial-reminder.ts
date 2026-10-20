import type { TemplateData } from '../mail.types';
import { appName, renderLayout } from './layout';

export const trialReminder = (data: TemplateData['trial-reminder']) =>
  renderLayout({
    subject: `We miss you on ${appName()}`,
    heading: 'Pick up where you left off',
    paragraphs: [
      `Assalam o Alaikum ${data.name},`,
      `Your ${appName()} trial is still running. Record today's sales and udhar to see your khata take shape.`,
    ],
  });
