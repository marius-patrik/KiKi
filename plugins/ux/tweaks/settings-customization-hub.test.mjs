import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Both files under test are classic scripts (no import/export) concatenated
 * ahead of client.js in the shipped bundle. Evaluate the shipped bytes
 * directly, against a fake `h` that records what it was asked to render,
 * rather than re-implementing the fold here — so the assertions below cover
 * exactly what the browser runs.
 */
const here = dirname(fileURLToPath(import.meta.url));
const bundled = ["client-settings-customization-hub.js", "client-settings-segmented-tabs.js"]
  .map((name) => readFileSync(join(here, name), "utf8"))
  .join("\n");
const { hub, SegmentedTabs } = new Function(
  `${bundled}
   var h = function (type, props, children) { return { type: type, props: props, children: children }; };
   return {
     hub: __dshCreateSettingsCustomizationHub(),
     SegmentedTabs: __dshCreateSettingsSegmentedTabs(h),
   };`,
)();

/** Names one passing assertion group on stdout. */
const passed = (what) => console.log("ok -", what);

const ledger = [
  { id: "general", label: "General", order: 0 },
  { id: "agent-presets", label: "Agent presets", order: 20 },
  { id: "tools", label: "Tools", order: 25 },
  { id: "loops", label: "Loops", order: 26 },
  { id: "skills-hooks", label: "Skills & Hooks", order: 25 },
  { id: "plugins", label: "Plugins", order: 30 },
  { id: "agents", label: "Agents", order: 31 },
  { id: "profiles", label: "Profiles", order: 40 },
  { id: "actions", label: "Actions", order: 100 },
];

/** The shell's label pass, as client.js applies it to every row. */
const relabel = (row) =>
  row.id === "agent-presets" ? Object.assign({}, row, { label: "Modes" }) : row;

const folded = hub.fold(ledger, relabel);

assert.deepEqual(
  folded.rows.map((row) => row.id),
  ["general", "composition", "actions"],
  "every folded section leaves the nav, and one hub row takes the first one's place",
);
assert.deepEqual(
  folded.tabs,
  [
    { id: "plugins", label: "Plugins" },
    { id: "agent-presets", label: "Modes" },
    { id: "tools", label: "Tools" },
    { id: "agents", label: "Agents" },
    { id: "loops", label: "Loops" },
    { id: "skills-hooks", label: "Skills & Hooks" },
    { id: "profiles", label: "Profiles" },
  ],
  "sub-tabs are presented in the hub's own order, wearing the shell's labels",
);
assert.equal(hub.label, "Composition");
assert.ok(
  !folded.tabs.some((tab) => tab.label === hub.label),
  "the section's name must be distinct from every sub-tab name (#119, #235)",
);
passed("fold absorbs the seven sections into one relabelled hub row");

assert.deepEqual(hub.resolve("plugins", folded.tabs), { active: "composition", subTab: "plugins" });
assert.deepEqual(hub.resolve("composition", folded.tabs), {
  active: "composition",
  subTab: "plugins",
});
assert.deepEqual(hub.resolve("general", folded.tabs), { active: "general", subTab: undefined });
passed("a folded section id still addresses its sub-tab, and other ids are untouched");

const empty = hub.fold([{ id: "general", label: "General", order: 0 }], relabel);
assert.deepEqual(empty.tabs, []);
assert.deepEqual(
  empty.rows.map((row) => row.id),
  ["general"],
  "with nothing to fold the shell offers no hub row rather than an empty one",
);
assert.deepEqual(hub.resolve("plugins", empty.tabs), { active: "plugins", subTab: undefined });
passed("no hub row exists while none of its sections is registered");

const partial = hub.fold(
  [
    { id: "general", label: "General", order: 0 },
    { id: "tools", label: "Tools", order: 25 },
  ],
  relabel,
);
assert.deepEqual(partial.tabs, [{ id: "tools", label: "Tools" }]);
assert.deepEqual(hub.resolve("composition", partial.tabs), {
  active: "composition",
  subTab: "tools",
});
passed("a partly-composed profile folds only the sections it actually has");

const strip = SegmentedTabs({ tabs: folded.tabs, active: "tools", onSelect: () => {} });
assert.equal(strip.props.role, "tablist");
assert.deepEqual(
  strip.children.map((tab) => tab.children),
  ["Plugins", "Modes", "Tools", "Agents", "Loops", "Skills & Hooks", "Profiles"],
);
assert.deepEqual(
  strip.children.map((tab) => tab.props["aria-selected"]),
  ["false", "false", "true", "false", "false", "false", "false"],
);
assert.equal(SegmentedTabs({ tabs: [], onSelect: () => {} }), null);
passed("the shared strip renders one pill per tab and marks the selected one");

console.log("settings customization hub check passed");
