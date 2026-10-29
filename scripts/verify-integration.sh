#!/usr/bin/env bash
# Host-owned Git boundary; Nx owns source checks and their caches.
set -euo pipefail
: "${NX_BASE:?The pre-push hook supplies the advertised remote main SHA}"
: "${NX_HEAD:?The pre-push hook supplies the candidate SHA}"
export NX_TUI=false NX_DEFAULT_OUTPUT_STYLE=static NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false
refuse() { echo "Main integration refused: $*" >&2; exit 1; }
[[ "$NX_BASE" =~ ^[0-9a-f]{40}$ && "$NX_HEAD" =~ ^[0-9a-f]{40}$ ]] || refuse 'invalid commit identity'
[[ "$NX_BASE" != 0000000000000000000000000000000000000000 ]] || refuse 'main must already exist'
[[ "$NX_HEAD" != 0000000000000000000000000000000000000000 ]] || refuse 'main cannot be deleted'
[[ "$(git config --bool core.bare)" != true ]] || refuse 'core.bare is true; repair the repository before integration'
[[ "$(git rev-parse HEAD)" == "$NX_HEAD" ]] || refuse 'check out the commit being pushed'
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || refuse 'commit or remove working changes first'
git cat-file -e "$NX_BASE^{commit}" || refuse 'fetch main, rebase, and retry'
git merge-base --is-ancestor "$NX_BASE" "$NX_HEAD" || refuse 'fetch main, rebase, and retry; never force-push main'
# Source checks create their own repositories; hook-local Git context must not
# redirect those child commands back into the checkout being integrated.
while IFS= read -r git_variable; do
  unset "$git_variable"
done < <(git rev-parse --local-env-vars)
pnpm run check:commit-history -- --base "$NX_BASE" --head "$NX_HEAD"
source_status=0
pnpm run verify:integration:source || source_status=$?
[[ "$(git config --bool core.bare)" != true ]] || refuse 'core.bare is true; repair the repository before integration'
[[ "$source_status" == 0 ]] || exit "$source_status"
[[ "$(git rev-parse HEAD)" == "$NX_HEAD" ]] || refuse 'HEAD changed during verification'
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || refuse 'verification changed files; commit the result and retry'
