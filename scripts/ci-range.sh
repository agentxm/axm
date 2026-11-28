#!/usr/bin/env bash
# The checked-out commit and default branch history establish the trusted range.
set -euo pipefail
base=$DEFAULT_BASE
head=$DEFAULT_HEAD
case "$GITHUB_EVENT_NAME" in
  pull_request|push) change=true; full=false ;;
  schedule|workflow_dispatch) change=false; full=true ;;
  *) exit 1 ;;
esac

if [[ -n "$VERIFY_SHA" ]]; then
  [[ "$GITHUB_EVENT_NAME" == workflow_dispatch && "$VERIFY_SHA" =~ ^[0-9a-f]{40}$ ]]
  [[ "$GITHUB_REF" == refs/heads/main || "$GITHUB_REF" == "refs/heads/ci-verify/$VERIFY_SHA" ]]
  head=$(git rev-parse HEAD)
  [[ "$head" == "$VERIFY_SHA" && "$GITHUB_SHA" == "$VERIFY_SHA" ]]
  git merge-base --is-ancestor "$head" refs/remotes/origin/main
  change=true
  full=false
  base=
  page=1
  while [[ -z "$base" ]]; do
    runs=$(gh api -X GET "repos/$GITHUB_REPOSITORY/actions/workflows/ci.yml/runs" \
      -f status=success -f per_page=100 -f page="$page")
    candidates=$(jq -r --arg repo "$GITHUB_REPOSITORY" '
      .workflow_runs[] | select(.status == "completed" and .conclusion == "success"
        and .head_repository.full_name == $repo and .path == ".github/workflows/ci.yml"
        and ((.event == "push" and .head_branch == "main") or
          (.event == "workflow_dispatch" and (.display_title == ("Verify main " + .head_sha) or .display_title == ("Verify release " + .head_sha))
           and (.head_branch == "main" or .head_branch == ("ci-verify/" + .head_sha)))))
      | .head_sha' <<< "$runs")
    while read -r candidate; do
      if [[ "$candidate" =~ ^[0-9a-f]{40}$ && "$candidate" != "$head" ]] &&
        git merge-base --is-ancestor "$candidate" "$head"; then
        base=$candidate
        break
      fi
    done <<< "$candidates"
    if [[ $(jq '.workflow_runs | length' <<< "$runs") -lt 100 ]]; then
      break
    fi
    ((page+=1))
  done
  if [[ -z "$base" ]]; then
    base=$(git rev-list --max-parents=0 "$head")
  fi
fi

[[ -n "$base" && -n "$head" ]]
printf 'base=%s\nhead=%s\nchange=%s\nfull=%s\n' "$base" "$head" "$change" "$full" >> "$GITHUB_OUTPUT"
