// jscpd:ignore-start -- hand-authored UI bundle sharing panel patterns with sibling client.js bundles
window.__ModuleLoader__.load({
  id: "@dsh-stack/agents",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    //#region lib/client.js
    /**
     * agents client half (hand-authored bundle, no build step):
     * contributes the Agents page to the Settings section, the `/persona`
     * switcher (a commandUi popupSelect ported from ui-model-selection),
     * and the active-persona badge in the composer tool row.
     *
     * The node half owns persona files on disk and materializes each into
     * an agent preset; this bundle reads the live preset roster over the
     * connection RPC (`connection.api.agentPresets.list`) for the Agents
     * tab and the switcher options. The active persona folds from the
     * host-computed `persona` session projection (itself folded from the
     * session log): the badge reads `useProjection('persona')`, and the
     * switcher marks the active option from `sessions.get(id).projections`.
     * Switching issues the `/persona <id>` command through the remote, and
     * the host logs `persona/selected` — no client-side persona state.
     *
     * Re-running the bundle (HMR / entry refresh) is idempotent through the
     * slot ledger.
     */
    function AgentsGlyph(props) {
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
          className: "agents-navGlyph dsh-icon-animated",
        },
        React.createElement("path", { d: "M12 8V4H8" }),
        React.createElement("rect", { width: "16", height: "12", x: "4", y: "8", rx: "2" }),
        React.createElement("path", { d: "M2 14h2" }),
        React.createElement("path", { d: "M20 14h2" }),
        React.createElement("path", { d: "M15 13v2" }),
        React.createElement("path", { d: "M9 13v2" }),
      );
    }
    /** AgentsSection implementation. */
    function AgentsSection(props) {
      var React = require("react");
      var h = React.createElement;
      var useState = React.useState,
        useEffect = React.useEffect;
      var listPresets = props.listPresets;
      var state = useState(null);
      var payload = state[0],
        setPayload = state[1];
      var errorState = useState(null);
      var error = errorState[0],
        setError = errorState[1];
      useEffect(
        function () {
          var cancelled = false;
          listPresets()
            .then(function (response) {
              if (cancelled) return;
              if (response.result.ok) {
                setPayload(response.result.value);
              } else {
                setError(response.result.error.message);
              }
            })
            .catch(function (reason) {
              if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
            });
          return function () {
            cancelled = true;
          };
        },
        [listPresets],
      );
      if (error !== null) {
        return h(
          "div",
          { style: { color: "var(--dsw-alias-state-error-primary)" } },
          "Could not read the agent roster: " + error,
        );
      }
      if (payload === null) {
        return h(
          "div",
          { style: { color: "var(--dsw-alias-label-secondary)" } },
          "Loading agents…",
        );
      }
      var presets = payload.presets || [];
      var /** presetRow implementation. */
        presetRow = function (preset) {
          var label = preset.name || preset.id;
          return h(
            "div",
            {
              key: preset.id,
              style: {
                display: "flex",
                alignItems: "center",
                gap: "10px",
                border: "1px solid var(--dsw-alias-border-l2)",
                borderRadius: "10px",
                padding: "12px 14px",
              },
            },
            h(
              "div",
              { style: { display: "grid", gap: "2px", minWidth: "0" } },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "8px" } },
                h("span", { style: { fontWeight: 600, fontSize: "14px" } }, label),
                preset.isDefault
                  ? h(
                      "span",
                      { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
                      "default",
                    )
                  : null,
                h(
                  "span",
                  { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
                  preset.trust,
                ),
              ),
              preset.description
                ? h(
                    "div",
                    { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary)" } },
                    preset.description,
                  )
                : null,
              preset.broken
                ? h(
                    "div",
                    { style: { fontSize: "13px", color: "var(--dsw-alias-state-error-primary)" } },
                    preset.broken,
                  )
                : null,
            ),
          );
        };
      return h(
        "div",
        { style: { display: "grid", gap: "20px", maxWidth: "760px" } },
        h(
          "div",
          null,
          h("h2", { style: { margin: "0 0 6px" } }, "Agents"),
          h(
            "p",
            { style: { margin: 0, color: "var(--dsw-alias-label-secondary)" } },
            "Persona files authored under the agent home are materialized into agent presets the harness roster discovers. This tab shows every preset the deployment composes.",
          ),
        ),
        h("div", { style: { display: "grid", gap: "8px" } }, presets.map(presetRow)),
        h(
          "div",
          { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary)" } },
          presets.length + (presets.length === 1 ? " agent preset" : " agent presets"),
        ),
      );
    }
    /**
     * The composer's active-persona badge: renders the persona in force
     * from the `persona` projection, hidden while the session has none
     * (the plan chip behaves the same for inactive plan mode). Clicking
     * runs `/persona` through the same command the switcher drives.
     */
    function PersonaChip(props) {
      var React = require("react");
      var h = React.createElement;
      var useProjection = props.useProjection;
      var nameFor = props.nameFor;
      var projection = typeof useProjection === "function" ? useProjection("persona") : undefined;
      var personaId =
        projection && typeof projection.personaId === "string" && projection.personaId !== ""
          ? projection.personaId
          : "";
      if (personaId === "") return null;
      var label = typeof nameFor === "function" ? nameFor(personaId) : personaId;
      return h(
        "button",
        {
          type: "button",
          title: "Persona: " + label + (projection.pending ? " (switching)" : ""),
          style: {
            display: "flex",
            alignItems: "center",
            gap: "6px",
            border: "1px solid var(--dsw-alias-border-l2)",
            borderRadius: "999px",
            padding: "2px 10px",
            background: "transparent",
            color: "var(--dsw-alias-label-primary)",
            fontSize: "12px",
            cursor: "default",
          },
        },
        [
          h(
            "svg",
            {
              width: 13,
              height: 13,
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              strokeLinecap: "round",
              strokeLinejoin: "round",
              className: "agents-personaGlyph dsh-icon-animated",
            },
            h("path", { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" }),
            h("circle", { cx: "12", cy: "7", r: "4" }),
          ),
          h(
            "span",
            {
              style: {
                maxWidth: "160px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
            },
            label,
          ),
        ],
      );
    }
    /** apply implementation. */
    function apply(ctx) {
      var roster = { value: null, pending: null };
      var /** ensureRoster implementation. */
        ensureRoster = function () {
          if (roster.value !== null) return Promise.resolve(roster.value);
          if (roster.pending !== null) return roster.pending;
          roster.pending = ctx.connection.api.agentPresets.list({}).then(function (response) {
            var presets = response.result.ok ? response.result.value.presets : [];
            var entries = presets.map(function (preset) {
              return { id: preset.id, label: preset.name || preset.id, detail: preset.description };
            });
            roster.value = entries;
            return entries;
          });
          return roster.pending;
        };
      var /** nameFor implementation. */
        nameFor = function (personaId) {
          var entries = roster.value;
          if (entries === null) return personaId;
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].id === personaId) return entries[i].label;
          }
          return personaId;
        };

      ctx.slots.inject(
        "settings.section",
        () =>
          ctx.slots.register(
            {
              name: "settings.section",
              id: "agents",
              order: 25,
              label: () => "Agents",
              inject: () => ({
                listPresets: () => ctx.connection.api.agentPresets.list({}),
              }),
            },
            AgentsSection,
          ),
        "agents: agents settings section",
      );
      ctx.slots.inject(
        "settings.section.icon",
        () =>
          ctx.slots.register(
            {
              name: "settings.section.icon",
              id: "agents",
              order: 0,
            },
            AgentsGlyph,
          ),
        "agents: agents nav glyph",
      );
      ctx.slots.inject(
        "conversation.input.left",
        () =>
          ctx.slots.register(
            {
              name: "conversation.input.left",
              id: "persona-chip",
              inject: () => ({ nameFor: nameFor }),
            },
            PersonaChip,
          ),
        "agents: persona composer badge",
      );

      ctx.inject(["commandUi", "sessions"], (scope) => {
        var command = scope.get("commandUi");
        var sessions = scope.sessions;
        scope.effect(
          () =>
            command.register({
              name: "persona",
              description: "Switch the active persona",
              ui: {
                kind: "popupSelect",
                options: (session) =>
                  ensureRoster().then(function (entries) {
                    var projection = sessions.get(session.sessionId).projections.get("persona");
                    var current =
                      projection && typeof projection.personaId === "string"
                        ? projection.personaId
                        : "";
                    return entries.map(function (entry) {
                      return {
                        id: entry.id,
                        label: entry.label,
                        ...(entry.detail !== undefined ? { detail: entry.detail } : {}),
                        active: entry.id === current,
                      };
                    });
                  }),
                onSelect: (option, session) =>
                  ctx.remote.commands
                    .execute(session.sessionId, "/persona " + option.id)
                    .then(function (result) {
                      if (!result.ok)
                        throw new Error(result.error.message + " (" + result.error.code + ")");
                    }),
              },
            }),
          "agents: /persona contribution",
        );
      });
    }
    //#endregion
    exports.apply = apply;
    exports.inject = ["slots", "connection", "commandUi", "sessions", "remote"];
    return module.exports;
  },
});

// jscpd:ignore-end
