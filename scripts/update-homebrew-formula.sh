#!/usr/bin/env bash
set -euo pipefail

# Update the Homebrew formula in agentxm/homebrew-tap with new version and SHA256s.
#
# Usage:
#   pnpm update-homebrew-formula -- <version>
#
# Examples:
#   pnpm update-homebrew-formula -- 0.2.0
#   HOMEBREW_TAP_DIR=/path/to/homebrew-tap pnpm update-homebrew-formula -- 0.2.0
#   RELEASE_ASSET_DIR=/path/to/binaries DRY_RUN=1 pnpm update-homebrew-formula -- 0.2.0
#
# Environment:
#   HOMEBREW_TAP_DIR  — path to local homebrew-tap clone (default: ../homebrew-tap)
#   GITHUB_REPO       — GitHub repo for releases (default: agentxm/axm)
#   RELEASE_ASSET_DIR — local directory containing release binaries; skips downloads when set
#   DRY_RUN           — set to "1" to print changes without committing/pushing

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.2.0"
  exit 1
fi

GITHUB_REPO="${GITHUB_REPO:-agentxm/axm}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOMEBREW_TAP_DIR="${HOMEBREW_TAP_DIR:-${SCRIPT_DIR}/../../homebrew-tap}"
FORMULA="${HOMEBREW_TAP_DIR}/Formula/axm.rb"
RELEASE_ASSET_DIR="${RELEASE_ASSET_DIR:-}"
DRY_RUN="${DRY_RUN:-0}"

BASE_URL="https://github.com/${GITHUB_REPO}/releases/download/cli-v${VERSION}"
ARTIFACTS="axm-darwin-arm64 axm-darwin-x64 axm-linux-arm64 axm-linux-x64"

if [ ! -f "$FORMULA" ]; then
  echo "Error: Formula not found at ${FORMULA}"
  echo "Set HOMEBREW_TAP_DIR to your local homebrew-tap clone."
  exit 1
fi

# Consume the canonical checksum manifest published with the exact binaries.
TMPDIR_PATH="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_PATH"' EXIT
MANIFEST="${TMPDIR_PATH}/SHA256SUMS"

if [ -n "$RELEASE_ASSET_DIR" ]; then
  echo "==> Using canonical checksums from ${RELEASE_ASSET_DIR}..."
  bun "${SCRIPT_DIR}/release-checksums.ts" validate "$RELEASE_ASSET_DIR"
  cp "${RELEASE_ASSET_DIR}/SHA256SUMS" "$MANIFEST"
else
  echo "==> Downloading canonical checksums for v${VERSION}..."
  curl -fsSL --output "$MANIFEST" "${BASE_URL}/SHA256SUMS" || {
    echo "Error: Failed to download ${BASE_URL}/SHA256SUMS"
    exit 1
  }
fi

for artifact in $ARTIFACTS; do
  echo "    ${artifact}"
  matches="$(awk -v name="$artifact" '$2 == name && $1 ~ /^[0-9a-f]{64}$/ { print $1 }' "$MANIFEST")"
  count="$(printf '%s\n' "$matches" | awk 'NF { count++ } END { print count+0 }')"
  if [ "$count" -ne 1 ]; then
    echo "Error: SHA256SUMS must contain exactly one valid entry for ${artifact}"
    exit 1
  fi
  sha="$matches"
  echo "    sha256: ${sha}"

  # Write sha to a file keyed by artifact name (avoids bash 4 associative arrays)
  echo "$sha" > "${TMPDIR_PATH}/${artifact}.sha256"
done

echo ""
echo "==> Updating formula..."

# Update version
sed -i.bak "s/version \".*\"/version \"${VERSION}\"/" "$FORMULA"

# Update each SHA256 — find the URL line containing the artifact name,
# then replace the sha256 on the next line
for artifact in $ARTIFACTS; do
  sha="$(cat "${TMPDIR_PATH}/${artifact}.sha256")"
  awk -v artifact="$artifact" -v sha="$sha" '
    found && /sha256/ {
      sub(/sha256 ".*"/, "sha256 \"" sha "\"")
      found = 0
    }
    /url/ && index($0, artifact) { found = 1 }
    { print }
  ' "$FORMULA" > "${FORMULA}.tmp" && mv "${FORMULA}.tmp" "$FORMULA"
done

rm -f "${FORMULA}.bak"

echo "    Updated ${FORMULA}"
echo ""

cd "$HOMEBREW_TAP_DIR"

if git diff --quiet -- Formula/axm.rb; then
  echo "==> No formula changes detected."
  exit 0
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "==> Dry run — changes not committed. Diff:"
  git diff Formula/axm.rb
  exit 0
fi

# Commit and push
echo "==> Committing and pushing..."

commit_identity=()
if ! git config user.name >/dev/null; then
  commit_identity+=(-c "user.name=github-actions[bot]")
fi

if ! git config user.email >/dev/null; then
  commit_identity+=(-c "user.email=41898282+github-actions[bot]@users.noreply.github.com")
fi

git add Formula/axm.rb
git "${commit_identity[@]}" commit -m "axm ${VERSION}"
git push

echo "==> Done. Homebrew formula updated to v${VERSION}."
