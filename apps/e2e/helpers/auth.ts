export type StoredUser = 'ownerA' | 'managerA' | 'staffA' | 'ownerB';

export const storage = (u: StoredUser) => `.auth/${u}.json`;
