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

## How do we know it worked?

- [Invocation trial](invocation-trial.md) — When a skill misses a task or appears on the wrong one, observe selection and task outcome separately.
