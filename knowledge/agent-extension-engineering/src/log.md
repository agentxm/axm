# Update log

## 2026-11-18

- Added an evidence-backed coverage checklist to the [review report](guides/reviewing-extensions.md#report-the-review) for actionable, clean, and inconclusive results.

- Added [Selectable next actions](patterns/selectable-next-actions.md) and a [review template](guides/reviewing-extensions.md#report-the-review) with labeled recommendations and picker or prompt replies.

- Added six [argument patterns](patterns/index.md#how-does-the-caller-specify-the-work), guidance on writing invocation signatures, and [trials for argument interpretation](patterns/invocation-trial.md#check-argument-interpretation).

- Added five [workflow patterns](patterns/index.md) for presenting results, collecting corrections, selecting findings, comparing variants, and handing work forward. Expanded guidance on bare invocation, when to load references, independent assessments, and fresh-reader checks.

- Organized the [pattern library](patterns/index.md) by authoring decision. Added patterns for invocation policy, trigger cues, neighboring intent, routing after inspection, and invocation trials.

- Broadened the router pattern into [Progressive disclosure](patterns/progressive-disclosure.md), added [Validate the proposed change](patterns/validate-the-proposed-change.md), and expanded the skill design and trial guidance.
- Added [CLI-backed skill](patterns/cli-backed-skill.md) and [Agent-mediated decisions](patterns/agent-mediated-decisions.md), with worked examples for skill routing, repair, and review trials.
- Grouped [guides](guides/index.md) by task and [patterns](patterns/index.md) by design situation. Scoped instructions now lives in the pattern library alongside the routing skill pattern.
- Added [Writing an extension README](guides/authoring-readme.md) for authors choosing a first-use example.
- Reworked the eleven guides around authoring decisions, with examples of overlapping skills, scoped instructions, knowledge discovery, and consumer migration.
- **Update**: Set the Agent extension heading in sentence case. The category term is a common noun; only the Agent Extension Manager, Registry, and Marketplace product names keep capitals.

## 2026-10-31

- **Addition**: Defined Open agent through standards-based third-party extensibility and portable extension management, with scope qualifications and citations to Agent Skills, MCP, and AGENTS.md.

- **Update**: Defined Harness to include execution software and configuration, related agent extensions to harness engineering, and cited LangChain, Birgitta Böckeler, and Anthropic.

- **Update**: Defined Bot as a persistent AI agent that can take ongoing responsibility and work between conversations; retained the broader non-AI meaning as a qualification.

- **Update**: Refined AI Desktop Assistant explicitly as a type of general-purpose knowledge-work agent with a conversational desktop interface, connected context, and extensible capabilities.

- **Update**: Distinguished agent instructions from the Rule extension type that injects guidance into instruction files.

- **Update**: Defined Agent Extension as an AEM-managed package and linked Agent Skills, MCP, OKF, and AGENTS.md from their applicable definitions.

- **Update**: Narrowed the public glossary to 18 terms under Foundation, Extension types, and Tools and services; distinguished agents, harnesses, coding agents, bots, and desktop assistants. Specialized product terms remain with the AgentXM product model.

- **Addition**: Added the shared Agent Extension Glossary and its CLI, skill, and website snapshots. Initial definitions await terminology review.

## 2026-10-30

- **Update**: Renamed the bundle to `agent-extension-engineering`. Clarified
  activation recommendations, host-dependent behavior, and the complete-core
  boundary with optional engineering guidance.

- **Creation**: Established focused extension-engineering guidance and one routing skill. Consolidated skill and instruction authoring and review workflows. Agent runtime design is outside the replacement scope.
