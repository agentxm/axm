---
name: beads-prune
description: Delete completed bead trees. Removes closed root beads (no parent) where all descendants are also closed.
allowed-tools: Bash(bd *), Bash(jq *), Bash(git *)
user-invocable: true
disable-model-invocation: true
---

# Prune Completed Beads

Delete completed bead trees to clean up the database. Only deletes beads that are:

1. **Closed** - Status is closed
2. **Root-level** - Has no parent bead
3. **Fully complete** - All descendant beads are also closed

## Important: Git-Tracked Beads

Beads are stored in `.beads/issues.jsonl` which is typically tracked in git. The `bd` CLI auto-imports from git when it detects the git version has more records than the local database.

**To permanently prune beads:**

1. Delete beads with `bd delete --hard`
2. Stage and commit the updated `.beads/issues.jsonl` to git
3. Optionally purge tombstones later with `bd admin compact`

Without committing, deleted beads will resurrect on the next `bd list` call.

## When to Use

- After a plan/epic is fully complete and verified
- To clean up old completed work from the bead database
- When `bd list --status=closed` shows trees you no longer need

## Workflow

### Step 1: Find closed root beads

Store JSON once to avoid repeated calls:

```bash
# Store closed beads JSON for reuse
closed_json=$(bd list --status=closed --limit=0 --json --no-auto-import)

# Find roots (no parent-child dependency where this bead is the child)
roots=$(echo "$closed_json" | jq -r '
  [.[] | select(
    .dependencies == null or
    ([.dependencies[] | select(.type == "parent-child")] | length == 0)
  )] | .[].id
')

echo "Found roots:"
echo "$roots"
```

### Step 2: Verify each root has all descendants closed

```bash
open_json=$(bd list --status=open --limit=0 --json --no-auto-import)

# Check for open descendants (replace <root-id> with actual ID)
echo "$open_json" | jq -r --arg root "<root-id>" '
  [.[] | select(.id | startswith($root))] | length
'
```

If the count is > 0, skip that root (has open descendants).

### Step 3: Collect beads to delete (leaves first)

Sort by ID depth (most dots = deepest):

```bash
echo "$closed_json" | jq -r --arg root "<root-id>" '
  [.[] | select(.id | startswith($root))]
  | sort_by(.id | split(".") | length)
  | reverse
  | .[].id
'
```

### Step 4: Delete using batch mode

Use `bd delete --from-file` for efficient batch deletion:

```bash
# Write IDs to temp file
echo "$to_delete" > /tmp/prune-ids.txt

# Preview first
bd delete --from-file /tmp/prune-ids.txt --dry-run

# Delete permanently (--hard prevents new tombstones in DB)
bd delete --from-file /tmp/prune-ids.txt --hard --force
```

### Step 5: Purge tombstones

After deleting beads, purge tombstones from the JSONL file:

```bash
# Try bd admin compact first
bd admin compact --purge-tombstones --dry-run

# If tombstones found, purge them
bd admin compact --purge-tombstones
```

**If `bd admin compact` shows 0 tombstones but JSONL has tombstone entries:**

This can happen when soft-delete tombstones (full data with `status: "tombstone"`) aren't detected by the compact command. Check and clear manually:

```bash
# Count tombstones in JSONL
tombstone_count=$(grep -c '"status":"tombstone"' .beads/issues.jsonl 2>/dev/null || echo "0")
live_count=$(bd list --status=open --limit=0 --json --no-auto-import 2>/dev/null | jq 'length')

echo "Tombstones in JSONL: $tombstone_count"
echo "Live beads: $live_count"

# If all entries are tombstones and no live beads, clear the file
if [ "$live_count" = "0" ] && [ "$tombstone_count" -gt 0 ]; then
  echo "All entries are tombstones with no live beads. Clearing JSONL..."
  echo "" > .beads/issues.jsonl
  echo "Cleared .beads/issues.jsonl"
fi
```

### Step 6: Commit to git (critical!)

Commit the cleaned JSONL to prevent resurrection:

```bash
git add .beads/issues.jsonl
git commit -m "chore(beads): prune completed trees"
```

## Complete Prune Script

```bash
#!/bin/bash
set -e

echo "=== Collecting bead data ==="
closed_json=$(bd list --status=closed --limit=0 --json --no-auto-import 2>/dev/null || echo "[]")
open_json=$(bd list --status=open --limit=0 --json --no-auto-import 2>/dev/null || echo "[]")

# Find closed roots
roots=$(echo "$closed_json" | jq -r '
  [.[] | select(
    .dependencies == null or
    ([.dependencies[] | select(.type == "parent-child")] | length == 0)
  )] | .[].id
' 2>/dev/null || true)

if [ -z "$roots" ]; then
  echo "No closed root beads found."
  exit 0
fi

root_count=$(echo "$roots" | wc -l | tr -d ' ')
echo "Found $root_count closed root bead(s)"
echo

total_deleted=0

# Process each root
for root in $roots; do
  [ -z "$root" ] && continue

  echo "=== Checking $root ==="

  # Check for open descendants
  open_count=$(echo "$open_json" | jq -r --arg root "$root" '
    [.[] | select(.id | startswith($root))] | length
  ' 2>/dev/null || echo "0")

  if [ "$open_count" != "0" ]; then
    echo "  ✗ Has $open_count open descendant(s), skipping"
    continue
  fi

  # Get all beads to delete (leaves first)
  to_delete=$(echo "$closed_json" | jq -r --arg root "$root" '
    [.[] | select(.id | startswith($root))]
    | sort_by(.id | split(".") | length)
    | reverse
    | .[].id
  ' 2>/dev/null || true)

  if [ -z "$to_delete" ]; then
    echo "  ✗ No beads found, skipping"
    continue
  fi

  count=$(echo "$to_delete" | wc -l | tr -d ' ')
  echo "  ✓ Eligible: $count bead(s)"

  # Write to temp file for batch deletion
  tmpfile=$(mktemp)
  echo "$to_delete" > "$tmpfile"

  # Delete in batch
  bd delete --from-file "$tmpfile" --hard --force 2>/dev/null
  rm -f "$tmpfile"

  echo "  ✓ Deleted $count bead(s)"
  total_deleted=$((total_deleted + count))
done

echo
echo "=== Tombstone Cleanup ==="

# Try bd admin compact first
tombstones_found=$(bd admin compact --purge-tombstones --dry-run 2>&1 | grep "Safe to delete:" | grep -o '[0-9]*' || echo "0")

if [ "$tombstones_found" -gt 0 ]; then
  echo "Purging $tombstones_found tombstones via bd admin compact..."
  bd admin compact --purge-tombstones
else
  # Check for soft-delete tombstones not detected by compact
  tombstone_count=$(grep -c '"status":"tombstone"' .beads/issues.jsonl 2>/dev/null || echo "0")
  live_count=$(bd list --status=open --limit=0 --json --no-auto-import 2>/dev/null | jq 'length' 2>/dev/null || echo "0")

  if [ "$tombstone_count" -gt 0 ]; then
    echo "Found $tombstone_count soft-delete tombstones in JSONL"
    if [ "$live_count" = "0" ]; then
      echo "No live beads - clearing JSONL file..."
      echo "" > .beads/issues.jsonl
      echo "Cleared .beads/issues.jsonl"
      tombstones_cleared=$tombstone_count
    else
      echo "Warning: $live_count live beads exist - manual cleanup needed"
      tombstones_cleared=0
    fi
  else
    echo "No tombstones to clean"
    tombstones_cleared=0
  fi
fi

echo
echo "=== Summary ==="
echo "Root beads found: $root_count"
echo "Total beads deleted: $total_deleted"
echo "Tombstones cleared: ${tombstones_cleared:-$tombstones_found}"
echo
echo "IMPORTANT: Commit the changes to prevent resurrection:"
echo "  git add .beads/issues.jsonl"
echo "  git commit -m 'chore(beads): prune completed trees'"
```

## Arguments

`$ARGUMENTS` can be:

- Empty: Find and prune all eligible roots
- Specific IDs: `axm-1 axm-2` - Prune only these roots (with verification)

## Key Commands

| Command                               | Purpose                                       |
| ------------------------------------- | --------------------------------------------- |
| `bd delete --hard --force`            | Delete without creating new tombstones        |
| `bd delete --from-file`               | Batch delete from file (efficient)            |
| `bd delete --dry-run`                 | Preview what would be deleted                 |
| `bd admin compact --purge-tombstones` | Remove tombstones from JSONL                  |
| `bd admin compact --prune`            | Remove tombstones older than 30 days          |
| `--no-auto-import`                    | Prevent auto-import from git during operation |

## Safety

- **Always verify first** - Check for open descendants before pruning
- **Delete leaves first** - Prevents orphaning children
- **Never prunes open beads** - Only closed roots with all closed descendants
- **Commit to git** - Required to prevent auto-resurrection from git history
- **Use `--no-auto-import`** - Prevents mid-operation resurrection

## Output

Summarize:

- Number of root beads found
- Number eligible for pruning (all descendants closed)
- Number of beads deleted per root
- Total beads deleted
- Tombstones cleared
- Reminder to commit changes
