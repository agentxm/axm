---
name: axe
description: >-
  Routes requests to design, create, revise, review, audit, or remediate agent
  extensions to focused knowledge guidance: skills and SKILL.md, scoped
  instructions such as AGENTS.md and CLAUDE.md, rules, knowledge bundles,
  agent definitions, hooks, MCP connection configuration, and packs. Use for
  extension craft, design patterns, package READMEs, and composition. Not for
  building agent runtimes, implementing MCP servers, ordinary use of an
  installed extension, or package management alone.
---

# Axe · Agent extension engineering

Select guidance from `@agentxm/knowledge/agent-extension-engineering`, the
required sibling in `@agentxm/packs/agent-extension-engineering`. Resolve it
through the active host or extension manager. With AXM, use
`axm knowledge concepts get '@agentxm/knowledge/agent-extension-engineering#<concept>'`.

## Interpret the request

Accept a named invocation or an ordinary request. Use the same operation, target,
and focus for equivalent wording. In `$axe [operation] [target or brief]`,
the operation sets the deliverable.

| Operation | Deliverable                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `design`  | Recommend an extension type and a concrete design from the brief.                                                      |
| `create`  | Author a usable draft in its canonical workspace location.                                                             |
| `review`  | Use the review guide’s checklist and report issues, improvements, or pruning opportunities within the requested focus. |
| `revise`  | Apply the requested change and check the original case and a nearby valid case.                                        |
| `verify`  | Test the stated claim against the target. Report observed behavior and what the available evidence leaves open.        |

A target alone requests read-only review. For work on an existing extension,
resolve the target before announcing which artifact you will inspect or opening
its contents. Use an explicit path (such as `./design`) or fully qualified
package identity directly. For a short name, look it up across extension types
in the workspace inventory (with AXM, `axm show <name> --json`). Apply any
type or owner the caller supplied. Proceed with one matching identity. For
several, list the matching types and qualified names, ask for the smallest
distinguishing qualifier, and wait. Resume the same operation and focus on
the selected identity. For zero matches, report the unresolved target.
A name proposed for a new extension is part of the creation brief.

A bare invocation asks for orientation. Use the current discussion or selected
artifact to suggest a useful next action and why. With no target, show a few
example requests. A direct question gets a direct answer from the relevant
guidance, with a worked example when it helps.

## Select the use case

| User intent                                                    | Concept                                 |
| -------------------------------------------------------------- | --------------------------------------- |
| Define or distinguish shared terms                             | `glossary`                              |
| Choose an extension type or divide responsibilities            | `guides/choosing-extensions`            |
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
| Publish, replace, deprecate, or retire extensions              | `guides/lifecycle`                      |

Use `glossary` when shared terminology affects interpretation or a design decision.

Read only the selected concepts and the additional guidance their application
requires. For a focused review, start with the review guide and the target.
Stop when those two settle the question. Open another concept only for a
decision they leave open. For a broad review, use the guide and pattern indexes
to select guidance for the decisions the target makes.
For mixed requests, select the relevant routes together. Resolve
obvious intent from the request and local context; clarify only material missing
scope. If the required bundle or concept is unavailable, name the missing
identity and preserve the target rather than inventing a substitute baseline.

Apply the selected knowledge within the user's authority. Review alone is
read-only; remediation includes assessment, authorized changes, and closure
verification. Use the existing manager workflow for canonical ownership,
scaffolding, workspace state, projections, and distribution. With AXM, compose
with the `axm` skill and current CLI help for those operations.

For actionable reviews, label each finding's Recommendation and Evidence,
then offer one set of next actions through the host's native picker when
available, with labeled prompt replies. Bind **Apply selected** and its text reply to the displayed
finding numbers. Honor the chosen action and scope.
Report selected routes, evidence, and material limits briefly.
