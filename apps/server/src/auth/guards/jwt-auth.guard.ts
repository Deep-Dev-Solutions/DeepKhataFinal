/**
 * Compatibility alias: controllers still import `JwtAuthGuard`. It is the
 * Better Auth session guard now; a later task renames the usages.
 */
export { SessionGuard as JwtAuthGuard, SessionGuard } from './session.guard';
