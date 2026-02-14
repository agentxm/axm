## Context

`axm skills fork` currently has two source-resolution modes:

- Glob source (`*` present): resolves candidates from workspace lockfile skill keys only.
- Non-glob source: resolves from explicit installed name, local path, or remote source string.

This causes a behavior gap: unmanaged skills that exist in settings and/or on disk are not discoverable through glob sources, even though users expect globbing to enumerate available local skills.

Constraints:

- Keep non-glob behavior unchanged.
- Preserve deterministic matching and stable error reporting.
- Continue using workspace-driven context (configured agents, configured skill entries, and canonical directories).

## Goals / Non-Goals

**Goals:**

- Expand glob candidate discovery for `skills fork` beyond lockfile entries.
- Include unmanaged configured skills and unmanaged skills present on disk.
- Keep matching deterministic with clear precedence and dedupe semantics.
- Improve `NO_SKILLS_MATCHED` diagnostics to show the expanded candidate set.
- Maintain lint-clean and test-backed behavior.

**Non-Goals:**

- No changes to non-glob source resolution.
- No changes to fork plan execution (copy/publish/install pipeline).
- No compatibility layer to preserve old lockfile-only matching behavior.

## Decisions

1. Discovery model for glob sources

- Decision: Build glob candidates from a union of three sets:
  - locked skill names (`ws.getLockedSkills()`)
  - configured skill names (`ws.getConfiguredSkills()`)
  - unmanaged on-disk skill names discovered from configured agent skill directories
- Rationale: Covers all user-visible local skill surfaces and closes the current discovery blind spots.
- Alternative considered: lockfile + settings only. Rejected because unmanaged on-disk skills may be absent from settings.

2. Candidate normalization and dedupe

- Decision: Normalize to skill-name set semantics before glob expansion, then sort lexicographically for stable output and errors.
- Rationale: Prevents duplicate matches across sources and keeps output deterministic.
- Alternative considered: source-priority list without canonical sort. Rejected due to unstable user-facing ordering.

3. Source materialization for matched names

- Decision: Resolve matched names with existing source resolver behavior, but allow unmanaged names discovered from settings/on-disk to be converted into local source refs before extension resolution.
- Rationale: Reuses existing provider pipeline while enabling unmanaged discovery.
- Alternative considered: bypass providers and fork directly from file paths. Rejected to avoid parallel code paths and drift.

4. Error semantics

- Decision: Keep `NO_SKILLS_MATCHED` code and message shape, but compute `Available:` from the expanded candidate set.
- Rationale: Preserves CLI contract while making diagnostics accurate.
- Alternative considered: introduce a new error code. Rejected as unnecessary churn for users and tests.

5. Test strategy

- Decision: Add/adjust unit and e2e coverage for:
  - glob matching unmanaged configured skills
  - glob matching unmanaged on-disk-only skills
  - dedupe/stable ordering across candidate sources
  - unchanged non-glob resolution behavior
- Rationale: Regression safety for behavior change and ordering-sensitive outputs.

## Risks / Trade-offs

- [Risk] On-disk discovery can include unintended directories. -> Mitigation: only count directories that satisfy skill shape checks (e.g., `SKILL.md` presence) under configured agent skill roots.
- [Risk] Extra discovery I/O may increase latency for glob sources. -> Mitigation: parallelize directory scans and keep non-glob path unchanged.
- [Risk] Source conversion for unmanaged entries may fail for malformed configs. -> Mitigation: map failures to existing `INVALID_SOURCE` / `DISCOVER_FAILED` patterns with contextual details.
- [Risk] Behavior shift may surprise users relying on lockfile-only semantics. -> Mitigation: explicit release note and updated help/example wording.

## Migration Plan

- Update fork glob discovery implementation and shared helpers.
- Add unit and e2e coverage for expanded candidate sources and deterministic ordering.
- Run lint and targeted tests for `skills fork`.
- Rollback strategy: revert glob discovery to lockfile-only candidate source.

## Open Questions

- Should unmanaged on-disk discovery include hidden directories by default?
- Should candidate ordering in `Available:` remain full lexical order or preserve source grouping for readability?
- Should `skills list` expose a similar expanded unmanaged discovery mode for consistency in future changes?
