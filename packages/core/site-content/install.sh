#!/bin/sh
# Transactional AXM installer
# Usage: curl -fsSL https://axm.sh/install.sh | sh
set -eu

USER_HOME="${AXM_USER_HOME:-$HOME}"
DATA_DIR="${AXM_INSTALL_DATA_DIR:-$USER_HOME/.axm}"
INSTALL_DIR="${AXM_INSTALL_DIR:-$DATA_DIR/bin}"
case "$INSTALL_DIR" in
  /*) ;;
  *) INSTALL_DIR="$(pwd)/${INSTALL_DIR#./}" ;;
esac
BINARY_NAME="axm"
GITHUB_REPO="${AXM_INSTALL_GITHUB_REPO:-agentxm/axm}"
TARGET="${INSTALL_DIR}/${BINARY_NAME}"
LOCK_DIR="${TARGET}.upgrade.lock"
TEMP_BINARY=""
TEMP_MANIFEST=""
BACKUP=""
ORIGINAL_VERSION=""
REPLACED=0
COMMITTED=0
LOCK_ACQUIRED=0

cleanup() {
  status=$?
  if [ "$REPLACED" -eq 1 ] && [ "$COMMITTED" -eq 0 ]; then
    if [ -n "$BACKUP" ] && [ -f "$BACKUP" ]; then
      rm -f "$TARGET"
      if ! mv "$BACKUP" "$TARGET"; then
        echo "Error: AXM rollback failed; recoverable backup retained at $BACKUP" >&2
        status=10
      fi
    else
      rm -f "$TARGET"
    fi
  fi
  [ -z "$TEMP_BINARY" ] || rm -f "$TEMP_BINARY"
  [ -z "$TEMP_MANIFEST" ] || rm -f "$TEMP_MANIFEST"
  if [ "$COMMITTED" -eq 1 ]; then
    [ -z "$BACKUP" ] || rm -f "$BACKUP"
  fi
  if [ "$LOCK_ACQUIRED" -eq 1 ]; then
    rm -rf "$LOCK_DIR"
  fi
  exit "$status"
}
trap cleanup EXIT HUP INT TERM

fail() {
  echo "Error: $1" >&2
  exit 1
}

valid_semver() {
  printf '%s\n' "$1" |
    grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
}

detect_platform() {
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin) platform="darwin" ;;
    Linux) platform="linux" ;;
    *) fail "Unsupported operating system: $os" ;;
  esac
  case "$arch" in
    arm64 | aarch64) arch="arm64" ;;
    x86_64 | amd64) arch="x64" ;;
    *) fail "Unsupported architecture: $arch" ;;
  esac
  ARTIFACT="${BINARY_NAME}-${platform}-${arch}"
  echo "Detected platform: ${platform}-${arch}"
}

resolve_base_url() {
  if [ -n "${AXM_INSTALL_VERSION:-}" ]; then
    valid_semver "$AXM_INSTALL_VERSION" ||
      fail "AXM_INSTALL_VERSION must be an unprefixed semantic version"
    TARGET_VERSION="$AXM_INSTALL_VERSION"
    RELEASE_PATH="cli-v${TARGET_VERSION}"
  else
    TARGET_VERSION=""
    RELEASE_PATH="latest"
  fi

  if [ -n "${AXM_INSTALL_BASE_URL:-}" ]; then
    BASE_URL="${AXM_INSTALL_BASE_URL%/}"
  elif [ "$RELEASE_PATH" = "latest" ]; then
    BASE_URL="https://github.com/${GITHUB_REPO}/releases/latest/download"
  else
    BASE_URL="https://github.com/${GITHUB_REPO}/releases/download/${RELEASE_PATH}"
  fi
}

detect_tools() {
  if command -v curl >/dev/null 2>&1; then
    DOWNLOADER="curl"
  elif command -v wget >/dev/null 2>&1; then
    DOWNLOADER="wget"
  else
    fail "curl or wget is required"
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    HASHER="sha256sum"
  elif command -v shasum >/dev/null 2>&1; then
    HASHER="shasum"
  else
    fail "sha256sum or shasum is required"
  fi
}

download() {
  if [ "$DOWNLOADER" = "curl" ]; then
    curl -fsSL --output "$2" "$1"
  else
    wget -qO "$2" "$1"
  fi
}

hash_file() {
  if [ "$HASHER" = "sha256sum" ]; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

acquire_lock() {
  mkdir -p "$INSTALL_DIR"
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    LOCK_ACQUIRED=1
    printf '%s\n' "$$" > "$LOCK_DIR/pid"
    return
  fi
  owner="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  case "$owner" in
    '' | *[!0-9]*) fail "Another AXM install may be active; lock ownership is unknown: $LOCK_DIR" ;;
  esac
  if kill -0 "$owner" 2>/dev/null; then
    fail "Another AXM install is active (pid $owner)"
  fi
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR" || fail "Could not acquire the AXM install lock"
  LOCK_ACQUIRED=1
  printf '%s\n' "$$" > "$LOCK_DIR/pid"
}

verify_version() {
  "$1" --version 2>/dev/null | tr -d '\r\n'
}

install_transactionally() {
  TEMP_BINARY="$(mktemp "${INSTALL_DIR}/.axm-download.XXXXXX")"
  TEMP_MANIFEST="$(mktemp "${INSTALL_DIR}/.axm-checksums.XXXXXX")"
  download "${BASE_URL}/${ARTIFACT}" "$TEMP_BINARY" ||
    fail "Failed to download ${ARTIFACT} from ${BASE_URL}"
  download "${BASE_URL}/SHA256SUMS" "$TEMP_MANIFEST" ||
    fail "Failed to download SHA256SUMS from ${BASE_URL}"

  checksum_lines="$(awk -v name="$ARTIFACT" '$2 == name && $1 ~ /^[0-9a-f]{64}$/ { print $1 }' "$TEMP_MANIFEST")"
  checksum_count="$(printf '%s\n' "$checksum_lines" | awk 'NF { count++ } END { print count+0 }')"
  [ "$checksum_count" -eq 1 ] || fail "SHA256SUMS must contain exactly one valid entry for ${ARTIFACT}"
  expected_checksum="$(printf '%s\n' "$checksum_lines")"
  actual_checksum="$(hash_file "$TEMP_BINARY")"
  [ "$actual_checksum" = "$expected_checksum" ] ||
    fail "Checksum mismatch for ${ARTIFACT}; the existing AXM was not changed"

  chmod 755 "$TEMP_BINARY" || fail "Could not make the downloaded AXM executable"
  downloaded_version="$(verify_version "$TEMP_BINARY")" ||
    fail "The downloaded AXM binary did not execute"
  if [ -z "$TARGET_VERSION" ]; then
    TARGET_VERSION="$downloaded_version"
  fi
  [ "$downloaded_version" = "$TARGET_VERSION" ] ||
    fail "Downloaded AXM reports ${downloaded_version}; expected ${TARGET_VERSION}"

  if [ -f "$TARGET" ]; then
    ORIGINAL_VERSION="$(verify_version "$TARGET" || true)"
    BACKUP="$(mktemp "${INSTALL_DIR}/.axm-backup.XXXXXX")"
    cp -p "$TARGET" "$BACKUP" || fail "Could not create a restorable AXM backup"
  fi

  mv -f "$TEMP_BINARY" "$TARGET" || fail "Could not atomically replace ${TARGET}"
  TEMP_BINARY=""
  REPLACED=1
  installed_version="$(verify_version "$TARGET")" ||
    fail "Installed AXM failed verification; restoring the previous installation"
  [ "$installed_version" = "$TARGET_VERSION" ] ||
    fail "Installed AXM reports ${installed_version}; expected ${TARGET_VERSION}; restoring the previous installation"

  mkdir -p "$DATA_DIR"
  meta_file="${DATA_DIR}/install-meta.json"
  meta_temp="$(mktemp "${DATA_DIR}/.install-meta.XXXXXX")"
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf '{"schemaVersion":2,"method":"script","installedAt":"%s","executablePath":"%s"}\n' \
    "$timestamp" "$TARGET" > "$meta_temp" ||
    fail "Could not write AXM install metadata"
  mv -f "$meta_temp" "$meta_file" || fail "Could not atomically persist AXM install metadata"

  COMMITTED=1
  echo "Installed AXM ${TARGET_VERSION} to ${TARGET}"
}

verify_path() {
  path_command="$(command -v "$BINARY_NAME" 2>/dev/null || true)"
  if [ "$path_command" = "$TARGET" ]; then
    path_version="$("$path_command" --version 2>/dev/null || true)"
    if [ "$path_version" = "$TARGET_VERSION" ]; then
      return
    fi
    echo "Warning: AXM on PATH reports ${path_version:-no version}; installed path reports ${TARGET_VERSION}." >&2
  elif [ -n "$path_command" ]; then
    path_version="$("$path_command" --version 2>/dev/null || true)"
    if [ "$path_version" != "$TARGET_VERSION" ]; then
      echo "Warning: AXM on PATH reports ${path_version:-no version}; installed path reports ${TARGET_VERSION}." >&2
    else
      echo "Warning: AXM on PATH resolves to ${path_command}, not ${TARGET}." >&2
    fi
  else
    echo "AXM is not on PATH."
  fi

  echo "Use AXM in this shell:"
  printf '  export PATH="%s:$PATH"\n' "$INSTALL_DIR"
  echo "For future shells, add that export to ~/.profile, ~/.bashrc, or ~/.zshrc, then open a new terminal."
  echo "Verify the installed executable:"
  printf '  "%s" --version\n' "$TARGET"
  echo "Automation and non-interactive shells may not load profile changes; set PATH explicitly or use the absolute executable path above."
}

main() {
  detect_platform
  resolve_base_url
  detect_tools
  acquire_lock
  install_transactionally
  verify_path
}

main
