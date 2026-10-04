import assert from "node:assert/strict";
import { packs, plugins, profiles, resolveProfile } from "./lib/index.js";

/** assertUnique implementation. */
function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    assert(!seen.has(value), `Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

assertUnique(
  plugins.map((plugin) => plugin.id),
  "plugin id",
);
assertUnique(
  packs.map((pack) => pack.id),
  "pack id",
);
assertUnique(
  profiles.map((profile) => profile.id),
  "profile id",
);

const pluginById = new Map(plugins.map((plugin) => [plugin.id, plugin]));
const packById = new Map(packs.map((pack) => [pack.id, pack]));

for (const plugin of plugins) {
  const dependencies = plugin.dependencies ?? [];
  assertUnique(
    dependencies.map((dependency) => `${dependency.plugin}:${dependency.kind}`),
    `dependency declaration for ${plugin.id}`,
  );

  for (const dependency of dependencies) {
    assert(
      pluginById.has(dependency.plugin),
      `${plugin.id} references unknown plugin ${dependency.plugin}`,
    );
  }

  assertUnique(plugin.provides ?? [], `provided capability for ${plugin.id}`);
}

for (const pack of packs) {
  assertUnique(pack.plugins, `plugin in pack ${pack.id}`);
  for (const pluginId of pack.plugins) {
    assert(pluginById.has(pluginId), `${pack.id} references unknown plugin ${pluginId}`);
  }
}

for (const profile of profiles) {
  assertUnique(profile.packs, `pack in profile ${profile.id}`);
  for (const packId of profile.packs) {
    assert(packById.has(packId), `${profile.id} references unknown pack ${packId}`);
  }
  resolveProfile(
    {
      plugins: pluginById,
      packs: packById,
      profiles: new Map(profiles.map((candidate) => [candidate.id, candidate])),
    },
    profile.id,
  );
}

console.log(
  `Composition verification passed: ${plugins.length} plugins, ${packs.length} packs, ${profiles.length} profiles.`,
);
