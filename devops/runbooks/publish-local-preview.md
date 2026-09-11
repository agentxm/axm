---
type: Runbook
title: "Publish a local AXM preview"
description: "Publish working-tree npm packages under a non-default dist-tag for authorized iteration outside the canonical release flow."
status: draft
applies-to:
  - ../repositories/axm.md
  - ../providers/npm.md
uses-tool:
  - ../tools/nx.md
sources:
  - id: migration-source
    resource: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/releasing.md
    title: Pre-migration repository guidance
generated:
  by: codex/gpt-6
  at: 2026-09-11T16:07:00Z
---

# Publish a local AXM preview

## Preconditions, completion, and failure

An authorized package publisher selects the working tree and preview tag and
has prepared the repository dependencies. This procedure changes npm state;
authorization to edit code or documentation alone is insufficient. A dry run
still builds and temporarily stamps manifests; it does not publish a package.

Success requires the command to finish, manifests to be restored, and the exact
preview versions to be available under the selected tag. Record the command
result, source revision/dirty state, versions, and tag. Installation of the
preview is a separate consumer check and does not establish release readiness.
On failure, inspect the command result and working-tree diff. Preserve unrelated
edits; do not blindly restore the checkout. A partly published cohort requires
publisher assessment before another invocation, since a new run selects a new
preview version. Settlement of ambiguous registry writes has no independent
manual recovery procedure documented here; escalate to the package publisher.

## Procedure

`pnpm release:publish:local` publishes every `release:cli` npm package directly
from the working tree under a non-default dist-tag (default: `preview`). It is
for fast iteration only. It is not a substitute for the canonical CI release:
it skips cross-platform binaries, npm provenance, Homebrew, installer
verification, and the version-plan changelog flow.

```bash
pnpm release:publish:local -- --dry-run
pnpm release:publish:local
```

The script derives a unique prerelease of the current cohort version from the
working tree (`{version}-preview.{unix}.{short-sha}[.dirty]`), builds the release
group, stamps the version into every release manifest, packs each package with
`pnpm pack`, then publishes each tarball in dependency order under the chosen
dist-tag. Because npm also assigns `latest` on a package's first publication,
keeping the preview below the current stable version lets the canonical release
supersede that bootstrap state. Manifests are restored in a `finally` block.

Install the published preview globally:

```bash
npm install -g axm.sh@preview
```

Optional flags:

- `--tag=<dist-tag>` - override the dist-tag (default `preview`; `latest` is
  refused).
- `--no-build` - skip the Nx build step when iterating on packaging only.
- `--dry-run` - run `npm publish --dry-run` against each tarball.

Login: requires `npm login` (no provenance is attached because OIDC is only
available from GitHub Actions).

## Accountability, gaps, and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). The authorized npm publisher operates this procedure; the current publisher and recovery roster must be confirmed in npm package settings.

Review this record when preview versioning, tag restrictions, package selection, credentials, or manifest restoration changes.

Exercise history is unknown: this migration inspected repository sources on
2026-09-11 and did not execute the procedure. Document status does not establish
execution authority or operational readiness.

Migration source: [pre-migration repository guidance][migration-source].

[migration-source]: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/releasing.md
