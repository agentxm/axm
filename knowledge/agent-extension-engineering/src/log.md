# Update log

## 2026-11-19

- Defined [workspace management](glossary.md#workspace-management) and added a [guide](guides/workspace-management.md) on keeping contributor workflows usable through branch changes and shared skill retirement.

- Added [Designing and reviewing a workspace setup](guides/workspace-setup.md) for tracing a contributor's task through the shared configuration and the intended host.

- Expanded the [set guide](guides/extension-sets.md) with a whole-repository ownership example and the [review guide](guides/reviewing-extensions.md) with evidence for the selected subject.

- Added [Domain glossary](patterns/domain-glossary.md) with three ways to maintain a reference concept and a worked example of a customer-update skill using it. Revised the authoring guides and interaction patterns to connect their examples to what the author changes and how a consumer can check it.

- Linked [extension type selection](guides/choosing-extensions.md) and [neighboring intent](patterns/neighboring-intent.md) to the set guide where a proposed extension overlaps an existing one.

- Added [Designing and reviewing sets of extensions](guides/extension-sets.md), with change and request traces for deciding boundaries across a repository, a pack, or an active workspace.

- The [review guide](guides/reviewing-extensions.md) distinguishes a defect in a rule from a lapse in following it. The [decision-review pattern](patterns/review-the-decisions-an-artifact-makes.md) shows how a working case can constrain a repair. [Select from findings](patterns/select-from-findings.md) shows how to choose an alternative remedy by reply.

- Added guidance on [mining patterns from examples](guides/authoring-knowledge.md#when-an-example-belongs-in-the-pattern-catalog), [briefing independent reviewers](guides/authoring-agent-definitions.md#ask-for-an-independent-assessment), and [refreshing version-sensitive guidance](guides/lifecycle.md#when-an-upstream-change-calls-for-a-review). The [verification guide](guides/verification.md) pairs an advice request with an edit request for the same skill.

- Updated the [authoring](guides/authoring-skills.md) and [review](guides/reviewing-extensions.md) guides to leave the approach to the agent by default. Pruning now considers which decisions can be delegated and what each constraint protects.

- Expanded [Scope selector](patterns/scope-selector.md) with a ranked picker and equivalent text replies for choosing one or all matching targets.

- Revised [Preserve agent judgment](principles/preserve-agent-judgment.md) to make the user's purpose and desired outcome explicit and delegate the approach by default. The [verification guide](guides/verification.md) now cites the archive-review trials.

- Added the candidate [Review the decisions an artifact makes](patterns/review-the-decisions-an-artifact-makes.md) and a [review checklist](guides/reviewing-extensions.md#review-checklist) for finding issues, improvements, and pruning opportunities. Reviewers can apply selected recommendations by number.

## 2026-11-18

- Added [pack-member README guidance](guides/authoring-readme.md#when-the-extension-belongs-to-a-pack) and a [review check](guides/reviewing-extensions.md#review-checklist) for readers who discover a package directly.

- Added [Preserve agent judgment](principles/preserve-agent-judgment.md) and applied it to skill authoring, scoped instructions, and extension review.

- Clarified how to leave the [next action](patterns/selectable-next-actions.md) visible while awaiting a reply, including on hosts that require a final text response.

- Updated [Selectable next actions](patterns/selectable-next-actions.md) and the [review template](guides/reviewing-extensions.md#report-the-review) to order choices consistently and label a grounded recommendation in both picker and text.

- Added an evidence-backed coverage checklist to the [review report](guides/reviewing-extensions.md#report-the-review) for actionable, clean, and inconclusive results.

- Added a [release file selection example](guides/lifecycle.md#choose-what-ships) and guidance for [choosing a review focus](guides/reviewing-extensions.md) and [evaluating open and focused reviews](guides/verification.md).

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
