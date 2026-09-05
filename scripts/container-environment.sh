#!/usr/bin/env bash

set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
GIT_COMMON_DIR=$(cd "$ROOT" && cd "$(git rev-parse --git-common-dir)" && pwd -P)
CI_IMAGE_CONTEXT="$ROOT/containers/ci"
CI_IMAGE_CONTAINERFILE="$CI_IMAGE_CONTEXT/Containerfile"
LOCAL_CI_IMAGE=${AXM_LOCAL_CI_IMAGE:-local/axm-ci:dev}
CI_IMAGE_PIN=$(tr -d '[:space:]' <"$CI_IMAGE_CONTEXT/CI_IMAGE")
CI_IMAGE=${AXM_CI_IMAGE:-$CI_IMAGE_PIN}
NX_PARALLEL=${AXM_CONTAINER_NX_PARALLEL:-2}
VITEST_MAX_WORKERS=${AXM_CONTAINER_VITEST_MAX_WORKERS:-2}

volume_key() {
  printf '%s' "$1" | cksum | awk '{print $1}'
}

# Scoping the CI caches by image and lockfile keeps a stale cache from bleeding
# across a bump, but it also means every bump mints a new pair of volumes and
# abandons the previous pair. On an ephemeral runner that costs nothing; on a
# persistent one the abandoned volumes accumulate until something reclaims them,
# so a persistent runner needs a retention sweep that keeps only the newest
# scopes.
CI_CACHE_SCOPE=$(
  volume_key "axm|$(uname -m)|$CI_IMAGE|$(cksum <"$ROOT/pnpm-lock.yaml")"
)
CI_PNPM_CACHE_VOLUME=${AXM_CI_PNPM_CACHE_VOLUME:-axm-ci-pnpm-$CI_CACHE_SCOPE}
CI_NX_CACHE_VOLUME=${AXM_CI_NX_CACHE_VOLUME:-axm-ci-nx-v2-$CI_CACHE_SCOPE}

usage() {
  cat <<'EOF'
Usage: scripts/container-environment.sh <command> [arguments]

  build-ci-image    Build the repository-owned CI image locally
  smoke-ci-image    Build and verify the repository-owned CI image
  ci [command...]   Run a command in the pinned Linux CI image
  smoke             Verify the pinned CI image and mounted checkout

Environment:
  AXM_CI_IMAGE          Override the CI image
  AXM_LOCAL_CI_IMAGE    Override the local producer image tag
  AXM_CI_PNPM_CACHE_VOLUME  Override the scoped CI pnpm cache source (volume or absolute path)
  AXM_CI_NX_CACHE_VOLUME  Override the scoped CI Nx cache source (volume or absolute path)
  AXM_CONTAINER_NX_PARALLEL  Nx task concurrency in containers (default: 2)
  AXM_CONTAINER_VITEST_MAX_WORKERS  Vitest concurrency in containers (default: 2)
EOF
}

build_ci_image() {
  docker build \
    --file "$CI_IMAGE_CONTAINERFILE" \
    --target axm-ci \
    --tag "$LOCAL_CI_IMAGE" \
    --build-arg "SOURCE_REVISION=$(git rev-parse HEAD)" \
    "$CI_IMAGE_CONTEXT"
}

smoke_ci_image() {
  if [[ "${AXM_SKIP_IMAGE_BUILD:-0}" != "1" ]] || ! docker image inspect "$LOCAL_CI_IMAGE" >/dev/null 2>&1; then
    build_ci_image
  fi

  docker run --rm "$LOCAL_CI_IMAGE" bash -lc '
    set -euo pipefail
    test "$(id -u)" != "0"
    test "$(node --version)" = "v22.23.2"
    test "$(pnpm --version)" = "11.20.0"
    test "$(bun --version)" = "1.3.14"
    actionlint -version
    test ! -e /workspace/.git
  '
}

# A CI cache target is either a named Docker volume (persistent host, the
# default) or an absolute host path bind mount (e.g. a directory restored by
# actions/cache on an ephemeral runner). Docker treats a leading-slash source
# as a bind mount automatically; only named volumes need `docker volume create`.
ensure_ci_cache_source() {
  local source=$1
  if [[ "$source" == /* ]]; then
    mkdir -p "$source"
  else
    docker volume create "$source" >/dev/null
  fi
}

run_ci() {
  local uid gid command
  uid=$(id -u)
  gid=$(id -g)
  if [[ $# -eq 0 ]]; then
    command='pnpm run ci'
  else
    printf -v command '%q ' "$@"
  fi
  mkdir -p "$ROOT/node_modules"
  ensure_ci_cache_source "$CI_PNPM_CACHE_VOLUME"
  ensure_ci_cache_source "$CI_NX_CACHE_VOLUME"

  docker run --rm \
    --user root \
    --ulimit nofile=65536:65536 \
    --env AXM_HOST_UID="$uid" \
    --env AXM_HOST_GID="$gid" \
    --env AXM_DEPS_DIRS="$ROOT/node_modules" \
    --env AXM_RELEASE_PREPARATION="${AXM_RELEASE_PREPARATION:-false}" \
    --env HOME=/tmp/axm-home \
    --env MISE_STATE_DIR=/tmp/axm-home/.local/state/mise \
    --env pnpm_config_store_dir=/tmp/axm-home/.local/share/pnpm/store \
    --env NX_CACHE_DIRECTORY=/tmp/axm-home/.cache/nx/cache \
    --env NX_WORKSPACE_DATA_DIRECTORY=/tmp/axm-home/.cache/nx/workspace-data \
    --env NX_BASE \
    --env NX_HEAD \
    --env NX_PARALLEL="$NX_PARALLEL" \
    --env VITEST_MAX_WORKERS="$VITEST_MAX_WORKERS" \
    --volume "$ROOT:$ROOT" \
    --volume "$ROOT/node_modules" \
    --volume "$GIT_COMMON_DIR:$GIT_COMMON_DIR" \
    --volume "$CI_PNPM_CACHE_VOLUME:/tmp/axm-home/.local/share/pnpm/store" \
    --volume "$CI_NX_CACHE_VOLUME:/tmp/axm-home/.cache/nx" \
    --workdir "$ROOT" \
    --pull missing \
    "$CI_IMAGE" \
    bash -lc "mkdir -p \"\$HOME\" && mise trust '$ROOT/mise.toml' && mise exec -- $command"
}

smoke() {
  # Expansion is intentionally deferred to the shell inside the container.
  # shellcheck disable=SC2016
  run_ci bash -lc '
    set -euo pipefail
    test "$(id -u)" != "0"
    test "$(node --version)" = "v22.23.2"
    test "$(pnpm --version)" = "11.20.0"
    test "$(bun --version)" = "1.3.14"
    git status --short >/dev/null
  '
}

case "${1:-}" in
  build-ci-image)
    build_ci_image
    ;;
  smoke-ci-image)
    smoke_ci_image
    ;;
  ci)
    shift
    run_ci "$@"
    ;;
  smoke)
    smoke
    ;;
  *)
    usage
    exit 2
    ;;
esac
