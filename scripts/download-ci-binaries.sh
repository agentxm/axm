#!/usr/bin/env bash
set -euo pipefail

exec bun scripts/download-ci-binaries.ts "$@"
