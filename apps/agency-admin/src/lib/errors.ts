import { ApiError } from "@/lib/api";

/**
 * User-facing copy for a failed request.
 *
 * Guard messages such as "You do not have permission... Required role: SUPER_ADMIN"
 * are never shown: they describe the server's rule, not what the admin should do.
 */
export function describeError(err: unknown, area: string): string {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return `Your session ended before ${area} could load. Sign in again.`;
    }
    if (err.status === 403) {
      return `This browser is not signed in as a Super Admin, so ${area} could not load.`;
    }
    if (err.status >= 500) {
      return `The server failed while loading ${area} (status ${err.status}). Try again.`;
    }
    return err.message || `Could not load ${area}.`;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return `Could not load ${area}.`;
}
