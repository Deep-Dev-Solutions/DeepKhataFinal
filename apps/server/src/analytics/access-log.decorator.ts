import { SetMetadata } from '@nestjs/common';

export const ACCESS_LOG_ACTION_KEY = 'adminAccessLogAction';

/** Overrides the action recorded in AdminAccessLog (default: the handler name). */
export const AccessLogAction = (action: string) =>
  SetMetadata(ACCESS_LOG_ACTION_KEY, action);
