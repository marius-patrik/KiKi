/**
 * Shared assertions for package `check-plugin.mjs` smoke scripts.
 *
 * Every canonical package/plugin ships a thin `check-plugin.mjs` that
 * validates its built loader shape before exercising package-specific
 * behavior. The loader-shape checks and client-bundle-load checks are
 * identical across packages (only the expected plugin name/id differs),
 * so they are centralized here instead of hand-copied per package.
 */

import { spawnSync } from "node:child_process";

/**
 * Assert that a loaded harness plugin module has the expected loader shape:
 * a matching `name`, a function `apply`, an array `inject`, and no default
 * export (function plugins must not have one).
 *
 * @param {Record<string, unknown>} plugin - the imported plugin module.
 * @param {string} expectedName - the plugin's expected `name` export.
 */
export function assertLoaderShape(plugin, expectedName) {
  if (plugin.name !== expectedName) throw new Error("bad name");
  if (typeof plugin.apply !== "function") throw new Error("bad apply");
  if (!Array.isArray(plugin.inject)) throw new Error("bad inject");
  if (plugin.default !== undefined) {
    throw new Error("function plugins must not have a default export");
  }
}

/**
 * Assert that a package's `dsh.client.inject` field (package.json) holds only
 * scoped package names — the namespace this field is actually consumed as
 * (harness's `dsh-client-modules` scanner copies it into the boot manifest's
 * informational preflight/HMR-diffing edges), never bare cordis service names
 * like `"slots"` or `"locale"`. The two namespaces are easy to confuse: a
 * package's own client bundle separately declares a real, activation-gating
 * `export const inject = [...]` using service names (a cordis fiber inject,
 * unrelated to this field) — see dsh-stack#91.
 *
 * @param {readonly unknown[]} clientInject - the package.json `dsh.client.inject` array.
 * @param {string} packageName - the owning package's name, for the error message.
 */
export function assertClientInjectIsPackageIds(clientInject, packageName) {
  for (const entry of clientInject) {
    if (typeof entry !== "string" || !/^@(deepseek-ai|dsh-stack)\/[a-z0-9-]+$/.test(entry)) {
      throw new Error(
        `${packageName}: dsh.client.inject entry ${JSON.stringify(entry)} is not a scoped package id — ` +
          `this field is informational preflight/HMR-diffing metadata and must name real packages, not cordis ` +
          `service names (those belong in the client bundle's own "export const inject", a separate mechanism)`,
      );
    }
  }
}

/**
 * Verify one `@dsh-stack/provider-<id>` extension: boots a `Context` with
 * `dialects` and the `providers` registry applied, applies the extension, and
 * asserts it registered exactly its own route under its own id with the
 * expected loader shape. Centralized here because every provider extension's
 * `verify.mjs` would otherwise be an identical copy differing only in the id
 * string.
 *
 * @param {string} id - the provider route id this extension registers (e.g. `"kimi-code"`).
 * @param {Record<string, unknown>} extension - the imported extension module.
 * @param {{ Context: unknown, dialects: Record<string, unknown>, providers: Record<string, unknown> }} deps -
 *   `@deepseek-ai/cordis`'s `Context`, and the `@dsh-stack/dialects` and
 *   `@dsh-stack/providers` modules, imported by the caller (not here) so they
 *   resolve against the calling extension's own dependencies rather than this
 *   shared script's.
 */
export async function assertProviderExtension(id, extension, deps) {
  const { Context, dialects, providers } = deps;

  assertLoaderShape(extension, `provider-${id}`);
  if (!Array.isArray(extension.inject) || extension.inject[0] !== "providers") {
    throw new Error(`provider-${id}: expected inject to include "providers"`);
  }

  const ctx = new Context();
  dialects.apply(ctx, {});
  new providers.ProviderRegistry(ctx);
  extension.apply(ctx);

  if (!ctx.providers.has(id)) throw new Error(`provider-${id}: route was not registered`);
  const route = ctx.providers.get(id);
  if (route.id !== id) throw new Error(`provider-${id}: route.id mismatch`);
  if (typeof route.displayName !== "string" || route.displayName.length === 0) {
    throw new Error(`provider-${id}: route.displayName must be a non-empty string`);
  }
  if (!Array.isArray(route.models))
    throw new Error(`provider-${id}: route.models must be an array`);
  console.log(`provider-${id} verification passed:`, route.displayName);
}

/**
 * Load a hand-authored browser client bundle (`client.js`), register a stub
 * `__ModuleLoader__.load` on `globalThis.window`, import the bundle, and
 * return the registered loader spec so callers can assert its id/inject and
 * invoke its `factory`.
 *
 * @param {string | URL} clientUrl - URL of the client.js bundle to import.
 * @returns {Promise<{ spec: any }>} the object the bundle registered.
 */
export async function loadClientLoaderSpec(clientUrl) {
  const loader = {};
  globalThis.window = {
    __ModuleLoader__: {
      load: (spec) => {
        loader.spec = spec;
      },
    },
  };
  await import(clientUrl);
  return loader;
}

/**
 * Create a stub `settings` service for boot-style checks: records registered
 * namespaces and answers `get`/`watch` from the install-time base value.
 *
 * @returns {{ service: object, registrations: unknown[] }} the stub service
 *   and the list of namespaces registered through it.
 */
export function stubSettingsService() {
  const registrations = [];
  const service = {
    /**
     * Registers the calling plugin instance's page policy.
     * Records the owner fiber so a check can assert a plugin declared its own page,
     * and returns a disposer as the real service does.
     * @param {{ auto?: boolean }} presentation - the page policy.
     * @param {object} owner - the plugin fiber the policy belongs to.
     * @returns {() => void} disposer withdrawing the policy.
     */
    configure(presentation, owner) {
      registrations.push({ presentation, owner });
      return () => {
        const index = registrations.findIndex((entry) => entry.owner === owner);
        if (index >= 0) registrations.splice(index, 1);
      };
    },
    /**
     * Projects the active profile's Config fields as forms.
     * @returns {Array<object>} one descriptor per form.
     */
    describe() {
      return [];
    },
  };
  return { service, registrations };
}

/**
 * Build a stub `ctx.subprocess` that runs real child processes through
 * `spawnSync` and adapts the result to the harness subprocess collector
 * shape (`collected.stdout/stderr.readFrom()`), for check-plugin.mjs scripts
 * that exercise real subprocess-backed tools (git, shell, etc).
 *
 * @param {NodeJS.ProcessEnv} [env] - environment passed to the spawned process.
 * @returns {{ spawn(spec: { argv: string[]; cwd?: string }): object }}
 */
export function stubSpawnSyncSubprocess(env) {
  return {
    spawn: (spec) => {
      const res = spawnSync(spec.argv[0], spec.argv.slice(1), {
        cwd: spec.cwd,
        encoding: "utf8",
        ...(env !== undefined ? { env } : {}),
      });
      return {
        pid: res.pid ?? -1,
        done: Promise.resolve({ exitCode: res.status, signal: null }),
        collected: {
          stdout: { readFrom: () => ({ text: res.stdout ?? "", nextOffset: 0, lossy: false }) },
          stderr: { readFrom: () => ({ text: res.stderr ?? "", nextOffset: 0, lossy: false }) },
        },
        terminate: () => {},
        waitForExit: async () => true,
      };
    },
  };
}
