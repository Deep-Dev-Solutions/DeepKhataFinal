import { Injectable, Logger } from '@nestjs/common';

export interface EmailChannelMessage {
  businessId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}

/** Stub: only logs. The real mailer arrives in Phase 6. */
@Injectable()
export class EmailChannel {
  private readonly logger = new Logger(EmailChannel.name);

  send(message: EmailChannelMessage): Promise<void> {
    this.logger.log(
      `[stub] email to user ${message.userId} (business ${message.businessId}): ${message.type} - ${message.title}`,
    );
    return Promise.resolve();
  }
}
