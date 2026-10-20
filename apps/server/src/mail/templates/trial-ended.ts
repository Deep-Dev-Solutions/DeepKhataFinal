import type { TemplateData } from '../mail.types';
import { appName, renderLayout } from './layout';

export const trialEnded = (data: TemplateData['trial-ended']) =>
  renderLayout({
    subject: `Your ${appName()} trial has ended`,
    heading: 'Your trial has ended',
    paragraphs: [
      `Assalam o Alaikum ${data.name},`,
      `Your free trial has ended. Your data is safe. To continue, please follow these payment steps: ${data.payInstructions}`,
    ],
  });
