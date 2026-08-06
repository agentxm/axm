---
type: Architecture Concept
description: The publicly reachable AgentXM platform surfaces — web app, CLI site, registry API, telemetry ingest, MCP server, and supporting hostnames — and what each serves.
tags: [surfaces, hostnames, api, mcp, registry, architecture]
status: stable
stale_after: 2027-02-06
generated:
  by: claude/fable-5
  at: 2026-08-06T13:04:04Z
---

# Public platform surfaces

AgentXM's publicly reachable surfaces, and what each one serves:

| Surface                          | What it serves                                                                                                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [agentxm.ai](https://agentxm.ai) | The AgentXM registry web app: browse, discover, and manage published agent extensions. The apex domain is canonical; `www` redirects to it.                                                                                                                 |
| [axm.sh](https://axm.sh)         | The AXM CLI site: install scripts (`install.sh`, `install.ps1`, `install.cmd`, `install.md`), documentation, and release flows. Also the CLI's npm package name.                                                                                            |
| registry.agentxm.ai              | The public registry REST API for machine clients such as the AXM CLI: extension catalog, version and archive reads, publishing and lifecycle operations, search and discovery, machine-auth endpoints under `/v1/auth/*`, and self-describing OpenAPI docs. |
| t.agentxm.ai                     | The public telemetry ingest API where the CLI and other rich clients submit product telemetry events and error reports (`POST /v1/events`, `POST /v1/errors`, OpenAPI reference at `/v1`).                                                                  |
| mcp.agentxm.ai                   | The public remote MCP server (Streamable HTTP at `POST /mcp`) exposing read-only catalog tools — `agentxm_search_extensions` and `agentxm_get_extension` — to MCP-compatible agent hosts.                                                                   |
| notifications.agentxm.ai         | Public notification callback and unsubscribe endpoints reachable from delivered notifications.                                                                                                                                                              |
| images.agentxm.ai                | Image delivery for hosted images on AgentXM pages.                                                                                                                                                                                                          |

The extension manifest JSON Schemas are published under
[axm.sh/schemas](https://axm.sh/schemas/), and the AXM CLI source lives at
[github.com/agentxm/axm](https://github.com/agentxm/axm). For the full
catalogue of public entry points, see
[Public resources](../references/public-resources.md).
