---
observed_at: "2026-09-29T23:18:39.513095+00:00"
session: "tn5h"
area: "OpenCode MCP native-contract verification"
---

# OpenCode's published schema and V2 documentation describe different MCP layouts

## Context

Verify the native shape and ownership metadata for a nested MCP writer.

## Friction

The V2 MCP documentation declares `mcp.servers`, `disabled`, and `{env:NAME}`. The published `config.json` instead declares server names directly under `mcp`, uses `enabled`, and disallows additional entry properties. Those sources did not establish one consistent writer contract.

## Cost / impact

Verification required reading the vendor's V2 configuration and MCP schema source before accepting ownership metadata or activation rendering.

## Outcome

The V2 source declares the documented nested layout and `disabled`. Its loader explicitly decodes with `onExcessProperty: "ignore"`, allowing AXM's on-disk ownership metadata.

## Evidence

- https://opencode.ai/v2/docs/mcp-servers
- https://opencode.ai/config.json
- https://github.com/anomalyco/opencode/blob/dev/packages/core/src/config.ts
- https://github.com/anomalyco/opencode/blob/dev/packages/core/src/config/mcp.ts
