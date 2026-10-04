/**
 * The single canonical mount prefix for every quotas web route. Kept in its
 * own module so route files and the router can both depend on it without a
 * cycle back through the router itself.
 * @module providers/quotas/web/quotas-prefix
 */

export const QUOTAS_PREFIX = "/quotas";
