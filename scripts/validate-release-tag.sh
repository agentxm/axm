#!/usr/bin/env bash
set -euo pipefail

exec bun scripts/validate-release-tag.ts "$@"
