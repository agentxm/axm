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

# Download binaries and compute SHA256s
TMPDIR_PATH="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_PATH"' EXIT

if [ -n "$RELEASE_ASSET_DIR" ]; then
  echo "==> Using local release binaries from ${RELEASE_ASSET_DIR}..."
else
  echo "==> Downloading binaries for v${VERSION}..."
fi

for artifact in $ARTIFACTS; do
  dest="${TMPDIR_PATH}/${artifact}"

  echo "    ${artifact}"

  if [ -n "$RELEASE_ASSET_DIR" ]; then
    if [ ! -f "${RELEASE_ASSET_DIR}/${artifact}" ]; then
      echo "Error: Missing local release binary ${RELEASE_ASSET_DIR}/${artifact}"
      exit 1
    fi
    cp "${RELEASE_ASSET_DIR}/${artifact}" "$dest"
  else
    url="${BASE_URL}/${artifact}"
    if ! curl -fsSL --output "$dest" "$url"; then
      echo "Error: Failed to download ${url}"
      echo "Ensure the release exists: https://github.com/${GITHUB_REPO}/releases/tag/cli-v${VERSION}"
      exit 1
    fi
  fi

  sha="$(shasum -a 256 "$dest" | cut -d' ' -f1)"
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

if ! git config user.name >/dev/null; then
  git config user.name "github-actions[bot]"
fi

if ! git config user.email >/dev/null; then
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
fi

git add Formula/axm.rb
git commit -m "axm ${VERSION}"
git push

echo "==> Done. Homebrew formula updated to v${VERSION}."
