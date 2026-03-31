# Release Learnings

## Release Workflow Friction, Issues, Opportunities

- 2026-03-31: `main` already contains `release: cli-v0.0.35` and `release: cli-v0.0.36` commits, but `origin` tags and GitHub releases stop at `cli-v0.0.34`. The workflow currently allows the repo to enter a "prepared but not published" state without an obvious guardrail before the next release is cut.
- 2026-03-31: The documented plan step depends on pending files in `.nx/version-plans/`, but the repo does not retain any local indicator of whether merged unreleased commits still need a release plan or a publish step. Recovering state requires checking git history, remote tags, and GitHub releases together.
- 2026-03-31: `release: cli-v0.0.35` never became publishable because its Binary Smoke workflow failed, while `release: cli-v0.0.36` had green CI but still was not published. The handoff between "prepare" and "publish" is easy to lose because nothing on `main` records that a prepared release still needs the publish step.
- 2026-03-31: `pnpm release:prepare --dry-run` refuses to run once `release_learnings.md` exists as an uncommitted working tree change. In-repo release documentation and the clean-tree preflight compete with each other unless you make a separate commit, stash, or use a second checkout.
- 2026-03-31: The documented `pnpm release:plan` script hardcodes `--only-touched`, which is awkward when cutting a fresh patch from already-merged commits on clean `main`. `pnpm exec nx release plan patch --message ... --onlyTouched=false` works, but that path is not the documented happy path.
- 2026-03-31: `nx release plan` and `nx release plan --printConfig` emit `Unable to locate swc-node or ts-node` warnings even when the command succeeds. The warning adds noise during release prep and makes the tooling look partially broken.
- 2026-03-31: `pnpm release:publish cli-v0.0.37` created the GitHub Release, but the generated release body said "This was a version bump only, there were no code changes" even though `CHANGELOG.md` contains a real `0.0.37` entry. The GitHub release notes path is not reflecting the prepared workspace changelog as expected.
- 2026-03-31: The `cli-v0.0.37` Release workflow uploaded binaries successfully and only then failed in `Publish npm packages` because `NODE_AUTH_TOKEN` was empty. `gh secret list` shows `HOMEBREW_TAP_TOKEN` is configured, but `NPM_TOKEN` is missing entirely, so the workflow can enter a partial-release state with a public GitHub release and assets but no npm packages or Homebrew update.
- 2026-03-31: The failed `Publish npm packages` step did not fail fast. `utils:nx-release-publish` hit the npm auth error immediately, but Nx still continued running downstream build and E2E tasks for about two more minutes before the job concluded. The publish pipeline should short-circuit much earlier when registry auth is unavailable.

## Other Application or Build Issues

- None observed in the fresh `0.0.37` prepare path. The blockers were release-process and release-infrastructure issues rather than application or build failures.
