---
name: Release
description: Route to the canonical release guide and its published release commands
category: Release
tags: [release, publish, github, npm, homebrew]
---

Read [contributing/guides/releasing.md](../../contributing/guides/releasing.md)
and follow it exactly. It is the release authority
([AGENTS.md](../../AGENTS.md#releasing)); do not follow a release flow restated
anywhere else, including here.

**Published names the guide owns**

| Command                    | Step                                               |
| -------------------------- | -------------------------------------------------- |
| `pnpm release:plan`        | Record the semver bump and changelog entry in a PR |
| `pnpm release:plan:check`  | Check the pending version plan (also run by CI)    |
| `pnpm release:prepare`     | Cut the release commit, branch, and pull request   |
| `gh pr merge --squash ...` | Land the release PR with the exact release subject |
| `pnpm release:publish`     | Create the GitHub Release after CI is green        |

`pnpm release:prepare` and `pnpm release:publish` both accept `-- --dry-run`.
Read the guide for the exact arguments, ordering, and preconditions.

**Guardrails**

- Never edit, commit, or push directly on `main`
  ([CONTRIBUTING.md](../../CONTRIBUTING.md)). Releases land through a pull
  request opened by `pnpm release:prepare`.
- Do not bump versions by hand. `utils`, `core`, and `cli` are a fixed release
  group and must stay aligned.
- Do not create the GitHub Release with a raw `gh release create`. Use
  `pnpm release:publish`, which enforces the tag, commit, and CI preconditions.
- GitHub Actions is the publisher for npm, release assets, and Homebrew.
  `pnpm release:publish:local` is preview-only, never the release path.
