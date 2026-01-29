---
name: beads-prune
description: Delete completed bead trees. Removes closed root beads (no parent) where all descendants are also closed.
allowed-tools: Bash(bd *), Bash(jq *)
user-invocable: true
disable-model-invocation: true
---

# Prune Completed Beads

Delete completed bead trees to clean up the database. Only deletes beads that are:

1. **Closed** - Status is closed
2. **Root-level** - Has no parent bead
3. **Fully complete** - All descendant beads are also closed

## When to Use

- After a plan/epic is fully complete and verified
- To clean up old completed work from the bead database
- When `bd list --status=closed` shows trees you no longer need

## Workflow

### Step 1: Find closed root beads

List all closed beads and identify roots (beads with no parent):

```bash
bd list --status=closed --limit=0 --json | jq -r '
  [.[] | select(
    .dependencies == null or
    ([.dependencies[] | select(.type == "parent-child")] | length == 0)
  )] | .[].id
'
```

### Step 2: Verify each root has all descendants closed

For each candidate root, check if ANY beads with that prefix are open:

```bash
# Check for any open beads under this root
bd list --status=open --limit=0 --json | jq -r '
  [.[] | select(.id | startswith("<root-id>"))] | length
'
```

If the count is > 0, skip that root (has open descendants).

### Step 3: Get all beads in the tree (leaves first)

For a clean deletion, delete leaves before parents. Sort by ID depth (most dots = deepest):

```bash
bd list --status=closed --limit=0 --json | jq -r '
  [.[] | select(.id | startswith("<root-id>"))]
  | sort_by(.id | split(".") | length)
  | reverse
  | .[].id
'
```

### Step 4: Preview deletion

Preview what will be deleted:

```bash
# Get the list of IDs to delete
ids=$(bd list --status=closed --limit=0 --json | jq -r '
  [.[] | select(.id | startswith("<root-id>"))]
  | sort_by(.id | split(".") | length)
  | reverse
  | .[].id
')

echo "Will delete these beads (leaves first):"
echo "$ids" | head -20
echo "... ($(echo "$ids" | wc -l | tr -d ' ') total)"
```

### Step 5: Delete leaves first, then parents

Delete in order (deepest first to avoid orphaning):

```bash
bd list --status=closed --limit=0 --json | jq -r '
  [.[] | select(.id | startswith("<root-id>"))]
  | sort_by(.id | split(".") | length)
  | reverse
  | .[].id
' | while read id; do
  bd delete "$id" --force --reason "Pruning completed bead tree"
done
```

## Complete Prune Script

To prune all eligible roots:

```bash
# Find closed roots and process each
bd list --status=closed --limit=0 --json | jq -r '
  [.[] | select(
    .dependencies == null or
    ([.dependencies[] | select(.type == "parent-child")] | length == 0)
  )] | .[].id
' | while read root; do
  echo "=== Checking $root ==="

  # Check for open descendants
  open_count=$(bd list --status=open --limit=0 --json | jq -r "
    [.[] | select(.id | startswith(\"$root\"))] | length
  ")

  if [ "$open_count" != "0" ]; then
    echo "✗ Has $open_count open descendants, skipping"
    continue
  fi

  # Get all beads to delete (leaves first)
  to_delete=$(bd list --status=closed --limit=0 --json | jq -r "
    [.[] | select(.id | startswith(\"$root\"))]
    | sort_by(.id | split(\".\") | length)
    | reverse
    | .[].id
  ")

  count=$(echo "$to_delete" | wc -l | tr -d ' ')
  echo "✓ Eligible for pruning ($count beads)"

  # Delete leaves first
  echo "$to_delete" | while read id; do
    bd delete "$id" --force --reason "Pruning completed bead tree"
  done

  echo "✓ Pruned $root ($count beads deleted)"
done
```

## Arguments

`$ARGUMENTS` can be:

- Empty: Find and prune all eligible roots
- Specific IDs: `axm-1 axm-2` - Prune only these roots (with verification)

## Safety

- **Always verify first** - Check for open descendants before pruning
- **Delete leaves first** - Prevents orphaning children
- **Never prunes open beads** - Only closed roots with all closed descendants
- **Tombstones preserved** - Default deletion creates tombstones for audit trail

## Output

Summarize:

- Number of root beads found
- Number eligible for pruning (all descendants closed)
- Number of beads deleted per root
- Total beads deleted
