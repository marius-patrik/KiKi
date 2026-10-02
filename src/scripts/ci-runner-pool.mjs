/**
 * Autoscaling pool of ephemeral GitHub Actions runners: one freshly registered
 * runner per job, scaled to the depth of the queue.
 *
 * A fixed pool is the wrong shape for this repository. Every job runs the same
 * ~13-minute install/build/typecheck/verify/test pipeline, so a queue of open
 * pull requests serialises against whatever runner count happens to be
 * installed, and each merge invalidates the rest and re-queues them all.
 *
 * Each slot here loops: ask GitHub for a just-in-time runner configuration, run
 * the agent with it, exit after exactly one job, repeat. JIT registrations are
 * ephemeral and single-use, so every job is served by a runner that has never
 * seen another job -- no state leaks between builds, and a crashed runner
 * leaves no zombie registration behind.
 *
 * Slots are added while jobs are waiting and retired once the queue drains, so
 * the machine is not carrying idle agents between bursts.
 *
 * @module @dsh-stack/scripts/ci-runner-pool
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Writes one progress line to stdout.
 *
 * Logs are consumed through a pipe by the service manager, so each line is
 * flushed on its own rather than letting Node buffer progress until the
 * process exits.
 *
 * @param {string} line - The message to emit, without a trailing newline.
 */
const log = (line) => process.stdout.write(`${line}\n`);

/** Repository whose queue this pool serves. */
const REPO = process.env.CI_RUNNER_POOL_REPO ?? "marius-patrik/dsh-stack";

/**
 * Installed runner directory cloned to create each slot. It supplies the agent
 * binaries only; no registration state is copied, because every slot registers
 * itself through JIT configuration.
 */
const TEMPLATE = process.env.CI_RUNNER_POOL_TEMPLATE ?? join(homedir(), "actions-runner");

/** Directory holding the per-slot runner installations. */
const SLOT_ROOT = process.env.CI_RUNNER_POOL_ROOT ?? join(homedir(), ".dsh-ci-runners");

/**
 * Upper bound on concurrent slots. Each slot is a full build -- Node, bun, a
 * workspace install and a TypeScript build -- so this exists to keep the pool
 * from exhausting the host rather than as a throughput target.
 */
const MAX_SLOTS = Number(process.env.CI_RUNNER_POOL_MAX ?? 8);

/** Labels each ephemeral runner registers with; must match `runs-on` in the workflows. */
const LABELS = ["self-hosted", "macOS", "ARM64"];

/** Seconds between queue polls. */
const POLL_SECONDS = Number(process.env.CI_RUNNER_POOL_INTERVAL ?? 15);

/** Runs a command to completion, resolving with its stdout and exit code. */
function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", () => resolve({ code: 1, stdout, stderr }));
  });
}

/**
 * How many workflow runs are waiting for a runner. Runs rather than jobs: the
 * jobs endpoint needs one request per run, which at a real backlog costs more
 * time than the poll interval and starves the loop. A queued run always needs
 * at least one runner, which is the signal scaling actually depends on.
 */
async function queuedRunCount() {
  const result = await run("gh", [
    "api",
    `repos/${REPO}/actions/runs?status=queued&per_page=100`,
    "-q",
    ".workflow_runs | length",
  ]);
  return Number(result.stdout.trim() || 0);
}

/** Creates the slot's runner installation if it does not already exist. */
async function ensureSlotInstalled(dir, index) {
  try {
    await fs.access(join(dir, "run.sh"));
    return;
  } catch {
    // Not installed yet.
  }
  await fs.mkdir(dir, { recursive: true });
  const copy = await run("rsync", [
    "-a",
    "--exclude",
    "_work",
    "--exclude",
    "_diag",
    "--exclude",
    ".runner",
    "--exclude",
    ".credentials*",
    "--exclude",
    "*.tar.gz",
    "--exclude",
    ".service",
    `${TEMPLATE}/`,
    `${dir}/`,
  ]);
  if (copy.code !== 0) throw new Error(`slot ${index}: copying runner binaries failed`);
  // Each slot needs its own bun install cache: concurrent installs sharing one
  // cache race and fail with ENOTEMPTY, which is why the installed runners
  // already key their store on the runner name.
  const home = join(homedir(), ".local", "share", `bun-ci-slot-${index}`);
  await fs.writeFile(
    join(dir, ".env"),
    `BUN_INSTALL_CACHE_DIR=${join(home, "cache")}\nBUN_INSTALL=${join(home, "bin")}\n`,
  );
}

/**
 * Requests a single-use JIT configuration. The returned runner is ephemeral:
 * it accepts one job and deregisters itself, so nothing has to clean it up.
 */
async function requestJitConfig(name) {
  const args = [
    "api",
    "-X",
    "POST",
    `repos/${REPO}/actions/runners/generate-jitconfig`,
    "-f",
    `name=${name}`,
    "-F",
    "runner_group_id=1",
    "-f",
    "work_folder=_work",
    "-q",
    ".encoded_jit_config",
  ];
  for (const label of LABELS) args.splice(args.length - 2, 0, "-f", `labels[]=${label}`);
  const result = await run("gh", args);
  const config = result.stdout.trim();
  return config && config !== "null" ? config : null;
}

/** Slots currently running, keyed by index. */
const active = new Map();

/**
 * Runs one ephemeral runner to completion in `dir`. Resolves when the agent
 * exits, which happens after it has served exactly one job.
 */
async function runOneJob(dir, index) {
  const config = await requestJitConfig(`dsh-ci-ephemeral-${index}-${Date.now()}`);
  if (config === null) {
    console.error(`slot ${index}: could not obtain a JIT configuration; backing off`);
    return false;
  }
  const result = await run("./run.sh", ["--jitconfig", config], { cwd: dir });
  if (result.code !== 0 && result.stderr.trim()) {
    console.error(
      `slot ${index}: runner exited ${result.code}: ${result.stderr.trim().slice(-400)}`,
    );
  }
  return true;
}

/** Starts a slot loop that keeps serving one job at a time until told to stop. */
function startSlot(index) {
  const dir = join(SLOT_ROOT, `slot-${index}`);
  const state = { stop: false };
  active.set(index, state);
  void (async () => {
    try {
      await ensureSlotInstalled(dir, index);
      log(`slot ${index}: ready`);
      while (!state.stop) {
        const served = await runOneJob(dir, index);
        if (!served) await new Promise((resolve) => setTimeout(resolve, 30_000));
      }
    } catch (err) {
      console.error(`slot ${index}: ${err?.message ?? err}`);
    } finally {
      active.delete(index);
      log(`slot ${index}: retired`);
    }
  })();
}

/** Marks the highest-numbered idle slot for retirement once its current job ends. */
function retireOneSlot() {
  const index = [...active.keys()].sort((a, b) => b - a)[0];
  if (index !== undefined) active.get(index).stop = true;
}

log(`ci-runner-pool: watching ${REPO}, max ${MAX_SLOTS} slots, polling every ${POLL_SECONDS}s`);

for (;;) {
  let queued = 0;
  try {
    queued = await queuedRunCount();
  } catch (err) {
    console.error(`queue poll failed: ${err?.message ?? err}`);
  }
  const want = Math.min(MAX_SLOTS, queued);
  if (want > active.size) {
    for (let index = 0; index < MAX_SLOTS && active.size < want; index += 1) {
      if (!active.has(index)) startSlot(index);
    }
    log(`queued=${queued} slots=${active.size}`);
  } else if (queued === 0 && active.size > 0) {
    retireOneSlot();
  }
  await new Promise((resolve) => setTimeout(resolve, POLL_SECONDS * 1000));
}
