export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface DigestRow {
  party: string;
  amount: string;
  dueDate: string;
}

/** Dates may arrive as Date or ISO string because retries re-render from stored JSON. */
export type DateLike = Date | string;

export interface TemplateData {
  'verify-email': { name: string; url: string };
  'password-reset': { name: string; url: string };
  'staff-invite': {
    inviterName: string;
    businessName: string;
    role: string;
    url: string;
    expiresAt?: DateLike;
  };
  welcome: {
    name: string;
    businessName: string;
    links: { label: string; url: string }[];
  };
  'trial-tips': { name: string };
  'trial-usage': {
    name: string;
    salesCount: number;
    salesTotal: string;
    duesTracked: number;
  };
  'trial-ending': { name: string; daysLeft: number; payUrl: string };
  'trial-ended': { name: string; payInstructions: string };
  'trial-reminder': { name: string };
  'agency-signup-alert': {
    shopName: string;
    ownerName: string;
    phone: string;
    city: string;
    market: string;
    waLink: string;
  };
  invoice: {
    businessName: string;
    number: string;
    total: string;
    dueDate: DateLike;
    publicUrl: string;
  };
  'payment-receipt': {
    businessName: string;
    number: string;
    amount: string;
    periodEnd: DateLike;
  };
  notification: { title: string; body: string; link?: string };
  digest: {
    businessName: string;
    receivables: DigestRow[];
    payables: DigestRow[];
  };
}

export type TemplateName = keyof TemplateData;

export interface OutgoingMail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
}

export interface MailTransport {
  /** Resolves with the provider message id, rejects on any failure. */
  send(mail: OutgoingMail): Promise<{ providerId: string | null }>;
}
