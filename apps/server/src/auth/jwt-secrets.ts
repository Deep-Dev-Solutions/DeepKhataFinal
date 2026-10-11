const MIN_SECRET_LENGTH = 32;

function readSecret(name: 'ACCESS_TOKEN_SECRET' | 'REFRESH_TOKEN_SECRET') {
  const value = process.env[name];
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} must be set and at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
  return value;
}

export function getAccessTokenSecret(): string {
  return readSecret('ACCESS_TOKEN_SECRET');
}

export function getRefreshTokenSecret(): string {
  return readSecret('REFRESH_TOKEN_SECRET');
}

export function assertJwtSecrets(): void {
  getAccessTokenSecret();
  getRefreshTokenSecret();
}
