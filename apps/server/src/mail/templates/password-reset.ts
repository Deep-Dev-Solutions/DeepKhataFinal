import type { TemplateData } from '../mail.types';
import { appName, renderLayout } from './layout';

export const passwordReset = (data: TemplateData['password-reset']) =>
  renderLayout({
    subject: `Reset your ${appName()} password`,
    heading: 'Reset your password',
    paragraphs: [
      `Assalam o Alaikum ${data.name},`,
      'We received a request to reset your password. Use the button below to choose a new one.',
    ],
    cta: { label: 'Reset password', url: data.url },
    footnote:
      'If you did not ask for this, you can ignore this email. Your password will not change.',
  });
