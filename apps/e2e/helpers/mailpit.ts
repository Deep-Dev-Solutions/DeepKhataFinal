import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';
import { E2E } from '../env';

const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

/** Poll Mailpit until a message addressed to `to` arrives; returns its text body. */
export async function waitForEmailText(request: APIRequestContext, to: string): Promise<string> {
  let text = '';
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${to}` } });
        if (!res.ok()) return false;
        const body = (await res.json()) as { messages: MailpitSummary[] };
        const msg = body.messages?.[0];
        if (!msg) return false;
        const full = await request.get(`${MAILPIT}/api/v1/message/${msg.ID}`);
        if (!full.ok()) return false;
        text = ((await full.json()) as { Text: string }).Text;
        return true;
      },
      { message: `no email for ${to} in Mailpit`, timeout: 20_000 },
    )
    .toBe(true);
  return text;
}

/** Extract the invite accept link from an email and rewrite its origin to the E2E web URL. */
export function inviteLinkFromEmail(text: string): string {
  const m = text.match(/https?:\/\/[^\s)]+\/join\?token=[a-f0-9]+/);
  if (!m) throw new Error(`No accept-invite link found in email:\n${text}`);
  const u = new URL(m[0]);
  return `${E2E.webUrl}${u.pathname}${u.search}`;
}
