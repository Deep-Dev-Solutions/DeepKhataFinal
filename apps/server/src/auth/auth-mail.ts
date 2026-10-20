import { getMailService } from '../mail/mail.service';

/** Staff created by an owner without an email get an address `<handle>@<slug>.<domain>`; never mailed. */
export const STAFF_EMAIL_DOMAIN = 'staff.deepkhata.invalid';

export function isSyntheticEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`.${STAFF_EMAIL_DOMAIN}`);
}

export function frontendUrl(): string {
  return (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

interface MailRecipient {
  email?: string;
  name: string;
}

/** Verification link valid for 24 h; the client calls GET /api/auth/verify-email?token=. */
export async function sendVerificationMail(
  user: MailRecipient,
  token: string,
): Promise<void> {
  if (!user.email || isSyntheticEmail(user.email)) return;
  const mail = getMailService();
  if (!mail) return;
  await mail.send('verify-email', user.email, {
    name: user.name,
    url: `${frontendUrl()}/verify-email?token=${encodeURIComponent(token)}`,
  });
}

/** Reset link valid for 1 h; the client posts the token to /api/auth/reset-password. */
export async function sendResetPasswordMail(
  user: MailRecipient,
  token: string,
): Promise<void> {
  if (!user.email || isSyntheticEmail(user.email)) return;
  const mail = getMailService();
  if (!mail) return;
  await mail.send('password-reset', user.email, {
    name: user.name,
    url: `${frontendUrl()}/reset-password?token=${encodeURIComponent(token)}`,
  });
}
