import type { TemplateData } from '../mail.types';
import { renderLayout } from './layout';

export const notification = (data: TemplateData['notification']) => {
  const frontend = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const url = data.link
    ? /^https?:\/\//i.test(data.link)
      ? data.link
      : `${frontend}${data.link.startsWith('/') ? '' : '/'}${data.link}`
    : undefined;
  return renderLayout({
    subject: data.title,
    heading: data.title,
    paragraphs: [data.body],
    ...(url ? { cta: { label: 'Open', url } } : {}),
  });
};
