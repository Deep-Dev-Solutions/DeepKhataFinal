/**
 * Ed25519 public key used to verify licence tokens.
 *
 * !!! DEV PLACEHOLDER !!!
 * This is a throw-away key for development only. The matching private key was
 * discarded, so no real licence can be signed for it. Production builds MUST
 * either set the env var LICENSE_PUBLIC_KEY_PEM or replace this constant with
 * the real public key of the licence-issuing service (public keys are not
 * secrets; the private key must never be committed).
 */
export const DEV_PLACEHOLDER_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAovElPJJXVi5mS6cjgFEp7MM/hYqHpaXklJZVssTaUjc=
-----END PUBLIC KEY-----
`;

export function getLicencePublicKeyPem(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.LICENSE_PUBLIC_KEY_PEM;
  if (fromEnv && fromEnv.trim().length > 0) {
    // Allow "\n" escaped newlines in env files.
    return fromEnv.replace(/\\n/g, '\n');
  }
  return DEV_PLACEHOLDER_PUBLIC_KEY_PEM;
}
