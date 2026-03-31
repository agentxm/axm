---
name: Release
description: Bump versions, commit, push, and create a GitHub Release to trigger publishing
category: Release
tags: [release, publish, github, npm, homebrew]
---

Release axm through the canonical GitHub Release workflow.

**Steps**

1. **Verify**

   ```bash
   pnpm verify
   ```

   Stop if anything fails.

2. **Ask for version bump type**

   Confirm `patch`, `minor`, or `major`.

3. **Bump versions**

   ```bash
   pnpm version:<patch|minor|major>
   ```

   Read the new version from `packages/cli/package.json`.

4. **Commit and push**

   ```bash
   git add packages/core/package.json packages/cli/package.json
   git commit -m "release: cli-v<version>"
   git push origin main
   ```

5. **Create GitHub Release**

   ```bash
   gh release create cli-v<version> --title "cli v<version>" --generate-notes
   ```

6. **Monitor**

   ```bash
   gh run list --workflow=publish.yml --limit=1
   ```

**Guardrails**

- Stop immediately if verification fails
- Never bump only one package; `core` and `cli` must stay aligned
- Use `cli-v<version>` tags only
- Do not publish packages locally as the normal path
- GitHub Actions is the publisher for npm, release assets, and Homebrew updates
- Homebrew automation also depends on `HOMEBREW_TAP_TOKEN`
