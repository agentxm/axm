#!/usr/bin/env bash
# The staged commit gate. bin/check-staged.mjs starts it with the repository's
# ordered checks in CHECK_STAGED_CHECKS and lint-staged's Node entry point in
# CHECK_STAGED_LINT_STAGED; lint-staged runs it again with --index-visible.
set -euo pipefail
export NX_TUI=false
export NX_DEFAULT_OUTPUT_STYLE=static
export NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false

if [[ "${1:-}" != "--index-visible" ]]; then
  # An empty index has no compiler selection (and no stash to restore).
  if git diff --cached --quiet; then
    exit 0
  fi
  # --all triggers one command even for deletion-only or symlink-only changes.
  # It does not expand the Nx selection; the command reads the index below.
  exec node "$CHECK_STAGED_LINT_STAGED" \
    --all --hide-all --stash --no-revert \
    --config "$(dirname "${BASH_SOURCE[0]}")/check-staged.config.mjs"
fi

# The repository's ordered checks run against the now-visible index. They own
# any dependency reconciliation and the placement of their auto-fixes; the
# typecheck below reads the index those checks leave staged.
bash "$CHECK_STAGED_CHECKS"

echo "Typechecking staged projects and their consumers..."
# A disposable index worktree gives Nx fresh file metadata, without resetting
# the developer's graph or task caches. Git and pnpm own source materialization
# and workspace dependency links; never link this tree to working-tree sources.
staged_tree=$(git write-tree)
staged_root=$(mktemp -d "${TMPDIR:-/tmp}/staged-typecheck.XXXXXX")
trap 'git worktree remove --force "$staged_root"; rmdir "$staged_root" 2>/dev/null || true' EXIT
git worktree add --detach --no-checkout "$staged_root" HEAD
(
  # Hooks can carry a temporary index (e.g. git commit --only). Preserve it for
  # write-tree above, then let the disposable worktree own its Git selectors.
  for git_selector in $(git rev-parse --local-env-vars); do
    unset "$git_selector"
  done
  cd "$staged_root"
  git read-tree --reset -u "$staged_tree"
  HUSKY=0 pnpm install --frozen-lockfile --offline
  export NX_DAEMON=false
  # NUL-delimited output preserves spaces, commas, quotes, and both rename
  # paths. Nx's supported stdin selection cannot represent newline filenames.
  git diff --cached --name-only --no-renames --no-ext-diff -z |
    while IFS= read -r -d '' staged_path; do
      if [[ "$staged_path" == *$'\n'* ]]; then
        echo "Cannot select a staged filename containing a newline for Nx." >&2
        exit 1
      fi
      printf '%s\n' "$staged_path"
    done |
    pnpm --config.verify-deps-before-run=error exec nx affected -t typecheck --stdin --nxBail

  # A compiler prerequisite must not silently validate a generated source tree
  # different from the index. Run generation/sync and stage the result first.
  if ! git diff --quiet; then
    echo "Compiler prerequisites changed tracked inputs. Generate and stage them before committing." >&2
    exit 1
  fi
)
