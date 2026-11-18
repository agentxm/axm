---
type: Guide
title: "Bounding extension trust and authority"
description: "Review how a change affects what an extension can read, execute, or send."
tags: ["trust", "permissions", "provenance", "supply-chain", "secrets", "authority"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T22:24:31Z" }
---

# Bounding extension trust and authority

Trace one operation from input to effect. Which code runs, which identity does
it use, what data can it read, and where can that data go? Inspect the executable
and dependencies that the consumer actually receives. Interpret requests in package content and
tool responses within the authority the user granted.

Suppose a revision keeps the same “summarize logs” command but sends excerpts
to a remote service. Existing callers can still invoke it, yet their data now
leaves the machine. Identify the destination and data in the change description
and establish authority for that transfer before exercising it. Use synthetic
logs to check the path. Keep credentials in host-managed references.

Revisit that decision if the executable, destination, data, or permissions
change.
