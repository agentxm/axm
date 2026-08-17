---
type: Explanation
title: Runtime and environments
description: How runtime substrates, adapted working environments, execution, isolation, reproducibility, and topology shape what an agent can accomplish safely.
tags: [harness, runtime, environment, environment-adaptation, isolation, reproducibility, topology]
status: stable
sources:
  - id: ai-harness-runtime
    resource: https://arxiv.org/abs/2605.13357
    title: AI Harness Engineering — A Runtime Substrate for Foundation-Model Software Agents
  - id: aws-harness-runtime
    resource: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-vs-runtime.html
    title: Amazon Bedrock AgentCore — Agent harnesses and agent runtimes
generated:
  by: codex/gpt-5.6
  at: 2026-08-14T21:42:14Z
stale_after: 2027-02-14
---

# Runtime and environments

The runtime substrate supplies compute, processes, isolation, dependencies,
and lifecycle facilities for the agent host. The working environment contains
the systems and artifacts the agent observes and changes. Environment
adaptation makes that target more legible, actionable, bounded, and
verifiable. These are distinct responsibilities even when one product or
container supplies all three.[^aws-harness-runtime]

Choose topology from task needs rather than fashion: interactive or background,
local or remote, ephemeral or persistent, single-agent or coordinated. For each
topology, make environment creation, dependency availability, concurrency,
timeouts, cancellation, cleanup, and artifact retention explicit.

Reproducibility is evidence, not an assumption. Record the versions, inputs,
environment identity, and commands needed to repeat consequential work. Isolate
concurrent tasks when their state can interfere, and distinguish disposable
execution surfaces from durable systems of record.[^ai-harness-runtime]

[^ai-harness-runtime]: AI Harness Engineering — A Runtime Substrate for Foundation-Model Software Agents

[^aws-harness-runtime]: Amazon Bedrock AgentCore — Agent harnesses and agent runtimes
