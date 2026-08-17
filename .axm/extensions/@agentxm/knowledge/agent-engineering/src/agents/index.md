# Agent design

The behavioral contract and control policy for a single agent: what it is
responsible for, how it decides, and how it stops.

- [Goals, roles, responsibilities, and success](goals-roles-responsibilities-and-success.md) -
  What the agent is responsible for, what completion means, and what remains
  outside its authority.
- [Agent loop, feedback, and termination](agent-loop-feedback-and-termination.md) -
  The observe-decide-act loop, progress evidence, stop conditions, and
  escalation.
- [Reasoning, planning, and replanning](reasoning-planning-and-replanning.md) -
  Planning commitments and replanning triggers, without requiring hidden
  reasoning disclosure.
- [Observation, action, and tool-use policy](observation-action-and-tool-use-policy.md) -
  When and why capabilities are selected, and how results affect the next
  decision.
- [Memory, state, and adaptation policy](memory-state-and-adaptation-policy.md) -
  What may influence future decisions, separating policy from storage
  mechanics.
- [Human control and collaboration](human-control-and-collaboration.md) -
  Oversight, approvals, intervention, explanation, and responsibility
  throughout a run.
