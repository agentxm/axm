#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <release-tag>" >&2
  exit 1
fi

tag="$1"

case "$tag" in
  cli-v*) ;;
  *)
    echo "Release tag must use the cli-v{VERSION} format: $tag" >&2
    exit 1
    ;;
esac

version="${tag#cli-v}"

if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]]; then
  echo "Release tag version is not valid semver: $tag" >&2
  exit 1
fi

read_package_version() {
  node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).version" "$1"
}

core_version="$(read_package_version packages/core/package.json)"
cli_version="$(read_package_version packages/cli/package.json)"

if [ "$core_version" != "$version" ]; then
  echo "packages/core/package.json version ($core_version) does not match release tag ($version)" >&2
  exit 1
fi

if [ "$cli_version" != "$version" ]; then
  echo "packages/cli/package.json version ($cli_version) does not match release tag ($version)" >&2
  exit 1
fi

printf '%s\n' "$version"
