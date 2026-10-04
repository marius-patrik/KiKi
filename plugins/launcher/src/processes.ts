import { openSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { parseBoundPort } from "./ports.js";
import { harnessCli } from "./paths.js";

/**
 * Find the PID listening on a TCP port. Uses `lsof`, which covers macOS and
 * Linux. Platform note: on Windows there is no lsof; process discovery is
 * reported as unsupported (returns null) until the installer work in #45
 * adds a netstat/PowerShell-based lookup.
 */
export function findListenerPid(port: number): number | null {
  if (process.platform === "win32") return null;
  const res = spawnSync("lsof", ["-ti", `:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  if (res.status !== 0 || res.stdout === undefined) return null;
  const first = res.stdout.split("\n")[0];
  if (first === undefined) return null;
  const pid = Number(first.trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/** Sleep helper for the poll loops below. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stop the web server listening on `port`: SIGTERM, up to six seconds of
 * graceful shutdown, then SIGKILL. Returns true when a server was stopped.
 */
export async function stopServer(port: number, log: (msg: string) => void): Promise<boolean> {
  const pid = findListenerPid(port);
  if (pid === null) {
    log(`dsh: web server is not running on port ${port}`);
    return false;
  }
  log(`dsh: stopping web server (PID: ${pid})...`);
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  for (let i = 0; i < 30 && findListenerPid(port) !== null; i += 1) {
    await sleep(200);
  }
  if (findListenerPid(port) !== null) {
    log(`dsh: force killing PID ${pid}...`);
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
    // SIGKILL frees the process but the OS can take a moment longer to
    // release the socket; a bare sleep here let `restart` bind before the
    // port was actually free, fail with no diagnosable cause, and leave the
    // harness down (#145). Poll the same way the SIGTERM path above does.
    for (let i = 0; i < 15 && findListenerPid(port) !== null; i += 1) {
      await sleep(200);
    }
  }
  log("dsh: web server stopped.");
  return true;
}

/** Result of a successful start: the PID and the port it actually bound. */
export interface StartedServer {
  pid: number;
  port: number;
}

/**
 * Start the harness web server detached in the background, logging to
 * `logFile`, and wait for readiness. Readiness and the returned port come
 * from the server's own `dsh web: http://<host>:<port>` startup line — never
 * from the port hint alone, since the profile's cordis.patch.yml decides the
 * real bind. Returns null when no server came up within ten seconds.
 */
export async function startServer(opts: {
  harnessDir: string;
  home: string;
  logFile: string;
  portHint: number;
  log: (msg: string) => void;
}): Promise<StartedServer | null> {
  const { harnessDir, home, logFile, portHint, log } = opts;
  const running = findListenerPid(portHint);
  if (running !== null) {
    log(`dsh: web server is already running (PID: ${running} on port ${portHint})`);
    return { pid: running, port: portHint };
  }
  const cli = harnessCli(harnessDir);
  if (cli === null) {
    log(`dsh: harness CLI not found under ${harnessDir} (run src/scripts/bootstrap first)`);
    return null;
  }
  log(`dsh: starting web server on port ${portHint}...`);
  const fd = openSync(logFile, "a");
  const child = spawn(
    process.execPath,
    [...(cli.tsx ? ["--import", "tsx/esm"] : []), cli.bin, "web", "--port", String(portHint)],
    {
      cwd: harnessDir,
      detached: true,
      stdio: ["ignore", fd, fd],
      env: { ...process.env, DSH_HOME: home },
    },
  );
  child.unref();
  for (let i = 0; i < 50; i += 1) {
    await sleep(200);
    let bound: number | null = null;
    try {
      bound = parseBoundPort(readFileSync(logFile, "utf8"));
    } catch {
      /* log not written yet */
    }
    const port = bound ?? portHint;
    const pid = findListenerPid(port);
    if (pid !== null) return { pid, port };
  }
  return null;
}
