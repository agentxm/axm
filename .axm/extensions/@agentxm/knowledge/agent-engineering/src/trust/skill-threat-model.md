---
type: Explanation
title: Agent Skill threat model
description: Threats across authoring, acquisition, retrieval, selection, execution, and evolution.
tags: [agent-skills, security, threat-model, supply-chain]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:36:04Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-enterprise
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/enterprise
    title: Anthropic — Enterprise skill security
---

# Agent Skill threat model

A skill is an executable supply-chain artifact. Its metadata influences
selection; its instructions influence decisions; its scripts, resources, and
dependencies may process data or cause side effects. Review the complete bytes,
not merely the prose entry point. Anthropic's enterprise guidance similarly
treats third-party skills as software requiring review.[^anthropic-enterprise]

## Trust boundaries

| Stage | Representative failure |
| --- | --- |
| Authoring | secrets, private examples, unsafe defaults, ambiguous authority |
| Acquisition | substitution, typosquatting, untrusted publisher, missing integrity |
| Discovery | misleading metadata, collision, prompt injection in descriptions |
| Loading | hidden or oversized resources, path escape, hostile linked content |
| Execution | command injection, exfiltration, destructive action, excess privilege |
| Evolution | silent behavior drift, dependency compromise, no rollback |

Start audits statically. Treat instructions, examples, filenames, and generated
output as untrusted data. Do not run code, follow external links, install
dependencies, activate the skill, or expose real secrets merely to understand
it. Dynamic analysis requires an isolated environment and separate authority.

Risk depends on reach: automatic activation, broad tool access, sensitive data,
network access, persistent writes, and opaque updates increase consequence.

[^anthropic-enterprise]: Anthropic — Enterprise skill security
