# Extension design patterns

Choose the decision you are making. Patterns from different groups can be used together.

## How does the work start?

- [Invocation policy](invocation-policy.md) — Choose who can start a skill based on who owns the timing and whether a named command is useful.
- [Trigger cues](trigger-cues.md) — Describe the evidence a model can recognize when deciding whether to select a skill.
- [Neighboring intent](neighboring-intent.md) — When requests share vocabulary, use the smallest difference in outcome, destination, or authority to choose the skill.

## What guidance should be available, and where?

- [Scoped instructions](scoped-instructions.md) — When a direction applies to only part of a workspace, place it where the host loads it for that work.
- [Progressive disclosure](progressive-disclosure.md) — When only some tasks need detailed guidance, put it where each reader can discover and use it.

## How does the skill carry out the task?

- [Route after inspection](route-after-inspection.md) — When one use case has several procedures, inspect the cheapest fact that changes the work.
- [Agent-mediated decisions](agent-mediated-decisions.md) — When a workflow depends on a user decision, show what the choice changes and make the proposed answer easy to correct.
- [CLI-backed skill](cli-backed-skill.md) — When a skill drives a CLI, give the command ownership of effects and the skill responsibility for interpreting the request.
- [Validate the proposed change](validate-the-proposed-change.md) — When one judgment drives many edits, check the proposed edits together before applying them.

## What does the user see or respond to?

- [Display template](display-template.md) — When a workflow repeatedly presents the same kind of result, give the reader a stable way to find the evidence and next action.
- [Selectable next actions](selectable-next-actions.md) — When a result leaves several meaningful follow-ups, let the user select an action by control or by a short reply.
- [Prefilled form](prefilled-form.md) — When the agent can recover part of a brief, show known values and proposals so the user can correct just the decisions that remain.
- [Select from findings](select-from-findings.md) — When several findings can be addressed independently, let the user choose which ones enter remediation.
- [Compare variants in context](compare-variants-in-context.md) — When a user can recognize a preference more easily than describe it, show alternatives on the same representative target.

## What carries forward to another workflow?

- [Workflow handoff artifact](workflow-handoff-artifact.md) — When work continues in another workflow or session, record the decisions and evidence the next participant needs to resume.

## How do we know it worked?

- [Invocation trial](invocation-trial.md) — When a skill misses a task or appears on the wrong one, observe selection and task outcome separately.
