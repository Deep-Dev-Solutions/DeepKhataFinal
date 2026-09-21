import nodemailer from 'nodemailer';

function buildTransporter() {
  const host =
    process.env.SMTP_HOST ||
    (process.env.RESEND_API_KEY ? 'smtp.resend.com' : undefined);

  if (host) {
    return nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user:
          process.env.SMTP_USER ??
          (host.includes('resend') ? 'resend' : undefined),
        pass: process.env.SMTP_PASS ?? process.env.RESEND_API_KEY,
      },
    });
  }
  // Dev fallback: local Mailpit
  return nodemailer.createTransport({
    host: '127.0.0.1',
    port: 1025,
    secure: false,
  });
}

const transporter = buildTransporter();

export const sendInviteEmail = async (toEmail: any, role: any, token: any) => {
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const inviteLink = `${frontendUrl}/join?token=${token}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2>You have been invited to BizFlow!</h2>
      <p>You have been invited to join a workspace as a <strong>${role}</strong>.</p>
      <p>Click the button below to accept the invitation and set up your account:</p>
      <a href="${inviteLink}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px;">
        Accept Invitation
      </a>
      <p style="margin-top: 20px; font-size: 12px; color: #888;">If you did not expect this, please ignore this email.</p>
    </div>
  `;

  const isResend =
    process.env.SMTP_HOST?.includes('resend') || !!process.env.RESEND_API_KEY;
  const defaultFrom = isResend
    ? '"BizFlow Admin" <onboarding@resend.dev>'
    : '"BizFlow Admin" <noreply@bizflow.com>';
  const from = process.env.SMTP_FROM || defaultFrom;

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: 'Invitation to join BizFlow Workspace',
    html: htmlContent,
  });
};
