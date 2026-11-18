---
name: agent-extension-engineering
description: >-
  Routes requests to design, create, revise, review, audit, or remediate agent
  extensions to focused knowledge guidance: skills and SKILL.md, scoped
  instructions such as AGENTS.md and CLAUDE.md, rules, knowledge bundles,
  agent definitions, hooks, MCP connection configuration, and packs. Use for
  extension craft, design patterns, package READMEs, and composition. Not for
  building agent runtimes, implementing MCP servers, ordinary use of an
  installed extension, or package management alone.
---

# Agent extension engineering

Select guidance from `@agentxm/knowledge/agent-extension-engineering`, the
required sibling in `@agentxm/packs/agent-extension-engineering`. Resolve it
through the active host or extension manager. With AXM, use
`axm knowledge concepts get '@agentxm/knowledge/agent-extension-engineering#<concept>'`.

## Select the use case

| User intent                                                    | Concept                                 |
| -------------------------------------------------------------- | --------------------------------------- |
| Define or distinguish shared terms                             | `glossary`                              |
| Choose an extension type or divide responsibilities            | `guides/choosing-extensions`            |
| Write or revise an extension README                            | `guides/authoring-readme`               |
| Choose inline guidance, a local reference, or shared knowledge | `patterns/progressive-disclosure`       |
| Choose a CLI or bundled helper for a skill                     | `patterns/cli-backed-skill`             |
| Design a user choice or checkpoint in a skill                  | `patterns/agent-mediated-decisions`     |
| Design validation before a skill applies a batch of edits      | `patterns/validate-the-proposed-change` |
| Create or revise a skill, including how it gets invoked        | `guides/authoring-skills`               |
| Create or improve instructions or rules                        | `patterns/scoped-instructions`          |
| Create or restructure a knowledge bundle                       | `guides/authoring-knowledge`            |
| Define a delegated agent role                                  | `guides/authoring-agent-definitions`    |
| Configure a hook or MCP connection                             | `guides/configuring-hooks-and-mcp`      |
| Compose extensions into a pack                                 | `guides/composing-packs`                |
| Review, audit, remediate, or verify earlier findings           | `guides/reviewing-extensions`           |
| Check routing, behavior, portability, or improvement claims    | `guides/verification`                   |
| Assess execution, provenance, credentials, or side effects     | `guides/trust-and-authority`            |
| Publish, replace, deprecate, or retire extensions              | `guides/lifecycle`                      |

Use `glossary` when shared terminology affects interpretation or a design decision.

Read only the selected concepts and the additional guidance their application
requires. For a review, stop when the artifact and review guide settle the claim.
For mixed requests, select the relevant routes together. Resolve
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
