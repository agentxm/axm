# Git hooks

Do you want your agent to use what this branch declares, or do you want to
adopt newer upstream extensions? Choose the workflow by its effect.

| When                                                | AXM workflow                                                                                                                                                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First clone or new worktree                         | Activate the project's existing hook manager, preview the workspace with `axm sync --preview`, then run `axm sync` to materialize it. Run this bootstrap explicitly even if hooks were unavailable at checkout. |
| Branch switch, successful merge or completed rebase | Check the current project with `axm sync --preview --fail-on-change`. Teams can opt into applying the branch's configuration.                                                                                   |
| Author edits an extension                           | An edit to a symlinked skill body is already visible through the link. Preview sync for a renamed skill, a copied output, or an active rule whose body contributes to a managed instruction region.             |
| Before commit                                       | Validate the exact index once after formatting with `axm lint --staged`.                                                                                                                                        |
| Before integration                                  | Run `axm lint --strict` on the candidate checkout. Use a convergence check when the job also promises that agent-visible output is current.                                                                     |
| Check for upstream releases                         | Use `axm list --outdated` for a report, or `axm update --preview` to inspect the proposed changes. A maintainer or scheduled check can surface candidates for review before anyone applies an update.           |

A Git hook runs on a Git event. For “after my agent edits a file,” see
`axm help hooks`.

## After a branch switch, pull, or rebase

Keep one script in the project, for example `scripts/axm-after-git`. Call it
in the current worktree. The example assumes the AXM project is at its root.
For a nested project, enter its directory first and adjust the script path.
Use the project's pinned AXM command if it has one. Install or activate hooks
only in a checkout whose scripts you trust.

```sh
#!/bin/sh
set -eu

[ -f axm.json ] || exit 0
command -v axm >/dev/null 2>&1 || {
  echo "Git updated this checkout. Install the project's AXM CLI, then run axm sync --preview." >&2
  exit 127
}

case "$1" in
  check)
    if axm sync --scope project --preview --fail-on-change --non-interactive; then
      exit 0
    else
      status=$?
    fi
    if [ "$status" -eq 1 ]; then
      echo "Git updated this checkout. Review the plan above and run axm sync to apply it." >&2
      exit 0
    fi
    ;;
  apply)
    if axm sync --scope project --non-interactive; then
      exit 0
    else
      status=$?
    fi
    ;;
  *) echo "Usage: axm-after-git check|apply" >&2; exit 2 ;;
esac
echo "Git updated this checkout. Resolve the AXM diagnostic above and retry axm sync --preview." >&2
exit "$status"
```

Append the matching command to each existing hook. For raw Git, place it
after `#!/bin/sh` in the named executable under `.githooks/` and activate that
directory once per clone with `git config core.hooksPath .githooks`. For a
manager, use its existing hook directory or command configuration. Preserve
the manager's current checks and their failure handling.

In `post-checkout`:

```sh
[ "$3" = 0 ] || sh scripts/axm-after-git check
```

In `post-merge`:

```sh
sh scripts/axm-after-git check
```

In `post-rewrite`:

```sh
[ "$1" != rebase ] || sh scripts/axm-after-git check
```

A path-only checkout skips the branch check. A merge-based pull runs the merge
hook on success. If a merge stops on conflicts, finish resolving it and run
the check explicitly. A rebase-based pull can rewrite commits, and the
`post-rewrite` argument distinguishes it from an amend. Hooks can overlap or be
absent on a particular branch. The manual check works after any Git operation.
A post-hook failure leaves the new checkout in place. If generated instructions are already current, verify what a fresh agent session loads. [Git hooks manual](https://git-scm.com/docs/githooks)

The default `check` prints an advisory when reconciliation is needed. A planning
failure retains its own exit status and diagnostic. Teams that want automatic
writes can select `apply` in those same hook entries. Sync may need to acquire
missing content or resolve a new declaration. Preserve local drift, unknown
files, and execution approval decisions for the developer. Keep upstream
version advancement in the separate update workflow.

## Before integration

On a clean runner, install the pinned CLI and prepare the project's configured
outputs, including ignored agent aliases. When the job needs to bootstrap with
`axm sync`, check the resulting Git status against the candidate as well:
changed or newly created files intended for version control need review.
A second preview alone can pass after sync has repaired a stale tracked file.
Run `axm lint --strict` for workspace findings and
`axm sync --preview --fail-on-change` for a read-only convergence assertion.
Use CI as the authoritative integration check. Repositories can also run
these commands in a pre-push hook when the checkout represents the ref being
pushed, or keep branch handoffs fast and check only the integration candidate.

## Before commit

Use `axm lint --staged` in a pre-commit hook for fast feedback on the exact
workspace Git would commit. It materializes the complete index in an isolated
temporary directory: staged bytes win for partially staged files, unchanged
tracked files remain present, and unstaged, untracked, deleted, and pre-rename
content stay out. The command is read-only, deterministic, and does not need
Registry access.

`--strict`, `--json`, and `--verbose` work with `--staged`. `--scope user`
does not. Exclude `agent_extensions/**` from filename-based formatters and other
mutating hooks. Run formatters first for repository-authored files so their
intended output is staged before AXM reads the index. Generated instruction
aliases such as `CLAUDE.md` and `GEMINI.md` are intentionally gitignored, so
staged lint leaves their currency check to the full-workspace pre-push or CI
command.

### Choose the staged lint policy

- Advisory pre-commit: `axm lint --staged` blocks errors but permits warnings.
- Strict pre-commit: `axm lint --staged --strict` blocks errors and warnings.

Client hooks are developer feedback, not an enforcement boundary. Keep CI
authoritative because hooks can be missing or bypassed.

## Husky

Append AXM after the existing formatter or `lint-staged` command in
`.husky/pre-commit`:

```sh
set -e
pnpm exec lint-staged --no-stash
axm lint --staged --strict
```

Keep the repository's existing package-manager invocation and checks. Husky
uses the repository `prepare` script to activate `.husky/`.

## Lefthook

Use a piped job group when formatting must finish before AXM reads the index:

```yaml
pre-commit:
  jobs:
    - group:
        piped: true
        jobs:
          - name: format
            run: pnpm exec prettier --write {staged_files}
            stage_fixed: true
          - name: axm-lint
            run: axm lint --staged --strict
```

Adapt the formatter command and glob to the repository, and exclude
`agent_extensions/**` from the formatter. `stage_fixed: true` stages formatter
output before the next piped job.

## pre-commit

Place the local AXM hook after formatting hooks in `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: local
    hooks:
      - id: axm-lint
        name: AXM staged workspace lint
        entry: axm lint --staged --strict
        language: system
        pass_filenames: false
        always_run: true
```

Run `pre-commit install` after changing the configuration.

## simple-git-hooks

Chain the workspace-wide AXM command after the formatter in `package.json`:

```json
{
  "scripts": {
    "prepare": "simple-git-hooks"
  },
  "simple-git-hooks": {
    "pre-commit": "pnpm exec lint-staged && axm lint --staged --strict"
  }
}
```

Run the package manager's `simple-git-hooks` command once after changing the
configuration. Preserve an existing `prepare` command by chaining it.

## Raw Git hook

Commit a POSIX hook when the repository has no hook manager:

```sh
#!/bin/sh
set -eu

command -v axm >/dev/null 2>&1 || {
  echo "AXM is required: https://axm.sh" >&2
  exit 1
}

axm lint --staged --strict
```

Store it as `.githooks/pre-commit`, make it executable, and activate it once per
clone:

```sh
git config core.hooksPath .githooks
```

## Partial staging and lint-staged

Do not register `axm lint --staged` as a filename-based `lint-staged` task and
do not append `{staged_files}` or a list from `git diff`. AXM reads the complete
index itself because workspace rules depend on unchanged configuration and
related extension files. Exclude `agent_extensions/**` from those formatters,
then run AXM once after they finish.

Staged lint leaves the index and worktree untouched. If it reports a finding,
fix the worktree through the normal AXM or editor workflow, stage the intended
result, and rerun `axm lint --staged`.

## Availability and bypass

Prefer a project-pinned AXM invocation when the repository declares `axm.sh`;
otherwise require `axm` on `PATH` and fail with an installation message. Do not
silently skip a missing CLI.

`git commit --no-verify` bypasses pre-commit hooks. Reserve it for an explicit
emergency policy; it does not waive review or the authoritative CI
`axm lint --strict` gate.

## Agent workflow

Before changing hooks, inspect the existing hook manager, formatter ordering,
strictness policy, CLI availability, bypass policy, and CI gate. Propose the
exact diff and get consent before editing shared hook files. Preserve every
existing check. Exercise the edited hook using a real Git operation in a
disposable checkout. For a branch hook, switch between two branches that
declare different rules. Inspect the visible instructions and lockfile before
and after applying the plan, then repeat the check on the converged branch.
For a commit hook, try a partially staged edit and inspect the committed bytes
and the unstaged remainder.
