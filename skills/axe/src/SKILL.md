---
name: axe
description: >-
  Routes requests to design, create, revise, review, audit, or remediate agent
  extensions to focused knowledge guidance: skills and SKILL.md, scoped
  instructions such as AGENTS.md and CLAUDE.md, rules, knowledge bundles,
  agent definitions, hooks, MCP connection configuration, and packs. Use for
  extension craft, design patterns, package READMEs, relationships among
  extensions, workspace setup, and choosing how to keep shared extensions usable
  across workspace changes. Not for
  building agent runtimes, implementing MCP servers, ordinary use of an
  installed extension, or package management alone.
---

# AXE · Agent Extension Engineering

Select guidance from `@agentxm/knowledge/axe`, the
required sibling in `@agentxm/packs/axe`. Resolve it
through the active host or extension manager. With AXM, use
`axm knowledge concepts get '@agentxm/knowledge/axe#<concept>'`.

## Interpret the request

Accept a named invocation or an ordinary request. Use the same operation, target,
and focus for equivalent wording. In `$axe [operation] [target or brief]`,
the operation sets the deliverable.

| Operation | Deliverable                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| `design`  | Recommend an extension, set, or workspace setup and explain how the design serves the brief.                            |
| `create`  | Author a usable draft in its canonical workspace location.                                                              |
| `review`  | Report the verdict, evidence-backed coverage, and numbered issues, improvements, or pruning opportunities within scope. |
| `revise`  | Apply the requested change and check the original case and a nearby valid case.                                         |
| `verify`  | Test the stated claim against the target. Report observed behavior and what the available evidence leaves open.         |

A target alone requests read-only review. Take the subject from the request
before looking up a package name. It can name an individual extension, a
specific group, everything authored here (including disabled extensions),
what a pack delivers to a consumer, what participates in a host request or
event, or the workspace setup for its users. Preserve an explicit selection.

For work on a named existing extension,
resolve the target before announcing which artifact you will inspect or opening
its contents. Use an explicit path (such as `./design`) or fully qualified
package identity directly. For a short name, look it up across extension types
in the workspace inventory (with AXM, `axm show <name> --json`). Apply any
type or owner the caller supplied. Proceed with one matching identity. For
several, show the matching types and qualified names. Use a native picker
when it can show every choice. Otherwise give a lettered menu with short replies. Include
**All N matches** when the operation can cover the displayed set. Put the
scope best supported by the request and context first and mark it
`(Recommended)`. Use a stable, unmarked order when the evidence is even.
Wait for the choice, then resume the same operation and focus on the selected
identities. For zero matches, report the unresolved target.
A name proposed for a new extension is part of the creation brief.

A bare invocation asks for orientation. Use the current discussion or selected
artifact to suggest a useful next action and why. With no target, show a few
example requests. A direct question gets a direct answer from the relevant
guidance, with a worked example when it helps.

## Select the use case

For design, inspect the brief and available capabilities first. Open the set
guide only when there is a relationship between extensions to decide.

| User intent                                                    | Concept                                 |
| -------------------------------------------------------------- | --------------------------------------- |
| Decide how much of the agent’s approach to prescribe           | `principles/preserve-agent-judgment`    |
| Define or distinguish agent extension terms                    | `glossary`                              |
| Design or maintain a glossary for a domain                     | `patterns/domain-glossary`              |
| Choose an extension type for a task                            | `guides/choosing-extensions`            |
| Design or review relationships among extensions in a set       | `guides/extension-sets`                 |
| Design or review a workspace setup for a user's first workflow | `guides/workspace-setup`                |
| Workspace drift, branches, retired or deprecated dependencies  | `guides/workspace-management`           |
| Write or revise an extension README                            | `guides/authoring-readme`               |
| Choose inline guidance, a local reference, or shared knowledge | `patterns/progressive-disclosure`       |
| Choose a CLI or bundled helper for a skill                     | `patterns/cli-backed-skill`             |
| Design a user choice or checkpoint in a skill                  | `patterns/agent-mediated-decisions`     |
| Design a recurring result, finding, or report layout           | `patterns/display-template`             |
| Offer distinct actions after presenting a result               | `patterns/selectable-next-actions`      |
| Let a user correct a partly known brief                        | `patterns/prefilled-form`               |
| Let a user choose findings for follow-up                       | `patterns/select-from-findings`         |
| Compare alternative outputs on the same target                 | `patterns/compare-variants-in-context`  |
| Carry decisions into another workflow or session               | `patterns/workflow-handoff-artifact`    |
| Design validation before a skill applies a batch of edits      | `patterns/validate-the-proposed-change` |
| Design a skill argument signature, options, or scope defaults  | `guides/authoring-skills`               |
| Create or revise a skill, including how it gets invoked        | `guides/authoring-skills`               |
| Create or improve instructions or rules                        | `patterns/scoped-instructions`          |
| Create or restructure a knowledge bundle                       | `guides/authoring-knowledge`            |
| Define a delegated agent role                                  | `guides/authoring-agent-definitions`    |
| Configure a hook or MCP connection                             | `guides/configuring-hooks-and-mcp`      |
| Compose extensions into a pack                                 | `guides/composing-packs`                |
| Review, audit, remediate, or verify earlier findings           | `guides/reviewing-extensions`           |
| Check routing, behavior, portability, or improvement claims    | `guides/verification`                   |
| Assess execution, provenance, credentials, or side effects     | `guides/trust-and-authority`            |
| Publish, replace, deprecate, or retire an extension you own    | `guides/lifecycle`                      |

Use `glossary` when the meaning of an agent extension term affects a decision.

Read only the selected concepts and the additional guidance their application
requires. For a focused review, start with the review guide and the target.
Stop when those two settle the question. Open another concept only for a
decision they leave open.
For mixed requests, select the relevant routes together. Resolve
obvious intent from the request and local context; clarify only material missing
scope. If the required bundle or concept is unavailable, name the missing
identity and preserve the target rather than inventing a substitute baseline.

Choose an approach that fits the user's purpose, evidence, and authority.
Prescribe a method when the outcome depends on it. Review alone is
read-only; remediation includes assessment, authorized changes, and closure
verification. Use the existing manager workflow for canonical ownership,
scaffolding, workspace state, projections, and distribution. With AXM, compose
with the `axm` skill and current CLI help for those operations.

Report the selected routes, evidence, and material limits briefly. Follow the
review guide for coverage, findings, and follow-up choices. Wait for the
caller's selection before applying a repair.
