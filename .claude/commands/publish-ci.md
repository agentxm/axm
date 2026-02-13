---
name: Publish via CI
description: Version bump, push, and create a GitHub Release to trigger CI publish
category: Release
tags: [release, npm, publish, ci]
---

Publish @axm.sh/cli via the CI publish workflow.

**Steps**

1. **Verify the build**

   ```bash
   pnpm build && pnpm test && pnpm lint
   ```

   Stop if anything fails.

2. **Ask for version bump type**

   Use AskUserQuestion to ask which bump: patch, minor, or major.

3. **Bump version**

   ```bash
   pnpm --filter @axm.sh/cli exec npm version <patch|minor|major> --no-git-tag-version
   ```

   Read the new version from `packages/cli/package.json` after bumping.

4. **Commit and push**

   ```bash
   git add packages/cli/package.json
   git commit -m "release: v<version>"
   git push origin main
   ```

5. **Create GitHub Release**

   ```bash
   gh release create v<version> --title "v<version>" --generate-notes
   ```

6. **Monitor**

   Tell the user to check the Actions tab or run:

   ```bash
   gh run list --workflow=publish.yml --limit=1
   ```

**Guardrails**

- Stop immediately if build, test, or lint fails
- Confirm version bump type before bumping
- Never push without a passing build
- The publish workflow handles build + publish with provenance
