#!/bin/sh
# Install script for axm — the extension manager for AI coding agents.
# Usage: curl -fsSL https://axm.sh/install.sh | sh
set -e

INSTALL_DIR="$HOME/.axm/bin"
BINARY_NAME="axm"
GITHUB_REPO="${AXM_INSTALL_GITHUB_REPO:-agentxm/axm}"
BASE_URL="${AXM_INSTALL_BASE_URL:-https://github.com/${GITHUB_REPO}/releases/latest/download}"

main() {
  detect_platform
  detect_downloader
  download_binary
  verify
}

detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Darwin) PLATFORM="darwin" ;;
    Linux)  PLATFORM="linux" ;;
    *)
      echo "Error: Unsupported operating system: $OS"
      echo ""
      echo "Supported platforms:"
      echo "  - macOS (arm64, x64)"
      echo "  - Linux (arm64, x64)"
      exit 1
      ;;
  esac

  case "$ARCH" in
    arm64 | aarch64) ARCH="arm64" ;;
    x86_64 | amd64)  ARCH="x64" ;;
    *)
      echo "Error: Unsupported architecture: $ARCH"
      echo ""
      echo "Supported architectures:"
      echo "  - arm64 (aarch64)"
      echo "  - x64 (x86_64)"
      exit 1
      ;;
  esac

  ARTIFACT="${BINARY_NAME}-${PLATFORM}-${ARCH}"
  DOWNLOAD_URL="${BASE_URL}/${ARTIFACT}"
  echo "Detected platform: ${PLATFORM}-${ARCH}"
}

detect_downloader() {
  if command -v curl >/dev/null 2>&1; then
    DOWNLOADER="curl"
  elif command -v wget >/dev/null 2>&1; then
    DOWNLOADER="wget"
  else
    echo "Error: curl or wget is required but neither was found."
    echo "Install curl or wget and try again."
    exit 1
  fi
}

download() {
  url="$1"
  output="$2"

  if [ "$DOWNLOADER" = "curl" ]; then
    curl -fsSL --output "$output" "$url"
  else
    wget -qO "$output" "$url"
  fi
}

download_binary() {
  echo "Downloading ${ARTIFACT}..."
  mkdir -p "$INSTALL_DIR"

  target="${INSTALL_DIR}/${BINARY_NAME}"
  if ! download "$DOWNLOAD_URL" "$target"; then
    echo ""
    echo "Error: Failed to download ${ARTIFACT}."
    echo "URL: ${DOWNLOAD_URL}"
    echo ""
    echo "Check that the release exists and your network connection is working."
    exit 1
  fi

  chmod +x "$target"
  echo "Installed to ${target}"
}

verify() {
  echo ""

  if command -v "$BINARY_NAME" >/dev/null 2>&1; then
    "$BINARY_NAME" --version
    echo ""
    echo "Done! Run 'axm auth login' to get started."
  else
    echo "axm was installed to ${INSTALL_DIR} but it is not on your PATH."
    echo ""
    print_path_instructions
    echo ""
    echo "Then open a new terminal session and run: axm auth login"
  fi
}

print_path_instructions() {
  echo "Add axm to your PATH by running:"
  echo ""

  # Detect shell and suggest the right rc file
  current_shell="$(basename "${SHELL:-sh}")"
  case "$current_shell" in
    zsh)
      echo "  echo 'export PATH=\"\$HOME/.axm/bin:\$PATH\"' >> ~/.zshrc"
      echo "  source ~/.zshrc"
      ;;
    bash)
      if [ -f "$HOME/.bash_profile" ]; then
        rc_file=".bash_profile"
      else
        rc_file=".bashrc"
      fi
      echo "  echo 'export PATH=\"\$HOME/.axm/bin:\$PATH\"' >> ~/${rc_file}"
      echo "  source ~/${rc_file}"
      ;;
    fish)
      echo "  set -Ux fish_user_paths \$HOME/.axm/bin \$fish_user_paths"
      ;;
    *)
      echo "  export PATH=\"\$HOME/.axm/bin:\$PATH\""
      echo ""
      echo "Add that line to your shell's configuration file to make it permanent."
      ;;
  esac
}

main
