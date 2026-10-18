import type { TemplateData } from '../mail.types';
import { appName, fmtDate, renderLayout } from './layout';

export const staffInvite = (data: TemplateData['staff-invite']) => {
  const expires = fmtDate(data.expiresAt);
  return renderLayout({
    subject: `${data.inviterName} invited you to ${data.businessName} on ${appName()}`,
    heading: `You have been invited to ${appName()}`,
    paragraphs: [
      `${data.inviterName} invited you to join ${data.businessName} as ${data.role}.`,
      'Click the button below to accept the invitation and set up your account.',
      ...(expires ? [`This invitation expires on ${expires}.`] : []),
    ],
    cta: { label: 'Accept invitation', url: data.url },
    footnote: 'If you did not expect this, please ignore this email.',
  });
};
