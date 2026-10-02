#!/usr/bin/env bash
# Provision a machine as a CI runner host for this repository.
#
# Installs the GitHub Actions runner binaries and starts the ephemeral runner
# pool, which serves one freshly registered single-use runner per queued job.
#
# Intended for offloading CI off a machine that is also running the harness,
# MLX inference, or interactive work -- those contend for the same cores, and
# CI is the part with somewhere else to go.
#
# Requires: an authenticated `gh` CLI with permission to create runner
# registrations, plus node and bun.
set -euo pipefail

REPO="${CI_RUNNER_POOL_REPO:-marius-patrik/dsh-stack}"
RUNNER_VERSION="${RUNNER_VERSION:-2.337.0}"
ROOT="${CI_RUNNER_POOL_TEMPLATE:-$HOME/actions-runner}"
MAX="${CI_RUNNER_POOL_MAX:-}"

echo "==> repository: $REPO"

command -v gh >/dev/null || { echo "gh CLI is required"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "run 'gh auth login' first"; exit 1; }
command -v node >/dev/null || { echo "node is required"; exit 1; }

# Size the pool to the host unless told otherwise. Each slot runs a full
# workspace install and TypeScript build, and the build itself is parallel, so
# more slots than roughly a quarter of the cores only makes every job slower.
if [ -z "$MAX" ]; then
  CORES="$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu)"
  MAX=$(( CORES / 4 )); [ "$MAX" -lt 1 ] && MAX=1
fi
echo "==> pool ceiling: $MAX"

if [ ! -x "$ROOT/run.sh" ]; then
  echo "==> installing runner binaries into $ROOT"
  mkdir -p "$ROOT"
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) PKG="actions-runner-osx-arm64-${RUNNER_VERSION}.tar.gz" ;;
    Darwin-x86_64) PKG="actions-runner-osx-x64-${RUNNER_VERSION}.tar.gz" ;;
    Linux-x86_64) PKG="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" ;;
    Linux-aarch64) PKG="actions-runner-linux-arm64-${RUNNER_VERSION}.tar.gz" ;;
    *) echo "unsupported platform: $(uname -s)-$(uname -m)"; exit 1 ;;
  esac
  curl -fsSL -o "$ROOT/$PKG" \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${PKG}"
  tar xzf "$ROOT/$PKG" -C "$ROOT"
fi

echo "==> starting ephemeral runner pool"
exec env \
  CI_RUNNER_POOL_REPO="$REPO" \
  CI_RUNNER_POOL_TEMPLATE="$ROOT" \
  CI_RUNNER_POOL_MAX="$MAX" \
  node "$(dirname "$0")/ci-runner-pool.mjs"
