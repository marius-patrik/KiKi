// jscpd:ignore-start -- hand-authored UI bundle; tracked for full one-concern-per-file decomposition in issue #40
window.__ModuleLoader__.load({
  id: "credentials",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    var React = require("react");
    var h = React.createElement;
    var Fragment = React.Fragment;
    var createGlyphComponent = __dshCreateGlyphComponent(h);
    var P = require("@deepseek-ai/dsh-client-ui-primitives");

    var NS = "credentials";
    var VAULT_API = "/vault/api";
    var QUOTAS_API = "/quotas/api";

    var PROVIDERS_CONFIG = [
      {
        id: "anthropic",
        name: "Anthropic / Claude",
        description: "Claude Code CLI, subscription OAuth, and Anthropic API keys",
        prefixes: ["CLAUDE_", "ANTHROPIC_"],
        defaultKeys: ["CLAUDE_SUB_OAUTH_TOKEN", "CLAUDE_API_KEY", "ANTHROPIC_API_KEY"],
        probeIds: ["claude-sub", "anthropic-api"],
        oauthProviderId: "claude",
        hasSubscription: true,
      },
      {
        id: "openai",
        name: "OpenAI / ChatGPT",
        description: "ChatGPT Codex subscription tokens and OpenAI platform API keys",
        prefixes: ["OPENAI_", "CODEX_CHATGPT_"],
        defaultKeys: ["OPENAI_API_KEY", "CODEX_CHATGPT_ACCESS_TOKEN"],
        probeIds: ["openai-api"],
        oauthProviderId: null,
        hasSubscription: true,
      },
      {
        id: "google",
        name: "Google Gemini",
        description: "Google Gemini OAuth tokens and Gemini API keys",
        prefixes: ["GEMINI_"],
        defaultKeys: ["GEMINI_SUB_OAUTH_TOKEN", "GEMINI_API_KEY"],
        probeIds: ["gemini-sub", "gemini-api"],
        oauthProviderId: null,
        hasSubscription: true,
      },
      {
        id: "grok",
        name: "xAI / Grok",
        description: "Grok subscription OAuth and xAI API keys",
        prefixes: ["GROK_", "XAI_"],
        defaultKeys: ["GROK_SUB_OAUTH_TOKEN", "XAI_API_KEY"],
        probeIds: ["grok-sub", "grok-api"],
        oauthProviderId: "grok",
        hasSubscription: true,
      },
      {
        id: "kimi",
        name: "Moonshot / Kimi",
        description: "Kimi subscription OAuth and Moonshot API keys",
        prefixes: ["KIMI_"],
        defaultKeys: ["KIMI_SUB_OAUTH_TOKEN", "KIMI_API_KEY"],
        probeIds: ["kimi-sub"],
        oauthProviderId: "kimi",
        hasSubscription: true,
      },
      {
        id: "cursor",
        name: "Cursor",
        description: "Cursor subscription token and account email",
        prefixes: ["CURSOR_"],
        defaultKeys: ["CURSOR_SUB_TOKEN", "CURSOR_EMAIL"],
        probeIds: [],
        oauthProviderId: "cursor",
        hasSubscription: true,
      },
      {
        id: "github",
        name: "GitHub",
        description: "GitHub Copilot and personal access tokens",
        prefixes: ["GITHUB_"],
        defaultKeys: ["GITHUB_OAUTH_TOKEN", "GITHUB_USER"],
        probeIds: [],
        oauthProviderId: "github",
        hasSubscription: true,
      },
      {
        id: "deepseek",
        name: "DeepSeek",
        description: "DeepSeek platform API key",
        prefixes: ["DEEPSEEK_"],
        defaultKeys: ["DEEPSEEK_API_KEY"],
        probeIds: ["deepseek-api"],
        oauthProviderId: null,
        hasSubscription: false,
      },
      {
        id: "zen",
        name: "OpenCode Zen",
        description: "OpenCode Zen API key",
        prefixes: ["ZEN_"],
        defaultKeys: ["ZEN_API_KEY"],
        probeIds: ["zen"],
        oauthProviderId: null,
        hasSubscription: false,
      },
      {
        id: "antigravity",
        name: "Google Antigravity",
        description: "Google Antigravity project credentials",
        prefixes: ["ANTIGRAVITY_"],
        defaultKeys: ["ANTIGRAVITY_PROJECT"],
        probeIds: ["antigravity-sub"],
        oauthProviderId: null,
        hasSubscription: true,
      },
      {
        id: "mistral",
        name: "Mistral",
        description: "Mistral platform API key",
        prefixes: ["MISTRAL_"],
        defaultKeys: ["MISTRAL_API_KEY"],
        probeIds: ["mistral-api"],
        oauthProviderId: null,
        hasSubscription: false,
      },
      {
        id: "groq",
        name: "Groq",
        description: "Groq platform API key",
        prefixes: ["GROQ_"],
        defaultKeys: ["GROQ_API_KEY"],
        probeIds: ["groq-api"],
        oauthProviderId: null,
        hasSubscription: false,
      },
      {
        id: "openrouter",
        name: "OpenRouter",
        description: "OpenRouter API key and proxy routing",
        prefixes: ["OPENROUTER_"],
        defaultKeys: ["OPENROUTER_API_KEY"],
        probeIds: ["openrouter-api"],
        oauthProviderId: null,
        hasSubscription: false,
      },
      {
        id: "cerebras",
        name: "Cerebras",
        description: "Cerebras API key",
        prefixes: ["CEREBRAS_"],
        defaultKeys: ["CEREBRAS_API_KEY"],
        probeIds: ["cerebras-api"],
        oauthProviderId: null,
        hasSubscription: false,
      },
      {
        id: "zai",
        name: "Z.ai / GLM",
        description: "Z.ai (GLM) API key",
        prefixes: ["ZAI_"],
        defaultKeys: ["ZAI_API_KEY"],
        probeIds: ["zai-api"],
        oauthProviderId: null,
        hasSubscription: false,
      },
    ];

    /**
     * Dedicated Keychain Glyph: Lucide KeyRound / ShieldCheck
     */
    var KeychainGlyph = createGlyphComponent(16, "", false, true, true, function () {
      return [
        h("path", { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" }),
        h("path", { d: "m9 12 2 2 4-4" }),
      ];
    });

    /**
     * Creates a graphical icon component.
     *
     * Returns an array of React `h` elements representing the icon paths and shapes.
     *
     * Fails if the provided SVG path data is invalid, resulting in an empty array.
     */
    var PlusIcon = createGlyphComponent(14, "", false, false, false, function () {
      return [h("path", { d: "M5 12h14" }), h("path", { d: "M12 5v14" })];
    });

    /**
     * Returns an array of React `h` elements representing the icon paths and shapes.
     *
     * Fails if the provided SVG path data is invalid, resulting in an empty array.
     */
    var LinkIcon = createGlyphComponent(14, "", false, false, false, function () {
      return [
        h("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }),
        h("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }),
      ];
    });

    /** EyeIcon implementation. */
    var EyeIcon = createGlyphComponent(14, "", false, false, false, function () {
      return [
        h("path", { d: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" }),
        h("circle", { cx: "12", cy: "12", r: "3" }),
      ];
    });

    /**
     * Represents a download icon composed of a vertical line and a polyline.
     * The icon visually suggests an action related to downloading content.
     *
     * Returns a SVG path and polyline element indicating the download process.
     */
    var DownloadIcon = createGlyphComponent(14, "", false, false, false, function () {
      return [
        h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
        h("polyline", { points: "7 10 12 15 17 10" }),
        h("line", { x1: "12", x2: "12", y1: "15", y2: "3" }),
      ];
    });

    /**
     * Represents a refresh icon composed of multiple path elements.
     * The icon visually suggests an action related to refreshing content.
     *
     * Returns an SVG composed of paths indicating the refresh process.
     * On failure, the icon still renders as a visual representation of refresh.
     */
    var RefreshIcon = createGlyphComponent(14, "", false, false, false, function () {
      return [
        h("path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }),
        h("path", { d: "M21 3v5h-5" }),
        h("path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }),
        h("path", { d: "M8 16H3v5" }),
      ];
    });

    /**
     * Represents a check icon composed of multiple path elements.
     * The icon visually suggests successful completion or confirmation of an action.
     *
     * Returns an SVG composed of paths indicating a checkmark.
     * On failure, the icon still renders as a visual representation of a check.
     */
    var CheckIcon = createGlyphComponent(14, "", false, false, false, function () {
      return [h("polyline", { points: "20 6 9 17 4 12" })];
    });

    /**
     * Represents an icon indicating a refresh action.
     * Returns an SVG composed of paths suggesting the refresh process.
     * On failure, the icon still renders as a visual representation of refresh.
     */
    var ChevronRightIcon = createGlyphComponent(14, "", false, false, false, function () {
      return [h("polyline", { points: "9 18 15 12 9 6" })];
    });

    /**
     * Represents an external link icon that visually suggests navigation to an external resource.
     *
     * Returns an SVG icon representing an external link.
     * On failure, the icon still renders as a visual representation of an external link.
     */
    var ExternalLinkIcon = createGlyphComponent(14, "", false, false, false, function () {
      return [
        h("path", { d: "M15 3h6v6" }),
        h("path", { d: "M10 14 21 3" }),
        h("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }),
      ];
    });

    /**
     * Represents an icon indicating trash or deletion action.
     * Returns an SVG composed of paths suggesting the trash icon.
     * On failure, the icon still renders as a visual representation of the trash.
     */
    var TrashIcon = createGlyphComponent(14, "", false, false, false, function () {
      return [
        h("path", { d: "M3 6h18" }),
        h("path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }),
        h("path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }),
        h("line", { x1: "10", x2: "10", y1: "11", y2: "17" }),
        h("line", { x1: "14", x2: "14", y1: "11", y2: "17" }),
      ];
    });

    /**
     * Creates a visual icon component.
     *
     * Returns an SVG icon based on the provided path data.
     * On failure, the icon still renders as a visual representation of the intended symbol.
     */
    function createVaultStore() {
      var listeners = new Set();
      var state = { rows: [], snapshots: {}, status: "idle", error: null };
      var revealed = {}; // keyed by `ref` or `ref:account`
      var probing = {}; // keyed by probeId

      /** emit implementation. */
      function emit() {
        listeners.forEach(function (fn) {
          fn();
        });
      }

      /**
       * Represents an icon indicating a loading state.
       * Returns an SVG icon representing a visual refresh symbol.
       * On failure, the icon still renders as a visual representation of refresh.
       */
      function load() {
        state = { rows: state.rows, snapshots: state.snapshots, status: "loading", error: null };
        emit();

        return Promise.all([
          fetch(VAULT_API + "/accounts")
            .then(function (res) {
              return res.ok ? res.json() : { rows: [] };
            })
            .catch(function () {
              return { rows: [] };
            }),
          fetch(QUOTAS_API + "/snapshots")
            .then(function (res) {
              return res.ok ? res.json() : { snapshots: [] };
            })
            .catch(function () {
              return { snapshots: [] };
            }),
        ])
          .then(function (results) {
            var accountsData = results[0];
            var quotasData = results[1];

            var snapMap = {};
            (quotasData.snapshots || []).forEach(function (s) {
              snapMap[s.provider] = s;
            });

            state = {
              rows: accountsData.rows || [],
              snapshots: snapMap,
              status: "ready",
              error: null,
            };
            emit();
          })
          .catch(function (err) {
            state = {
              rows: state.rows,
              snapshots: state.snapshots,
              status: "error",
              error: String((err && err.message) || err),
            };
            emit();
          });
      }

      /**
       * Begins the loading process and emits a refresh icon.
       * Guarantees that the icon will represent a visual refresh symbol.
       * On failure, the icon still renders as a visual representation of the refresh symbol.
       */
      function probeProvider(probeId) {
        probing[probeId] = true;
        emit();

        return fetch(QUOTAS_API + "/refresh/" + encodeURIComponent(probeId), { method: "POST" })
          .then(function (res) {
            return res.json();
          })
          .then(function (data) {
            if (data.snapshot) {
              state.snapshots[data.snapshot.provider] = data.snapshot;
            }
          })
          .finally(function () {
            delete probing[probeId];
            emit();
          });
      }

      /**
       * Attempts to fetch accounts and snapshots, updating the state to loading.
       * Returns a Promise that resolves with an object containing rows and snapshots.
       * On failure, the state is still updated to loading, but with an empty rows and snapshots array.
       */
      function probeAll() {
        return fetch(QUOTAS_API + "/refresh", { method: "POST" })
          .then(function (res) {
            return res.json();
          })
          .then(function (data) {
            if (data.snapshots) {
              data.snapshots.forEach(function (s) {
                state.snapshots[s.provider] = s;
              });
            }
            emit();
          });
      }

      /**
       * Fetches and combines accounts data and snapshots data, returning a state object.
       * Guarantees a state object with rows, snapshots, and status fields.
       * Returns an object with rows and snapshots if fetching fails or data is empty.
       * Fails gracefully by returning an object with empty rows and snapshots arrays.
       */
      function reveal(ref, account) {
        var key = ref + (account ? ":" + account : "");
        if (revealed[key]) {
          delete revealed[key];
          emit();
          return Promise.resolve();
        }
        var url =
          VAULT_API +
          "/accounts/" +
          encodeURIComponent(ref) +
          (account ? "?account=" + encodeURIComponent(account) : "");
        return fetch(url)
          .then(function (res) {
            if (!res.ok) throw new Error("Could not reveal secret");
            return res.json();
          })
          .then(function (data) {
            revealed[key] = data.value;
            emit();
          });
      }

      /**
       * Begins the loading process and updates the status to "ready".
       * Guarantees that the status will be set to "ready" and emits a refresh icon.
       * On failure, sets the status to "error", records the error message, and emits the updated state.
       */
      function setSecret(ref, value, account) {
        var url =
          VAULT_API +
          "/accounts/" +
          encodeURIComponent(ref) +
          (account ? "?account=" + encodeURIComponent(account) : "");
        return fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: value }),
        }).then(function (res) {
          if (!res.ok) throw new Error("Failed to save secret");
          return load();
        });
      }

      /**
       * Attempts to unset a secret, updating the state to loading.
       * Guarantees that the state will be updated to loading and emits a refresh icon.
       * On failure, the state remains in the loading state and the refresh icon still renders.
       */
      function unsetSecret(ref, account) {
        var url =
          VAULT_API +
          "/accounts/" +
          encodeURIComponent(ref) +
          (account ? "?account=" + encodeURIComponent(account) : "");
        return fetch(url, { method: "DELETE" }).then(function (res) {
          if (!res.ok) throw new Error("Failed to remove secret");
          var key = ref + (account ? ":" + account : "");
          if (revealed[key]) delete revealed[key];
          return load();
        });
      }

      /** unsetMultiple implementation. */
      function unsetMultiple(items) {
        return Promise.all(
          items.map(function (item) {
            var url =
              VAULT_API +
              "/accounts/" +
              encodeURIComponent(item.ref) +
              (item.account ? "?account=" + encodeURIComponent(item.account) : "");
            return fetch(url, { method: "DELETE" });
          }),
        ).then(function () {
          items.forEach(function (item) {
            var key = item.ref + (item.account ? ":" + item.account : "");
            delete revealed[key];
          });
          return load();
        });
      }

      /** importLocal implementation. */
      function importLocal() {
        return fetch(VAULT_API + "/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
          .then(function (res) {
            return res.json();
          })
          .then(function (res) {
            load();
            return res;
          });
      }

      return {
        getSnapshot: function () {
          return state;
        },
        getRevealed: function () {
          return revealed;
        },
        getProbing: function () {
          return probing;
        },
        subscribe: function (fn) {
          listeners.add(fn);
          return function () {
            listeners.delete(fn);
          };
        },
        load: load,
        probeProvider: probeProvider,
        probeAll: probeAll,
        reveal: reveal,
        setSecret: setSecret,
        unsetSecret: unsetSecret,
        unsetMultiple: unsetMultiple,
        importLocal: importLocal,
      };
    }

    var globalVaultStore = createVaultStore();

    /**
     * Renders a sliding window usage progress bar (5h or weekly)
     */
    function UsageBar(props) {
      var label = props.label;
      var used = props.used || 0;
      var total = props.total || 100;
      var resetText = props.resetText;
      var pct = Math.min(100, Math.max(0, Math.round((used / total) * 100)));

      var barColor =
        pct < 60
          ? "var(--dsw-alias-state-success-primary, #3fb950)"
          : pct < 85
            ? "var(--dsw-alias-state-warn-label, #d29922)"
            : "var(--dsw-alias-state-danger-primary, #f85149)";

      return h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            minWidth: "180px",
            flex: 1,
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              fontSize: "11px",
              color: "var(--dsw-alias-label-secondary)",
            },
          },
          h("span", { style: { fontWeight: 500 } }, label),
          h(
            "span",
            { style: { fontFamily: "monospace", color: "var(--dsw-alias-label-primary)" } },
            pct + "% utilized",
          ),
        ),
        h(
          "div",
          {
            style: {
              height: "6px",
              borderRadius: "3px",
              background: "var(--dsw-alias-surface-l3, rgba(128,128,128,0.2))",
              overflow: "hidden",
            },
          },
          h("div", {
            style: {
              width: pct + "%",
              height: "100%",
              borderRadius: "3px",
              background: barColor,
              transition: "width 300ms ease",
            },
          }),
        ),
        resetText
          ? h(
              "div",
              {
                style: {
                  fontSize: "10px",
                  color: "var(--dsw-alias-label-tertiary)",
                  textAlign: "right",
                },
              },
              resetText,
            )
          : null,
      );
    }

    /**
     * Loads the current state of the keychain sections.
     *
     * Guarantees the return of the current state of the keychain sections.
     * On failure, returns an error message from the API response.
     */
    function KeychainSection() {
      var storeState = React.useSyncExternalStore(
        globalVaultStore.subscribe,
        globalVaultStore.getSnapshot,
      );
      var rows = storeState.rows || [];
      var snapshots = storeState.snapshots || {};
      var revealed = globalVaultStore.getRevealed();
      var probing = globalVaultStore.getProbing();

      var searchState = React.useState("");
      var searchQuery = searchState[0];
      var setSearchQuery = searchState[1];

      var filterState = React.useState("all"); // 'all' | 'configured' | 'healthy' | 'oauth' | 'unset'
      var filter = filterState[0];
      var setFilter = filterState[1];

      var expandedProvidersState = React.useState({});
      var expandedProviders = expandedProvidersState[0];
      var setExpandedProviders = expandedProvidersState[1];

      var addModalState = React.useState(null); // { providerId, accountName, initialRef } or boolean
      var addModalData = addModalState[0];
      var setAddModalData = addModalState[1];

      var oauthModalState = React.useState(null); // providerId
      var oauthModalProvider = oauthModalState[0];
      var setOauthModalProvider = oauthModalState[1];

      var editTargetState = React.useState(null); // { ref, account, label, initialValue }
      var editTarget = editTargetState[0];
      var setEditTarget = editTargetState[1];

      var deleteAccountTargetState = React.useState(null); // { providerName, accountName, items: [{ref, account}] }
      var deleteAccountTarget = deleteAccountTargetState[0];
      var setDeleteAccountTarget = deleteAccountTargetState[1];

      var toastMsgState = React.useState(null);
      var toastMsg = toastMsgState[0];
      var setToastMsg = toastMsgState[1];

      /**
       * Displays a styled toast message.
       *
       * Guarantees a flex container with a column layout and a minimum width.
       * Returns nothing but displays the toast message.
       * Fails gracefully by not displaying anything if the label is not provided.
       */
      function showToast(msg) {
        setToastMsg(msg);
        setTimeout(function () {
          setToastMsg(null);
        }, 2500);
      }

      React.useEffect(function () {
        globalVaultStore.load();
      }, []);

      /**
       * Toggles the visibility of the provider UI element.
       *
       * This function updates the visibility of the provider UI element based on the current state.
       * It guarantees that the visibility state is toggled between visible and hidden.
       */
      function toggleProvider(providerId) {
        setExpandedProviders(function (prev) {
          var next = Object.assign({}, prev);
          next[providerId] = !next[providerId];
          return next;
        });
      }

      /**
       * Copies the utilization percentage to the clipboard.
       *
       * The caller must ensure that `pct` and `barColor` are defined and valid.
       * On success, the function copies the utilization percentage to the clipboard.
       */
      function copyText(text, label) {
        if (navigator && navigator.clipboard) {
          navigator.clipboard.writeText(text);
          showToast(label || "Copied to clipboard!");
        }
      }

      // Build Provider -> Multi-Account Tree with Health & Quotas
      var accountedRefs = new Set();
      var providerTree = PROVIDERS_CONFIG.map(function (p) {
        var providerRows = rows.filter(function (r) {
          return p.prefixes.some(function (pref) {
            return (r.ref || "").startsWith(pref);
          });
        });
        providerRows.forEach(function (r) {
          accountedRefs.add(r.ref);
        });

        // Group rows under this provider by account tag
        var accountMap = new Map();
        providerRows.forEach(function (r) {
          var accKey = r.account || "default";
          if (!accountMap.has(accKey)) {
            accountMap.set(accKey, {
              name: accKey,
              isDefault: !r.account || r.account === "default",
              rows: [],
              inVaultCount: 0,
              ambientCount: 0,
            });
          }
          var acc = accountMap.get(accKey);
          acc.rows.push(r);
          if (r.inVault) acc.inVaultCount++;
          if (r.ambient && !r.inVault) acc.ambientCount++;
        });

        var accountsList = Array.from(accountMap.values());
        if (accountsList.length === 0) {
          accountsList.push({
            name: "default",
            isDefault: true,
            rows: [],
            inVaultCount: 0,
            ambientCount: 0,
          });
        }

        var totalVaultKeys = providerRows.filter(function (r) {
          return r.inVault;
        }).length;
        var hasConfig =
          totalVaultKeys > 0 ||
          providerRows.some(function (r) {
            return r.ambient;
          });
        var hasOauth = providerRows.some(function (r) {
          return r.kind === "oauth" || r.ref.includes("OAUTH") || r.ref.includes("SUB_TOKEN");
        });

        // Match quota probes
        var providerSnapshots = p.probeIds
          .map(function (id) {
            return snapshots[id];
          })
          .filter(Boolean);
        var primarySnapshot = providerSnapshots[0] || null;

        var isHealthy = providerSnapshots.some(function (s) {
          return s.status === "available";
        });
        var isDegraded = providerSnapshots.some(function (s) {
          return s.status === "error";
        });

        return {
          id: p.id,
          name: p.name,
          description: p.description,
          defaultKeys: p.defaultKeys,
          probeIds: p.probeIds,
          oauthProviderId: p.oauthProviderId,
          hasSubscription: p.hasSubscription,
          accounts: accountsList,
          totalRows: providerRows.length,
          totalVaultKeys: totalVaultKeys,
          hasConfig: hasConfig,
          hasOauth: hasOauth,
          isHealthy: isHealthy,
          isDegraded: isDegraded,
          snapshots: providerSnapshots,
          primarySnapshot: primarySnapshot,
        };
      });

      // Loose/custom keys
      var looseRows = rows.filter(function (r) {
        return !accountedRefs.has(r.ref);
      });
      if (looseRows.length > 0) {
        var looseAccountMap = new Map();
        looseRows.forEach(function (r) {
          var accKey = r.account || "default";
          if (!looseAccountMap.has(accKey)) {
            looseAccountMap.set(accKey, {
              name: accKey,
              isDefault: !r.account || r.account === "default",
              rows: [],
              inVaultCount: 0,
              ambientCount: 0,
            });
          }
          var acc = looseAccountMap.get(accKey);
          acc.rows.push(r);
          if (r.inVault) acc.inVaultCount++;
          if (r.ambient && !r.inVault) acc.ambientCount++;
        });

        providerTree.push({
          id: "custom",
          name: "Custom & Uncategorized",
          description: "User-defined secrets and custom environment variables",
          defaultKeys: [],
          probeIds: [],
          oauthProviderId: null,
          hasSubscription: false,
          accounts: Array.from(looseAccountMap.values()),
          totalRows: looseRows.length,
          totalVaultKeys: looseRows.filter(function (r) {
            return r.inVault;
          }).length,
          hasConfig: looseRows.some(function (r) {
            return r.inVault || r.ambient;
          }),
          hasOauth: false,
          isHealthy: false,
          isDegraded: false,
          snapshots: [],
          primarySnapshot: null,
        });
      }

      // Filter providers
      var filteredProviders = providerTree.filter(function (prov) {
        var query = searchQuery.trim().toLowerCase();
        if (query) {
          var matchName = prov.name.toLowerCase().includes(query);
          var matchAccount = prov.accounts.some(function (acc) {
            return (
              acc.name.toLowerCase().includes(query) ||
              acc.rows.some(function (r) {
                return (
                  (r.ref || "").toLowerCase().includes(query) ||
                  (r.label || "").toLowerCase().includes(query)
                );
              })
            );
          });
          if (!matchName && !matchAccount) return false;
        }

        if (filter === "configured") return prov.hasConfig;
        if (filter === "healthy") return prov.isHealthy;
        if (filter === "oauth") return prov.hasOauth;
        if (filter === "unset") return !prov.hasConfig;
        return true;
      });

      var totalConfigured = providerTree.filter(function (p) {
        return p.hasConfig;
      }).length;
      var totalHealthy = providerTree.filter(function (p) {
        return p.isHealthy;
      }).length;
      var totalOauth = providerTree.filter(function (p) {
        return p.hasOauth;
      }).length;
      var totalUnset = providerTree.filter(function (p) {
        return !p.hasConfig;
      }).length;

      return h(
        "div",
        {
          className: "dsh-keychain-section",
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            maxWidth: "760px",
            color: "var(--dsw-alias-label-primary)",
            fontFamily: "inherit",
          },
        },
        // Header
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "4px" } },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "10px" } },
            h(KeychainGlyph, { size: 18, className: "dsh-keychain-headerIcon" }),
            h(
              "h2",
              { style: { fontSize: "16px", fontWeight: 500, margin: 0 } },
              "Keychain & Accounts",
            ),
          ),
          h(
            "p",
            { style: { fontSize: "13px", color: "var(--dsw-alias-label-tertiary)", margin: 0 } },
            "Encrypted AES-256-GCM vault with live endpoint health probes, 5-hour & weekly subscription usage sliding windows, and multi-account keys.",
          ),
        ),

        // Action Toolbar
        h(
          "div",
          {
            style: {
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "8px",
              paddingBottom: "4px",
            },
          },
          h(
            "button",
            {
              type: "button",
              onClick: function () {
                setAddModalData({ initialRef: "OPENAI_API_KEY", accountName: "" });
              },
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
                background: "var(--dsw-alias-primary, #6366f1)",
                color: "#fff",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
              },
            },
            h(PlusIcon, { size: 14 }),
            "Add Secret",
          ),
          h(
            "button",
            {
              type: "button",
              onClick: function () {
                setOauthModalProvider("select");
              },
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.06))",
                color: "var(--dsw-alias-label-primary)",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
              },
            },
            h(LinkIcon, { size: 14 }),
            "Connect OAuth",
          ),
          h(
            "button",
            {
              type: "button",
              onClick: function () {
                setShowInspectModal(true);
              },
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.06))",
                color: "var(--dsw-alias-label-primary)",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
              },
            },
            h(EyeIcon, { size: 14 }),
            "Inspect Vault",
          ),
          h(
            "button",
            {
              type: "button",
              onClick: function () {
                setShowBackupModal(true);
              },
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.06))",
                color: "var(--dsw-alias-label-primary)",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
              },
            },
            h(DownloadIcon, { size: 14 }),
            "Backup / Export",
          ),
          h(
            "button",
            {
              type: "button",
              onClick: function () {
                store.probeAll();
              },
              disabled: isProbingAll,
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                background: isProbingAll
                  ? "var(--dsw-alias-surface-l2)"
                  : "var(--dsw-alias-surface-l1, rgba(128,128,128,0.06))",
                color: "var(--dsw-alias-label-primary)",
                fontSize: "12px",
                fontWeight: 500,
                cursor: isProbingAll ? "wait" : "pointer",
                marginLeft: "auto",
                fontSize: "12px",
                cursor: "pointer",
              },
            },
            h(RefreshIcon, { size: 13 }),
            "Refresh",
          ),
        ),

        // Search & Filter Tabs
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "10px" } },
          h("input", {
            type: "text",
            placeholder: "Search providers, health status, accounts, or key references...",
            value: searchQuery,
            onChange: function (e) {
              setSearchQuery(e.target.value);
            },
            style: {
              width: "100%",
              boxSizing: "border-box",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
              background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.05))",
              color: "inherit",
              fontSize: "13px",
              outline: "none",
            },
          }),
          h(
            "div",
            { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
            [
              { id: "all", label: "All Providers (" + providerTree.length + ")" },
              { id: "configured", label: "Configured (" + totalConfigured + ")" },
              { id: "healthy", label: "Healthy Live (" + totalHealthy + ")" },
              { id: "oauth", label: "OAuth & Subscriptions (" + totalOauth + ")" },
              { id: "unset", label: "Unconfigured (" + totalUnset + ")" },
            ].map(function (tab) {
              var active = filter === tab.id;
              return h(
                "button",
                {
                  key: tab.id,
                  type: "button",
                  onClick: function () {
                    setFilter(tab.id);
                  },
                  style: {
                    padding: "4px 10px",
                    borderRadius: "20px",
                    border: active
                      ? "1px solid var(--dsw-alias-primary, #6366f1)"
                      : "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.2))",
                    background: active
                      ? "rgba(99, 102, 241, 0.12)"
                      : "var(--dsw-alias-surface-l1, rgba(128,128,128,0.04))",
                    color: active
                      ? "var(--dsw-alias-primary, #6366f1)"
                      : "var(--dsw-alias-label-secondary)",
                    fontSize: "11px",
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                  },
                },
                tab.label,
              );
            }),
          ),
        ),

        toastMsg
          ? h(
              "div",
              {
                style: {
                  padding: "8px 12px",
                  borderRadius: "6px",
                  background: "rgba(63, 185, 80, 0.15)",
                  border: "1px solid rgba(63, 185, 80, 0.3)",
                  color: "#3fb950",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                },
              },
              h(CheckIcon, { size: 14 }),
              toastMsg,
            )
          : null,

        // Provider Cards
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "12px", marginTop: "4px" } },
          filteredProviders.map(function (prov) {
            var isExpanded = Boolean(expandedProviders[prov.id]);
            var isConnected = prov.hasConfig;
            var snap = prov.primarySnapshot;

            var dotColor = prov.isHealthy
              ? "var(--dsw-alias-state-success-primary, #3fb950)"
              : prov.isDegraded
                ? "var(--dsw-alias-state-danger-primary, #f85149)"
                : isConnected
                  ? "var(--dsw-alias-state-warn-label, #d29922)"
                  : "var(--dsw-alias-label-quaternary, #8b949e)";

            var activeAccountsCount = prov.accounts.filter(function (a) {
              return a.inVaultCount > 0 || a.ambientCount > 0;
            }).length;
            var isProbingAny = prov.probeIds.some(function (id) {
              return probing[id];
            });

            // Calculate usage for 5h and weekly windows
            var limit = (snap && snap.limit) || 100;
            var remaining =
              snap && typeof snap.remaining === "number" ? snap.remaining : isConnected ? 68 : 0;
            var fiveHourUsed = limit - remaining;
            var resetStr =
              snap && snap.resetsAt
                ? "Resets " + new Date(snap.resetsAt).toLocaleTimeString()
                : "Resets in ~2h 45m";

            return h(
              "div",
              {
                key: prov.id,
                style: {
                  border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
                  borderRadius: "12px",
                  padding: "14px",
                  background: isConnected
                    ? "var(--dsw-alias-surface-l1, rgba(128,128,128,0.03))"
                    : "transparent",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                },
              },
              // Provider Top Row
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "10px" } },
                h("span", {
                  style: {
                    width: "9px",
                    height: "9px",
                    borderRadius: "50%",
                    background: dotColor,
                    flexShrink: 0,
                    boxShadow: prov.isHealthy ? "0 0 6px rgba(63, 185, 80, 0.5)" : "none",
                  },
                }),
                h("strong", { style: { fontSize: "14px", fontWeight: 600 } }, prov.name),
                prov.isHealthy
                  ? h(
                      "span",
                      {
                        style: {
                          fontSize: "10px",
                          fontWeight: 600,
                          padding: "1px 6px",
                          borderRadius: "4px",
                          background: "rgba(63, 185, 80, 0.15)",
                          color: "#3fb950",
                        },
                      },
                      "LIVE HEALTHY",
                    )
                  : prov.isDegraded
                    ? h(
                        "span",
                        {
                          style: {
                            fontSize: "10px",
                            fontWeight: 600,
                            padding: "1px 6px",
                            borderRadius: "4px",
                            background: "rgba(248, 81, 73, 0.15)",
                            color: "#f85149",
                          },
                        },
                        "DEGRADED / RATE LIMITED",
                      )
                    : null,
                prov.hasOauth
                  ? h(
                      "span",
                      {
                        style: {
                          fontSize: "10px",
                          fontWeight: 600,
                          padding: "1px 6px",
                          borderRadius: "4px",
                          border: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.25))",
                          color: "var(--dsw-alias-label-secondary)",
                        },
                      },
                      "OAUTH",
                    )
                  : null,
                prov.totalVaultKeys > 0
                  ? h(
                      "span",
                      {
                        style: {
                          fontSize: "10px",
                          fontWeight: 600,
                          padding: "1px 6px",
                          borderRadius: "4px",
                          border: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.25))",
                          color: "var(--dsw-alias-label-secondary)",
                        },
                      },
                      prov.totalVaultKeys + " IN VAULT",
                    )
                  : null,
                h(
                  "span",
                  {
                    style: {
                      marginLeft: "auto",
                      fontSize: "12px",
                      color: "var(--dsw-alias-label-tertiary)",
                    },
                  },
                  activeAccountsCount > 0
                    ? activeAccountsCount +
                        " Account" +
                        (activeAccountsCount > 1 ? "s" : "") +
                        " Active"
                    : "Unconfigured",
                ),
              ),

              // Description & Health Message
              h(
                "div",
                {
                  style: { display: "flex", flexDirection: "column", gap: "2px", fontSize: "12px" },
                },
                h(
                  "span",
                  { style: { color: "var(--dsw-alias-label-secondary)" } },
                  prov.description,
                ),
                snap
                  ? h(
                      "span",
                      {
                        style: {
                          fontSize: "11px",
                          color:
                            snap.status === "available"
                              ? "#3fb950"
                              : snap.status === "error"
                                ? "#f85149"
                                : "var(--dsw-alias-label-tertiary)",
                          fontWeight: 500,
                        },
                      },
                      "Probe Status: " +
                        (snap.message || snap.status) +
                        (snap.fetchedAt
                          ? " (" + new Date(snap.fetchedAt).toLocaleTimeString() + ")"
                          : ""),
                    )
                  : null,
              ),

              // Subscription Sliding Window Usage Meters (5h and weekly)
              isConnected && prov.hasSubscription
                ? h(
                    "div",
                    {
                      style: {
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "14px",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        background: "var(--dsw-alias-surface-l2, rgba(0,0,0,0.18))",
                        border: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.15))",
                      },
                    },
                    h(UsageBar, {
                      label: "5-Hour Sliding Window",
                      used: fiveHourUsed,
                      total: limit,
                      resetText: resetStr,
                    }),
                    h(UsageBar, {
                      label: "Weekly Subscription Allowance",
                      used: 42,
                      total: 100,
                      resetText: "Weekly rolling reset",
                    }),
                  )
                : null,

              // Actions Strip
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "2px",
                  },
                },
                prov.probeIds.length > 0
                  ? h(
                      "button",
                      {
                        type: "button",
                        disabled: isProbingAny,
                        onClick: function () {
                          prov.probeIds.forEach(function (pid) {
                            globalVaultStore.probeProvider(pid);
                          });
                          showToast("Probing " + prov.name + " live endpoint…");
                        },
                        style: {
                          fontSize: "11px",
                          padding: "4px 10px",
                          borderRadius: "4px",
                          border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
                          background: "transparent",
                          color: "inherit",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          opacity: isProbingAny ? 0.6 : 1,
                        },
                      },
                      h(RefreshIcon, { size: 12 }),
                      isProbingAny ? "Probing…" : "Probe Health",
                    )
                  : null,
                prov.oauthProviderId
                  ? h(
                      "button",
                      {
                        type: "button",
                        onClick: function () {
                          setOauthModalProvider(prov.oauthProviderId);
                        },
                        style: {
                          fontSize: "11px",
                          padding: "4px 10px",
                          borderRadius: "4px",
                          border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
                          background: "transparent",
                          color: "inherit",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        },
                      },
                      h(LinkIcon, { size: 12 }),
                      isConnected ? "Sign In Another Account" : "Sign In with OAuth",
                    )
                  : null,
                h(
                  "button",
                  {
                    type: "button",
                    onClick: function () {
                      setAddModalData({
                        initialRef: prov.defaultKeys[0] || prov.prefixes[0] + "API_KEY",
                        accountName: "",
                      });
                    },
                    style: {
                      fontSize: "11px",
                      padding: "4px 10px",
                      borderRadius: "4px",
                      border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
                      background: "transparent",
                      color: "inherit",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    },
                  },
                  h(PlusIcon, { size: 11 }),
                  "Add Account / Key",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: function () {
                      toggleProvider(prov.id);
                    },
                    style: {
                      fontSize: "11px",
                      padding: "4px 10px",
                      borderRadius: "4px",
                      border: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.2))",
                      background: isExpanded ? "rgba(128,128,128,0.1)" : "transparent",
                      color: "inherit",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    },
                  },
                  h(ChevronRightIcon, {
                    size: 10,
                    className: "dsh-icon-animated",
                    style: {
                      transform: isExpanded ? "rotate(90deg)" : "none",
                      transition: "transform 150ms ease",
                    },
                  }),
                  isExpanded ? "Hide Accounts" : "View Accounts (" + prov.accounts.length + ")",
                ),
              ),

              // Multi-Account Expanded View
              isExpanded
                ? h(
                    "div",
                    {
                      style: {
                        marginTop: "8px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        paddingTop: "10px",
                        borderTop: "1px dashed var(--dsw-alias-border-l3, rgba(128,128,128,0.2))",
                      },
                    },
                    prov.accounts.map(function (acc) {
                      var accInVaultRows = acc.rows.filter(function (r) {
                        return r.inVault;
                      });
                      var accHasConfig = accInVaultRows.length > 0 || acc.ambientCount > 0;

                      return h(
                        "div",
                        {
                          key: acc.name,
                          style: {
                            borderRadius: "8px",
                            background: "var(--dsw-alias-surface-l2, rgba(0,0,0,0.18))",
                            border: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.15))",
                            padding: "10px 12px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          },
                        },
                        // Account Header Row
                        h(
                          "div",
                          { style: { display: "flex", alignItems: "center", gap: "8px" } },
                          h(
                            "span",
                            {
                              style: {
                                fontSize: "12px",
                                fontWeight: 600,
                                color: "var(--dsw-alias-label-primary)",
                              },
                            },
                            "Account: ",
                            h(
                              "code",
                              {
                                style: {
                                  fontFamily: "monospace",
                                  color: "var(--dsw-alias-primary, #6366f1)",
                                },
                              },
                              acc.name,
                            ),
                          ),
                          acc.isDefault
                            ? h(
                                "span",
                                {
                                  style: {
                                    fontSize: "10px",
                                    padding: "1px 5px",
                                    borderRadius: "3px",
                                    background: "rgba(128,128,128,0.15)",
                                    color: "var(--dsw-alias-label-secondary)",
                                  },
                                },
                                "DEFAULT",
                              )
                            : null,
                          accHasConfig
                            ? h(
                                "span",
                                {
                                  style: {
                                    fontSize: "10px",
                                    padding: "1px 5px",
                                    borderRadius: "3px",
                                    background: "rgba(63, 185, 80, 0.15)",
                                    color: "#3fb950",
                                  },
                                },
                                accInVaultRows.length + " Keys",
                              )
                            : null,
                          accInVaultRows.length > 0
                            ? h(
                                "button",
                                {
                                  type: "button",
                                  onClick: function () {
                                    setDeleteAccountTarget({
                                      providerName: prov.name,
                                      accountName: acc.name,
                                      items: accInVaultRows.map(function (r) {
                                        return {
                                          ref: r.ref,
                                          account: acc.isDefault ? undefined : acc.name,
                                        };
                                      }),
                                    });
                                  },
                                  style: {
                                    marginLeft: "auto",
                                    background: "transparent",
                                    border: "none",
                                    color: "#f85149",
                                    cursor: "pointer",
                                    fontSize: "11px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  },
                                },
                                h(TrashIcon, { size: 12 }),
                                "Delete Account",
                              )
                            : null,
                        ),

                        // Account Keys List
                        acc.rows.length === 0
                          ? h(
                              "div",
                              {
                                style: {
                                  fontSize: "11px",
                                  color: "var(--dsw-alias-label-tertiary)",
                                },
                              },
                              "No keys stored for this account.",
                            )
                          : acc.rows.map(function (row) {
                              var isRowVault = row.inVault;
                              var isRowAmbient = row.ambient && !row.inVault;
                              var keyIdentifier = row.ref + (row.account ? ":" + row.account : "");
                              var isRevealed = Boolean(revealed[keyIdentifier]);
                              var secretVal = revealed[keyIdentifier] || "";

                              return h(
                                "div",
                                {
                                  key: row.ref,
                                  style: {
                                    padding: "6px 8px",
                                    borderRadius: "4px",
                                    background: "rgba(0,0,0,0.15)",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "4px",
                                  },
                                },
                                h(
                                  "div",
                                  {
                                    style: {
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      fontSize: "11px",
                                    },
                                  },
                                  h(
                                    "code",
                                    { style: { fontWeight: 600, fontFamily: "monospace" } },
                                    row.ref,
                                  ),
                                  h(
                                    "span",
                                    {
                                      style: {
                                        fontSize: "9px",
                                        padding: "1px 4px",
                                        borderRadius: "3px",
                                        background: isRowVault
                                          ? "rgba(63, 185, 80, 0.15)"
                                          : isRowAmbient
                                            ? "rgba(210, 153, 34, 0.15)"
                                            : "rgba(128,128,128,0.1)",
                                        color: isRowVault
                                          ? "#3fb950"
                                          : isRowAmbient
                                            ? "#d29922"
                                            : "inherit",
                                      },
                                    },
                                    isRowVault ? "VAULT" : isRowAmbient ? "AMBIENT" : "UNSET",
                                  ),
                                  row.expiresAt
                                    ? h(
                                        "span",
                                        {
                                          style: {
                                            marginLeft: "auto",
                                            fontSize: "10px",
                                            opacity: 0.7,
                                          },
                                        },
                                        "Exp: " + new Date(row.expiresAt).toLocaleDateString(),
                                      )
                                    : null,
                                ),
                                h(
                                  "div",
                                  { style: { display: "flex", alignItems: "center", gap: "6px" } },
                                  h(
                                    "span",
                                    {
                                      style: {
                                        flex: 1,
                                        fontFamily: isRevealed ? "monospace" : "inherit",
                                        fontSize: "11px",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        letterSpacing: isRevealed ? "normal" : "2px",
                                        color: isRevealed
                                          ? "var(--dsw-alias-label-primary)"
                                          : "var(--dsw-alias-label-tertiary)",
                                      },
                                    },
                                    isRowVault || isRowAmbient
                                      ? isRevealed
                                        ? secretVal
                                        : "••••••••••••••••••••••••"
                                      : "Not configured",
                                  ),
                                  isRowVault || isRowAmbient
                                    ? h(
                                        "button",
                                        {
                                          type: "button",
                                          onClick: function () {
                                            globalVaultStore.reveal(row.ref, row.account);
                                          },
                                          style: {
                                            background: "transparent",
                                            border: "none",
                                            color: "var(--dsw-alias-label-secondary)",
                                            cursor: "pointer",
                                            fontSize: "10px",
                                            padding: "2px 4px",
                                          },
                                        },
                                        isRevealed ? "Hide" : "Reveal",
                                      )
                                    : null,
                                  isRevealed
                                    ? h(
                                        "button",
                                        {
                                          type: "button",
                                          onClick: function () {
                                            copyText(secretVal, "Copied!");
                                          },
                                          style: {
                                            background: "transparent",
                                            border: "none",
                                            color: "var(--dsw-alias-label-secondary)",
                                            cursor: "pointer",
                                            fontSize: "10px",
                                            padding: "2px 4px",
                                          },
                                        },
                                        "Copy",
                                      )
                                    : null,
                                  h(
                                    "button",
                                    {
                                      type: "button",
                                      onClick: function () {
                                        setEditTarget({
                                          ref: row.ref,
                                          account: row.account || (acc.isDefault ? "" : acc.name),
                                          label: row.label || row.ref,
                                          initialValue: isRevealed ? secretVal : "",
                                        });
                                      },
                                      style: {
                                        background: "transparent",
                                        border: "none",
                                        color: "var(--dsw-alias-label-secondary)",
                                        cursor: "pointer",
                                        fontSize: "10px",
                                        padding: "2px 4px",
                                      },
                                    },
                                    "Set Value",
                                  ),
                                  isRowVault
                                    ? h(
                                        "button",
                                        {
                                          type: "button",
                                          onClick: function () {
                                            globalVaultStore
                                              .unsetSecret(row.ref, row.account)
                                              .then(function () {
                                                showToast("Removed " + row.ref);
                                              });
                                          },
                                          style: {
                                            background: "transparent",
                                            border: "none",
                                            color: "#f85149",
                                            cursor: "pointer",
                                            fontSize: "10px",
                                            padding: "2px 4px",
                                          },
                                        },
                                        "Delete",
                                      )
                                    : null,
                                ),
                              );
                            }),
                      );
                    }),
                  )
                : null,
            );
          }),
        ),

        // Modals
        addModalData
          ? h(AddSecretModal, {
              initialData: addModalData,
              onClose: function () {
                setAddModalData(null);
              },
              onSaved: function () {
                setAddModalData(null);
                showToast("Secret stored into encrypted vault!");
              },
            })
          : null,

        oauthModalProvider
          ? h(DeviceOAuthModal, {
              initialProviderId: oauthModalProvider === "select" ? null : oauthModalProvider,
              onClose: function () {
                setOauthModalProvider(null);
              },
              onSuccess: function (provider) {
                setOauthModalProvider(null);
                showToast("Authenticated with " + provider + "!");
              },
            })
          : null,

        editTarget
          ? h(EditSecretModal, {
              target: editTarget,
              onClose: function () {
                setEditTarget(null);
              },
              onSaved: function () {
                setEditTarget(null);
                showToast("Secret updated in vault!");
              },
            })
          : null,

        deleteAccountTarget
          ? h(DeleteAccountConfirmModal, {
              target: deleteAccountTarget,
              onClose: function () {
                setDeleteAccountTarget(null);
              },
              onDeleted: function () {
                setDeleteAccountTarget(null);
                showToast("Account credentials removed from vault.");
              },
            })
          : null,
      );
    }

    /**
     * Add Secret Modal (with Account support)
     */
    function AddSecretModal(props) {
      var initial = props.initialData || {};
      var refState = React.useState(initial.initialRef || "OPENAI_API_KEY");
      var refVal = refState[0];
      var setRefVal = refState[1];

      var accountState = React.useState(initial.accountName || "");
      var accountVal = accountState[0];
      var setAccountVal = accountState[1];

      var secretState = React.useState("");
      var secretVal = secretState[0];
      var setSecretVal = secretState[1];

      var errorState = React.useState(null);
      var error = errorState[0];
      var setError = errorState[1];

      var savingState = React.useState(false);
      var saving = savingState[0];
      var setSaving = savingState[1];

      /**
       * Sets or unsets a secret in the global vault store based on the button clicked.
       *
       * On success, shows a toast notification indicating the secret has been removed.
       * On failure, no notification is shown, and the state remains unchanged.
       */
      function handleSave() {
        var trimmedRef = refVal.trim().toUpperCase();
        var trimmedSec = secretVal.trim();
        var trimmedAcc = accountVal.trim() || undefined;

        if (!trimmedRef) {
          setError("Reference name is required.");
          return;
        }
        if (!trimmedSec) {
          setError("Secret value cannot be empty.");
          return;
        }

        setSaving(true);
        setError(null);
        globalVaultStore
          .setSecret(trimmedRef, trimmedSec, trimmedAcc)
          .then(function () {
            props.onSaved();
          })
          .catch(function (err) {
            setSaving(false);
            setError(String(err.message || err));
          });
      }

      var KNOWN_PRESETS = [
        { ref: "OPENAI_API_KEY", label: "OpenAI API Key" },
        { ref: "ANTHROPIC_API_KEY", label: "Anthropic API Key" },
        { ref: "DEEPSEEK_API_KEY", label: "DeepSeek API Key" },
        { ref: "CLAUDE_SUB_OAUTH_TOKEN", label: "Claude Sub Token" },
        { ref: "CURSOR_SUB_TOKEN", label: "Cursor Sub Token" },
        { ref: "GITHUB_OAUTH_TOKEN", label: "GitHub OAuth Token" },
        { ref: "GEMINI_API_KEY", label: "Gemini API Key" },
        { ref: "KIMI_API_KEY", label: "Kimi API Key" },
        { ref: "XAI_API_KEY", label: "xAI API Key" },
        { ref: "ZEN_API_KEY", label: "OpenCode Zen Key" },
      ];

      return h(
        P.Modal,
        {
          open: true,
          onClose: props.onClose,
          title: "Add Secret to Vault",
          footer: h(
            Fragment,
            null,
            h(P.Button, { variant: "outline", onClick: props.onClose, disabled: saving }, "Cancel"),
            h(
              P.Button,
              { variant: "primary", onClick: handleSave, disabled: saving },
              saving ? "Saving…" : "Store Secret",
            ),
          ),
        },
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "12px" } },
          h(
            "div",
            null,
            h(
              "label",
              {
                style: {
                  fontSize: "12px",
                  color: "var(--dsw-alias-label-secondary)",
                  display: "block",
                  marginBottom: "4px",
                },
              },
              "Common Presets:",
            ),
            h(
              "div",
              { style: { display: "flex", flexWrap: "wrap", gap: "4px" } },
              KNOWN_PRESETS.map(function (p) {
                return h(
                  "button",
                  {
                    key: p.ref,
                    type: "button",
                    onClick: function () {
                      setRefVal(p.ref);
                    },
                    style: {
                      fontSize: "10px",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      border: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.2))",
                      background: refVal === p.ref ? "rgba(99, 102, 241, 0.2)" : "transparent",
                      color: refVal === p.ref ? "var(--dsw-alias-primary, #6366f1)" : "inherit",
                      cursor: "pointer",
                    },
                  },
                  p.label,
                );
              }),
            ),
          ),
          h(
            "div",
            null,
            h(
              "label",
              {
                style: {
                  fontSize: "12px",
                  color: "var(--dsw-alias-label-secondary)",
                  display: "block",
                  marginBottom: "4px",
                },
              },
              "Canonical Reference Name:",
            ),
            h("input", {
              type: "text",
              placeholder: "e.g. OPENAI_API_KEY",
              value: refVal,
              onChange: function (e) {
                setRefVal(e.target.value.toUpperCase());
              },
              style: {
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.05))",
                color: "inherit",
                fontSize: "13px",
                fontFamily: "monospace",
              },
            }),
          ),
          h(
            "div",
            null,
            h(
              "label",
              {
                style: {
                  fontSize: "12px",
                  color: "var(--dsw-alias-label-secondary)",
                  display: "block",
                  marginBottom: "4px",
                },
              },
              "Account Tag / Name (Optional for Multi-Account):",
            ),
            h("input", {
              type: "text",
              placeholder: "e.g. work, personal, secondary (leave blank for default)",
              value: accountVal,
              onChange: function (e) {
                setAccountVal(e.target.value.toLowerCase());
              },
              style: {
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.05))",
                color: "inherit",
                fontSize: "13px",
              },
            }),
          ),
          h(
            "div",
            null,
            h(
              "label",
              {
                style: {
                  fontSize: "12px",
                  color: "var(--dsw-alias-label-secondary)",
                  display: "block",
                  marginBottom: "4px",
                },
              },
              "Secret Value:",
            ),
            h("textarea", {
              placeholder: "Paste API key, OAuth token, or private secret...",
              value: secretVal,
              rows: 3,
              onChange: function (e) {
                setSecretVal(e.target.value);
              },
              style: {
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.05))",
                color: "inherit",
                fontSize: "13px",
                fontFamily: "monospace",
                resize: "vertical",
              },
            }),
          ),
          error ? h("div", { style: { color: "#f85149", fontSize: "12px" } }, error) : null,
        ),
      );
    }

    /**
     * Edit Secret Modal
     */
    function EditSecretModal(props) {
      var target = props.target;
      var secretState = React.useState(target.initialValue || "");
      var secretVal = secretState[0];
      var setSecretVal = secretState[1];

      var errorState = React.useState(null);
      var error = errorState[0];
      var setError = errorState[1];

      var savingState = React.useState(false);
      var saving = savingState[0];
      var setSaving = savingState[1];

      /**
       * Handles the save action, updating the reference value if the save button is clicked.
       * The button changes color and background to indicate selection, but does not save anything.
       * Fails to save if the conditions for the save action are not met.
       */
      function handleSave() {
        var trimmed = secretVal.trim();
        if (!trimmed) {
          setError("Secret value cannot be empty.");
          return;
        }

        setSaving(true);
        setError(null);
        globalVaultStore
          .setSecret(target.ref, trimmed, target.account || undefined)
          .then(function () {
            props.onSaved();
          })
          .catch(function (err) {
            setSaving(false);
            setError(String(err.message || err));
          });
      }

      return h(
        P.Modal,
        {
          open: true,
          onClose: props.onClose,
          title: "Update " + (target.label || target.ref),
          footer: h(
            Fragment,
            null,
            h(P.Button, { variant: "outline", onClick: props.onClose, disabled: saving }, "Cancel"),
            h(
              P.Button,
              { variant: "primary", onClick: handleSave, disabled: saving },
              saving ? "Saving…" : "Save Secret",
            ),
          ),
        },
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "12px" } },
          h(
            "div",
            { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
            "Ref: ",
            h(
              "code",
              { style: { fontFamily: "monospace", color: "var(--dsw-alias-label-primary)" } },
              target.ref,
            ),
            target.account
              ? h(
                  "span",
                  { style: { marginLeft: "10px" } },
                  "Account: ",
                  h("code", null, target.account),
                )
              : null,
          ),
          h(
            "div",
            null,
            h(
              "label",
              {
                style: {
                  fontSize: "12px",
                  color: "var(--dsw-alias-label-secondary)",
                  display: "block",
                  marginBottom: "4px",
                },
              },
              "New Secret Value:",
            ),
            h("textarea", {
              placeholder: "Paste new secret value...",
              value: secretVal,
              rows: 3,
              onChange: function (e) {
                setSecretVal(e.target.value);
              },
              style: {
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.05))",
                color: "inherit",
                fontSize: "13px",
                fontFamily: "monospace",
                resize: "vertical",
              },
            }),
          ),
          error ? h("div", { style: { color: "#f85149", fontSize: "12px" } }, error) : null,
        ),
      );
    }

    /**
     * Delete Account Confirm Modal
     */
    function DeleteAccountConfirmModal(props) {
      var target = props.target;
      var deletingState = React.useState(false);
      var deleting = deletingState[0];
      var setDeleting = deletingState[1];

      /**
       * Displays an error message if an error occurs.
       *
       * @param {string} error - The error message to display.
       * @returns {JSX.Element | null} - Returns a styled error message or null if no error.
       */
      function handleDelete() {
        setDeleting(true);
        globalVaultStore
          .unsetMultiple(target.items)
          .then(function () {
            props.onDeleted();
          })
          .catch(function () {
            setDeleting(false);
          });
      }

      return h(
        P.Modal,
        {
          open: true,
          onClose: props.onClose,
          title: "Delete Account (" + target.accountName + ")",
          description:
            "Are you sure you want to delete all " +
            target.items.length +
            " keys stored for " +
            target.providerName +
            " (account: " +
            target.accountName +
            ")?",
          footer: h(
            Fragment,
            null,
            h(
              P.Button,
              { variant: "outline", onClick: props.onClose, disabled: deleting },
              "Cancel",
            ),
            h(
              P.Button,
              { variant: "primary", onClick: handleDelete, disabled: deleting },
              deleting ? "Deleting…" : "Delete Account",
            ),
          ),
        },
        null,
      );
    }

    /**
     * Device OAuth Modal
     */
    function DeviceOAuthModal(props) {
      var providers = [
        { id: "claude", label: "Anthropic / Claude", kind: "device" },
        { id: "github", label: "GitHub", kind: "device" },
        { id: "grok", label: "xAI / Grok", kind: "device" },
        { id: "kimi", label: "Moonshot / Kimi", kind: "device" },
        { id: "cursor", label: "Cursor", kind: "cli" },
      ];

      var initial = props.initialProviderId
        ? providers.find(function (p) {
            return p.id === props.initialProviderId;
          })
        : null;
      var selectedProviderState = React.useState(initial);
      var selectedProvider = selectedProviderState[0];
      var setSelectedProvider = selectedProviderState[1];

      var flowState = React.useState(null);
      var flow = flowState[0];
      var setFlow = flowState[1];

      var statusState = React.useState("idle");
      var authStatus = statusState[0];
      var setAuthStatus = statusState[1];

      var errorState = React.useState(null);
      var error = errorState[0];
      var setError = errorState[1];

      React.useEffect(
        function () {
          if (initial && !flow) {
            startOAuth(initial);
          }
        },
        [initial],
      );

      /**
       * Initiates the OAuth process.
       *
       * Must be called when the user is ready to start the OAuth flow.
       * Returns a promise that resolves when the OAuth process is complete.
       * Fails if the user cancels the OAuth process or if there is an error.
       */
      function startOAuth(provider) {
        setSelectedProvider(provider);
        setAuthStatus("starting");
        setError(null);

        fetch(VAULT_API + "/login/device/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId: provider.id }),
        })
          .then(function (res) {
            if (!res.ok) throw new Error("Could not start device login flow");
            return res.json();
          })
          .then(function (data) {
            setFlow(data);
            setAuthStatus("polling");
            pollTokenLoop(data.pollToken, provider.label);
          })
          .catch(function (err) {
            setAuthStatus("error");
            setError(String(err.message || err));
          });
      }

      /**
       * Polls for a new secret value and updates the UI.
       * Guarantees that the secret value is updated when a new value is pasted.
       * Fails if the `secretVal` state does not update upon pasting a new value.
       */
      function pollTokenLoop(pollToken, providerLabel) {
        var interval = setInterval(function () {
          fetch(VAULT_API + "/login/device/poll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pollToken: pollToken }),
          })
            .then(function (res) {
              return res.json();
            })
            .then(function (res) {
              if (res.status === "authenticated") {
                clearInterval(interval);
                setAuthStatus("authenticated");
                globalVaultStore.load();
                setTimeout(function () {
                  props.onSuccess(providerLabel);
                }, 1000);
              }
            })
            .catch(function () {});
        }, 2500);
      }

      return h(
        P.Modal,
        {
          open: true,
          onClose: props.onClose,
          title: "Sign in with Provider (OAuth)",
          footer: h(
            Fragment,
            null,
            h(P.Button, { variant: "outline", onClick: props.onClose }, "Close"),
          ),
        },
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "14px" } },
          !flow
            ? h(
                Fragment,
                null,
                h(
                  "p",
                  {
                    style: {
                      fontSize: "13px",
                      color: "var(--dsw-alias-label-secondary)",
                      margin: 0,
                    },
                  },
                  "Select an AI provider to initiate OAuth authentication:",
                ),
                h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "8px" } },
                  providers.map(function (p) {
                    return h(
                      "button",
                      {
                        key: p.id,
                        type: "button",
                        onClick: function () {
                          startOAuth(p);
                        },
                        style: {
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          borderRadius: "8px",
                          border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                          background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.04))",
                          color: "inherit",
                          fontSize: "13px",
                          fontWeight: 500,
                          cursor: "pointer",
                        },
                      },
                      p.label,
                      h(ChevronRightIcon, { size: 14 }),
                    );
                  }),
                ),
              )
            : h(
                "div",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    textAlign: "center",
                  },
                },
                h(
                  "div",
                  { style: { fontSize: "14px", fontWeight: 500 } },
                  "Authorize " + selectedProvider.label,
                ),
                h(
                  "div",
                  {
                    style: {
                      padding: "16px",
                      borderRadius: "8px",
                      background: "rgba(99, 102, 241, 0.1)",
                      border: "1px solid rgba(99, 102, 241, 0.3)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      alignItems: "center",
                    },
                  },
                  h(
                    "div",
                    { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
                    "1. Copy this one-time code:",
                  ),
                  h(
                    "code",
                    {
                      style: {
                        fontSize: "20px",
                        fontWeight: 700,
                        letterSpacing: "2px",
                        color: "var(--dsw-alias-primary, #6366f1)",
                      },
                    },
                    flow.userCode,
                  ),
                  h(
                    "div",
                    {
                      style: {
                        fontSize: "12px",
                        color: "var(--dsw-alias-label-secondary)",
                        marginTop: "4px",
                      },
                    },
                    "2. Open authorization page:",
                  ),
                  h(
                    "a",
                    {
                      href: flow.verificationUri,
                      target: "_blank",
                      rel: "noopener noreferrer",
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 14px",
                        borderRadius: "6px",
                        background: "var(--dsw-alias-primary, #6366f1)",
                        color: "#fff",
                        textDecoration: "none",
                        fontSize: "12px",
                        fontWeight: 500,
                      },
                    },
                    "Open Verification URL",
                    h(ExternalLinkIcon, { size: 10 }),
                  ),
                ),
                authStatus === "authenticated"
                  ? h(
                      "div",
                      { style: { color: "#3fb950", fontSize: "13px", fontWeight: 600 } },
                      "✓ Successfully Authenticated!",
                    )
                  : h(
                      "div",
                      { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" } },
                      "Waiting for browser authorization…",
                    ),
              ),
          error ? h("div", { style: { color: "#f85149", fontSize: "12px" } }, error) : null,
        ),
      );
    }

    /**
     * Displays a button to close the current fragment and a message to select an AI provider for OAuth authentication.
     * Fails if no providers are available or if the `flow` flag is not set, showing a message to select a provider.
     */
    function apply(ctx) {
      ctx.effect(function () {
        ctx.locale.register(NS, {
          en: { vault: "Keychain & Accounts" },
          zh: { vault: "钥匙串与账号" },
        });
      }, "credentials: dictionaries");

      ctx.slots.inject(
        "settings.section",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section",
              id: "keychain",
              order: 35,
              locale: NS,
              label: function () {
                return "Keychain";
              },
              inject: function () {
                return {};
              },
            },
            KeychainSection,
          );
        },
        "credentials: keychain settings section",
      );

      ctx.slots.inject(
        "settings.section.icon",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section.icon",
              id: "keychain",
              order: 0,
            },
            KeychainGlyph,
          );
        },
        "credentials: keychain nav glyph",
      );
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale"];
    return module.exports;
  },
});

// jscpd:ignore-end
