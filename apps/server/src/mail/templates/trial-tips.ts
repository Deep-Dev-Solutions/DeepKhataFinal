import type { TemplateData } from '../mail.types';
import { appName, renderLayout } from './layout';

export const trialTips = (data: TemplateData['trial-tips']) =>
  renderLayout({
    subject: `Three quick tips to get more from ${appName()}`,
    heading: 'Get more from your trial',
    paragraphs: [
      `Assalam o Alaikum ${data.name},`,
      'Add your products and opening stock (maal) first, so every sale updates stock automatically.',
      'Record udhar sales against a customer so the khata and the lena list stay up to date.',
      'Close your galla (cash register) at the end of the day to catch any difference early.',
    ],
  });
