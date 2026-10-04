/**
 * Core quota routes: the `GET /quotas` HTML dashboard, `GET
 * /quotas/api/integrations` (binary/usage probe), `GET /quotas/api/
 * snapshots`, `GET /quotas/api/summary`, and the refresh endpoints.
 * @module providers/quotas/web/quota-routes
 */

import { sendJsonResponse } from "@dsh-stack/plugin-kit";
import { vendorBaseId, vendorSuffix } from "../../providers.js";
import type { QuotaRegistry, QuotaSnapshot } from "../index.js";
import { probeBinariesAndUsage } from "./binary-probe.js";
import { QUOTAS_PREFIX } from "./quotas-prefix.js";
import { isRoute, type RouteContext } from "./route-context.js";

/**
 * A snapshot annotated with the vendor grouping the Settings UI needs to
 * show every account of a multi-account provider (`openrouter`,
 * `openrouter-2`, ...) together: `vendor` is the numbered id's base
 * (#187's convention, already shared with `@dsh-stack/provider-rotation`),
 * `accountIndex` its numbered suffix (bare ids sort first, at 1).
 */
interface VendorGroupedSnapshot extends QuotaSnapshot {
  vendor: string;
  accountIndex: number;
}

/** Annotate one snapshot with its vendor grouping. */
function withVendorGrouping(snapshot: QuotaSnapshot): VendorGroupedSnapshot {
  return {
    ...snapshot,
    vendor: vendorBaseId(snapshot.provider),
    accountIndex: vendorSuffix(snapshot.provider),
  };
}

/** Handle one core quota request (dashboard, integrations, snapshots, summary, refresh). */
export async function handleQuotaRoute(
  ctx: RouteContext,
  registry: QuotaRegistry,
): Promise<boolean> {
  const { res, pathname, method } = ctx;

  if (isRoute(ctx, `${QUOTAS_PREFIX}/api/integrations`, "GET")) {
    sendJsonResponse(res, 200, probeBinariesAndUsage());
    return true;
  }

  if (isRoute(ctx, QUOTAS_PREFIX, "GET")) {
    sendJsonResponse(res, 200, {
      message:
        "Quotas dashboard is consolidated into Settings > Providers / Models. Live data available at /quotas/api/snapshots",
      snapshots: registry.all().map(withVendorGrouping),
    });
    return true;
  }

  if (isRoute(ctx, `${QUOTAS_PREFIX}/api/snapshots`, "GET")) {
    sendJsonResponse(res, 200, { snapshots: registry.all().map(withVendorGrouping) });
    return true;
  }

  if (isRoute(ctx, `${QUOTAS_PREFIX}/api/summary`, "GET")) {
    const snapshots = registry.all();
    const summary = {
      total: snapshots.length,
      available: snapshots.filter((s) => s.status === "available").length,
      unknown: snapshots.filter((s) => s.status === "unknown").length,
      error: snapshots.filter((s) => s.status === "error").length,
      exhausted: snapshots.filter(
        (s) => s.status === "available" && s.remaining !== undefined && s.remaining <= 0,
      ).length,
      providers: snapshots.map((s: QuotaSnapshot) => ({
        ...withVendorGrouping(s),
        displayName: s.displayName ?? null,
        remaining: s.remaining ?? null,
        limit: s.limit ?? null,
        resetsAt: s.resetsAt ?? null,
      })),
    };
    sendJsonResponse(res, 200, summary);
    return true;
  }

  const refreshPrefix = `${QUOTAS_PREFIX}/api/refresh/`;
  if (pathname.startsWith(refreshPrefix) && method === "POST") {
    const provider = decodeURIComponent(pathname.slice(refreshPrefix.length));
    const snapshot = await registry.refresh(provider);
    sendJsonResponse(res, 200, { snapshot });
    return true;
  }

  if (isRoute(ctx, `${QUOTAS_PREFIX}/api/refresh`, "POST")) {
    const snapshots: Array<{ provider: string; status: string; remaining?: number }> = [];
    for (const snap of registry.all()) {
      const refreshed = await registry.refresh(snap.provider);
      snapshots.push({
        provider: refreshed.provider,
        status: refreshed.status,
        remaining: refreshed.remaining,
      });
    }
    sendJsonResponse(res, 200, { snapshots });
    return true;
  }

  return false;
}
