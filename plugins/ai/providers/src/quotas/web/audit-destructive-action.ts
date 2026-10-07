/**
 * Records a destructive route action before it executes, naming who asked.
 *
 * The quotas API shells out to `docker stop`, `docker rm` and
 * `tmux kill-session` -- operations that destroy a user's running work -- and
 * previously left no trace of having done so. When containers were reported
 * disappearing as tabs were closed, there was no way to distinguish an
 * unintended caller from an unrelated coincidence, because nothing recorded
 * that the route had been reached at all.
 *
 * The referer is what makes the line useful: it separates a deliberate click in
 * the container or session view from a teardown path nobody intended to be
 * destructive.
 *
 * @module providers/quotas/web/audit-destructive-action
 */
import type { RouteContext } from "./route-context.js";

/**
 * Writes one audit line for a destructive action.
 * @param req - the request performing the action, read for caller headers.
 * @param surface - which subsystem is acting, e.g. `docker` or `tmux`.
 * @param action - the action about to run, e.g. `stop`, `rm`, `kill-session`.
 * @param target - the container id or session name being acted on.
 */
export function auditDestructiveAction(
  req: RouteContext["req"],
  surface: string,
  action: string,
  target: string,
): void {
  const referer = req.headers["referer"] ?? "unknown";
  const agent = req.headers["user-agent"] ?? "unknown";
  console.log(
    `[${surface}] action=${action} target=${target} referer=${referer} ua=${agent} at=${new Date().toISOString()}`,
  );
}
