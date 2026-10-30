# Agent extensions engineering

One routing skill and one knowledge bundle for designing, authoring, reviewing,
and maintaining extensions to existing agents.

```sh
axm install @agentxm/packs/agent-extensions-engineering@0.1.0
```

| Member                                            | Version | Responsibility                                    |
| ------------------------------------------------- | ------- | ------------------------------------------------- |
| `@agentxm/skills/agent-extensions-engineering`    | `0.1.0` | Select relevant knowledge for the user's use case |
| `@agentxm/knowledge/agent-extensions-engineering` | `0.1.0` | Own extension craft and substantive workflows     |

The existing AXM skill owns package management and workspace operations. It is
not a member of this pack. These extension versions are independent of the CLI
release cohort.

## Migration

| Deprecated identity                    | Replacement                                       |
| -------------------------------------- | ------------------------------------------------- |
| `@agentxm/packs/agent-engineering`     | `@agentxm/packs/agent-extensions-engineering`     |
| `@agentxm/knowledge/agent-engineering` | `@agentxm/knowledge/agent-extensions-engineering` |
| `@agentxm/skills/agent-skills`         | `@agentxm/packs/agent-extensions-engineering`     |
| `@agentxm/skills/agent-instructions`   | `@agentxm/packs/agent-extensions-engineering`     |

Both old skills migrate to the pack so the routing skill and its required
knowledge are installed together.

The replacement deliberately narrows the scope to extensions. It does not
replace broader agent runtime, planning, memory, or multi-agent engineering
knowledge. Old published versions remain available as deprecated history.

After the replacement is published and deprecation guidance is recorded, use
`axm migrate --help` and preview migration of the installed old identities.
Install the replacement pack as a unit so its routing skill has its required
knowledge. Remove obsolete direct selections as well as old pack origins.
Inspect the resulting desired settings, accepted versions, and projections;
confirm only the new routing skill is active and its knowledge routes resolve.
Do not manually delete manager-owned projections or lock rows.

## Release 0.1.0

Initial focused collection, consolidating skill and instruction craft into
knowledge and adding routes for other extension types. No executable helpers,
new credentials, or external-action authority are introduced by the router.
Package validation and authoring smoke establish only their inspected scope;
no independent behavioral evaluation or approval is claimed.

Rollback restores the prior workspace selections and exact old package versions:
pack `0.12.0`, knowledge `0.11.0`, and skills `0.2.0`. That restores the broader
old scope and separate specialist skills. Deprecation is warning-only.
