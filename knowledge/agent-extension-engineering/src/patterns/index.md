# Extension design patterns

Choose the situation that matches your design. Each pattern explains the tradeoff and points to an example.

## Design situations

- [Routing skill with a knowledge bundle](routing-skill-with-knowledge.md) — When several workflows share detailed guidance, route each request to the concept it needs.
- [CLI-backed skill](cli-backed-skill.md) — When a skill drives a CLI, give the command ownership of effects and the skill responsibility for interpreting the request.
- [Agent-mediated decisions](agent-mediated-decisions.md) — When a workflow depends on a user decision, show what the choice changes and make the proposed answer easy to correct.
- [Scoped instructions](scoped-instructions.md) — When a direction applies to only part of a workspace, place it where the host loads it for that work.
