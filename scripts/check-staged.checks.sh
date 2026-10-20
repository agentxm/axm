#!/usr/bin/env bash
# This repository's staged checks. scripts/check-staged.sh runs them in order
# after isolating the index and before its staged typecheck.
set -euo pipefail

# Every check enforces the now-visible index dependency state.
echo "Running staged auto-fixes..."
pnpm --config.verify-deps-before-run=error exec lint-staged --no-stash
pnpm --config.verify-deps-before-run=error axm:local lint --staged --strict
pnpm --config.verify-deps-before-run=error exec nx run axm:scan-secrets:staged
