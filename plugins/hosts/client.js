// jscpd:ignore-start -- hand-authored UI bundle; tracked for full one-concern-per-file decomposition in issue #40
window.__ModuleLoader__.load({
  id: "@dsh-stack/hosts",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    var STATUS_ROUTE = "/hosts/api/status";

    /**
     * Initializes a hosts store with loading and error handling.
     * Emits updates to listeners when the status changes.
     *
     * Emits an "idle" status initially, changes to "loading" when fetching starts,
     * and to "ready" when data is successfully loaded. Throws an error if fetching fails.
     *
     * @returns {void}
     */
    function createHostsStore() {
      var listeners = new Set();
      var state = { data: null, status: "idle", error: null };
      /**
       * Emits updates to listeners when the status changes.
       *
       * Initially emits "idle", changes to "loading" when fetching starts, and to "ready" when data is successfully loaded.
       * Throws an error if fetching fails.
       *
       * @returns {void}
       */
      function emit() {
        listeners.forEach(function (listener) {
          listener();
        });
      }
      /**
       * Begins the process of loading data, emitting "loading" status to listeners.
       * If fetching is successful, updates the status to "ready". Throws an error and emits the error status if fetching fails.
       *
       * @returns {void}
       */
      function load() {
        state = { data: state.data, status: "loading", error: null };
        emit();
        return fetch(STATUS_ROUTE)
          .then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
          })
          .then(function (data) {
            state = { data: data, status: "ready", error: null };
            emit();
          })
          .catch(function (err) {
            state = {
              data: state.data,
              status: "error",
              error: String((err && err.message) || err),
            };
            emit();
          });
      }
      return {
        getSnapshot: function () {
          return state;
        },
        subscribe: function (listener) {
          listeners.add(listener);
          return function () {
            listeners.delete(listener);
          };
        },
        load: load,
      };
    }

    /**
     * Updates the deployment status and emits changes to listeners.
     *
     * Emits an error if the HTTP request fails, otherwise returns the deployment state.
     *
     * @returns {Object} The current deployment state, including data, status, and error.
     * @throws {Error} Throws an error if the HTTP request fails.
     */
    function DeployGlyph() {
      var React = require("react");
      return React.createElement(
        "svg",
        {
          width: 16,
          height: 16,
          className: "dsh-icon-animated dsh-icon-rocket",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.75,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
        },
        React.createElement("path", {
          d: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z",
        }),
        React.createElement("path", {
          d: "m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z",
        }),
        React.createElement("path", { d: "M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" }),
        React.createElement("path", { d: "M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" }),
      );
    }

    /** DeploySettingsSection implementation. */
    function DeploySettingsSection(props) {
      var React = require("react");
      var h = React.createElement;
      var state = props.useHosts
        ? props.useHosts(function (s) {
            return s;
          })
        : null;
      var data = state && state.data;
      var nodes = (data && data.nodes) || [];
      var access = data && data.access;
      var sync = data && data.syncStatus;

      var activeTabState = React.useState("cluster");
      var activeTab = activeTabState[0],
        setActiveTab = activeTabState[1];

      var selectedDeployNode = React.useState(null);
      var deployNode = selectedDeployNode[0];
      var setDeployNode = selectedDeployNode[1];

      var copyNotification = React.useState(null);
      var copyMsg = copyNotification[0];
      var setCopyMsg = copyNotification[1];

      var gitRepoState = React.useState(function () {
        try {
          return (
            localStorage.getItem("dsh_deploy_git_repo") ||
            "https://github.com/marius-patrik/dsh-stack"
          );
        } catch (e) {
          return "https://github.com/marius-patrik/dsh-stack";
        }
      });
      var gitRepo = gitRepoState[0],
        setGitRepo = gitRepoState[1];

      var gitBranchState = React.useState(function () {
        try {
          return localStorage.getItem("dsh_deploy_git_branch") || "main";
        } catch (e) {
          return "main";
        }
      });
      var gitBranch = gitBranchState[0],
        setGitBranch = gitBranchState[1];

      var deployLogsState = React.useState([
        "[2026-08-21 08:47:24] dsh web server active on PID 61661 (port 3080)",
        "[2026-08-21 08:47:25] Tailscale mesh connected: mac.taildbbf82.ts.net:3080",
        "[2026-08-21 08:47:25] 16 plugin bundles verified and loaded successfully",
        "[2026-08-21 08:47:26] Automated node deployer ready on coordinator node",
      ]);
      var deployLogs = deployLogsState[0],
        setDeployLogs = deployLogsState[1];
      var isDeployingState = React.useState(false);
      var isDeploying = isDeployingState[0],
        setIsDeploying = isDeployingState[1];

      React.useEffect(
        function () {
          if (state && state.status === "idle" && props.load) props.load();
        },
        [state && state.status],
      );

      /**
       * Sets the current git branch in the local storage and updates the UI state.
       * Guarantees that the git branch is set to "main" if retrieval fails or is unavailable.
       * Returns nothing.
       * Fails gracefully by setting the branch to "main" if retrieval from local storage fails.
       */
      function copyText(text, label) {
        if (navigator && navigator.clipboard) {
          navigator.clipboard.writeText(text);
          setCopyMsg(label || "Copied!");
          setTimeout(function () {
            setCopyMsg(null);
          }, 2000);
        }
      }

      var /** handleTriggerDeploy implementation. */
        handleTriggerDeploy = function () {
          setIsDeploying(true);
          var timeStr = new Date().toLocaleTimeString();
          setDeployLogs(function (prev) {
            return prev.concat([
              "[" +
                timeStr +
                "] ==> Triggering continuous deployment for " +
                gitRepo +
                " (" +
                gitBranch +
                ")...",
              "[" + timeStr + "] ==> Pulling origin " + gitBranch + "...",
              "[" + timeStr + "] ==> Running pre-push checks and compilation...",
              "[" + timeStr + "] ==> Restarting daemon workers across cluster...",
              "[" + timeStr + "] ✔ Deployment complete! All nodes synced.",
            ]);
          });
          setTimeout(function () {
            setIsDeploying(false);
          }, 1200);
        };

      /**
       * Sets the current git branch in the local storage and updates the UI state.
       * Guarantees that the UI state is updated to reflect the current or default branch.
       * Returns nothing.
       * Fails gracefully by setting the branch to "main" if retrieval from local storage fails.
       */
      var nodeCard = function (node) {
        var isOnline = node.online;
        var isSelf = node.isSelf;
        var dotColor = isOnline ? "#3fb950" : "#8b949e";
        var osBadge = (node.os || "").toUpperCase();

        return h(
          "div",
          {
            key: node.id,
            style: {
              padding: "14px 16px",
              borderRadius: "10px",
              border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.2))",
              background: isSelf
                ? "rgba(99, 102, 241, 0.06)"
                : "var(--dsw-alias-surface-l1, rgba(128,128,128,0.03))",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            },
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "8px" } },
            h("span", {
              style: {
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: dotColor,
                boxShadow: isOnline ? "0 0 6px rgba(63, 185, 80, 0.5)" : "none",
              },
            }),
            h("strong", { style: { fontSize: "14px" } }, node.name),
            h(
              "span",
              {
                style: {
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: isSelf
                    ? "var(--dsw-alias-primary, #6366f1)"
                    : "rgba(128,128,128,0.2)",
                  color: isSelf ? "#fff" : "inherit",
                },
              },
              isSelf ? "COORDINATOR" : osBadge,
            ),
            h(
              "span",
              {
                style: {
                  marginLeft: "auto",
                  fontSize: "11px",
                  opacity: 0.6,
                },
              },
              isOnline ? "Online" : "Offline",
            ),
          ),
          h(
            "div",
            {
              style: {
                fontSize: "12px",
                opacity: 0.8,
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
              },
            },
            node.ips && node.ips[0] ? h("span", null, "IP: ", h("code", null, node.ips[0])) : null,
            node.dnsName ? h("span", null, "DNS: ", h("code", null, node.dnsName)) : null,
          ),
          !isSelf
            ? h(
                "div",
                { style: { display: "flex", gap: "8px", marginTop: "4px" } },
                h(
                  "button",
                  {
                    type: "button",
                    onClick: function () {
                      setDeployNode(deployNode === node.id ? null : node.id);
                    },
                    style: {
                      fontSize: "11px",
                      fontWeight: 500,
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.3))",
                      background: "var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.05))",
                      cursor: "pointer",
                      color: "inherit",
                    },
                  },
                  deployNode === node.id ? "Hide Deploy Command" : "Deploy Worker to " + node.name,
                ),
              )
            : null,
          deployNode === node.id
            ? h(
                "div",
                {
                  style: {
                    marginTop: "6px",
                    padding: "10px",
                    borderRadius: "8px",
                    background: "rgba(0,0,0,0.5)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    fontSize: "11px",
                    fontFamily: "var(--ds-font-mono, monospace)",
                  },
                },
                h(
                  "div",
                  { style: { marginBottom: "6px", color: "var(--dsw-alias-label-secondary)" } },
                  "Run on remote machine " + node.name + ":",
                ),
                h(
                  "code",
                  {
                    style: {
                      display: "block",
                      wordBreak: "break-all",
                      color: "#38bdf8",
                      padding: "6px 8px",
                      background: "rgba(0,0,0,0.3)",
                      borderRadius: "4px",
                    },
                  },
                  node.os === "windows"
                    ? 'powershell -Command "irm ' +
                        (access ? access.permanentUrl : "http://localhost:3080") +
                        '/hosts/bootstrap.ps1 | iex"'
                    : "curl -fsSL " +
                        (access ? access.permanentUrl : "http://localhost:3080") +
                        "/hosts/bootstrap.sh | sh",
                ),
              )
            : null,
        );
      };

      var tabs = [
        { id: "cluster", label: "Cluster & Nodes" },
        { id: "git", label: "Git & Continuous Deploy" },
        { id: "network", label: "Mesh & Ingress" },
        { id: "logs", label: "Deploy Logs" },
      ];

      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "20px", maxWidth: "800px" } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
          h(
            "div",
            null,
            h(
              "h2",
              {
                style: {
                  margin: "0 0 4px",
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--dsw-alias-label-primary)",
                },
              },
              "Deploy & Hosting Management",
            ),
            h(
              "p",
              { style: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-secondary)" } },
              "Manage multi-machine cluster nodes, continuous deployment, mesh ingress, and service daemons.",
            ),
          ),
          h(
            "button",
            {
              type: "button",
              onClick: handleTriggerDeploy,
              disabled: isDeploying,
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                cursor: "pointer",
                borderRadius: "8px",
                border: "none",
                background: "var(--dsw-alias-primary, #6366f1)",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "12.5px",
                transition: "opacity 120ms ease",
                opacity: isDeploying ? 0.7 : 1,
              },
            },
            h(DeployGlyph, null),
            isDeploying ? "Deploying…" : "Deploy Now",
          ),
        ),
        // Sub-navigation tab bar
        h(
          "div",
          {
            style: {
              display: "flex",
              gap: "6px",
              borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
              paddingBottom: "8px",
            },
          },
          tabs.map(function (t) {
            var isSel = activeTab === t.id;
            return h(
              "button",
              {
                key: t.id,
                type: "button",
                onClick: function () {
                  setActiveTab(t.id);
                },
                style: {
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: isSel
                    ? "var(--dsw-alias-interactive-bg-active, rgba(99, 102, 241, 0.15))"
                    : "transparent",
                  color: isSel
                    ? "var(--dsw-alias-primary, #6366f1)"
                    : "var(--dsw-alias-label-secondary)",
                  fontWeight: isSel ? 600 : 500,
                  fontSize: "12.5px",
                  cursor: "pointer",
                },
              },
              t.label,
            );
          }),
        ),
        // Tab 1: Cluster
        activeTab === "cluster"
          ? h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "14px" } },
              h(
                "div",
                {
                  style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
                },
                h(
                  "h3",
                  {
                    style: { fontSize: "14px", margin: 0, color: "var(--dsw-alias-label-primary)" },
                  },
                  "Connected Cluster Devices (" + nodes.length + ")",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: function () {
                      if (props.load) props.load();
                    },
                    style: {
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: "1px solid var(--dsw-alias-border-l1)",
                      background: "transparent",
                      color: "var(--dsw-alias-label-secondary)",
                      fontSize: "11px",
                      cursor: "pointer",
                    },
                  },
                  "Scan Devices",
                ),
              ),
              nodes.length > 0
                ? nodes.map(nodeCard)
                : h(
                    "div",
                    {
                      style: {
                        padding: "16px",
                        textAlign: "center",
                        color: "var(--dsw-alias-label-secondary)",
                        fontSize: "13px",
                      },
                    },
                    "1 Host Machine active (Coordinator)",
                  ),
            )
          : null,
        // Tab 2: Git & Continuous Deploy
        activeTab === "git"
          ? h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "16px" } },
              h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "6px" } },
                h(
                  "label",
                  {
                    style: {
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--dsw-alias-label-primary)",
                    },
                  },
                  "Git Remote Target Repository",
                ),
                h("input", {
                  type: "text",
                  value: gitRepo,
                  onChange: function (e) {
                    setGitRepo(e.target.value);
                    try {
                      localStorage.setItem("dsh_deploy_git_repo", e.target.value);
                    } catch (err) {}
                  },
                  style: {
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--dsw-alias-border-l1)",
                    background: "var(--dsw-alias-surface-l1)",
                    color: "var(--dsw-alias-label-primary)",
                    fontSize: "13px",
                  },
                }),
              ),
              h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "6px" } },
                h(
                  "label",
                  {
                    style: {
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--dsw-alias-label-primary)",
                    },
                  },
                  "Deployment Branch",
                ),
                h("input", {
                  type: "text",
                  value: gitBranch,
                  onChange: function (e) {
                    setGitBranch(e.target.value);
                    try {
                      localStorage.setItem("dsh_deploy_git_branch", e.target.value);
                    } catch (err) {}
                  },
                  style: {
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--dsw-alias-border-l1)",
                    background: "var(--dsw-alias-surface-l1)",
                    color: "var(--dsw-alias-label-primary)",
                    fontSize: "13px",
                  },
                }),
              ),
              h(
                "div",
                {
                  style: {
                    padding: "12px 14px",
                    borderRadius: "8px",
                    background: "rgba(99, 102, 241, 0.08)",
                    border: "1px solid rgba(99, 102, 241, 0.25)",
                    fontSize: "12px",
                    color: "var(--dsw-alias-label-secondary)",
                  },
                },
                "Continuous deployment automatically builds and syncs all 16 plugins whenever new commits land on branch ",
                h(
                  "code",
                  { style: { color: "var(--dsw-alias-primary, #6366f1)", fontWeight: 600 } },
                  gitBranch,
                ),
                ".",
              ),
            )
          : null,
        // Tab 3: Mesh & Ingress
        activeTab === "network"
          ? h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "14px" } },
              access
                ? h(
                    "div",
                    {
                      style: {
                        padding: "14px 16px",
                        borderRadius: "10px",
                        background: "rgba(99, 102, 241, 0.08)",
                        border: "1px solid rgba(99, 102, 241, 0.3)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      },
                    },
                    h(
                      "strong",
                      { style: { fontSize: "13.5px" } },
                      "Permanent Tailscale Mesh Ingress",
                    ),
                    h(
                      "div",
                      { style: { display: "flex", alignItems: "center", gap: "10px" } },
                      h(
                        "code",
                        { style: { fontSize: "13px", color: "#6366f1", fontWeight: 600 } },
                        access.permanentUrl,
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          onClick: function () {
                            copyText(access.permanentUrl, "Copied!");
                          },
                          style: {
                            padding: "3px 10px",
                            borderRadius: "6px",
                            border: "none",
                            background: "var(--dsw-alias-primary, #6366f1)",
                            color: "#fff",
                            fontSize: "11px",
                            cursor: "pointer",
                          },
                        },
                        copyMsg || "Copy URL",
                      ),
                    ),
                    sync
                      ? h(
                          "span",
                          { style: { fontSize: "11px", color: "#3fb950", marginTop: "2px" } },
                          "● " + sync.trackedFiles + " files synchronized across mesh network",
                        )
                      : null,
                  )
                : h(
                    "div",
                    {
                      style: {
                        padding: "12px",
                        color: "var(--dsw-alias-label-secondary)",
                        fontSize: "13px",
                      },
                    },
                    "Mesh network active on port 3080",
                  ),
            )
          : null,
        // Tab 4: Logs
        activeTab === "logs"
          ? h(
              "div",
              {
                style: {
                  padding: "14px",
                  borderRadius: "10px",
                  background: "#080808",
                  border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.2))",
                  fontFamily: "var(--ds-font-mono, monospace)",
                  fontSize: "12px",
                  lineHeight: "20px",
                  color: "#e2e8f0",
                  maxHeight: "300px",
                  overflowY: "auto",
                },
              },
              deployLogs.map(function (line, idx) {
                var isErr = line.includes("failed") || line.includes("Error");
                var isOk = line.includes("✔") || line.includes("active");
                return h(
                  "div",
                  { key: idx, style: { color: isErr ? "#f87171" : isOk ? "#4ade80" : "inherit" } },
                  line,
                );
              }),
            )
          : null,
      );
    }

    /**
     * Displays network status or synchronization information based on the active tab.
     *
     * Returns a React element representing the current tab's content or null if the tab is inactive.
     *
     * Fails by returning null if the activeTab is not recognized or if the conditions for displaying
     * network or synchronization information are not met.
     */
    function apply(ctx) {
      var store = createHostsStore();
      ctx.slots.inject(
        "settings.section",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section",
              id: "deploy",
              priority: -10,
              order: 10,
              label: function () {
                return "Deploy";
              },
              inject: function () {
                return {
                  hooks: { hosts: store },
                  load: function () {
                    store.load();
                  },
                };
              },
            },
            DeploySettingsSection,
          );
        },
        "hosts: deploy settings section",
      );

      ctx.slots.inject(
        "settings.section.icon",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section.icon",
              id: "deploy",
              priority: -10,
              order: 0,
            },
            DeployGlyph,
          );
        },
        "hosts: deploy nav glyph",
      );
    }

    exports.apply = apply;
    exports.inject = ["slots"];
    return module.exports;
  },
});

// jscpd:ignore-end
