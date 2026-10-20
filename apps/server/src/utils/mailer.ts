import { getMailService } from '../mail/mail.service';

export interface InviteEmailContext {
  inviterName?: string;
  businessName?: string;
  businessId?: string;
  expiresAt?: Date | string;
}

/**
 * Sends a staff invitation through the shared MailService. Kept as a function so
 * existing callers keep working; pass `context` to brand the email.
 */
export const sendInviteEmail = async (
  toEmail: string,
  role: string,
  token: string,
  context: InviteEmailContext = {},
): Promise<void> => {
  const mail = getMailService();
  if (!mail) {
    throw new Error('MailService is not initialised (is MailModule imported?)');
  }
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  await mail.send(
    'staff-invite',
    toEmail,
    {
      inviterName: context.inviterName ?? 'Your team',
      businessName: context.businessName ?? 'a workspace',
      role,
      url: `${frontendUrl}/join?token=${token}`,
      expiresAt: context.expiresAt,
    },
    { businessId: context.businessId },
  );
};
