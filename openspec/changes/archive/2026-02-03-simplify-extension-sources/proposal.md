## Why

The current source type model conflates two concerns: where extensions come from (sources) and how they're discovered within a repository (well-known paths). Local sources add complexity for development workflows that are better served by other mechanisms. Consolidating to git-based remotes and registry simplifies the mental model and implementation.

## What Changes

- **BREAKING** Remove `local` source type - local development will use different mechanisms
- Add `bitbucket` source type for Bitbucket repositories
- Add `gitlab` source type for GitLab repositories
- Clarify that "well-known" is a discovery mechanism (finding extensions within a repo), not a source type
- Update source string formats to reflect the five canonical sources

**Final source types**: `github`, `git`, `bitbucket`, `gitlab`, `registry`

## Capabilities

### New Capabilities

_None_ - this change modifies existing capabilities only.

### Modified Capabilities

- `extension-sources`: Redefine source types to the five canonical sources (remove local, add bitbucket/gitlab)
- `extension-resolution`: Remove local path resolution; update URL patterns for bitbucket/gitlab

## Impact

- **Schemas**: `SourceSchema` union changes
- **Parsing**: Source string parsing adds bitbucket/gitlab prefixes, removes local prefix
- **Resolution**: `extension-resolution` module removes local path handling
- **CLI**: Commands that accepted local paths need migration path or error messaging
- **Tests**: Update fixtures and scenarios for new source set
