import { SetMetadata } from '@nestjs/common';

export const ALLOW_WITHOUT_BUSINESS_KEY = 'allowWithoutBusiness';

/** Lets an authenticated user who has no business yet reach this route. */
export const AllowWithoutBusiness = () =>
  SetMetadata(ALLOW_WITHOUT_BUSINESS_KEY, true);
