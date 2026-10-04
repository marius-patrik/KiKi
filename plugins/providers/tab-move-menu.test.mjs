import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const protocolSource = readFileSync(join(dir, "client-tab-move-protocol.js"), "utf8");
const menuSource = readFileSync(join(dir, "client-tab-move-menu.js"), "utf8");

/**
 * Both files are classic scripts (no import/export) meant to be concatenated
 * ahead of client.js in the shipped bundle, in this order. Evaluate the
 * shipped bytes directly, wired to a real protocol instance and a fake `h`
 * that just records what it was asked to render, rather than re-implementing
 * the logic here, so this test exercises exactly what ships.
 */
function loadMenu(target) {
  const factory = new Function(
    "target",
    `${protocolSource}\n${menuSource}\n` +
      `var tabMove = __dshCreateTabMoveProtocol(target);\n` +
      `var h = function (type, props) { return { type: type, props: props }; };\n` +
      `var glyphs = { top: "TopGlyph", bottom: "BottomGlyph", right: "RightGlyph", close: "CloseGlyph" };\n` +
      `return { tabMove: tabMove, menu: __dshCreateTabMoveMenu({ h: h, tabMove: tabMove, glyphs: glyphs }) };`,
  );
  return factory(target);
}

/** Logs "ok -" followed by the provided name to the console. */
const ok = (name) => console.log("ok -", name);

// ---- a destination that cannot host the tab is never offered ----
{
  const { menu } = loadMenu(new EventTarget());
  const chatTab = { id: "chat-1", type: "chat" };

  const items = menu.buildMoveMenuItems({ tab: chatTab, destinations: ["bottom", "right"] });

  assert.deepEqual(
    items,
    [],
    "a menu must not offer a move the destination would refuse (and the chat tab is not closable)",
  );
  ok("move menu omits destinations that cannot host the tab, instead of a silent-failing option");
}

// ---- a destination that can host the tab is offered ----
{
  const { menu } = loadMenu(new EventTarget());
  const terminalTab = { id: "term-1", type: "terminal" };

  const items = menu.buildMoveMenuItems({ tab: terminalTab, destinations: ["top", "bottom"] });

  assert.deepEqual(
    items.map((i) => i.id),
    ["move-top", "move-bottom", "close-tab"],
    "a menu must offer every destination that can host the tab, plus close",
  );
  ok("move menu offers every destination that can host the tab");
}

// ---- the conversation tab never offers "Close Tab" ----
{
  const { menu } = loadMenu(new EventTarget());
  const chatTab = { id: "chat-main", type: "chat" };

  const items = menu.buildMoveMenuItems({ tab: chatTab, destinations: ["top"] });

  assert.ok(
    !items.some((i) => i.id === "close-tab"),
    "the conversation tab must not offer Close Tab",
  );
  ok("move menu never offers closing the conversation tab");
}

// ---- selecting "move-<area>" requests a move and never removes locally ----
{
  const target = new EventTarget();
  const { tabMove, menu } = loadMenu(target);
  const terminalTab = { id: "term-2", type: "terminal" };

  let requested = null;
  tabMove.onMoveRequested("bottom", (tab) => {
    requested = tab;
  });
  let closed = false;
  /** Records that the local close callback ran (it must not, for a move). */
  const onClose = () => {
    closed = true;
  };

  const handled = menu.handleMoveMenuSelect("move-bottom", terminalTab, onClose);

  assert.equal(handled, true, "handleMoveMenuSelect must report it handled a move- id");
  assert.deepEqual(requested, terminalTab, "selecting a move item must request the move");
  assert.equal(closed, false, "selecting a move item must never call the local close callback");
  ok("selecting a move menu item requests the move and never removes the tab locally (#122)");
}

// ---- selecting "close-tab" closes locally and never requests a move ----
{
  const target = new EventTarget();
  const { tabMove, menu } = loadMenu(target);
  const terminalTab = { id: "term-3", type: "terminal" };

  let requested = false;
  tabMove.onMoveRequested("bottom", () => {
    requested = true;
  });
  let closedTab = null;

  const handled = menu.handleMoveMenuSelect("close-tab", terminalTab, (tab) => {
    closedTab = tab;
  });

  assert.equal(handled, true, "handleMoveMenuSelect must report it handled close-tab");
  assert.deepEqual(closedTab, terminalTab, "close-tab must call the local close callback");
  assert.equal(requested, false, "close-tab must never request a cross-surface move");
  ok("selecting close-tab closes locally without requesting a move");
}

// ---- moving the conversation tab to a panel that would refuse it is impossible via the menu ----
{
  const target = new EventTarget();
  const { tabMove, menu } = loadMenu(target);
  const chatTab = { id: "chat-main", type: "chat" };

  let bottomAccepted = null;
  tabMove.onMoveRequested("bottom", (tab) => {
    bottomAccepted = tabMove.takeOwnership("bottom", tab);
  });
  let closed = false;

  // The menu the UI would actually render for the conversation tab never
  // contains a "move-bottom" id (see the first test above); this confirms
  // that even if one were selected some other way, the shared handler still
  // never removes the tab locally before a destination commits.
  menu.handleMoveMenuSelect("move-bottom", chatTab, () => {
    closed = true;
  });

  assert.equal(bottomAccepted, false, "the bottom panel must still refuse a chat tab");
  assert.equal(
    closed,
    false,
    "the conversation tab must never be removed locally on a refused move",
  );
  ok("the conversation tab is never destroyed by a move the destination refuses (#122)");
}

console.log("\ntab-move menu tests passed");
