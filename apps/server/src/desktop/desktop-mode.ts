/** DEPLOYMENT_MODE=desktop: single tenant shop PC running the API locally. */
export function isDesktopMode(): boolean {
  return process.env.DEPLOYMENT_MODE === 'desktop';
}

/** Licence states in which the desktop API may write (the shell passes the state in env). */
const WRITABLE_LICENCE_STATES = new Set(['valid', 'grace']);

export function isDesktopLicenceWritable(): boolean {
  return WRITABLE_LICENCE_STATES.has(process.env.DESKTOP_LICENSE_STATE ?? '');
}
