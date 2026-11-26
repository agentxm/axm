# Agent Extension Engineering changes

## 0.3.1

Documented the two-step migration from pack 0.2.0 when its skill pin conflicts
with the new pack. Package dependencies remain at 0.3.0.

## 0.3.0

Install `@agentxm/packs/axe` to use Agent Extension Engineering. The pack
brings together `@agentxm/skills/axe` and `@agentxm/knowledge/axe` at 0.3.0.
Invoke the skill with `$axe`. Existing concept IDs still work under the new
bundle name, for example `@agentxm/knowledge/axe#glossary`.

Preview migration from the former pack:

```sh
axm migrate @agentxm/packs/agent-extension-engineering --preview
```

If the CLI reports conflicting AXE skill pins, remove the former pack and
install the replacement in the same workspace:

```sh
axm uninstall @agentxm/packs/agent-extension-engineering
axm install @agentxm/packs/axe
```

Otherwise run the matching migrate command without `--preview` to apply it.
For an independently installed bundle, preview
`axm migrate @agentxm/knowledge/agent-extension-engineering --preview` and
apply that migration separately. Update saved concept lookups to the new name.

## Candidate 0.2.0

The pack now selects `@agentxm/skills/axe`, replacing
`@agentxm/skills/agent-extension-engineering`. Invoke it as `$axe`
with a target for a read-only review, a question, or a design, create, review,
revise, or verify request. The pack and knowledge bundle retain the name
`agent-extension-engineering`.

The authoring guide now covers skill argument signatures. Six patterns cover
operation and scope selectors, contextual defaults, focus filters, named options,
and free-form briefs. Invocation trials now check how a skill interpreted the
caller’s arguments and what it actually did.

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

A bounded before/after evaluation of the AXM core and optional authoring routes
is recorded at [`skills/axm/evals/2026-10-30/`](https://github.com/agentxm/axm/tree/b9198b243059008a44ee71f98c1f334ba1395dae/skills/axm/evals/2026-10-30). These are independent
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
