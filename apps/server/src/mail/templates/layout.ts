import type { RenderedEmail } from '../mail.types';

export function appName(): string {
  return process.env.APP_NAME || 'DeepKhata';
}

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtDate(d: Date | string | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  // Karachi is a fixed UTC+5.
  return new Date(date.getTime() + 5 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export interface LayoutParts {
  subject: string;
  heading: string;
  /** Paragraph strings (plain text, escaped by the layout). */
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Extra pre-escaped HTML placed after the paragraphs. */
  extraHtml?: string;
  /** Extra plain text lines placed after the paragraphs. */
  extraText?: string[];
  footnote?: string;
}

export function renderLayout(parts: LayoutParts): RenderedEmail {
  const name = appName();
  const logoUrl = process.env.MAIL_LOGO_URL;
  const logo = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${esc(name)}" height="36" style="display:block;border:0;" />`
    : `<span style="font-size:20px;font-weight:700;color:#2563eb;">${esc(name)}</span>`;
  const paragraphs = parts.paragraphs
    .map((p) => `<p style="margin:0 0 14px;line-height:1.5;">${esc(p)}</p>`)
    .join('');
  const cta = parts.cta
    ? `<p style="margin:20px 0;"><a href="${esc(parts.cta.url)}" style="display:inline-block;padding:11px 22px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">${esc(parts.cta.label)}</a></p>` +
      `<p style="margin:0 0 14px;font-size:12px;color:#666;">If the button does not work, copy this link: ${esc(parts.cta.url)}</p>`
    : '';
  const foot = parts.footnote
    ? `<p style="margin:20px 0 0;font-size:12px;color:#888;">${esc(parts.footnote)}</p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#222;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;padding:28px;">
<tr><td>${logo}</td></tr>
<tr><td style="padding-top:20px;"><h2 style="margin:0 0 16px;font-size:20px;">${esc(parts.heading)}</h2>${paragraphs}${parts.extraHtml ?? ''}${cta}${foot}</td></tr>
</table>
<p style="font-size:12px;color:#888;margin:14px 0 0;">${esc(name)}</p>
</td></tr></table></body></html>`;

  const textLines = [
    parts.heading,
    '',
    ...parts.paragraphs,
    ...(parts.extraText ?? []),
    ...(parts.cta ? ['', `${parts.cta.label}: ${parts.cta.url}`] : []),
    ...(parts.footnote ? ['', parts.footnote] : []),
    '',
    `- ${name}`,
  ];
  return { subject: parts.subject, html, text: textLines.join('\n') };
}
