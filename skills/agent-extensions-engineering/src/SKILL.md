---
name: agent-extensions-engineering
description: >-
  Routes requests to design, create, revise, review, audit, or remediate agent
  extensions to focused knowledge guidance: skills and SKILL.md, scoped
  instructions such as AGENTS.md and CLAUDE.md, rules, knowledge bundles,
  agent definitions, hooks, MCP connection configuration, and packs. Use for
  extension craft and composition. Not for building agent runtimes, implementing
  MCP servers, ordinary use of an installed extension, or package management alone.
---

# Agent extensions engineering

Select guidance from `@agentxm/knowledge/agent-extensions-engineering`, the
required sibling in `@agentxm/packs/agent-extensions-engineering`. Resolve it
through the active host or extension manager. With AXM, use
`axm knowledge concepts get '@agentxm/knowledge/agent-extensions-engineering#<concept>'`.

## Select the use case

| User intent                                                 | Concept                                              |
| ----------------------------------------------------------- | ---------------------------------------------------- |
| Choose an extension type or divide responsibilities         | `choosing-extensions`                                |
| Create or revise a skill                                    | `authoring-skills`                                   |
| Create or improve instructions or rules                     | `authoring-instructions`                             |
| Create or restructure a knowledge bundle                    | `authoring-knowledge`                                |
| Define a delegated agent role                               | `authoring-agent-definitions`                        |
| Configure a hook or MCP connection                          | `configuring-hooks-and-mcp`                          |
| Compose extensions into a pack                              | `composing-packs`                                    |
| Review, audit, remediate, or verify earlier findings        | `reviewing-extensions`, then the relevant type guide |
| Check routing, behavior, portability, or improvement claims | `verification`                                       |
| Assess execution, provenance, credentials, or side effects  | `trust-and-authority`                                |
| Publish, replace, deprecate, or retire extensions           | `lifecycle`                                          |

Read only the selected concepts and the additional guidance their application
requires. For mixed requests, select the relevant routes together. Resolve
obvious intent from the request and local context; clarify only material missing
scope. If the required bundle or concept is unavailable, name the missing
identity and preserve the target rather than inventing a substitute baseline.

Apply the selected knowledge within the user's authority. Review alone is
read-only; remediation includes assessment, authorized changes, and closure
verification. Use the existing manager workflow for canonical ownership,
scaffolding, workspace state, projections, and distribution. With AXM, compose
with the `axm` skill and current CLI help for those operations.

Report the selected routes, resulting artifact or findings, evidence checked,
and material limits. Keep substantive procedures in the knowledge bundle.
