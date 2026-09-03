---
__default__: minor
---

# Agent targeting is workspace membership

## Breaking changes

- `--agent` is removed from `skills new`, `subagents new`, `skills update`,
  `subagents update`, `mcps add`, and `mcps install`. Agent selection exists
  only to choose the workspace's configured agents (`setup`, `agents add`,
  `agents remove`) or to filter a listing (`skills list`, `subagents list`).
- `--agent` on `setup`, `skills list`, and `subagents list` is validated against
  the supported agent catalog; an unsupported identifier is rejected when the
  command line is parsed.
- MCP server entries in `axm.json` no longer accept an `agents` inclusion list.
  A settings document carrying the key fails validation and gates every
  operation; there is no migration or dual read. Every configured MCP server
  reaches every configured agent that can represent it, and an agent that
  cannot is reported as `unsupported`.
- The lint rule `workspace/mcps-shared-target-compatible` is retired from the
  published rule catalog and settings schema.
- The `uninstallSkill` lifecycle operation is removed from
  `@agentxm/extension-lifecycle`; `SkillManager` owns skill removal.
- `mcps import` records an adopted server once, without an agent subset; the
  next reconciliation projects it to every configured, capable agent.
