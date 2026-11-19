# Agent extension engineering changes

## Candidate 0.2.0

Authors can now look up five workflow patterns individually: Display template,
Prefilled form, Select from findings, Compare variants in context, and Workflow
handoff artifact. The guides and patterns also cover bare invocation, loading
guidance at the step that uses it, independent review evidence, and testing a
completed artifact with a fresh reader.

The skill authoring guide now starts with a use case and links to individual
patterns for invocation policy, trigger cues, neighboring intent, routing after
inspection, and invocation trials. The pattern index groups these decisions by
when an author needs them.

Adds the shared glossary, shorter engineering guides, and a guide to writing
extension READMEs. Guide IDs now start with `guides/`. For scoped instructions use
`patterns/scoped-instructions`. The glossary keeps its existing ID. The skill
also routes authors to patterns for CLI-backed skills and agent-mediated decisions.
The review guides now cover clean controls, incomplete evidence, and checking a
repair against the original request. The former bundle-routing pattern is now
`patterns/progressive-disclosure`. For batch edit workflows use
`patterns/validate-the-proposed-change`. The authoring and verification guides
show how to distinguish a discovery failure from a failure to apply guidance.

## 0.1.0

Initial release under the singular name. Adds a clearer distinction between
host-dependent skill activation advice and AXM requirements. The collection
continues to exclude agent-runtime engineering and MCP server implementation.
No executable helpers, credentials, or external-action authority are added.

The repository retains a bounded before/after evaluation of the AXM core and
optional authoring routes under `skills/axm/evals/2026-10-30/`. These are independent
agent authoring and planning exercises with synthetic inputs, not automatic host
activation rates, portability results, or a claim that the pack improves all tasks.

### Migration

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

Rollback restores the plural-named pack, skill, and knowledge at `0.1.0`, along
with their prior workspace selections. Deprecation is warning-only.
