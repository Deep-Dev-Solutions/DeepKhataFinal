import nodemailer from 'nodemailer';
import type { MailTransport, OutgoingMail } from './mail.types';

export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  connectionTimeoutMs?: number;
}

interface NodemailerInfo {
  messageId?: string;
}

interface NodemailerTransporter {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    attachments?: { filename: string; content: Buffer; contentType: string }[];
  }): Promise<NodemailerInfo>;
}

export class SmtpTransport implements MailTransport {
  private transporter: NodemailerTransporter | null = null;

  constructor(private readonly options: SmtpOptions) {}

  private get client(): NodemailerTransporter {
    if (!this.transporter) {
      const timeout = this.options.connectionTimeoutMs ?? 10000;
      this.transporter = nodemailer.createTransport({
        host: this.options.host,
        port: this.options.port,
        secure: this.options.secure,
        connectionTimeout: timeout,
        greetingTimeout: timeout,
        socketTimeout: timeout,
        ...(this.options.user
          ? { auth: { user: this.options.user, pass: this.options.pass ?? '' } }
          : {}),
      }) as NodemailerTransporter;
    }
    return this.transporter;
  }

  async send(mail: OutgoingMail): Promise<{ providerId: string | null }> {
    const info = await this.client.sendMail({
      from: mail.from,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: mail.attachments,
    });
    return { providerId: info.messageId ?? null };
  }
}

export class ResendTransport implements MailTransport {
  constructor(
    private readonly apiKey: string,
    private readonly endpoint = 'https://api.resend.com/emails',
  ) {}

  async send(mail: OutgoingMail): Promise<{ providerId: string | null }> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: mail.from,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(mail.attachments?.length
          ? {
              attachments: mail.attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString('base64'),
              })),
            }
          : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!res.ok) {
      throw new Error(
        `Resend ${res.status}: ${body.message ?? res.statusText}`,
      );
    }
    return { providerId: body.id ?? null };
  }
}

export function defaultFrom(): string {
  const appName = process.env.APP_NAME || 'DeepKhata';
  if (process.env.MAIL_FROM) return process.env.MAIL_FROM;
  if (process.env.RESEND_API_KEY) return `${appName} <onboarding@resend.dev>`;
  const domain = process.env.MAIL_DOMAIN || 'deepkhata.app';
  return `${appName} <noreply@${domain}>`;
}

/** Picks Resend when RESEND_API_KEY is set, else SMTP (Mailpit 127.0.0.1:1025 in dev). */
export function createTransportFromEnv(): MailTransport {
  const key = process.env.RESEND_API_KEY;
  if (key) return new ResendTransport(key);
  return new SmtpTransport({
    host: process.env.SMTP_HOST || '127.0.0.1',
    port: Number(process.env.SMTP_PORT || 1025),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
  });
}
