#!/usr/bin/env bash
set -euo pipefail

# Release: bump patch versions, build, and publish both @axm.sh/core and @axm.sh/cli

echo "==> Bumping patch versions..."
pnpm --filter @axm.sh/core exec npm version patch --no-git-tag-version
pnpm --filter @axm.sh/cli exec npm version patch --no-git-tag-version

echo "==> Building..."
pnpm nx run-many -t build

echo "==> Publishing @axm.sh/core..."
pnpm --filter ./packages/core publish --access public --no-git-checks

echo "==> Publishing @axm.sh/cli..."
pnpm --filter ./packages/cli publish --access public --no-git-checks

echo "==> Done."
