---
type: Guide
title: "Configuring hooks and MCP connections"
description: "Use when extending a host through lifecycle hooks or an existing MCP service; bound execution and verify the selected host configuration."
tags: ["hooks", "mcp", "connections", "events", "configuration", "permissions"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-10-30T20:56:27Z" }
---

# Configuring hooks and MCP connections

Resolve the consuming hosts and exact connection or event before editing.
Read their current supported schemas and use the owning extension manager.
Implementation of an MCP server or a general runtime is separate software work.

## Hooks

Select the real lifecycle event and its matching conditions. Establish whether
the host invokes the hook synchronously, how it supplies inputs, what outputs
mean, and what a timeout or failure does. Inspect the exact executable and its
dependencies. Bound filesystem, network, credentials, data, and side effects.
Keep repeated execution safe where the event can recur; do not assume exactly
once delivery or universal fail-open behavior.

## MCP connections

Resolve local command versus remote transport, endpoint, arguments, working
directory, environment references, headers, authentication, and intended tools.
Use symbolic secret references. Never place credentials in package content or
logs. Do not forward credentials to an unverified endpoint. A configured server
name does not establish identity or trust in the tools it advertises.

## Verify and recover

Preview the selected host projections and inspect the resulting configuration.
Check both the host's projection capability and actual connection or event
state. When execution is authorized, use a bounded event or read operation that
observes the intended behavior without incidental external writes. Inspect
failure and timeout behavior appropriate to the change.

Report configured, projected, connected, and exercised states separately for
each selected host. Unsupported capabilities remain explicit limitations. Keep
a concrete rollback to the prior configuration, and avoid disabling unrelated
connections or hooks as a guessed recovery.
