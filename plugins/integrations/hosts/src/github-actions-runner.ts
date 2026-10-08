/** GitHub Actions self-hosted runner provisioning for hosts. */

import { mkdir, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { homedir, platform, arch } from "node:os";

export interface GitHubRunnerConfig {
  owner: string;
  repository: string;
  registrationToken: string;
  labels?: string[];
  runnerName?: string;
  runnerDir?: string;
}

export interface GitHubRunnerStatus {
  installed: boolean;
  running: boolean;
  directory: string;
  runnerName: string;
}

/**
 * Returns the directory path for the GitHub Actions runner.
 *
 * Guarantees: Returns a string representing the directory path.
 *             If `config.runnerDir` is not provided, defaults to `DSH_HOME/github-runner`.
 *             Fallbacks to `~/.agents/github-runner` if `DSH_HOME` is not set.
 *
 * Throws: Error if `config.owner`, `config.repository`, or `config.registrationToken` is missing.
 */
function defaultDir(): string {
  return join(process.env.DSH_HOME ?? join(homedir(), ".agents"), "github-runner");
}

/**
 * Guarantees: Returns a string representing the runner's archive name.
 *             Includes the operating system and CPU architecture.
 * Throws: Error if `config.owner`, `config.repository`, or `config.registrationToken` is missing.
 */
function runnerArchive(): string {
  const os = platform() === "darwin" ? "osx" : platform();
  const cpu = arch() === "arm64" ? "arm64" : "x64";
  return `actions-runner-${os}-${cpu}`;
}

export class GitHubActionsRunnerManager {
  readonly config: GitHubRunnerConfig;

  /** Constructs an instance. */
  constructor(config: GitHubRunnerConfig) {
    if (!config.owner || !config.repository || !config.registrationToken) {
      throw new Error("GitHub Actions runner requires owner, repository, and registrationToken");
    }
    this.config = { ...config, runnerDir: config.runnerDir ?? defaultDir() };
  }

  /**
   * Returns the directory for the GitHub Actions runner.
   *
   * Guarantees: Returns the `runnerDir` from the configuration if provided; otherwise, returns the default directory.
   * Throws: Error if `config.owner`, `config.repository`, or `config.registrationToken` is missing.
   */
  get runnerDir(): string {
    return this.config.runnerDir ?? defaultDir();
  }

  /**
   * Constructs an instance of GitHubActionsRunnerManager.
   *
   * Guarantees: Sets up the configuration with `owner`, `repository`, and `registrationToken`.
   * Throws: Error if `owner`, `repository`, or `registrationToken` is missing from the configuration.
   * Returns: An instance of GitHubActionsRunnerManager.
   */
  get runnerName(): string {
    return this.config.runnerName ?? `dsh-${platform()}-${arch()}`;
  }

  /**
   * Initializes a GitHubActionsRunnerManager instance.
   *
   * Guarantees: Sets up the configuration with `owner`, `repository`, and `registrationToken`.
   * Throws: Error if `owner`, `repository`, or `registrationToken` is missing from the configuration.
   * Returns: An instance of GitHubActionsRunnerManager.
   */
  status(): GitHubRunnerStatus {
    return {
      installed: false,
      running: false,
      directory: this.runnerDir,
      runnerName: this.runnerName,
    };
  }

  /** Generate an installation script. Token is embedded only in the generated local script. */
  generateUnixInstallScript(): string {
    const labels = ["self-hosted", "dsh", platform(), arch(), ...(this.config.labels ?? [])].join(
      ",",
    );
    const url = `https://github.com/${this.config.owner}/${this.config.repository}`;
    const dir = this.runnerDir;
    return `#!/usr/bin/env bash
set -euo pipefail

RUNNER_DIR=${JSON.stringify(dir)}
RUNNER_NAME=${JSON.stringify(this.runnerName)}
RUNNER_URL=${JSON.stringify(url)}
RUNNER_TOKEN=${JSON.stringify(this.config.registrationToken)}
RUNNER_LABELS=${JSON.stringify(labels)}

mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

if [ ! -x ./run.sh ]; then
  ARCHIVE_URL=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest \\
    | grep 'browser_download_url' \\
    | grep '${runnerArchive()}.tar.gz' \\
    | head -n1 \\
    | cut -d '"' -f4)
  curl -fsSL "$ARCHIVE_URL" -o runner.tar.gz
  tar xzf runner.tar.gz
  rm -f runner.tar.gz
fi

./config.sh --unattended \\
  --url "$RUNNER_URL" \\
  --token "$RUNNER_TOKEN" \\
  --name "$RUNNER_NAME" \\
  --labels "$RUNNER_LABELS" \\
  --work _work

if command -v systemctl >/dev/null 2>&1; then
  sudo ./svc.sh install
  sudo ./svc.sh start
else
  nohup ./run.sh > runner.log 2>&1 &
fi
`;
  }

  /**
   * Generates a Unix installation script for the GitHub Runner.
   * The script sets up environment variables for the runner's directory, name, URL, registration token, and labels.
   * The generated script is not executed immediately; it must be sourced or run manually.
   *
   * @returns A string representing the installation script content.
   */
  async writeInstallScript(): Promise<string> {
    await mkdir(this.runnerDir, { recursive: true });
    const path = join(this.runnerDir, "install.sh");
    await writeFile(path, this.generateUnixInstallScript(), "utf8");
    await chmod(path, 0o700);
    return path;
  }
}
