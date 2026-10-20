import type { RenderedEmail, TemplateData, TemplateName } from '../mail.types';
import { agencySignupAlert } from './agency-signup-alert';
import { digest } from './digest';
import { invoice } from './invoice';
import { notification } from './notification';
import { passwordReset } from './password-reset';
import { paymentReceipt } from './payment-receipt';
import { staffInvite } from './staff-invite';
import { trialEnded } from './trial-ended';
import { trialEnding } from './trial-ending';
import { trialReminder } from './trial-reminder';
import { trialTips } from './trial-tips';
import { trialUsage } from './trial-usage';
import { verifyEmail } from './verify-email';
import { welcome } from './welcome';

type Renderers = {
  [K in TemplateName]: (data: TemplateData[K]) => RenderedEmail;
};

export const templates: Renderers = {
  'verify-email': verifyEmail,
  'password-reset': passwordReset,
  'staff-invite': staffInvite,
  welcome,
  'trial-tips': trialTips,
  'trial-usage': trialUsage,
  'trial-ending': trialEnding,
  'trial-ended': trialEnded,
  'trial-reminder': trialReminder,
  'agency-signup-alert': agencySignupAlert,
  invoice,
  'payment-receipt': paymentReceipt,
  notification,
  digest,
};

export function renderTemplate<T extends TemplateName>(
  name: T,
  data: TemplateData[T],
): RenderedEmail {
  const render = templates[name] as (d: TemplateData[T]) => RenderedEmail;
  if (!render) throw new Error(`Unknown mail template: ${name}`);
  return render(data);
}
