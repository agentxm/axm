#!/bin/sh
# Install script for axm — the extension manager for AI coding agents.
# Usage: curl -fsSL https://axm.sh/install.sh | sh
set -e

PACKAGE="@axm.sh/cli"

main() {
  check_node
  install_axm
  verify
}

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js is required but not installed."
    echo "Install it from https://nodejs.org or via your package manager."
    exit 1
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "Error: npm is required but not installed."
    echo "It usually ships with Node.js — reinstall Node.js from https://nodejs.org"
    exit 1
  fi
}

install_axm() {
  echo "Installing ${PACKAGE}..."
  npm install -g "${PACKAGE}"
}

verify() {
  if ! command -v axm >/dev/null 2>&1; then
    echo ""
    echo "axm was installed but is not on PATH."
    echo "Add the npm global bin directory to your PATH:"
    echo ""
    echo "  export PATH=\"\$(npm config get prefix)/bin:\$PATH\""
    echo ""
    exit 1
  fi

  echo ""
  axm --version
  echo ""
  echo "Done! Run 'axm auth login' to authenticate."
}

main
