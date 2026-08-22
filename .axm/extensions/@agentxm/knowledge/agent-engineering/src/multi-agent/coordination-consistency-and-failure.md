---
type: Reference
title: Coordination, consistency, and failure
description: Controls duplicate work, conflicting state, cascades, deadlock, partial failure, and reconciliation.
tags: [multi-agent, coordination, consistency, failure, reconciliation, cascades, deadlock]
status: stable
sources:
  - id: multi-agent-survey
    resource: https://link.springer.com/article/10.1007/s44336-024-00009-2
    title: Large Language Model based Multi-Agents — A Survey of Progress and Challenges
  - id: owasp-agentic
    resource: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
    title: OWASP Top 10 for Agentic Applications for 2026
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Coordination, consistency, and failure

Multi-agent systems need explicit ownership and reconciliation because fluent
messages do not create consistency. Survey literature treats interaction and
evolution as system concerns beyond the profile and action design of one
agent.[^multi-agent-survey]

## Coordination contract

- Partition work by artifact, responsibility, scope, or decision right.
- Give shared state durable identities, versions, and an authority rule.
- Define whether results merge, vote, rank, compete, or require an owner.
- Make committed effects distinguishable from proposals and observations.
- Set budgets for fan-out, depth, retries, messages, and subdelegation.
- Detect duplicate work, cycles, conflicting commitments, and lost ownership.

## Failure containment

Expect unavailable actors, stale context, partial outputs, contradictory
results, deceptive messages, timeouts after uncertain effects, and a failing
coordinator. Preserve enough state to cancel, reassign, reconcile, or degrade to
a simpler topology.

Do not let one actor's untrusted output become another actor's instruction or
memory merely because it arrived over an agent protocol. Validate identity,
authority, artifact provenance, and requested effect. OWASP identifies insecure
inter-agent communication and cascading failures as distinct agentic-system
risks.[^owasp-agentic]

Evaluate the complete topology as well as each role. A collection of competent
agents can still fail through poor decomposition, interaction, synthesis, or
shared-state management.

[^multi-agent-survey]: Large Language Model based Multi-Agents — A Survey of Progress and Challenges

[^owasp-agentic]: OWASP Top 10 for Agentic Applications for 2026
