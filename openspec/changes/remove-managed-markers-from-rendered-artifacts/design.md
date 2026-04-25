## Context

AXM currently uses two marker-based mechanisms around rendered artifacts:

1. Renderers prepend managed markers (`<!-- Managed by axm -->`, `# Managed by axm`, `_axm_managed`) to command, subagent, and skill outputs.
2. Sync paths read those markers back to distinguish AXM-managed files from manual files before overwriting or merging.

That logic is now misaligned with the rest of the system. Workspace classification already decides which extensions AXM manages by combining settings and lockfile data; it does not inspect rendered file content. The marker system therefore adds write-time mutation and read-time complexity without providing the actual ownership signal the product relies on.

## Goals / Non-Goals

**Goals:**

- Remove managed markers from rendered artifacts and materialized skill files.
- Remove content-based conflict detection and content parsing that exist only to support marker checks.
- Keep command and subagent sync behavior driven by classifier-managed extension state.
- Simplify Roo mode reconciliation to use slug identity alone.
- Update specs and tests so the supported behavior matches the implementation.

**Non-Goals:**

- Changing how the workspace classifier determines managed versus unmanaged extensions.
- Adding a new replacement ownership marker or metadata field.
- Redesigning command or subagent packaging formats beyond removing AXM-managed markers.

## Decisions

### 1. AXM ownership comes from workspace metadata, not rendered file content

Command and subagent sync SHALL stop reading target file contents to determine whether AXM owns a render target. The workspace classifier already gates sync to extensions declared in settings and lockfile state, so marker-based conflict detection is duplicate logic.

This removes `detectConflict` and related branches instead of replacing them with another content probe.

Alternative considered: keep marker generation but stop reading it back. Rejected because the markers would still mutate user-visible artifacts without providing runtime value.

### 2. Renderers emit native artifact content only

Command renderers, subagent renderers, Roo mode entry builders, and skill materialization flows SHALL stop prepending AXM-managed markers. Generated output should contain only the agent-native content implied by the extension source.

This also removes marker prepend/strip helpers from copy and install flows.

Alternative considered: replace visible markers with a different hidden marker. Rejected because any content marker reintroduces mutation and special-case parsing.

### 3. Roo mode reconciliation becomes slug-based

Without `_axm_managed`, Roo mode merge and remove operations SHALL treat the mode slug as the managed identity. If AXM is configured to manage a subagent with slug `code-reviewer`, sync owns that slug in `.roomodes`.

Alternative considered: add a second private Roo-specific ownership field. Rejected because slug identity is sufficient once classifier-managed sync is the ownership boundary.

### 4. Detection and reporting stop inferring managed state from file content

Subagent detection and setup summaries SHALL stop reading files to classify them as managed or unmanaged. They only need to enumerate detected render targets; managed state already lives in workspace metadata.

Alternative considered: keep managed/unmanaged reporting for UX. Rejected because the reported distinction is derived from a mechanism being removed.

## Risks / Trade-offs

- Existing manual files that share a managed render target path will no longer be protected by marker-based overwrite checks. Mitigation: sync is already scoped to classifier-managed extensions, which defines AXM ownership explicitly.
- Roo manual entries that reuse the same slug as an AXM-managed subagent may now be overwritten or removed. Mitigation: slug collision is treated as AXM ownership once the user configures that subagent through AXM.
- Repositories with older rendered markers may keep them until the next render or materialization pass rewrites the file. Mitigation: the new flows naturally remove stale markers on rewrite.

## Migration Plan

No explicit migration step is required. Existing rendered artifacts are rewritten without markers the next time AXM syncs, installs, updates, or removes the relevant extension. Existing Roo entries with `_axm_managed` continue to reconcile because slug matching remains stable.

## Open Questions

None.
