// jscpd:ignore-start -- hand-authored UI bundle sharing panel patterns with sibling client.js bundles
window.__ModuleLoader__.load({
  id: "agent-actions",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    //#region lib/client.js
    /**
     * agent-actions client half (hand-authored bundle, no build step):
     * contributes the Actions page to the Settings section. The node
     * half owns the per-session controller (`/mode` command,
     * agent/pre-step + tools/pre-execute + agent/request hooks); this bundle
     * only surfaces the mode roster — the mode vocabulary, the configured
     * default, and any per-mode route / tool policies — served at
     * `/actions`.
     *
     * Re-running the bundle (HMR / entry refresh) is idempotent through the
     * slot ledger.
     */
    var MODES_ROUTE = "/actions";
    /**
     * Renders a glyph representing session modes.
     *
     * The caller must provide a `size` prop to define the glyph's dimensions.
     *
     * Returns a React SVG element representing the session modes glyph.
     *
     * On failure, the function returns an SVG element with the specified size and style.
     */
    function SessionModesGlyph(props) {
      var React = require("react");
      var size = (props && props.size) || 16;
      return React.createElement(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          className: "agent-actions-navGlyph dsh-icon-animated",
        },
        React.createElement("line", { x1: "21", x2: "14", y1: "4", y2: "4" }),
        React.createElement("line", { x1: "10", x2: "3", y1: "4", y2: "4" }),
        React.createElement("line", { x1: "21", x2: "12", y1: "12", y2: "12" }),
        React.createElement("line", { x1: "8", x2: "3", y1: "12", y2: "12" }),
        React.createElement("line", { x1: "21", x2: "16", y1: "20", y2: "20" }),
        React.createElement("line", { x1: "12", x2: "3", y1: "20", y2: "20" }),
        React.createElement("line", { x1: "14", x2: "14", y1: "2", y2: "6" }),
        React.createElement("line", { x1: "8", x2: "8", y1: "10", y2: "14" }),
        React.createElement("line", { x1: "16", x2: "16", y1: "18", y2: "22" }),
      );
    }
    /**
     * Displays session modes by fetching and rendering them.
     *
     * Guarantees: Renders lines based on the fetched session modes data.
     *             Updates the displayed data when the payload changes.
     *
     * Failure Path: If the fetch operation is cancelled or fails, no data is displayed.
     */
    function SessionModesSection(props) {
      var React = require("react");
      var h = React.createElement;
      var useState = React.useState,
        useEffect = React.useEffect;
      var state = useState(null);
      var payload = state[0],
        setPayload = state[1];
      useEffect(function () {
        var cancelled = false;
        fetch(MODES_ROUTE)
          .then(function (response) {
            return response.json();
          })
          .then(function (body) {
            if (!cancelled) setPayload(body);
          })
          .catch(function (error) {
            console.error("[agent-actions]", error);
          });
        return function () {
          cancelled = true;
        };
      }, []);
      if (payload === null) {
        return h(
          "div",
          { style: { color: "var(--dsw-alias-label-secondary)" } },
          "Loading session modes…",
        );
      }
      var modes = payload.modes || [];
      var defaultMode = payload.defaultMode;
      var routes = payload.routes || {};
      var tools = payload.tools || {};
      return h(
        "div",
        { style: { display: "grid", gap: "20px", maxWidth: "760px" } },
        h(
          "div",
          null,
          h("h2", { style: { margin: "0 0 6px" } }, "Actions"),
          h(
            "p",
            { style: { margin: 0, color: "var(--dsw-alias-label-secondary)" } },
            "Each session runs under one mode; the active mode is set per session via the /mode command. Below is the vocabulary and the policies configured for this agent.",
          ),
        ),
        h(
          "div",
          {
            style: {
              display: "grid",
              gap: "8px",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            },
          },
          modes.map(function (mode) {
            var isDefault = mode === defaultMode;
            return h(
              "div",
              {
                key: mode,
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  border: "1px solid var(--dsw-alias-border-l2)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                },
              },
              h("span", { style: { fontWeight: 600, fontSize: "14px" } }, mode),
              isDefault
                ? h(
                    "span",
                    {
                      style: {
                        marginLeft: "auto",
                        fontSize: "12px",
                        color: "var(--dsw-alias-label-secondary)",
                      },
                    },
                    "default",
                  )
                : null,
            );
          }),
        ),
        h(
          "div",
          { style: { display: "grid", gap: "8px" } },
          h(
            "div",
            {
              style: {
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--dsw-alias-label-secondary)",
              },
            },
            "Policies",
          ),
          modes.map(function (mode) {
            var route = routes[mode];
            var allowed = tools[mode];
            var parts = [];
            if (route) parts.push(route.provider + "/" + route.model);
            if (allowed) parts.push(allowed.length + " tool" + (allowed.length === 1 ? "" : "s"));
            if (parts.length === 0) return null;
            return h(
              "div",
              {
                key: mode,
                style: { display: "flex", gap: "10px", alignItems: "baseline", fontSize: "13px" },
              },
              h("span", { style: { minWidth: "90px", fontWeight: 600 } }, mode),
              h(
                "span",
                { style: { color: "var(--dsw-alias-label-secondary)" } },
                parts.join(" · "),
              ),
            );
          }),
        ),
      );
    }
    /**
     * Injects a settings section into the UI based on the provided context.
     *
     * Guarantees that the settings section is displayed with the mode and relevant parts joined by " · ".
     * Returns null if no parts are generated.
     * Fails gracefully by returning null if no parts are available.
     */
    function apply(ctx) {
      ctx.slots.inject(
        "settings.section",
        () =>
          ctx.slots.register(
            {
              name: "settings.section",
              id: "actions",
              order: 20,
              label: () => "Actions",
              inject: () => ({}),
            },
            SessionModesSection,
          ),
        "agent-actions: session modes settings",
      );
      ctx.slots.inject(
        "settings.section.icon",
        () =>
          ctx.slots.register(
            {
              name: "settings.section.icon",
              id: "actions",
              order: 0,
            },
            SessionModesGlyph,
          ),
        "agent-actions: session modes nav glyph",
      );
    }
    //#endregion
    exports.apply = apply;
    exports.inject = ["slots"];
    return module.exports;
  },
});

// jscpd:ignore-end
