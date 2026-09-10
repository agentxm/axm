# Git hooks

Use `axm lint --view git-index` in a pre-commit hook for fast feedback on the exact
workspace Git would commit. It materializes the complete index in an isolated
temporary directory: staged bytes win for partially staged files, unchanged
tracked files remain present, and unstaged, untracked, deleted, and pre-rename
content stay out. The command is read-only, deterministic, and does not need
Registry access.

`--strict`, `--json`, and `--details` work with `--view git-index`. `--scope user`
does not. Exclude `agent_extensions/**` from filename-based formatters and other
mutating hooks. Run formatters first for repository-authored files so their
intended output is staged before AXM reads the index. Generated instruction
aliases such as `CLAUDE.md` and `GEMINI.md` are intentionally gitignored, so
staged lint leaves their currency check to the full-workspace pre-push or CI
command.

## Choose the gate

- Advisory pre-commit: `axm lint --view git-index` blocks errors but permits warnings.
- Strict pre-commit: `axm lint --view git-index --strict` blocks errors and warnings.
- Pre-push and CI: run `axm lint --strict` against the checked-out workspace.

Client hooks are developer feedback, not an enforcement boundary. Keep CI
authoritative because hooks can be missing or bypassed.

## Husky

Append AXM after the existing formatter or `lint-staged` command in
`.husky/pre-commit`:

```sh
set -e
pnpm exec lint-staged --no-stash
axm lint --view git-index --strict
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
            run: axm lint --view git-index --strict
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
        entry: axm lint --view git-index --strict
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
    "pre-commit": "pnpm exec lint-staged && axm lint --view git-index --strict"
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

axm lint --view git-index --strict
```

Store it as `.githooks/pre-commit`, make it executable, and activate it once per
clone:

```sh
git config core.hooksPath .githooks
```

## Partial staging and lint-staged

Do not register `axm lint --view git-index` as a filename-based `lint-staged` task and
do not append `{staged_files}` or a list from `git diff`. AXM reads the complete
index itself because workspace rules depend on unchanged configuration and
related extension files. Exclude `agent_extensions/**` from those formatters,
then run AXM once after they finish.

The hook never stages, restores, or rewrites files. If it reports a finding,
fix the worktree through the normal AXM or editor workflow, stage the intended
result, and rerun `axm lint --view git-index`.

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
existing check, then stage the intended hook changes and verify them with
`axm lint --view git-index`.
