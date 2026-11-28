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
  # Run creation order differs from main history when an older SHA is
  # verified on demand. Keep the newest reachable successful ancestor.
  qualifying_shas() {
    jq -r --arg repo "$GITHUB_REPOSITORY" '
      .workflow_runs[] | select(.status == "completed" and .conclusion == "success"
        and .head_repository.full_name == $repo and .path == ".github/workflows/ci.yml"
        and ((.event == "push" and .head_branch == "main") or
          (.event == "workflow_dispatch" and (.display_title == ("Verify main " + .head_sha) or .display_title == ("Verify release " + .head_sha))
           and (.head_branch == "main" or .head_branch == ("ci-verify/" + .head_sha)))))
      | .head_sha'
  }
  endpoint="repos/$GITHUB_REPOSITORY/actions/workflows/ci.yml/runs"
  page=1
  while :; do
    # The unfiltered workflow listing supports paging beyond 1,000 runs.
    runs=$(gh api -X GET "$endpoint" -f per_page=100 -f page="$page")
    candidates=$(qualifying_shas <<< "$runs")
    while read -r candidate; do
      if [[ "$candidate" =~ ^[0-9a-f]{40}$ && "$candidate" != "$head" ]] &&
        git merge-base --is-ancestor "$candidate" "$head" &&
        { [[ -z "$base" ]] || git merge-base --is-ancestor "$base" "$candidate"; }; then
        base=$candidate
      fi
    done <<< "$candidates"
    count=$(jq '.workflow_runs | length' <<< "$runs")
    if (( count < 100 )); then break; fi
    if [[ -n "$base" ]]; then
      # For a short batch, probing intermediate commits takes fewer requests
      # than paging older runs. A prior green replay can never move the base back.
      remaining=$(jq --argjson page "$page" '((.total_count / 100) | ceil) - $page' <<< "$runs")
      span=$(git rev-list --count "$base..$head")
      if (( span - 1 <= remaining )); then
        while read -r candidate; do
          [[ "$candidate" != "$head" ]] || continue
          exact=$(gh api --paginate -X GET "$endpoint" -f head_sha="$candidate" -f per_page=100)
          verified=$(qualifying_shas <<< "$exact")
          if grep -Fxq "$candidate" <<< "$verified"; then
            base=$candidate
            break
          fi
        done < <(git rev-list --topo-order "$base..$head")
        break
      fi
    fi
    ((page+=1))
  done
  if [[ -z "$base" ]]; then
    base=$(git rev-list --max-parents=0 "$head")
  fi
fi

[[ -n "$base" && -n "$head" ]]
printf 'base=%s\nhead=%s\nchange=%s\nfull=%s\n' "$base" "$head" "$change" "$full" >> "$GITHUB_OUTPUT"
