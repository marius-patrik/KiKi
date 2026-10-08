import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const dir = dirname(fileURLToPath(import.meta.url));
const rowActionsMenuSource = readFileSync(join(dir, "row-actions-menu.js"), "utf8");
const liveProcessRowSource = readFileSync(join(dir, "live-process-row.js"), "utf8");

/**
 * Evaluates the sidebar-tree row sources with a fake runtime and injectable
 * browser globals, returning the live-process row factory result.
 */
function loadRows(globals) {
  const sandbox = Object.assign(
    {
      console: console,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
    },
    globals || {},
  );
  const code =
    rowActionsMenuSource +
    "\n" +
    liveProcessRowSource +
    "\n__dshLiveProcessRows = __dshCreateLiveProcessRow(runtime);";
  vm.runInNewContext(code, sandbox);
  return sandbox.__dshLiveProcessRows;
}

/** Logs a passing test name. */
const ok = (name) => console.log("ok -", name);

/** Returns a fake runtime for live-process rows. */
function makeRuntime(extraGlobals) {
  return loadRows(
    Object.assign(
      {
        runtime: {
          h: function (type, props) {
            return { type: type, props: props, children: Array.prototype.slice.call(arguments, 2) };
          },
          glyphs: {
            Terminals: function () {
              return "TerminalsGlyph";
            },
            Containers: function () {
              return "ContainersGlyph";
            },
            Edit: function () {
              return "EditGlyph";
            },
            Trash: function () {
              return "TrashGlyph";
            },
          },
          SelectDropdownMenu: function (props) {
            return { type: "SelectDropdownMenu", props: props };
          },
        },
      },
      extraGlobals || {},
    ),
  );
}

/** Returns a default context for live-process rows. */
function makeCtx(overrides) {
  return Object.assign(
    {
      quotasApiBase: "http://test",
      ellipsisOpen: null,
      setEllipsisOpen: function () {},
      loadAll: function () {},
      onActionFailure: function () {},
    },
    overrides || {},
  );
}

/** Finds the rendered SelectDropdownMenu inside a row's actions span. */
function findMenu(row) {
  const actionsMenu = row.children.find(function (child) {
    return (
      child && child.type === "span" && child.props && child.props.className === "dsh-tree-actions"
    );
  });
  assert.ok(actionsMenu, "row must render a dsh-tree-actions span");
  const flatChildren = actionsMenu.children.flat(Infinity);
  const menu = flatChildren.find(function (child) {
    return child && child.props && child.props.key === "actions-menu";
  });
  assert.ok(menu, "row must render a SelectDropdownMenu");
  return menu;
}

/** Asserts that a menu exposes the expected item ids in order. */
function assertMenuItems(menu, expectedIds, message) {
  assert.equal(
    JSON.stringify(
      menu.props.items.map(function (item) {
        return item.id;
      }),
    ),
    JSON.stringify(expectedIds),
    message,
  );
}

// ---- terminal row exposes rename and kill actions ----
{
  const rows = makeRuntime();
  const menu = findMenu(rows.renderTerminalRow({ name: "dev-shell" }, makeCtx()));
  assertMenuItems(menu, ["rename", "kill"], "terminal menu must offer rename and kill");
  ok("terminal row renders rename and kill actions");
}

// ---- container row exposes stop and remove actions ----
{
  const rows = makeRuntime();
  const menu = findMenu(
    rows.renderContainerRow({ id: "abc123", name: "redis", image: "redis:latest" }, makeCtx()),
  );
  assertMenuItems(menu, ["stop", "remove"], "container menu must offer stop and remove");
  ok("container row renders stop and remove actions");
}

// ---- selecting kill confirms, posts to /tmux/sessions/kill, and refreshes ----
{
  const calls = { fetch: [], confirm: false, loadAll: false };
  const rows = makeRuntime({
    confirm: function () {
      calls.confirm = true;
      return true;
    },
    fetch: function (url, options) {
      calls.fetch.push({ url: url, options: options });
      return Promise.resolve({
        json: function () {
          return Promise.resolve({ ok: true });
        },
      });
    },
  });

  const ctx = makeCtx({
    loadAll: function () {
      calls.loadAll = true;
    },
  });
  const menu = findMenu(rows.renderTerminalRow({ name: "dev-shell" }, ctx));

  await menu.props.onSelect("kill");

  assert.equal(calls.confirm, true, "kill must confirm before acting");
  assert.equal(calls.fetch.length, 1, "kill must make one request");
  assert.ok(
    calls.fetch[0].url.endsWith("/tmux/sessions/kill"),
    "kill must POST to /tmux/sessions/kill",
  );
  assert.deepEqual(JSON.parse(calls.fetch[0].options.body), { name: "dev-shell" });
  assert.equal(calls.loadAll, true, "kill must refresh the live list");
  ok("kill terminal dispatches the expected request and refreshes");
}

// ---- rename surfaces server errors through onActionFailure ----
{
  const calls = { failure: null, fetch: 0 };
  const rows = makeRuntime({
    prompt: function () {
      return "new-name";
    },
    fetch: function () {
      calls.fetch += 1;
      return Promise.resolve({
        json: function () {
          return Promise.resolve({ ok: false, error: "name taken" });
        },
      });
    },
  });

  const ctx = makeCtx({
    onActionFailure: function (failure) {
      calls.failure = failure;
    },
  });
  const menu = findMenu(rows.renderTerminalRow({ name: "dev-shell" }, ctx));

  await menu.props.onSelect("rename");

  assert.equal(calls.fetch, 1, "rename must make one request");
  assert.equal(
    calls.failure && calls.failure.action,
    "Rename",
    "rename failure must report action",
  );
  assert.equal(
    calls.failure && calls.failure.message,
    "name taken",
    "rename failure must surface server message",
  );
  ok("rename terminal surfaces server errors through onActionFailure");
}

console.log("\nlive-process-row tests passed");
