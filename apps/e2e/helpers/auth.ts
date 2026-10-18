import { E2E } from '../env';

export type StoredUser = 'ownerA' | 'managerA' | 'staffA' | 'ownerB';

export const storage = (u: StoredUser) => `${E2E.authDir}/${u}.json`;
