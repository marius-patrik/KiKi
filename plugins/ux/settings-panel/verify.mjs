import assert from "node:assert/strict";
import {
  SettingsSection,
  SettingsOptionRow,
  SettingsToggleRow,
  SettingsCloseButton,
} from "./lib/index.js";

for (const [name, component] of Object.entries({
  SettingsSection,
  SettingsOptionRow,
  SettingsToggleRow,
  SettingsCloseButton,
})) {
  assert.equal(typeof component, "function", `${name} must be a component`);
}

// The section owns its close action: given onClose it renders the button
// itself, so sections never hand-roll a second close control.
const rendered = SettingsSection({
  label: "Example",
  title: "Example",
  description: "Example description.",
  children: null,
  onClose: () => undefined,
});
const children = rendered.props.children;
assert.ok(Array.isArray(children), "section renders header, options and close");
assert.equal(children.at(-1)?.type, SettingsCloseButton, "section renders its own close button");

const withoutClose = SettingsSection({ label: "Example", title: "Example", children: null });
assert.equal(withoutClose.props.children.at(-1), null, "no close button without onClose");

console.log("Settings panel verification passed.");
