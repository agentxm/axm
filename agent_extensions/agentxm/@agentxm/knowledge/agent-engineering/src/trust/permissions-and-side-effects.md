---
type: Reference
title: Permissions and side effects
description: How to expose authority and trace information flow before actions run.
tags: [agent-skills, permissions, side-effects, data-flow]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:36:04Z }
stale_after: 2027-02-14
---

# Permissions and side effects

A trustworthy skill states the minimum authority its job requires. Trace data
from each input through instructions, tools, scripts, subprocesses, network
destinations, outputs, logs, caches, and persistent storage before execution.

Classify each action as read, local write, destructive local change, network
read, external mutation, credential use, or code execution. For every material
side effect, identify its target, trigger, confirmation boundary, failure mode,
and recovery or rollback path.

Good defaults are local, reversible, previewable, and bounded to explicit
targets. Skills must not broaden authority from verbs such as “fix,” “set up,”
or “finish.” Secrets should be symbolic inputs, never examples or fixtures, and
must not cross an undeclared process or network boundary.

Host-level permission controls are defense in depth. They do not excuse vague
skill instructions, unsafe scripts, or undisclosed effects.

Distinguish requested, approved, effective, and observed capabilities. Portable
metadata may declare or pre-approve tools, but only the host's identity,
sandbox, policy, and approval controls enforce the maximum effective boundary.
The effective capability set must be no broader than the independently approved
set for the exact skill identity and use.
