import type { TemplateData } from '../mail.types';
import { appName, renderLayout } from './layout';

export const verifyEmail = (data: TemplateData['verify-email']) =>
  renderLayout({
    subject: `Verify your email for ${appName()}`,
    heading: 'Verify your email',
    paragraphs: [
      `Assalam o Alaikum ${data.name},`,
      `Please confirm your email address to finish setting up your ${appName()} account.`,
    ],
    cta: { label: 'Verify email', url: data.url },
    footnote: 'If you did not create this account, you can ignore this email.',
  });
