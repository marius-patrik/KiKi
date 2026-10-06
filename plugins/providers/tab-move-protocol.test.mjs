import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(dir, "client-tab-move-protocol.js"), "utf8");

/**
 * The protocol file is a classic script (no import/export) meant to be
 * concatenated ahead of client.js in the shipped bundle. Evaluate the shipped
 * bytes directly against a plain EventTarget rather than re-implementing the
 * logic here, so this test exercises exactly what ships.
 */
function loadProtocol(target) {
  const factory = new Function("target", `${source}\nreturn __dshCreateTabMoveProtocol(target);`);
  return factory(target);
}

/** Logs "ok -" followed by the provided name to the console. */
const ok = (name) => console.log("ok -", name);

// ---- a chat tab moved to "bottom" is refused, not lost ----
{
  const target = new EventTarget();
  const tabMove = loadProtocol(target);
  const chatTab = { id: "chat-1", type: "chat" };

  let bottomAccepted = null;
  tabMove.onMoveRequested("bottom", (tab) => {
    bottomAccepted = tabMove.takeOwnership("bottom", tab);
  });

  let committed = false;
  tabMove.onForeignCommit("top", () => {
    committed = true;
  });

  tabMove.requestMove("bottom", chatTab);

  assert.equal(bottomAccepted, false, "bottom must refuse a chat tab");
  assert.equal(committed, false, "a refused move must never commit");
  ok("chat tab to bottom panel is refused, never removed from its source (#122)");
}

/**
 * Asserts that moving a terminal tab to `targetArea` leaves it in exactly one
 * area, with the two non-target areas dropping their copies on commit.
 */
function assertTerminalMoveCommitsOnce(targetArea, otherAreas, description) {
  const target = new EventTarget();
  const tabMove = loadProtocol(target);
  const terminalTab = { id: `term-${targetArea}`, type: "terminal" };

  const areas = { top: [terminalTab], bottom: [], right: [] };

  tabMove.onMoveRequested(targetArea, (tab) => {
    if (!tabMove.takeOwnership(targetArea, tab)) return;
    areas[targetArea].push(tab);
  });
  for (const area of otherAreas) {
    tabMove.onForeignCommit(area, (detail) => {
      areas[area] = areas[area].filter((t) => t.id !== detail.id);
    });
  }

  tabMove.requestMove(targetArea, terminalTab);

  const presentIn = Object.keys(areas).filter((area) =>
    areas[area].some((t) => t.id === terminalTab.id),
  );
  assert.deepEqual(presentIn, [targetArea], "a committed tab must live in exactly one area");
  ok(description);
}

// ---- terminal tab moves to each hostable area commit exactly once ----
assertTerminalMoveCommitsOnce(
  "bottom",
  ["top", "right"],
  "terminal tab moved to bottom panel exists in exactly one area afterward (#122)",
);
assertTerminalMoveCommitsOnce(
  "right",
  ["top", "bottom"],
  "terminal tab moved to secondary sidebar exists in exactly one area afterward (#241)",
);

// ---- a move request no destination is listening for leaves the tab in place ----
{
  const target = new EventTarget();
  const tabMove = loadProtocol(target);
  const tab = { id: "orphan-1", type: "terminal" };
  let removedFromSource = false;
  tabMove.onForeignCommit("top", () => {
    removedFromSource = true;
  });

  tabMove.requestMove("right", tab);

  assert.equal(removedFromSource, false, "an unanswered request must not remove the source copy");
  ok("a request with no listening destination leaves the tab exactly where it was (#122)");
}

console.log("\ntab-move protocol tests passed");
