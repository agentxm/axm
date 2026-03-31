#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <patch|minor|major>" >&2
  exit 1
fi

release_type="$1"

case "$release_type" in
  patch | minor | major) ;;
  *)
    echo "Version bump must be one of: patch, minor, major" >&2
    exit 1
    ;;
esac

read_package_version() {
  node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).version" "$1"
}

core_version="$(read_package_version packages/core/package.json)"
cli_version="$(read_package_version packages/cli/package.json)"

if [ "$core_version" != "$cli_version" ]; then
  echo "packages/core/package.json version ($core_version) does not match packages/cli/package.json version ($cli_version)" >&2
  exit 1
fi

echo "==> Bumping $release_type versions..."
pnpm --filter @axm.sh/core exec npm version "$release_type" --no-git-tag-version
pnpm --filter @axm.sh/cli exec npm version "$release_type" --no-git-tag-version

version="$(read_package_version packages/cli/package.json)"
tag="cli-v$version"

echo "==> Updated packages/core and packages/cli to $version"
echo ""
echo "Next steps:"
echo "  git add packages/core/package.json packages/cli/package.json"
echo "  git commit -m \"release: $tag\""
echo "  git push origin main"
echo "  # Wait for CI on the release commit to pass"
echo "  pnpm release:publish $tag"
echo ""
echo "The GitHub Release workflow publishes npm, release assets, and Homebrew updates."
