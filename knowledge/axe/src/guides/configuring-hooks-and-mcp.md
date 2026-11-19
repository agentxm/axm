---
type: Guide
title: "Configuring hooks and MCP connections"
description: "Decide how a hook should handle failure or what access an MCP connection needs."
tags: ["hooks", "mcp", "connections", "events", "configuration", "permissions"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T03:52:30Z" }
---

# Configuring hooks and MCP connections

## Hooks

Decide what should happen if the event fires twice or the executable times
out. A hook that refreshes a local index can rebuild from current state. A hook
that appends a notification could send it twice. Choose the event and duplicate
handling accordingly. For an index-refresh hook, configure the event for
changes to the source files and keep the generated index outside that match.
Edit a source file twice and check that the resulting index contains the
current entries once. Watch which writes trigger the hook so you can catch
a refresh that triggers itself. Check the host's timeout and failure
semantics before relying on a hook to block an action.

## MCP connections

Start with the operation the agent needs. For an issue lookup, give the
connection read access to the intended tracker. Verify the remote endpoint or
local executable before supplying a credential reference. A change of destination
deserves review even if the connection name stays the same.

A projection shows the configuration the host received. To check behavior when
authorized, trigger a harmless matching event or perform a bounded lookup from
that host and observe the result.
