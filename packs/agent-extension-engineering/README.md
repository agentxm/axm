# Agent extension engineering

One routing skill and one knowledge bundle for designing, authoring, reviewing,
and maintaining extensions to existing agents. This optional, encouraged pack
adds engineering judgment; basic AXM use and authoring work without it.

```sh
axm install @agentxm/packs/agent-extension-engineering@0.2.0
```

| Member                                           | Version | Responsibility                               |
| ------------------------------------------------ | ------- | -------------------------------------------- |
| `@agentxm/skills/agent-extension-engineering`    | `0.2.0` | Select focused knowledge for the use case    |
| `@agentxm/knowledge/agent-extension-engineering` | `0.2.0` | Own substantive extension craft and patterns |

The AXM skill owns package management and workspace operations and is bundled
with the CLI. It is not a member of this pack. This collection's versions are
independent of the CLI release cohort. Engineering recommendations do not
independently redefine AXM conventions or external standards.

## Migration

| Deprecated identity                               | Replacement                                      |
| ------------------------------------------------- | ------------------------------------------------ |
| `@agentxm/packs/agent-extensions-engineering`     | `@agentxm/packs/agent-extension-engineering`     |
| `@agentxm/skills/agent-extensions-engineering`    | `@agentxm/skills/agent-extension-engineering`    |
| `@agentxm/knowledge/agent-extensions-engineering` | `@agentxm/knowledge/agent-extension-engineering` |

The rename preserves the focused collection's scope and one-skill composition.
Old published versions remain available as deprecated history. For a directly
installed old pack, preview `axm migrate @agentxm/packs/agent-extensions-engineering
--preview`, then apply the supported migration. A pack-selected member follows
its owning pack; remove obsolete direct selections separately if present.

Prefer installing the replacement pack as a unit: the routing skill requires
its knowledge sibling. Inspect desired settings, accepted versions, canonical
packages, and projections afterward; verify the new concept routes. Do not
hand-delete manager-owned files or lock rows.

## Candidate 0.2.0

Adds the shared glossary and its routing entry. Definitions are seeded from the
existing public vocabulary and await terminology review. CLI help, the AXM skill,
and both websites receive generated snapshots; installing this pack remains
optional. This candidate has not been published.

## Release 0.1.0

Initial release under the singular name. Adds a clearer distinction between
host-dependent skill activation advice and AXM requirements. The collection
continues to exclude agent-runtime engineering and MCP server implementation.
No executable helpers, credentials, or external-action authority are added.

The repository retains a bounded before/after evaluation of the AXM core and
optional authoring routes under `skills/axm/evals/2026-10-30/`. These are independent
agent authoring and planning exercises with synthetic inputs, not automatic host
activation rates, portability results, or a claim that the pack improves all tasks.

Rollback restores the plural-named pack, skill, and knowledge at `0.1.0`, along
with their prior workspace selections. Deprecation is warning-only.
