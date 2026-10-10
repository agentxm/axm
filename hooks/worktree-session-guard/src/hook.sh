#!/usr/bin/env bash
# Tells an agent that starts a session in a Git worktree when another live
# agent session is already registered there.
#
# Sessions that share a worktree share its files, its index, and its task
# cache, so each one sees the other's half-finished edits as its own failures
# and may commit or stash them. Each session records its agent's process under
# the worktree's own Git directory; a record whose process has gone is dropped.
# The host adds what this prints on stdout to the session's context, so the
# warning reaches the agent before its first edit. It never blocks a session.
set -euo pipefail

payload="$(cat)"

# The first string value of one top-level field; the payload is a flat object.
field() {
  printf '%s' "$payload" |
    sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" |
    head -n 1
}

[[ "$(field hook_event_name)" == "$1" ]] || exit 0

session="$(field session_id)"
[[ "$session" =~ ^[A-Za-z0-9_-]+$ ]] || exit 0

directory="$(field cwd)"
directory="${directory:-$PWD}"
git_dir="$(git -C "$directory" rev-parse --absolute-git-dir 2>/dev/null)" || exit 0
root="$(git -C "$directory" rev-parse --show-toplevel 2>/dev/null)" || exit 0

# The agent is the nearest ancestor that is not a shell the host ran this through.
agent="$PPID"
while name="$(ps -o comm= -p "$agent" 2>/dev/null)" &&
  [[ "${name##*/}" =~ ^-?(sh|bash|zsh|dash)$ ]]; do
  agent="$(ps -o ppid= -p "$agent" | tr -d ' ')"
done

registry="$git_dir/agent-sessions"
mkdir -p "$registry"

others=""
for record in "$registry"/*; do
  [[ -f "$record" ]] || continue
  [[ "${record##*/}" == "$session" ]] && continue
  process="$(cat "$record")"
  # A record of this same agent is an earlier session of it, not company.
  if [[ "$process" =~ ^[0-9]+$ && "$process" != "$agent" ]] && kill -0 "$process" 2>/dev/null; then
    others="${others:+$others, }$process"
  else
    rm -f "$record"
  fi
done

printf '%s\n' "$agent" >"$registry/$session"

[[ -n "$others" ]] || exit 0

cat <<MESSAGE
Another agent session is already running in this worktree: $root (process $others).
Sessions that share a worktree share its files, Git index, and task cache, so each sees the other's unfinished edits as failures of its own, and a commit hook stashes whatever either has left unstaged.
Before changing anything here, tell the user. Prefer a separate worktree for this session: git worktree add <path> -b <branch>.
MESSAGE
