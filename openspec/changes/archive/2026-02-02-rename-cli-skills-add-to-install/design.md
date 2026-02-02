# Design: Rename cli-skills-add to cli-skills-install

## Context

The CLI uses "add" for installing skills, but "install" is the industry-standard
term used by npm, pip, brew, and VS Code. This rename improves discoverability
and aligns with user expectations.

## Goals / Non-Goals

**Goals:**

- Rename the sub-command from `add` to `install`
- Update all spec references
- Update all code and test references
- Maintain identical functionality

**Non-Goals:**

- Change any behavior or functionality
- Add backwards compatibility aliases (clean break)

## Decisions

### DES-1: Direct Rename Without Alias

**Decision:** Rename directly without maintaining a deprecated `add` alias.

**Rationale:** The feature is new and not yet released. No backwards compatibility
needed. A clean rename is simpler than maintaining aliases.

### DES-2: Spec Rename Strategy

**Decision:** Use RENAMED spec operation to rename `cli-skills-add` to
`cli-skills-install`, then MODIFIED to update all command references in
requirements.

**Rationale:** OpenSpec supports RENAMED operations for capability renames.
The content must also be modified to change "add" references to "install".

### DES-3: File Rename Approach

**Decision:** Rename directory and files, then update imports.

**Rationale:** Git will track the rename properly. All imports use relative
paths within the package.

## Risks / Trade-offs

- **Risk:** Merge conflicts with in-flight work on skills commands.
- **Mitigation:** Complete this rename before additional skills work begins.

## Migration Plan

1. Rename spec capability using RENAMED operation
2. Modify spec content to use "install" terminology
3. Rename code directories and files
4. Update all imports and references
5. Update tests

## Open Questions

None.
