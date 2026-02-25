## Context

Lockfile entries currently type `resolvedVersion` and pack `resolved*` maps as generic strings, so semver ranges can be persisted even though lockfiles are intended to represent a deterministic resolved state. This is cross-cutting because registry install/write paths exist for skills, commands, MCP servers, and packs, and those paths can read or emit lockfile values. We need one consistent contract: constraints are accepted at input boundaries, exact versions are persisted in lockfile, and legacy range values are not supported.

## Goals / Non-Goals

**Goals:**

- Guarantee that all lockfile resolved version fields are exact semver versions.
- Preserve current UX for version constraints in CLI/settings/pack manifests.
- Fail fast when lockfile resolved fields contain ranges.
- Add test coverage across install paths and lockfile read/write behavior.
- Keep lint/typecheck/test expectations green.

**Non-Goals:**

- Backward compatibility for lockfile rows that contain semver ranges in resolved fields.
- Changing registry resolution semantics (range -> newest satisfying version).
- Introducing new lockfile format versions unless strictly required.

## Decisions

### 1) Enforce exact-version invariant at the schema boundary

Decision: Replace plain `Schema.String` for lockfile resolved version fields with an `ExactSemverVersion` schema (valid semver version, not semver range).

Applies to:

- Registry extension lock entries: `resolvedVersion`
- Registry/builtin pack lock entries: `resolvedVersion`
- Pack resolved maps: `resolvedSkills`, `resolvedCommands`, `resolvedMcpServers` values

Rationale:

- Schema-level enforcement prevents invalid lockfiles from silently circulating.
- Centralized validation avoids repeating range checks in every caller.

Alternatives considered:

- Keep schema broad and validate only at write sites: rejected (easy to bypass, inconsistent behavior).
- Introduce a new lockfile version with dual parsing only: deferred; not needed for this invariant.

### 2) Keep constraints at source boundaries, normalize before lockfile writes

Decision: Continue accepting version constraints from CLI/settings/pack manifests, but always persist resolved exact versions in lockfile-writing paths.

Rationale:

- Matches existing conceptual split: intent in settings/manifests, realization in lockfile.
- Avoids changing user-facing commands that currently accept ranges.

Alternatives considered:

- Ban ranges at CLI/manifest input: rejected (regresses core workflow and current specs).

### 3) Handle range values with explicit failure only

Decision: When operations encounter range strings in lockfile resolved fields, fail with a clear `CliError` including remediation guidance. No automatic repair or normalization is attempted.

Rationale:

- Keeps behavior simple and unambiguous.
- Avoids hidden rewrites and partial normalization states.

Alternatives considered:

- Opportunistic repair when exact value is known: rejected (adds complexity and hidden mutation).
- Coerce by selecting latest matching now: rejected (can rewrite lockfile to a version that was never installed).

### 4) Verify invariant through behavioral tests in each install flow

Decision: Add/adjust tests so successful installs assert exact version pins in lockfile, and legacy range handling is covered in pack/extension paths.

Rationale:

- Protects against regressions in independent handlers.
- Keeps spec-level behavior executable and observable.

Alternatives considered:

- Single schema unit test only: rejected (insufficient end-to-end confidence).

## Risks / Trade-offs

- [Risk] Strict schema will reject previously accepted lockfiles with ranges. -> Mitigation: emit actionable errors with exact field paths and expected format.
- [Risk] Cross-module updates could miss a write path. -> Mitigation: add targeted tests per install executor and pack install flow.
- [Trade-off] Stricter behavior may require manual lockfile cleanup by users. -> Benefit: deterministic installs and simpler implementation.

## Migration Plan

1. Introduce exact-semver schema primitives for lockfile resolved fields.
2. Update lockfile write paths to persist exact versions only.
3. Add fail-fast validation/error mapping for any range value in resolved fields.
4. Add/adjust tests for schema validation and install flow persistence.
5. Roll out in normal release; if regressions appear, rollback by reverting this change set.

## Open Questions

- Do we want dedicated error codes per field family (`PACK_RESOLVED_VERSION_INVALID` vs generic lockfile parse) for better diagnostics?
