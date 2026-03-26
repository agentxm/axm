---
name: Publish Locally
description: Build, version bump, and publish @axm.sh/cli to npm from local machine
category: Release
tags: [release, npm, publish]
---

Publish @axm.sh/cli to npm locally.

**Steps**

1. **Verify the build**

   ```bash
   pnpm nx run-many -t build typecheck test e2e lint
   ```

   Stop if anything fails.

2. **Ask for version bump type**

   Use AskUserQuestion to ask which bump: patch, minor, or major.

3. **Bump version**

   ```bash
   pnpm --filter @axm.sh/cli exec npm version <patch|minor|major> --no-git-tag-version
   ```

   Read the new version from `packages/cli/package.json` after bumping.

4. **Build and publish**

   ```bash
   pnpm nx run cli:publish
   ```

5. **Commit, tag, and push**

   ```bash
   git add packages/cli/package.json
   git commit -m "release: v<version>"
   git tag v<version>
   git push origin main --tags
   ```

6. **Create GitHub Release (optional)**

   Ask the user if they want a GitHub Release. If yes:

   ```bash
   gh release create v<version> --title "v<version>" --generate-notes
   ```

7. **Verify**

   ```bash
   npm view @axm.sh/cli version
   ```

   Confirm the published version matches.

**Guardrails**

- Stop immediately if build, test, or lint fails
- Confirm version bump type before bumping
- Never publish without a passing build
- Always tag after publishing so npm and git stay in sync
