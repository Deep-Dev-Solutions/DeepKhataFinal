import type { TemplateData } from '../mail.types';
import { esc, appName, renderLayout } from './layout';

export const welcome = (data: TemplateData['welcome']) =>
  renderLayout({
    subject: `Welcome to ${appName()}, ${data.name}`,
    heading: `Welcome to ${appName()}`,
    paragraphs: [
      `Assalam o Alaikum ${data.name},`,
      `${data.businessName} is ready. Here are a few places to start with your galla, khata and maal.`,
    ],
    extraHtml: `<ul style="margin:0 0 14px;padding-left:20px;line-height:1.7;">${data.links
      .map((l) => `<li><a href="${esc(l.url)}">${esc(l.label)}</a></li>`)
      .join('')}</ul>`,
    extraText: data.links.map((l) => `- ${l.label}: ${l.url}`),
  });
