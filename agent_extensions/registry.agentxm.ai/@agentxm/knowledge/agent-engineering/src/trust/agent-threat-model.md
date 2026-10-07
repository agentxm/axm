---
type: Reference
title: Agent threat model
description: Models attacks and failures that exploit goals, tools, memory, inter-agent communication, delegated trust, or apparent competence.
tags: [agent-security, threat-model, goal-hijacking, tool-misuse, memory-poisoning, supply-chain, trust]
status: stable
sources:
  - id: owasp-agentic
    resource: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
    title: OWASP Top 10 for Agentic Applications for 2026
  - id: mcp-spec
    resource: https://modelcontextprotocol.io/specification/2025-03-26/index
    title: Model Context Protocol specification
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Agent threat model

Threat-model the complete goal-directed path, including trusted humans,
untrusted users, model inputs, retrieved content, tools, credentials, memory,
delegates, protocols, external systems, and affected parties.

| Threat | Behavioral design response |
| --- | --- |
| Goal or instruction hijacking | Separate authority levels; revalidate goal and source before consequential action |
| Tool misuse or confused-deputy behavior | Bind capability selection to task, identity, scope, evidence, and approval |
| Identity or privilege abuse | Use distinct scoped identities, expiry, attribution, and revocation |
| Supply-chain compromise | Establish provenance and trust for tools, skills, models, data, and delegates |
| Unexpected code or content execution | Treat outputs as data; isolate and explicitly authorize execution |
| Memory or context poisoning | Control writes, provenance, scope, freshness, conflict, and retirement |
| Insecure inter-agent communication | Authenticate actors; validate authority, messages, artifacts, and effects |
| Cascading failures | Bound fan-out and authority; add circuit breakers, reconciliation, and stop paths |
| Human trust exploitation | Calibrate claims, surface uncertainty, preserve review and redress |
| Rogue or drifting behavior | Monitor decisions and effects; constrain adaptation; support revocation and retirement |

This synthesis follows the current OWASP agentic risk categories without
copying its text or treating the list as exhaustive.[^owasp-agentic] Exact
OWASP adaptations would inherit CC-BY-SA-4.0; this concept instead provides
original boundary guidance and links to the upstream source.

Prompts can influence judgment but cannot enforce security. Use structural
controls for identity, permissions, isolation, network and filesystem reach,
approvals, budgets, validation, audit, and recovery. Protocol implementers must
also preserve user consent and data-control expectations.[^mcp-spec]

[^owasp-agentic]: OWASP Top 10 for Agentic Applications for 2026
[^mcp-spec]: Model Context Protocol specification
