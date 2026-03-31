#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <commit-sha> <output-dir>" >&2
  exit 1
fi

sha="$1"
output_dir="$2"
repo="${GITHUB_REPOSITORY:-agentxm/axm}"
artifact_name="axm-binaries-$sha"

run_id="$(
  gh run list \
    --repo "$repo" \
    --workflow ci.yml \
    --commit "$sha" \
    --event push \
    --status success \
    --limit 20 \
    --json databaseId \
    --jq '.[0].databaseId'
)"

if [ -z "${run_id}" ] || [ "$run_id" = "null" ]; then
  echo "No successful CI workflow run found for commit $sha in $repo" >&2
  exit 1
fi

mkdir -p "$output_dir"

gh run download "$run_id" \
  --repo "$repo" \
  --name "$artifact_name" \
  --dir "$output_dir"
