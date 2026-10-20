# Email setup

All mail goes through the global `MailModule` (`apps/server/src/mail`). Every send is recorded in the `EmailLog` table. A failed send is retried 1 minute, 5 minutes and 30 minutes later; after the third retry it is marked `FAILED`.

## Transport selection

| Condition | Transport |
| --- | --- |
| `RESEND_API_KEY` is set | Resend REST API (`https://api.resend.com/emails`), sender from `MAIL_FROM` |
| otherwise | SMTP via nodemailer, default `127.0.0.1:1025` with no auth (Mailpit) |

## Environment variables

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Enables Resend. Leave empty in dev. |
| `MAIL_FROM` | Sender, for example `DeepKhata <noreply@mail.example.com>`. Must be on a verified domain when using Resend. |
| `MAIL_LOGO_URL` | Optional absolute URL of a logo shown in the email header. Falls back to the `APP_NAME` text. |
| `SMTP_HOST`, `SMTP_PORT` | SMTP server (default `127.0.0.1`, `1025`). |
| `SMTP_USER`, `SMTP_PASS` | SMTP credentials, optional. |
| `SMTP_SECURE` | `true` for implicit TLS (port 465). |
| `APP_NAME` | Product name used in subjects and layout. |
| `FRONTEND_URL` | Base URL for links in notification and invite emails. |

## Development with Mailpit

1. `npm run db:up` starts Mailpit (SMTP `127.0.0.1:1025`, UI http://localhost:8025).
2. Leave `RESEND_API_KEY` and `SMTP_*` unset.
3. Trigger an email (invite a team member, enable the EMAIL channel on a notification rule) and open the Mailpit UI.

## Production with Resend

1. Create a Resend account and add your sending domain, preferably a subdomain such as `mail.example.com`, so it does not affect the root domain reputation.
2. Add the DNS records Resend shows (below), then click Verify.
3. Create an API key with "Sending access" and set `RESEND_API_KEY` and `MAIL_FROM` in the server environment. Do not commit them.
4. Send a test email to a mail-tester.com address (below) before going live.

## DNS records (template)

Replace `mail.example.com` with your sending domain. Use the exact values shown in the Resend dashboard for DKIM and the SPF include.

| Type | Name | Value |
| --- | --- | --- |
| TXT (SPF) | `send.mail.example.com` | `v=spf1 include:amazonses.com ~all` (use the value Resend gives you) |
| MX | `send.mail.example.com` | `feedback-smtp.<region>.amazonses.com`, priority 10 (value from Resend) |
| TXT (DKIM) | `resend._domainkey.mail.example.com` | `p=<public key from Resend>` |
| TXT (DMARC) | `_dmarc.mail.example.com` | `v=DMARC1; p=none; rua=mailto:dmarc@example.com; adkim=s; aspf=s` |

Start DMARC with `p=none` and read the reports for a couple of weeks. Then move to `p=quarantine`, and later `p=reject`, once SPF and DKIM pass for all legitimate mail.

## Check deliverability with mail-tester

1. Open https://www.mail-tester.com and copy the temporary address it shows.
2. With production settings, send any template to that address, for example by triggering a password reset or by calling `MailService.send('welcome', '<address>', ...)` from a script.
3. Press "Then check your score". Aim for 9/10 or better. Fix SPF, DKIM and DMARC first, then content warnings.

## Troubleshooting

- Look at the `EmailLog` table: `status`, `attempts`, `error` and `nextAttemptAt` show what happened to each message.
- `QUEUED` rows are retried every minute by the `mail-retry` cron. `FAILED` rows are not retried automatically.
- Resend returns 403 when the `MAIL_FROM` domain is not verified.
