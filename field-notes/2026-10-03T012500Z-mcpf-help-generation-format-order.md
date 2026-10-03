---
observed_at: "2026-10-03T01:25:00Z"
session: "unknown"
area: "CLI help generation"
---

# Formatting changed help after its bundled copy was generated

## Context

The MCP change updated the environment help table, then ran help generation followed by repository formatting.

## Friction

The source smoke check failed because formatting changed the Markdown table spacing after the generator had copied the topic into bundled help. The comparison reported different whitespace in otherwise matching text.

## Outcome

The help target was run again after formatting. The focused source smoke target then passed.
