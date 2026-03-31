# Release Learnings

## Release Workflow Friction, Issues, Opportunities

- 2026-03-31: Cutting a release from clean `main` still requires a separate prep commit when we want to capture release notes or process learnings in-repo. `pnpm release:prepare` insists on a clean tree, so release documentation and the release script compete unless they land first.
- 2026-03-31: The documented happy path says to create the version plan in the PR, but once changes are already merged there is no retained plan state locally. This run started with no `.nx/version-plans/` directory at all, so the release had to reconstruct that state before `release:prepare` could succeed.
- 2026-03-31: `release_learnings.md` has been added and removed multiple times in recent history. That makes process knowledge easy to lose and forces each release to rediscover prior friction through git archaeology instead of a stable source of truth.
- 2026-03-31: The current publish state was not obvious from local git state alone. Verifying whether `cli-v0.0.37` was actually published required checking `pnpm release:status`, remote tags, and GitHub release state together before preparing `0.0.38`.

## Other Application or Build Issues

- None observed yet in the local pre-release checks for `0.0.38`.
