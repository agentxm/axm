---
type: Explanation
title: Repository harnesses
description: How repository-owned adaptation composes with coding-agent hosts and external infrastructure to make a codebase legible, actionable, bounded, and verifiable.
tags: [repository-harness, coding-agents, repositories, adaptation, ownership, verification]
status: stable
sources:
  - id: openai-agents-md
    resource: https://learn.chatgpt.com/docs/agent-configuration/agents-md
    title: OpenAI — Custom instructions with AGENTS.md
  - id: github-response-customization
    resource: https://docs.github.com/en/copilot/concepts/prompting/response-customization
    title: GitHub Docs — About customizing GitHub Copilot responses
  - id: repository-harness-project
    resource: https://github.com/hoangnb24/repository-harness
    title: repository-harness
  - id: repo-harness-project
    resource: https://github.com/Ancienttwo/repo-harness
    title: repo-harness
generated: { by: "codex/gpt-5.6", at: 2026-08-14T21:42:14Z }
stale_after: 2027-02-14
---

# Repository harnesses

A **repository harness** is the repository-owned adaptation layer that makes a
codebase legible, actionable, bounded, and verifiable for coding agents. It is
an environment-side harness profile: repository ownership and scope are
essential; owning the model loop is not.

Repository instruction conventions and emerging projects explicitly named
“repository harness” demonstrate that this is a recognizable application of
harness engineering, not merely another name for repository context.
[^openai-agents-md][^github-response-customization]
[^repository-harness-project][^repo-harness-project]

## What a repository harness can contain

| Surface | Contribution |
| --- | --- |
| Scoped instructions and discovery routes | Establish invariants, commands, precedence, and paths to deeper knowledge |
| Architecture and domain documentation | Make responsibilities, vocabulary, authority, and change boundaries discoverable |
| Scripts, task runners, and development containers | Provide repeatable actions and environments |
| Tests, linters, schemas, and finish gates | Convert important expectations into executable feedback |
| CI, review automation, and repository hooks | Carry verification and policy into delivery workflows |
| Plans, task state, handoffs, and receipts | Preserve decisions, progress, and evidence across sessions or workers |

These surfaces are not all context. Some change the environment, enforce
policy, execute work, or produce verification evidence. That is why
**repository harness** is broader than **repository context**.

## Composition boundary

The repository is not the whole coding-agent system, but it can own a
first-class repository harness that composes with portable coding-agent
runtimes and external infrastructure:

```text
portable coding-agent harness
  + repository-owned harness
  + execution environment
  + user and organization policy
  = effective coding-agent system for the repository
```

The repository layer should own stable codebase-specific adaptation. The
portable agent host should own reusable loop, model, and tool behavior.
External platforms should own shared compute, credentials, queues,
observability, and organization policy when those concerns cannot be safely or
portably owned by one repository.

## Scope can nest

A repository harness may have root defaults plus narrower package, subtree, or
workspace adaptations. Host discovery and precedence rules determine how those
layers compose. The engineering goal is not one file; it is a coherent
effective environment at representative entry points.

Do not call any repository-local evaluator a **repository evaluation
harness** without qualification. It may mean repository-owned checks used by a
production coding harness, or an evaluation harness that benchmarks agents on
repository tasks. Name which system runs trials and which system is the target.

## Relationship to coding harnesses

A [coding harness](harnesses.md) is classified primarily by its software-
engineering domain. A repository harness is classified primarily by its
environment-side adaptation locus and repository ownership scope. A real
coding-agent system commonly includes both; neither term should replace the
other.

See [Harness classification](../../harness/harness-classification.md) for
the complete set of axes.

[^openai-agents-md]: OpenAI — Custom instructions with AGENTS.md
[^github-response-customization]: GitHub Docs — About customizing GitHub Copilot responses
[^repository-harness-project]: repository-harness
[^repo-harness-project]: repo-harness
