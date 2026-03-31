# Release Learnings

## Release Workflow Friction, Issues, Opportunities

- 2026-03-31: `main` already contains `release: cli-v0.0.35` and `release: cli-v0.0.36` commits, but `origin` tags and GitHub releases stop at `cli-v0.0.34`. The workflow currently allows the repo to enter a "prepared but not published" state without an obvious guardrail before the next release is cut.
- 2026-03-31: The documented plan step depends on pending files in `.nx/version-plans/`, but the repo does not retain any local indicator of whether merged unreleased commits still need a release plan or a publish step. Recovering state requires checking git history, remote tags, and GitHub releases together.
- 2026-03-31: `release: cli-v0.0.35` never became publishable because its Binary Smoke workflow failed, while `release: cli-v0.0.36` had green CI but still was not published. The handoff between "prepare" and "publish" is easy to lose because nothing on `main` records that a prepared release still needs the publish step.
- 2026-03-31: `pnpm release:prepare --dry-run` refuses to run once `release_learnings.md` exists as an uncommitted working tree change. In-repo release documentation and the clean-tree preflight compete with each other unless you make a separate commit, stash, or use a second checkout.
- 2026-03-31: The documented `pnpm release:plan` script hardcodes `--only-touched`, which is awkward when cutting a fresh patch from already-merged commits on clean `main`. `pnpm exec nx release plan patch --message ... --onlyTouched=false` works, but that path is not the documented happy path.
- 2026-03-31: `nx release plan` and `nx release plan --printConfig` emit `Unable to locate swc-node or ts-node` warnings even when the command succeeds. The warning adds noise during release prep and makes the tooling look partially broken.

## Other Application or Build Issues

- 2026-03-31: The GitHub Release workflow for `cli-v0.0.34` failed in `Resolve release metadata` because Bun could not resolve `@axm.sh/utils/unstable/env` from `scripts/release-shared.ts`. Later release commits appear to address this, but the failed workflow explains why GitHub/npm release state drifted.
- 2026-03-31: npm currently shows `@axm.sh/cli` at `0.0.26`, and `@axm.sh/core` is not published at all. Recent release attempts have therefore not completed package publication end-to-end.
