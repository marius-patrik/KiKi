// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding, duplicated by design across sibling packages
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Context } from "@deepseek-ai/cordis";
import assert from "node:assert";
import {
  assertLoaderShape,
  loadClientLoaderSpec,
  stubSettingsService,
} from "../../../scripts/plugin-check-kit.mjs";

const root = mkdtempSync(join(tmpdir(), "agents-"));

const plugin = await import("./lib/index.js");
const { authoringRoot, defaultBase, defaultPersona, NS } = await import("./lib/settings.js");
const { parsePersona, sanitizeId } = await import("./lib/persona.js");
const { splicePersona, composeComposition, composeMetadata } = await import("./lib/compose.js");
const {
  basePresetDir,
  PRESET_ROOT,
  SOURCE_MARKER,
  readBaseComposition,
  syncPersonas,
  materializePreset,
} = await import("./lib/sync.js");
const { PersonaCatalog } = await import("./lib/catalog.js");
const { PERSONA_SELECTED, PersonaController, foldPersona, hasOpenTurn } = await import(
  "./lib/controller.js"
);

// ── loader shape ──
assertLoaderShape(plugin, "agents");
assert.equal(NS, "agents");
assert.equal(plugin.inject.length, 0);
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

// ── volatile marking: what keeps `agents` a settings form at all ──
// Since 0.2.0 the settings service projects an entry's form from the VOLATILE
// fields of its Config alone. `volatileForm()` returns undefined for a schema
// that declares none, so `describe()` silently omits the entry and every write
// (`update`/`replace`/`mutate`) throws `has no volatile fields` — and the
// `auto: false` page policy would attach to a form that does not exist.
// `defaultPersona` is the user's choice and is therefore volatile; the
// authoring root and the default base preset are deployment facts and stay out.
const configMeta = (() => {
  const json = plugin.Config.toJSON();
  const dict = json.dict ?? json.refs[json.uid].dict;
  return (field) => json.refs[dict[field]].meta;
})();
assert.equal(
  configMeta("defaultPersona").volatile,
  true,
  "defaultPersona must stay volatile or the agents entry has no settings form",
);
assert.equal(
  configMeta("root").volatile,
  undefined,
  "root is deployment wiring, not a field the settings page edits",
);
assert.equal(
  configMeta("defaultBase").volatile,
  undefined,
  "defaultBase is deployment wiring, not a field the settings page edits",
);

// The marking is not decoration: a volatile field resolves to a live reference,
// a plain one to the value itself.
const resolved = plugin.Config({ defaultPersona: "reviewer" });
assert.equal(typeof resolved.root, "string", "root stays a plain string");
assert.equal(
  typeof resolved.defaultPersona.get,
  "function",
  "defaultPersona must resolve to a live reference the Loader commits writes into",
);
assert.equal(resolved.defaultPersona.get(), "reviewer");
assert.equal(defaultPersona(undefined, resolved), "reviewer");
console.log("volatile marking ok (defaultPersona live; root/defaultBase deployment facts)");

// ── settings helpers: root, base, persona ──
assert.equal(authoringRoot("/home", undefined, undefined), "/home/agents");
assert.equal(authoringRoot("/home", { root: "custom" }, undefined), "/home/custom");
assert.equal(authoringRoot("/home", undefined, plugin.Config({ root: "/abs/root" })), "/abs/root");
assert.equal(authoringRoot("/home", { root: "/win" }, plugin.Config({ root: "/abs" })), "/win");
assert.equal(defaultBase(undefined, undefined), "standard");
assert.equal(defaultBase({ defaultBase: "minimal" }, undefined), "minimal");
assert.equal(defaultBase(undefined, plugin.Config({ defaultBase: "cordis" })), "cordis");
assert.equal(defaultPersona(undefined, undefined), undefined);
assert.equal(defaultPersona({ defaultPersona: "x" }, undefined), "x");
assert.equal(defaultPersona(undefined, plugin.Config({ defaultPersona: "y" })), "y");
assert.equal(
  defaultPersona({ defaultPersona: "x" }, plugin.Config({ defaultPersona: "y" })),
  "x",
  "a settings document still wins over the Config",
);
assert.equal(defaultPersona(undefined, plugin.Config({})), undefined, "an empty id means none");
console.log("settings helpers ok");

// ── persona parsing ──
assert.equal(sanitizeId("My Agent"), "my-agent");
assert.equal(sanitizeId("..."), "agent");
assert.equal(sanitizeId("Refactor.Review"), "refactor.review");
const md = parsePersona(
  "/x/reviewer.md",
  `---\nname: PR Reviewer\nbase: minimal\ndescription: Reviews pull requests\n---\n\nYou review PRs carefully.\nWith a second paragraph.`,
);
assert.equal(md.id, "reviewer");
assert.equal(md.name, "PR Reviewer");
assert.equal(md.base, "minimal");
assert.equal(md.description, "Reviews pull requests");
assert.equal(md.prompt, "You review PRs carefully.\nWith a second paragraph.");
const bare = parsePersona("/x/bare.md", "Just instructions.");
assert.equal(bare.id, "bare");
assert.equal(bare.prompt, "Just instructions.");
assert.equal(bare.base, undefined);
const json = parsePersona(
  "/x/tester.json",
  JSON.stringify({ name: "Tester", description: "T", base: "standard", prompt: "Run the tests." }),
);
assert.equal(json.id, "tester");
assert.equal(json.prompt, "Run the tests.");
assert.equal(json.base, "standard");
assert.throws(
  () => parsePersona("/x/empty.json", JSON.stringify({ prompt: "   " })),
  /must not be empty/,
);
assert.throws(() => parsePersona("/x/no.json", "{}"), /needs a string/);
assert.throws(() => parsePersona("/x/file.txt", "hello"), /unsupported persona file type/);
console.log("persona parsing ok");

// ── composition: neutral persona row via splicePersona (private neutralPersonaRow) ──
const row = splicePersona(""); // no base → prepends neutral row
assert.ok(
  row.includes("- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    text: ''"),
  "neutral persona row: " + row,
);
const meta = composeMetadata({ id: "x", name: 'Say "hi"', description: "D" });
assert.ok(meta.includes('name: "Say \\"hi\\""'));
assert.ok(meta.includes('description: "D"'));
const bareMeta = composeMetadata({ id: "x" });
assert.ok(bareMeta.startsWith("#"));
console.log("composition helpers ok");

// ── splice against a synthetic base: neutral row replaces, `!!js` preserved ──
const synthetic = `- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    text: >-\n      Old persona text.\n\n- id: tool-bash\n  name: '@deepseek-ai/dsh-tool-bash'\n  disabled: !!js process.platform === 'win32'\n`;
const spliced = splicePersona(synthetic);
assert.ok(spliced.includes("text: ''"), "neutral row spliced in");
assert.ok(!spliced.includes("Old persona text."), "old prompt removed");
assert.ok(spliced.includes("disabled: !!js process.platform === 'win32'"), "!!js preserved");
assert.equal(spliced.split("- id: persona").length - 1, 1, "exactly one persona row");
const prepended = splicePersona("- id: tool-fs\n  name: x\n");
assert.ok(prepended.startsWith("- id: persona"), "prepended when none present");
assert.ok(prepended.includes("- id: tool-fs"));
console.log("base splice ok");

// ── real-world: neutral row spliced into the shipped standard declaration ──
// Since dsh-v0.2.0-rc.2 a shipped preset is one `@deepseek-ai/dsh-agent-preset`
// declaration in the web-app bundle (`<id>.patch.yml`) whose plugin entry list
// is nested under `config.plugins`, not a per-preset `agent.cordis.yml`
// directory under `packages/preset/agent-presets/presets`.
const baseDir = basePresetDir();
assert.ok(
  baseDir !== undefined && existsSync(join(baseDir, "standard.patch.yml")),
  "shipped standard preset declaration must be reachable for the splice test",
);
const standard = await readBaseComposition(baseDir, "standard");
assert.ok(standard !== undefined, "the shipped declaration must carry a plugin entry list");
assert.ok(
  standard.startsWith("- id: "),
  "the entry list is dedented to column 0, not left at the declaration's nesting",
);
const jsBefore = standard.split("!!js").length - 1;
const standardSpliced = splicePersona(standard);
assert.equal(standardSpliced.split("!!js").length - 1, jsBefore);
assert.equal(standardSpliced.split("- id: persona").length - 1, 1);
assert.ok(standardSpliced.includes("text: ''"), "neutral persona row in standard composition");
assert.ok(
  !standardSpliced.includes("You are a coding agent powered by the {{model}} model"),
  "old persona prompt gone",
);
assert.ok(standardSpliced.includes("- id: agent-instructions"), "non-persona rows intact");
console.log("standard composition splice ok (!!js preserved, neutral persona row)");

// Every shipped preset resolves to a usable entry list — including `cordis`,
// whose block opens with comments rather than a row.
for (const id of ["standard", "minimal", "ptc", "cordis"]) {
  const list = await readBaseComposition(baseDir, id);
  assert.ok(list !== undefined, `${id}: entry list readable`);
  assert.ok(
    splicePersona(list)
      .split("\n")
      .some((line) => line.startsWith("- id: ")),
    `${id}: entry list carries rows`,
  );
  assert.equal(splicePersona(list).split("- id: persona").length - 1, 1, `${id}: one persona row`);
}
assert.equal(await readBaseComposition(baseDir, "no-such-preset"), undefined);
console.log("shipped preset declarations ok (all four presets)");

// ── materialize + sync over a temp home: neutral row in output ──
const home = join(root, "home");
const homeRoot = join(home, "agents");
mkdirSync(homeRoot, { recursive: true });
writeFileSync(
  join(homeRoot, "reviewer.md"),
  `---\nname: PR Reviewer\nbase: standard\ndescription: Reviews pull requests\n---\n\nReview PRs.\n`,
);
writeFileSync(
  join(homeRoot, "tester.json"),
  JSON.stringify({ name: "Tester", prompt: "Run tests." }),
);
writeFileSync(join(homeRoot, "broken.md"), "---\nname: B\n---\n\n  ");

const report = await syncPersonas(home, homeRoot, baseDir);
assert.deepEqual(report.materialized.map((m) => m.id).sort(), ["reviewer", "tester"]);
assert.equal(report.failed.length, 1);
assert.ok(report.failed[0].includes("broken"));
assert.equal(report.pruned.length, 0);
for (const id of ["reviewer", "tester"]) {
  assert.ok(
    existsSync(join(home, PRESET_ROOT, id, "agent.cordis.yml")),
    `preset ${id} materialized`,
  );
  assert.ok(existsSync(join(home, PRESET_ROOT, id, SOURCE_MARKER)), `preset ${id} marked`);
}
const reviewerComposition = readFileSync(
  join(home, PRESET_ROOT, "reviewer", "agent.cordis.yml"),
  "utf8",
);
assert.ok(reviewerComposition.includes("text: ''"), "neutral persona row in materialized preset");
assert.ok(!reviewerComposition.includes("Review PRs."), "persona text NOT embedded in preset");
assert.ok(reviewerComposition.includes("- id: tool-fs"), "base tools intact");
const metadata = readFileSync(join(home, PRESET_ROOT, "reviewer", "preset.yml"), "utf8");
assert.ok(metadata.includes('name: "PR Reviewer"'));
console.log("sync materialization ok (neutral persona row)");

// ── bare fallback: neutral row only, no tool-fs ──
const bareHome = join(root, "bare-home");
mkdirSync(join(bareHome, "agents"), { recursive: true });
writeFileSync(join(bareHome, "agents", "solo.md"), "Solo persona.");
const bareReport = await syncPersonas(bareHome, join(bareHome, "agents"), undefined);
assert.equal(bareReport.materialized.length, 1);
const bareComposition = readFileSync(
  join(bareHome, PRESET_ROOT, "solo", "agent.cordis.yml"),
  "utf8",
);
assert.ok(bareComposition.includes("text: ''"), "neutral row in bare fallback");
assert.ok(!bareComposition.includes("Solo persona."), "no persona text in bare fallback");
assert.ok(!bareComposition.includes("- id: tool-fs"));
console.log("bare persona fallback ok");

// ── pruning: only marked presets whose source is gone; hand-authored presets survive ──
mkdirSync(join(home, PRESET_ROOT, "handmade"), { recursive: true });
writeFileSync(
  join(home, PRESET_ROOT, "handmade", "agent.cordis.yml"),
  "- id: persona\n  name: x\n",
);
rmSync(join(homeRoot, "tester.json"));
const pruned = await syncPersonas(home, homeRoot, baseDir);
assert.deepEqual(pruned.pruned, ["tester"]);
assert.ok(existsSync(join(home, PRESET_ROOT, "reviewer")));
assert.ok(existsSync(join(home, PRESET_ROOT, "handmade")), "unmarked preset must never be pruned");
assert.equal(pruned.materialized.length, 1);
console.log("prune ok (marked-only, source-gone)");

// ── catalog: id→prompt resolution from the authoring root ──
const catalogRoot = join(root, "catalog-root");
mkdirSync(catalogRoot, { recursive: true });
writeFileSync(join(catalogRoot, "alpha.md"), `---\nname: Alpha\n---\n\nAlpha prompt.\n`);
writeFileSync(join(catalogRoot, "beta.json"), JSON.stringify({ prompt: "Beta prompt." }));
const catalog = new PersonaCatalog({ root: catalogRoot });
await catalog.load();
assert.equal(catalog.get("alpha").prompt, "Alpha prompt.");
assert.equal(catalog.nameOf("beta"), "beta");
assert.equal(catalog.nameOf("alpha"), "Alpha");
assert.equal(catalog.get("missing"), undefined);
assert.deepEqual([...catalog.ids()].sort(), ["alpha", "beta"]);
console.log("catalog ok");

// ── controller: fold, set, pending, commit, unknown ──
const catalogRoot2 = join(root, "catalog-ctrl");
mkdirSync(catalogRoot2, { recursive: true });
writeFileSync(join(catalogRoot2, "reviewer.md"), "You review PRs.");
writeFileSync(join(catalogRoot2, "tester.json"), JSON.stringify({ prompt: "Run the tests." }));
const ctrlCatalog = new PersonaCatalog({ root: catalogRoot2 });
await ctrlCatalog.load();
const controller = new PersonaController({ resolve: (id) => ctrlCatalog.get(id) !== undefined });

const /** makeSession implementation. */
  makeSession = (header = {}) => {
    const events = [];
    return {
      events,
      header,
      /** append implementation. */
      append(type, data) {
        events.push({ type, data });
      },
    };
  };

// foldPersona
assert.equal(foldPersona([]), "");
assert.equal(foldPersona([{ type: "other" }]), "");
assert.equal(
  foldPersona([{ type: PERSONA_SELECTED, data: { personaId: "reviewer" } }]),
  "reviewer",
);
assert.equal(
  foldPersona([
    { type: PERSONA_SELECTED, data: { personaId: "reviewer" } },
    { type: PERSONA_SELECTED, data: { personaId: "tester" } },
  ]),
  "tester",
  "last wins",
);

// hasOpenTurn
assert.equal(hasOpenTurn([]), false);
assert.equal(hasOpenTurn([{ type: "turn/start" }]), true);
assert.equal(hasOpenTurn([{ type: "turn/start" }, { type: "turn/end" }]), false);

// get / set closed turn / noop / unknown
const s0 = makeSession();
assert.deepEqual(controller.get({ session: s0 }), { personaId: "" });
assert.equal(controller.set({ session: s0 }, "reviewer"), "committed");
assert.deepEqual(controller.get({ session: s0 }), { personaId: "reviewer" });
assert.equal(s0.events[s0.events.length - 1].type, PERSONA_SELECTED);
assert.equal(controller.set({ session: s0 }, "reviewer"), "noop");
assert.throws(() => controller.set({ session: s0 }, "nope"), /Unknown persona: nope/);

// set open turn → queued; commitPending → appends; pendingOf
const s1 = makeSession();
s1.events.push({ type: "turn/start", data: {} });
assert.equal(hasOpenTurn(s1.events), true);
assert.equal(controller.set({ session: s1 }, "reviewer"), "queued");
assert.equal(controller.set({ session: s1 }, "tester"), "queued");
assert.equal(foldPersona(s1.events), "", "nothing committed yet");
assert.equal(controller.pendingOf({ session: s1 }), "tester");
controller.commitPending(s1);
assert.equal(foldPersona(s1.events), "tester");
assert.equal(controller.pendingOf({ session: s1 }), undefined);

// opposite pending → cancelled
const s2 = makeSession();
s2.events.push({ type: "turn/start" }, { type: PERSONA_SELECTED, data: { personaId: "reviewer" } });
assert.equal(controller.set({ session: s2 }, "tester"), "queued");
assert.equal(controller.set({ session: s2 }, "reviewer"), "cancelled", "opposite clears");
console.log("controller ok");

// ── personaPolicyText: section text resolution chains ──
const s3 = makeSession();
s3.append(PERSONA_SELECTED, { personaId: "reviewer" });
assert.equal(
  plugin.personaPolicyText({ agent: { session: s3 } }, controller, ctrlCatalog, undefined),
  "You review PRs.",
  "live wins",
);
const s4 = makeSession();
assert.equal(
  plugin.personaPolicyText({ agent: { session: s4 } }, controller, ctrlCatalog, undefined),
  "",
  "no live, no header, no fallback → empty",
);
const s5 = makeSession();
assert.equal(
  plugin.personaPolicyText({ agent: { session: s5 } }, controller, ctrlCatalog, "reviewer"),
  "You review PRs.",
  "fallback wins",
);
const s6 = makeSession();
assert.equal(
  plugin.personaPolicyText(
    {
      agent: {
        session: {
          events: [],
          header: { agentPreset: "reviewer" } /** append implementation. */,
          /** append implementation. */
          append() {},
        },
      },
    },
    controller,
    ctrlCatalog,
    undefined,
  ),
  "You review PRs.",
  "header wins",
);
const s7 = makeSession();
assert.equal(
  plugin.personaPolicyText(
    {
      agent: {
        session: {
          events: [],
          header: { agentPreset: "unknown" } /** append implementation. */,
          /** append implementation. */
          append() {},
        },
      },
    },
    controller,
    ctrlCatalog,
    undefined,
  ),
  "",
  "unknown header → empty",
);
assert.equal(
  plugin.personaPolicyText({}, controller, ctrlCatalog, undefined),
  "",
  "no agent → empty",
);
console.log("personaPolicyText ok");

// ── apply: boot sync + live-persona wiring over stub ctx ──
const bootHome = join(root, "boot-home");
mkdirSync(join(bootHome, "agents"), { recursive: true });
writeFileSync(join(bootHome, "agents", "boot.md"), "Boot persona.");
writeFileSync(join(bootHome, "agents", "reviewer.md"), "Review personas.");
const prevDshHome = process.env.DSH_HOME;
process.env.DSH_HOME = bootHome;
let capturedSection = null;
let capturedProjection = null;
let capturedCommand = null;
const actx = new Context();
const { service: bootSettings, registrations } = stubSettingsService();
actx.provide("settings", bootSettings);
actx.provide("systemPrompt", {
  section: (def) => {
    capturedSection = def;
    return () => {};
  },
});
actx.provide("sessionProjections", {
  register: (def) => {
    capturedProjection = def;
    return () => {};
  },
});
actx.provide("commands", {
  register: (def) => {
    capturedCommand = def;
    return () => {};
  },
});
actx.logger = { info: () => {}, warn: (m) => console.log("WARN:", m) };
const bootConfig = plugin.Config({ defaultPersona: "reviewer" });
plugin.apply(actx, bootConfig);
await new Promise((resolve) => setTimeout(resolve, 500));

// Since 0.2.0 the plugin registers no settings form; it only declares that it
// ships its own page for the form the service projects from its own Config.
assert.equal(NS, "agents", "namespace must be this plugin's entry id");
assert.equal(
  registrations.length,
  1,
  `expected one settings page policy, got ${registrations.length}`,
);
assert.equal(registrations[0].presentation.auto, false);
console.log("declareCustomSettingsPage ok (auto=false)");

// boot sync: neutral row in the materialized preset
assert.ok(
  existsSync(join(bootHome, PRESET_ROOT, "boot", SOURCE_MARKER)),
  "boot sync materialized the persona",
);
assert.ok(existsSync(join(bootHome, PRESET_ROOT, "boot", "agent.cordis.yml")));
const bootComposition = readFileSync(
  join(bootHome, PRESET_ROOT, "boot", "agent.cordis.yml"),
  "utf8",
);
assert.ok(bootComposition.includes("text: ''"), "boot preset has neutral persona row");

// section registration: persona:policy with text provider
assert.ok(capturedSection !== null, "persona:policy section registered");
assert.equal(capturedSection.name, "persona:policy");
assert.equal(capturedSection.order, 45);
assert.equal(typeof capturedSection.text, "function");
assert.equal(capturedSection.text({}), "", "no agent → empty");
const bootAgentSession = {
  events: [],
  header: { agentPreset: "boot" } /** append implementation. */,
  /** append implementation. */
  append() {},
};
assert.equal(
  capturedSection.text({ agent: { session: bootAgentSession } }),
  "Boot persona.",
  "header preset resolves via catalog",
);

// The volatile fallback is read per use, never captured at boot: the Loader
// commits a settings write into the SAME reference without remounting the
// plugin, so a captured value would go stale for the life of the process.
const unselectedSession = {
  events: [],
  header: {} /** append implementation. */,
  /** append implementation. */
  append() {},
};
assert.equal(
  capturedSection.text({ agent: { session: unselectedSession } }),
  "Review personas.",
  "configured fallback renders with no live selection and no header preset",
);
bootConfig.defaultPersona[Symbol.for("cosmokit.volatile.write")]("boot");
assert.equal(
  capturedSection.text({ agent: { session: unselectedSession } }),
  "Boot persona.",
  "a settings write commits into the same reference and the section follows it",
);
assert.equal(
  capturedCommand.handler({ agent: { session: unselectedSession }, rawInput: "" }).text,
  "Current persona: boot",
  "/persona with no argument reads the live reference too",
);
// Put the deployment default back so the remaining command assertions exercise
// the no-fallback path they were written against.
bootConfig.defaultPersona[Symbol.for("cosmokit.volatile.write")]("");
assert.equal(
  capturedSection.text({ agent: { session: unselectedSession } }),
  "",
  "clearing the fallback leaves the section empty",
);
console.log("volatile fallback ok (read per use, not captured at boot)");

// projection registration: persona unit
assert.ok(capturedProjection !== null, "persona projection registered");
assert.equal(capturedProjection.key, "persona");
assert.equal(capturedProjection.stateVersion, 1);
assert.deepEqual(capturedProjection.init(), { personaId: "", pending: false });
assert.deepEqual(
  capturedProjection.apply(
    { personaId: "", pending: false },
    { type: "command/run", data: { name: "persona", args: "boot" } },
  ),
  { personaId: "boot", pending: true },
  "command/run → pending",
);
assert.deepEqual(
  capturedProjection.apply(
    { personaId: "boot", pending: true },
    { type: PERSONA_SELECTED, data: { personaId: "boot" } },
  ),
  { personaId: "boot", pending: false },
  "persona/selected → committed",
);
assert.deepEqual(
  capturedProjection.apply({ personaId: "boot", pending: false }, { type: "other" }),
  { personaId: "boot", pending: false },
  "unrelated event → no change",
);

// command registration: /persona
assert.ok(capturedCommand !== null, "/persona command registered");
assert.equal(capturedCommand.name, "persona");
const cmdSession = makeSession();
const cmdResult = capturedCommand.handler({ agent: { session: cmdSession }, rawInput: "" });
assert.equal(cmdResult.kind, "success");
assert.ok(cmdResult.text.includes("No persona"), "no persona → fallback message");
const switchResult = capturedCommand.handler({ agent: { session: cmdSession }, rawInput: "boot" });
assert.equal(switchResult.kind, "success");
assert.ok(switchResult.text.includes("boot"), "switch succeeded");
assert.equal(cmdSession.events[cmdSession.events.length - 1].type, PERSONA_SELECTED);
const unknownResult = capturedCommand.handler({ agent: { session: cmdSession }, rawInput: "nope" });
assert.equal(unknownResult.kind, "error");
assert.ok(unknownResult.text.includes("nope"), "unknown persona error");
const alreadyResult = capturedCommand.handler({ agent: { session: cmdSession }, rawInput: "boot" });
assert.equal(alreadyResult.kind, "success");
assert.ok(alreadyResult.text.includes("already"), "noop → already message");

if (prevDshHome === undefined) delete process.env.DSH_HOME;
else process.env.DSH_HOME = prevDshHome;
console.log("apply boot + live-persona wiring ok");

// ── CLI round-trip: list / add / remove / sync over DSH_HOME ──
const cliHome = join(root, "cli-home");
mkdirSync(join(cliHome, "agents"), { recursive: true });
writeFileSync(join(cliHome, "agents", "writer.md"), "You are a writer.");
const cliEnv = { ...process.env, DSH_HOME: cliHome };
const cli = new URL("./bin/agents.mjs", import.meta.url).pathname;
const list = spawnSync(process.execPath, [cli, "list"], { env: cliEnv, encoding: "utf8" });
assert.equal(list.status, 0, list.stderr);
assert.ok(list.stdout.includes("writer"));
const extra = join(root, "extra-reviewer.md");
writeFileSync(extra, "---\nname: Extra\n---\n\nReview.\n");
const add = spawnSync(process.execPath, [cli, "add", extra], { env: cliEnv, encoding: "utf8" });
assert.equal(add.status, 0, add.stderr);
assert.ok(add.stdout.includes("added persona extra-reviewer.md"));
assert.ok(existsSync(join(cliHome, PRESET_ROOT, "extra-reviewer", SOURCE_MARKER)));
const remove = spawnSync(process.execPath, [cli, "remove", "writer"], {
  env: cliEnv,
  encoding: "utf8",
});
assert.equal(remove.status, 0, remove.stderr);
assert.ok(remove.stdout.includes("removed persona writer"));
assert.ok(
  !existsSync(join(cliHome, PRESET_ROOT, "writer")),
  "removing the persona pruned its preset",
);
const missing = spawnSync(process.execPath, [cli, "remove", "nope"], {
  env: cliEnv,
  encoding: "utf8",
});
assert.notEqual(missing.status, 0);
const syncRes = spawnSync(process.execPath, [cli, "sync"], { env: cliEnv, encoding: "utf8" });
assert.equal(syncRes.status, 0, syncRes.stderr);
console.log("cli round-trip ok (list/add/remove/sync)");

// ── client bundle: settings section + icon + persona badge + commandUi switcher ──
const clientPath = new URL("./lib/client.js", import.meta.url);
assert.ok(readFileSync(clientPath, "utf8").includes("__ModuleLoader__.load"));
assert.ok(
  readFileSync(new URL("./client.js", import.meta.url), "utf8").includes("__ModuleLoader__.load"),
);
const loader = await loadClientLoaderSpec(clientPath);
assert.equal(loader.spec.id, "@dsh-stack/agents");
const stubRoster = [
  { id: "reviewer", name: "PR Reviewer", description: "Reviews PRs" },
  { id: "tester", description: "Runs tests" },
];
const executedCommands = [];
let currentProjection = { personaId: "", pending: false };
const commandUiRegistrants = [];
const clientExports = loader.spec.factory((spec) => {
  if (spec === "react") return {};
  if (spec === "@deepseek-ai/dsh-client-ui-primitives")
    return { IconGoalOutline16: () => null, IconPersonalizationOutline16: () => null };
  throw new Error("unexpected require: " + spec);
}, {});
assert.deepEqual(
  clientExports.inject,
  ["slots", "connection", "commandUi", "sessions", "remote"],
  "client inject must match package.json",
);
const clientRegistrants = new Map();
const clientCtx = {
  /** effect implementation. */
  effect(fn) {
    fn();
  },
  slots: {
    /** inject implementation. */
    inject(name, fn) {
      clientRegistrants.set(name, fn);
    },
    /** register implementation. */
    register(spec) {
      return spec;
    },
  },
  /** inject implementation. */
  inject(services, cb) {
    const scope = {
      /** effect implementation. */
      effect(fn) {
        fn();
      },
      /** get implementation. */
      get(name) {
        if (name === "commandUi")
          return {
            /** register implementation. */
            register(spec) {
              commandUiRegistrants.push(spec);
              return () => {};
            },
          };
        return undefined;
      },
      sessions: {
        /** get implementation. */
        get() {
          return {
            projections: {
              /** get implementation. */
              get() {
                return currentProjection;
              },
            },
          };
        },
      },
    };
    cb(scope);
  },
  connection: {
    api: {
      agentPresets: {
        /** list implementation. */
        list() {
          return Promise.resolve({ result: { ok: true, value: { presets: stubRoster } } });
        },
      },
    },
  },
  remote: {
    commands: {
      /** execute implementation. */
      execute(sessionId, line) {
        executedCommands.push({ sessionId, line });
        return Promise.resolve({ ok: true });
      },
    },
  },
};
clientExports.apply(clientCtx);

// settings.section + icon (unchanged from Phase B)
const agentsSection = clientRegistrants.get("settings.section")();
assert.equal(agentsSection.id, "agents");
assert.equal(agentsSection.order, 25);
assert.equal(agentsSection.label(), "Agents");
assert.equal(typeof agentsSection.inject().listPresets, "function");
const agentsGlyph = clientRegistrants.get("settings.section.icon")();
assert.equal(agentsGlyph.id, "agents");

// conversation.input.left: persona badge (after roster warmup)
const leftBadge = clientRegistrants.get("conversation.input.left");
assert.ok(leftBadge !== undefined, "conversation.input.left registered");
const leftSpec = leftBadge();
assert.equal(leftSpec.name, "conversation.input.left");
assert.equal(leftSpec.id, "persona-chip", "conversation.input.left has id");

// commandUi: /persona popupSelect — warm up roster first
assert.equal(commandUiRegistrants.length, 1, "one commandUi registration");
const personaCmd = commandUiRegistrants[0];
assert.equal(personaCmd.name, "persona");
assert.equal(personaCmd.ui.kind, "popupSelect");
currentProjection = { personaId: "reviewer", pending: false };
const options = await personaCmd.ui.options({ sessionId: "s1" });
assert.equal(options.length, 2, "two roster entries");
const reviewerOpt = options.find((o) => o.id === "reviewer");
assert.ok(reviewerOpt.active, "reviewer is active");
assert.equal(reviewerOpt.label, "PR Reviewer", "label from roster");
const testerOpt = options.find((o) => o.id === "tester");
assert.ok(!testerOpt.active, "tester is not active");
await personaCmd.ui.onSelect({ id: "tester" }, { sessionId: "s1" });
assert.equal(executedCommands.length, 1);
assert.equal(executedCommands[0].sessionId, "s1");
assert.equal(executedCommands[0].line, "/persona tester");

// badge nameFor (now that roster is loaded)
const leftFace = leftSpec.inject();
assert.equal(typeof leftFace.nameFor, "function");
assert.equal(leftFace.nameFor("reviewer"), "PR Reviewer", "nameFor resolves from roster");
assert.equal(leftFace.nameFor("unknown"), "unknown", "nameFor falls back to id");
console.log("agents client ok (settings + badge + switcher)");

rmSync(root, { recursive: true, force: true });
console.log("plugin check passed");

// jscpd:ignore-end
