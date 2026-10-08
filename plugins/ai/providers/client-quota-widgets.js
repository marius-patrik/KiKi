/**
 * Presentational quota widgets shared by the Accounts and Models settings
 * sections: a status light, a remaining/limit meter bar, a reset-time
 * countdown, and the vendor grouping that lets a multi-account provider
 * (OpenRouter, Groq, Cerebras, ...) show every account together instead of
 * only the first one a card happens to pick (#164).
 *
 * `__dshQuotaVendorBaseId`/`__dshQuotaVendorSuffix` mirror the
 * `vendorBaseId`/`vendorSuffix` helpers `@dsh-stack/providers` exports
 * server-side (#187's numbered-account convention) -- duplicated here in one
 * line each only as a fallback for a snapshot fetched before this file's
 * server-side counterpart started stamping `vendor`/`accountIndex` onto
 * every `/quotas/api/*` response; this classic-script client bundle cannot
 * import that TS module directly, the same reason `client-tab-move-protocol.js`
 * and `glyph-factory.js` (prepended the same way) stay framework-free
 * instead of importing it.
 *
 * This file is prepended (via the package build script, the same way
 * crypto-polyfill.js, glyph-factory.js and client-tab-move-protocol.js are)
 * ahead of client.js, which then does
 * `var quotaWidgets = __dshCreateQuotaWidgets(h);` once `h` is in scope.
 */

/** Fallback vendor-base derivation for a snapshot the server has not yet annotated. */
function __dshQuotaVendorBaseId(provider) {
  return provider.replace(/-\d+$/, "");
}

/** Fallback account-index derivation for a snapshot the server has not yet annotated. */
function __dshQuotaVendorSuffix(provider) {
  var match = /-(\d+)$/.exec(provider);
  return match === null ? 1 : Number(match[1]);
}

/** A handful of vendor ids common enough to deserve their proper capitalization over a bare title-case. */
var __DSH_QUOTA_VENDOR_LABELS = {
  openrouter: "OpenRouter",
  groq: "Groq",
  cerebras: "Cerebras",
  zai: "Z.ai",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  openai: "OpenAI",
};

/** A human label for a vendor id lacking any snapshot `displayName` to fall back on. */
function __dshHumanizeVendorId(vendor) {
  if (__DSH_QUOTA_VENDOR_LABELS[vendor]) return __DSH_QUOTA_VENDOR_LABELS[vendor];
  return vendor
    .split(/[-_]/)
    .map(function (part) {
      return part.length === 0 ? part : part[0].toUpperCase() + part.slice(1);
    })
    .join(" ");
}

/**
 * Build the quota widget components bound to one `React.createElement`
 * (`h`): `QuotaStatusDot`, `QuotaMeterBar`, `QuotaResetTimer`, and the
 * `groupQuotaSnapshotsByVendor` grouping helper they render against.
 */
function __dshCreateQuotaWidgets(h) {
  var STATUS_COLORS = {
    available: "#3fb950",
    error: "#f85149",
    unknown: "#888888",
  };

  var STATUS_LABELS = {
    available: "Available",
    error: "Rate Limited / Error",
    unknown: "Unknown",
  };

  /** One status light: a colored dot plus its label (or a caller-supplied one). */
  function QuotaStatusDot(props) {
    var status = (props && props.status) || "unknown";
    var color = STATUS_COLORS[status] || STATUS_COLORS.unknown;
    var label = (props && props.label) || STATUS_LABELS[status] || status;
    return h(
      "span",
      {
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          fontSize: "11px",
          fontWeight: 600,
          color: color,
        },
      },
      h("span", {
        style: {
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: color,
          boxShadow: status === "available" ? "0 0 6px " + color : "none",
          flex: "0 0 auto",
        },
      }),
      label,
    );
  }

  /** A horizontal remaining/limit meter bar; renders nothing when the probe reported no numeric limit. */
  function QuotaMeterBar(props) {
    var remaining = props && props.remaining;
    var limit = props && props.limit;
    var unit = (props && props.unit) || "requests";
    if (typeof limit !== "number" || limit <= 0 || typeof remaining !== "number") return null;
    var used = Math.max(0, limit - remaining);
    var pct = Math.min(100, Math.max(0, (used / limit) * 100));
    var color = pct >= 90 ? "#f85149" : pct >= 70 ? "#d29922" : "#3fb950";
    return h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "3px", minWidth: "130px" } },
      h(
        "div",
        {
          style: {
            height: "5px",
            borderRadius: "3px",
            background: "var(--dsw-alias-surface-l2, rgba(128,128,128,0.15))",
            overflow: "hidden",
          },
        },
        h("div", {
          style: { width: pct + "%", height: "100%", background: color },
        }),
      ),
      h(
        "span",
        { style: { fontSize: "10px", color: "var(--dsw-alias-label-tertiary)" } },
        remaining.toLocaleString() + " / " + limit.toLocaleString() + " " + unit + " left",
      ),
    );
  }

  /** Formats a millisecond duration as a short "3h 12m" / "45s" countdown. */
  function formatCountdown(ms) {
    if (ms <= 0) return "now";
    var totalSeconds = Math.floor(ms / 1000);
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    if (hours > 0) return hours + "h " + minutes + "m";
    if (minutes > 0) return minutes + "m " + seconds + "s";
    return seconds + "s";
  }

  /**
   * A "resets in Xm Ys" countdown against `resetsAt` (an ISO string), driven
   * by the caller's `now` (a shared ticking clock, not a per-row interval —
   * one row's countdown must not spin up its own timer when a settings tab
   * can list dozens of accounts at once).
   */
  function QuotaResetTimer(props) {
    var resetsAt = props && props.resetsAt;
    var now = (props && props.now) || Date.now();
    if (!resetsAt) return null;
    var resetTime = new Date(resetsAt).getTime();
    if (Number.isNaN(resetTime)) return null;
    return h(
      "span",
      { style: { fontSize: "10px", color: "var(--dsw-alias-label-tertiary)" } },
      "resets in " + formatCountdown(resetTime - now),
    );
  }

  /**
   * Groups a flat snapshot list by vendor (the server-stamped `vendor`
   * field, falling back to deriving it locally for an older payload), each
   * group's accounts ordered by `accountIndex` ascending so "Account 1"
   * always leads "Account 2".
   */
  function groupQuotaSnapshotsByVendor(snapshots) {
    var order = [];
    var groups = {};
    (snapshots || []).forEach(function (snap) {
      var vendor = snap.vendor || __dshQuotaVendorBaseId(snap.provider);
      if (!groups[vendor]) {
        groups[vendor] = [];
        order.push(vendor);
      }
      groups[vendor].push(snap);
    });
    return order.map(function (vendor) {
      var accounts = groups[vendor].slice().sort(function (a, b) {
        var ai =
          typeof a.accountIndex === "number" ? a.accountIndex : __dshQuotaVendorSuffix(a.provider);
        var bi =
          typeof b.accountIndex === "number" ? b.accountIndex : __dshQuotaVendorSuffix(b.provider);
        return ai - bi;
      });
      return { vendor: vendor, label: __dshHumanizeVendorId(vendor), accounts: accounts };
    });
  }

  return {
    QuotaStatusDot: QuotaStatusDot,
    QuotaMeterBar: QuotaMeterBar,
    QuotaResetTimer: QuotaResetTimer,
    groupQuotaSnapshotsByVendor: groupQuotaSnapshotsByVendor,
    vendorBaseId: __dshQuotaVendorBaseId,
  };
}
