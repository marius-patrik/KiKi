// jscpd:ignore-start -- per-package check-plugin.mjs scaffolding, duplicated by design across sibling packages
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { Context } from "@deepseek-ai/cordis";
import assert from "node:assert";
import {
  assertLoaderShape,
  stubSettingsService,
  stubSpawnSyncSubprocess,
} from "../../scripts/plugin-check-kit.mjs";

const root = mkdtempSync(join(tmpdir(), "repos-"));
const env = { ...process.env };

const plugin = await import("./lib/index.js");
const { NS } = await import("./lib/settings.js");
const { runGit, currentBranch, GitCommandError } = await import("./lib/git.js");
const { resolveGitHubToken, createPullRequest, GITHUB_OAUTH_REF } = await import("./lib/github.js");
const { ownerRepoFromRemote } = plugin;

assertLoaderShape(plugin, "repos");
assert.equal(NS, "repos", "namespace must be this plugin's entry id");
assert.equal(plugin.inject.join(","), "subprocess,tools");
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

// settings helpers: remote/base-branch fall back to the schema defaults.
const { defaultRemote, defaultBaseBranch } = await import("./lib/settings.js");
assert.equal(defaultRemote(undefined), "origin");
assert.equal(defaultRemote({ remote: "upstream" }), "upstream");
assert.equal(defaultBaseBranch(undefined), "main");
assert.equal(defaultBaseBranch({ defaultBaseBranch: "trunk" }), "trunk");
assert.equal(defaultBaseBranch({ remote: "origin" }), "main");
console.log("settings helpers ok");

// ownerRepoFromRemote parsing across remote shapes.
assert.equal(
  ownerRepoFromRemote("https://github.com/marius-patrik/agents.git"),
  "marius-patrik/agents",
);
assert.equal(
  ownerRepoFromRemote("git@github.com:marius-patrik/agents.git"),
  "marius-patrik/agents",
);
assert.equal(ownerRepoFromRemote("https://user@github.com/org/repo"), "org/repo");
assert.equal(ownerRepoFromRemote("git://github.com/a/b.git"), "a/b");
assert.equal(ownerRepoFromRemote("git@gitlab.com:group/proj.git"), null);
assert.equal(ownerRepoFromRemote("file:///tmp/x"), null);
assert.equal(ownerRepoFromRemote("/tmp/x"), null);
console.log("ownerRepoFromRemote ok");

// A real git repo in a temp dir; git runs through ctx.subprocess.
const repo = join(root, "repo");
mkdirSync(repo, { recursive: true });
const gitCtx = new Context();
gitCtx.subprocess = stubSpawnSyncSubprocess(env);
const { stdout: initOut } = await runGit(gitCtx, repo, ["init", "-b", "main"]);
assert.equal(await currentBranch(gitCtx, repo), "main");
await runGit(gitCtx, repo, ["config", "user.email", "repos@example.com"]);
await runGit(gitCtx, repo, ["config", "user.name", "repos"]);
writeFileSync(join(repo, "a.txt"), "hello\n");
await runGit(gitCtx, repo, ["add", "a.txt"]);
await runGit(gitCtx, repo, ["commit", "-m", "initial"]);
assert.equal(await currentBranch(gitCtx, repo), "main");
await runGit(gitCtx, repo, ["checkout", "-b", "feature/one"]);
assert.equal(await currentBranch(gitCtx, repo), "feature/one");
await assert.rejects(runGit(gitCtx, repo, ["commit", "-m", "nothing-to-commit"]), GitCommandError);
console.log("git helpers ok (init/branch/current/detached failure)");

// apply: registers the five repo tools over a stub settings/tools surface.
// Since 0.2.0 the plugin's own Config is its form and the namespace is its entry
// id, so there is no section registration to observe; what this plugin must
// declare is that it ships its own page for that form.
const actx = new Context();
const { service: settings, registrations } = stubSettingsService();
actx.provide("settings", settings);
const registeredTools = [];
actx.provide("tools", {
  register: (def) => {
    registeredTools.push(def);
    return () => {};
  },
});
actx.subprocess = gitCtx.subprocess;
actx.logger = { info: () => {}, warn: (m) => console.log("WARN:", m) };
actx.on = () => () => {};
plugin.apply(actx, { remote: "upstream", defaultBaseBranch: "trunk" });
await new Promise((resolve) => setTimeout(resolve, 50));
assert.equal(
  registrations.length,
  1,
  `expected one settings page policy, got ${registrations.length}`,
);
assert.equal(registrations[0].presentation.auto, false);
const names = registeredTools.map((t) => t.name).sort();
assert.deepEqual(names, ["repo-branch", "repo-commit", "repo-pr", "repo-push", "repo-status"]);
console.log("apply wiring ok (5 repo tools registered, custom settings page declared)");

// repo-status tool: real git state of the temp repo.
const statusDef = registeredTools.find((t) => t.name === "repo-status");
const status = await statusDef.execute({ path: repo }, { signal: new AbortController().signal });
assert.equal(status.branch, "feature/one");
assert.equal(status.detached, false);
assert.deepEqual(status.untracked, []);
console.log("repo-status ok:", status.branch);

// repo-branch tool: create, list, switch round-trip.
const branchDef = registeredTools.find((t) => t.name === "repo-branch");
const listed = await branchDef.execute(
  { path: repo, action: "list" },
  { signal: new AbortController().signal },
);
assert.ok(listed.branches.includes("main"));
assert.ok(listed.branches.includes("feature/one"));
await branchDef.execute(
  { path: repo, action: "create", name: "feature/two" },
  { signal: new AbortController().signal },
);
const listed2 = await branchDef.execute(
  { path: repo, action: "list" },
  { signal: new AbortController().signal },
);
assert.ok(listed2.branches.includes("feature/two"));
await branchDef.execute(
  { path: repo, action: "switch", name: "feature/two" },
  { signal: new AbortController().signal },
);
assert.equal(await currentBranch(gitCtx, repo), "feature/two");
await branchDef.execute(
  { path: repo, action: "switch", name: "feature/one" },
  { signal: new AbortController().signal },
);
await branchDef.execute(
  { path: repo, action: "delete", name: "feature/two" },
  { signal: new AbortController().signal },
);
console.log("repo-branch ok (create/list/switch/delete)");

// repo-commit tool: stage a file and commit on the current branch.
writeFileSync(join(repo, "b.txt"), "second\n");
const commitDef = registeredTools.find((t) => t.name === "repo-commit");
const commit = await commitDef.execute(
  { path: repo, message: "add b.txt" },
  { signal: new AbortController().signal },
);
assert.equal(commit.branch, "feature/one");
assert.ok(commit.commit.length > 0);
assert.ok(commit.summary.includes("add b.txt"));
console.log("repo-commit ok:", commit.commit);

// token resolution: vault stub first, then env fallback.
const vaultToken = "gho_vault-token";
const accountsCtx = new Context();
accountsCtx.get = (name) =>
  name === "accounts"
    ? { resolve: async (ref) => (ref === GITHUB_OAUTH_REF ? { value: vaultToken } : undefined) }
    : undefined;
assert.equal(await resolveGitHubToken(accountsCtx), vaultToken);
const emptyCtx = new Context();
emptyCtx.get = () => undefined;
assert.equal(await resolveGitHubToken(emptyCtx, {}), null);
assert.equal(await resolveGitHubToken(emptyCtx, { GH_TOKEN: "gho_env-token" }), "gho_env-token");
console.log("resolveGitHubToken ok (vault first, env fallback)");

// createPullRequest against a local HTTP server: verifies auth header, body,
// and the resolved PR URL.
const prPayload = { html_url: "https://github.com/marius-patrik/agents/pull/42" };
let received = null;
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => {
    body += c;
  });
  req.on("end", () => {
    received = { method: req.method, url: req.url, headers: req.headers, body: JSON.parse(body) };
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify(prPayload));
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const url = await createPullRequest("gho_pr-token", {
  ownerRepo: "marius-patrik/agents",
  head: "feature/one",
  base: "main",
  title: "Add feature",
  body: "closes #7",
  apiBase: `http://127.0.0.1:${port}`,
});
assert.equal(url, prPayload.html_url);
assert.equal(received.method, "POST");
assert.equal(received.url, "/repos/marius-patrik/agents/pulls");
assert.equal(received.headers.authorization, "Bearer gho_pr-token");
assert.equal(received.body.title, "Add feature");
assert.equal(received.body.head, "feature/one");
assert.equal(received.body.base, "main");
assert.equal(received.body.body, "closes #7");
await new Promise((resolve) => server.close(resolve));
console.log("createPullRequest ok (auth + body + url)");

// CLI settings round-trip: set + list over a temp home.
const cliHome = join(root, "cli-home");
const cliEnv = { ...process.env, DSH_HOME: cliHome };
const cli = new URL("./bin/repos.mjs", import.meta.url).pathname;
{
  const setRes = spawnSync(process.execPath, [cli, "set", "remote", "upstream"], {
    env: cliEnv,
    encoding: "utf8",
  });
  assert.equal(setRes.status, 0, setRes.stderr);
  const listRes = spawnSync(process.execPath, [cli, "list"], { env: cliEnv, encoding: "utf8" });
  assert.equal(listRes.status, 0, listRes.stderr);
  assert.ok(listRes.stdout.includes("remote: upstream"));
  assert.ok(listRes.stdout.includes("defaultBaseBranch: main"));
  const text = readFileSync(join(cliHome, "settings.yaml"), "utf8");
  assert.ok(text.includes("repos:"));
  assert.ok(text.includes("defaultBaseBranch: main"));
}
console.log("cli settings round-trip ok");

// CLI status/commit verbs over the real repo.
{
  const statusRes = spawnSync(process.execPath, [cli, "status", repo], { encoding: "utf8" });
  assert.equal(statusRes.status, 0, statusRes.stderr);
  assert.ok(statusRes.stdout.includes("branch: feature/one"));
  writeFileSync(join(repo, "c.txt"), "third\n");
  const commitRes = spawnSync(process.execPath, [cli, "commit", repo, "add c.txt"], {
    encoding: "utf8",
  });
  assert.equal(commitRes.status, 0, commitRes.stderr);
  assert.ok(commitRes.stdout.includes("committed "));
}
console.log("cli git verbs ok");

rmSync(root, { recursive: true, force: true });
console.log("plugin check passed");

// jscpd:ignore-end
